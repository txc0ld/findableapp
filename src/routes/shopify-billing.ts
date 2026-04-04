import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { requireAuth, type AuthVariables } from "../lib/auth-middleware";
import { decryptAccessToken } from "../lib/shopify-client";
import { db } from "../db/client";
import { accounts, stores } from "../db/schema";
import { env } from "../lib/env";
import {
  createSubscription,
  getActiveSubscription,
  cancelSubscription,
  type PlanTier,
} from "../services/billing";

const shopifyBillingRoute = new Hono<{ Variables: AuthVariables }>();

// ---------- Schemas ----------

const SubscribeSchema = z.object({
  tier: z.enum(["starter", "growth", "pro", "agency"]),
  interval: z.enum(["monthly", "annual"]).optional(),
});

const CancelSchema = z.object({
  subscriptionId: z.string().min(1),
});

// ---------- Helpers ----------

async function findActiveShopifyStore(accountId: string) {
  if (!db) return null;
  return db.query.stores.findFirst({
    where: and(
      eq(stores.accountId, accountId),
      eq(stores.platform, "shopify"),
      eq(stores.active, true),
    ),
  });
}

// ---------- Routes ----------

/** POST /subscribe — create a Shopify app subscription and return the confirmation URL */
shopifyBillingRoute.post("/subscribe", requireAuth(), async (c) => {
  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  const parseResult = SubscribeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid subscription request.",
      },
      400,
    );
  }

  const authAccount = c.get("authAccount");
  const store = await findActiveShopifyStore(authAccount.id);

  if (!store) {
    return c.json({ success: false, error: "No active Shopify store found for this account." }, 400);
  }

  if (!store.shopifyShop || !store.shopifyAccessToken) {
    return c.json({ success: false, error: "Shopify store is missing shop domain or access token." }, 400);
  }

  let accessToken: string;
  try {
    accessToken = decryptAccessToken(store.shopifyAccessToken);
  } catch {
    return c.json({ success: false, error: "Failed to decrypt store access token." }, 500);
  }

  const { tier, interval } = parseResult.data;

  try {
    const { confirmationUrl, subscriptionId } = await createSubscription(
      store.shopifyShop,
      accessToken,
      tier,
      interval,
    );

    return c.json({
      success: true,
      data: { confirmationUrl, subscriptionId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create subscription.";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /callback — Shopify redirects here after the merchant accepts or declines the charge.
 * Query params: shop, tier, charge_id (added by Shopify).
 */
shopifyBillingRoute.get("/callback", async (c) => {
  if (!db) {
    return c.redirect(`${env.FRONTEND_URL}/dashboard/billing?status=error&reason=db`);
  }

  const shop = c.req.query("shop");
  const tier = c.req.query("tier") as PlanTier | undefined;

  if (!shop || !tier) {
    return c.redirect(`${env.FRONTEND_URL}/dashboard/billing?status=error&reason=missing_params`);
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
  });

  if (!store) {
    return c.redirect(`${env.FRONTEND_URL}/dashboard/billing?status=error&reason=store_not_found`);
  }

  if (!store.shopifyAccessToken) {
    return c.redirect(`${env.FRONTEND_URL}/dashboard/billing?status=error&reason=no_token`);
  }

  let accessToken: string;
  try {
    accessToken = decryptAccessToken(store.shopifyAccessToken);
  } catch {
    return c.redirect(`${env.FRONTEND_URL}/dashboard/billing?status=error&reason=decrypt_failed`);
  }

  try {
    const subscription = await getActiveSubscription(shop, accessToken);

    if (subscription && subscription.status === "ACTIVE") {
      await db
        .update(accounts)
        .set({ plan: tier })
        .where(eq(accounts.id, store.accountId!));

      return c.redirect(
        `${env.FRONTEND_URL}/dashboard/billing?status=active&plan=${tier}`,
      );
    }

    // Merchant declined or subscription not active
    return c.redirect(`${env.FRONTEND_URL}/dashboard/billing?status=declined`);
  } catch {
    return c.redirect(`${env.FRONTEND_URL}/dashboard/billing?status=error&reason=verification_failed`);
  }
});

/** GET /status — return the current Shopify subscription for the authenticated account */
shopifyBillingRoute.get("/status", requireAuth(), async (c) => {
  if (!db) {
    return c.json({ success: true, data: { subscription: null } });
  }

  const authAccount = c.get("authAccount");
  const store = await findActiveShopifyStore(authAccount.id);

  if (!store || !store.shopifyShop || !store.shopifyAccessToken) {
    return c.json({ success: true, data: { subscription: null } });
  }

  let accessToken: string;
  try {
    accessToken = decryptAccessToken(store.shopifyAccessToken);
  } catch {
    return c.json({ success: true, data: { subscription: null } });
  }

  try {
    const subscription = await getActiveSubscription(store.shopifyShop, accessToken);
    return c.json({ success: true, data: { subscription } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch subscription status.";
    return c.json({ success: false, error: message }, 500);
  }
});

/** POST /cancel — cancel a Shopify app subscription and downgrade to free */
shopifyBillingRoute.post("/cancel", requireAuth(), async (c) => {
  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  const parseResult = CancelSchema.safeParse(await c.req.json().catch(() => null));
  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid cancel request.",
      },
      400,
    );
  }

  const authAccount = c.get("authAccount");
  const store = await findActiveShopifyStore(authAccount.id);

  if (!store) {
    return c.json({ success: false, error: "No active Shopify store found for this account." }, 400);
  }

  if (!store.shopifyShop || !store.shopifyAccessToken) {
    return c.json({ success: false, error: "Shopify store is missing shop domain or access token." }, 400);
  }

  let accessToken: string;
  try {
    accessToken = decryptAccessToken(store.shopifyAccessToken);
  } catch {
    return c.json({ success: false, error: "Failed to decrypt store access token." }, 500);
  }

  const { subscriptionId } = parseResult.data;

  try {
    await cancelSubscription(store.shopifyShop, accessToken, subscriptionId);

    await db
      .update(accounts)
      .set({ plan: "free" })
      .where(eq(accounts.id, authAccount.id));

    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel subscription.";
    return c.json({ success: false, error: message }, 500);
  }
});

export { shopifyBillingRoute };
