import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db/client";
import { accounts, alerts, products, shopifyWebhookDeliveries, stores } from "../db/schema";
import { verifyAccessToken } from "../lib/auth";
import { env } from "../lib/env";
import {
  consumeShopifyOAuthState,
  createShopifyOAuthState,
  encryptShopifyAccessToken,
  exchangeShopifyCodeForToken,
  fetchShopifyShop,
  getShopifyAuthorizeUrl,
  registerShopifyWebhooks,
  validateShopifyShop,
  verifyShopifyQueryHmac,
  verifyShopifyWebhookHmac,
} from "../lib/shopify";

const shopifyRoute = new Hono();

const InstallQuerySchema = z.object({
  shop: z.string().trim().min(1),
});

const CallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  hmac: z.string().trim().min(1),
  shop: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

async function getOptionalAccountIdFromBearerToken(authorization: string | undefined) {
  if (!db || !authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const payload = await verifyAccessToken(authorization.slice(7).trim());
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, payload.accountId),
    });

    return account?.id ?? null;
  } catch {
    return null;
  }
}

shopifyRoute.get("/", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Shopify install requires a configured database.",
      },
      503,
    );
  }

  const parseResult = InstallQuerySchema.safeParse(c.req.query());

  if (!parseResult.success || !validateShopifyShop(parseResult.data.shop)) {
    return c.json(
      {
        success: false,
        error: "Invalid Shopify shop domain.",
      },
      400,
    );
  }

  const hasHmac = Boolean(new URL(c.req.url).searchParams.get("hmac"));

  if (hasHmac && !verifyShopifyQueryHmac(c.req.url)) {
    return c.json(
      {
        success: false,
        error: "Invalid Shopify install signature.",
      },
      401,
    );
  }

  const accountId = await getOptionalAccountIdFromBearerToken(c.req.header("authorization"));
  const state = await createShopifyOAuthState({
    shop: parseResult.data.shop,
    ...(accountId ? { accountId } : {}),
  });

  return c.redirect(getShopifyAuthorizeUrl(parseResult.data.shop, state), 302);
});

shopifyRoute.get("/callback", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Shopify install requires a configured database.",
      },
      503,
    );
  }

  const parseResult = CallbackQuerySchema.safeParse(c.req.query());

  if (!parseResult.success || !validateShopifyShop(parseResult.data.shop)) {
    return c.json(
      {
        success: false,
        error: "Invalid Shopify callback.",
      },
      400,
    );
  }

  if (!verifyShopifyQueryHmac(c.req.url)) {
    return c.json(
      {
        success: false,
        error: "Invalid Shopify callback signature.",
      },
      401,
    );
  }

  const state = await consumeShopifyOAuthState(parseResult.data.state);

  if (!state || state.shop !== parseResult.data.shop) {
    return c.json(
      {
        success: false,
        error: "Shopify install state expired or invalid.",
      },
      400,
    );
  }

  const tokenResponse = await exchangeShopifyCodeForToken(
    parseResult.data.shop,
    parseResult.data.code,
  );
  const shopResponse = await fetchShopifyShop(parseResult.data.shop, tokenResponse.access_token);
  const shop = shopResponse.shop;
  const normalizedEmail = shop.email.trim().toLowerCase();
  const existingLinkedAccount = state.accountId
    ? await db.query.accounts.findFirst({
        where: eq(accounts.id, state.accountId),
      })
    : null;
  const existingEmailAccount = await db.query.accounts.findFirst({
    where: eq(accounts.email, normalizedEmail),
  });
  const account =
    existingLinkedAccount ??
    existingEmailAccount ??
    (
      await db
        .insert(accounts)
        .values({
          email: normalizedEmail,
        })
        .returning()
    )[0];

  if (!account) {
    return c.json(
      {
        success: false,
        error: "Failed to link Shopify store to an account.",
      },
      500,
    );
  }

  const encryptedAccessToken = encryptShopifyAccessToken(tokenResponse.access_token);
  const primaryUrl =
    shop.primary_domain?.url ||
    (shop.domain ? `https://${shop.domain}` : `https://${parseResult.data.shop}`);
  const existingStore = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, parseResult.data.shop),
    orderBy: [desc(stores.updatedAt)],
  });

  if (existingStore) {
    await db
      .update(stores)
      .set({
        accountId: account.id,
        active: true,
        name: shop.name,
        platform: "shopify",
        productCount: existingStore.productCount,
        shopifyAccessToken: encryptedAccessToken,
        shopifyInstalledAt: new Date(),
        shopifyScopes: (tokenResponse.scope ?? tokenResponse.associated_user_scope ?? "")
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean),
        shopifyUninstalledAt: null,
        updatedAt: new Date(),
        url: primaryUrl,
      })
      .where(eq(stores.id, existingStore.id));
  } else {
    await db.insert(stores).values({
      accountId: account.id,
      active: true,
      name: shop.name,
      platform: "shopify",
      productCount: 0,
      shopifyAccessToken: encryptedAccessToken,
      shopifyInstalledAt: new Date(),
      shopifyScopes: (tokenResponse.scope ?? tokenResponse.associated_user_scope ?? "")
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean),
      shopifyShop: parseResult.data.shop,
      url: primaryUrl,
    });
  }

  await registerShopifyWebhooks(parseResult.data.shop, tokenResponse.access_token);

  const redirectUrl = new URL("/dashboard/settings", env.FRONTEND_URL);
  redirectUrl.searchParams.set("shopify", "connected");
  redirectUrl.searchParams.set("shop", parseResult.data.shop);

  return c.redirect(redirectUrl.toString(), 302);
});

shopifyRoute.post("/webhooks", async (c) => {
  if (!db) {
    return c.json(
      {
        success: false,
        error: "Shopify webhooks require a configured database.",
      },
      503,
    );
  }

  const rawBody = await c.req.text();
  const providedHmac = c.req.header("x-shopify-hmac-sha256") ?? null;
  const topic = c.req.header("x-shopify-topic") ?? "";
  const shop = c.req.header("x-shopify-shop-domain") ?? "";
  const deliveryId = c.req.header("x-shopify-webhook-id") ?? crypto.randomUUID();

  if (!verifyShopifyWebhookHmac(rawBody, providedHmac)) {
    return c.json(
      {
        success: false,
        error: "Invalid Shopify webhook signature.",
      },
      401,
    );
  }

  if (!validateShopifyShop(shop) || !topic) {
    return c.json(
      {
        success: false,
        error: "Invalid Shopify webhook payload.",
      },
      400,
    );
  }

  const existingDelivery = await db.query.shopifyWebhookDeliveries.findFirst({
    where: eq(shopifyWebhookDeliveries.deliveryId, deliveryId),
  });

  if (existingDelivery) {
    return c.body(null, 200);
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
    orderBy: [desc(stores.updatedAt)],
  });

  await db.insert(shopifyWebhookDeliveries).values({
    deliveryId,
    shop,
    storeId: store?.id ?? null,
    topic,
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return c.json({ success: false, error: "Malformed webhook payload." }, 400);
  }

  switch (topic) {
    case "app/uninstalled":
      if (store) {
        await db
          .update(stores)
          .set({
            active: false,
            shopifyAccessToken: null,
            shopifyUninstalledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(stores.id, store.id));
      }
      break;
    case "products/delete":
      if (store) {
        const numericId =
          typeof payload.id === "number" ? String(payload.id) : null;
        const adminGraphqlId =
          typeof payload.admin_graphql_api_id === "string"
            ? payload.admin_graphql_api_id
            : numericId
              ? `gid://shopify/Product/${numericId}`
              : null;

        if (adminGraphqlId) {
          await db
            .delete(products)
            .where(
              and(
                eq(products.storeId, store.id),
                eq(products.platformProductId, adminGraphqlId),
              ),
            );
        }
      }
      break;
    case "products/create":
    case "products/update":
      if (store) {
        await db
          .update(stores)
          .set({
            updatedAt: new Date(),
          })
          .where(eq(stores.id, store.id));

        await db.insert(alerts).values({
          alertType: topic === "products/create" ? "shopify_product_created" : "shopify_product_updated",
          message:
            topic === "products/create"
              ? "A Shopify product was created. Product ingestion will process it in the next sync."
              : "A Shopify product was updated. Findable marked the store for re-sync.",
          severity: "info",
          storeId: store.id,
        });
      }
      break;
    default:
      break;
  }

  return c.body(null, 200);
});

export { shopifyRoute };
