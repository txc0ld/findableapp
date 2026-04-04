import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { requireAuth, type AuthVariables } from "../lib/auth-middleware";
import { decryptAccessToken } from "../lib/shopify-client";
import { db } from "../db/client";
import { stores, products } from "../db/schema";
import type { Store } from "../db/schema";
import { syncAllProducts, getProductCount, getShopInfo, buildStoreConfig as buildLiveStoreConfig } from "../services/product-sync";
import { startBulkProductSync } from "../services/bulk-operations";
import { generateAcpFeed, generateGmcSupplementalFeed, saveFeedRecord } from "../services/feed-generator";
import type { StoreConfig } from "../services/schema-generator";

const storeOpsRoute = new Hono<{ Variables: AuthVariables }>();

storeOpsRoute.use("*", requireAuth());

async function getActiveStore(accountId: string) {
  if (!db) return null;
  return db.query.stores.findFirst({
    where: and(
      eq(stores.accountId, accountId),
      eq(stores.platform, "shopify"),
      eq(stores.active, true),
    ),
  });
}

async function buildStoreConfig(store: Store): Promise<StoreConfig> {
  return buildLiveStoreConfig(store);
}

// ── POST /sync ──────────────────────────────────────────────────────────────────
storeOpsRoute.post("/sync", async (c) => {
  const authAccount = c.get("authAccount");
  const store = await getActiveStore(authAccount.id);

  if (!store) {
    return c.json({ success: false, error: "No active Shopify store found." }, 404);
  }

  if (!store.shopifyShop || !store.shopifyAccessToken) {
    return c.json({ success: false, error: "Store is missing Shopify credentials." }, 400);
  }

  const accessToken = decryptAccessToken(store.shopifyAccessToken);
  const shopInfo = await getShopInfo(store.shopifyShop, accessToken);
  const count = await getProductCount(store.shopifyShop, accessToken);

  if (count > 1000) {
    const opId = await startBulkProductSync(store.shopifyShop, accessToken);
    return c.json({
      success: true,
      data: { mode: "bulk" as const, operationId: opId },
    });
  }

  // Fire and forget — sync runs in the background
  syncAllProducts(store.shopifyShop, accessToken, store.id, shopInfo.currencyCode).catch(
    console.error,
  );

  return c.json({
    success: true,
    data: { mode: "paginated" as const, estimatedProducts: count },
  });
});

// ── GET /sync/status ────────────────────────────────────────────────────────────
storeOpsRoute.get("/sync/status", async (c) => {
  const authAccount = c.get("authAccount");
  const store = await getActiveStore(authAccount.id);

  if (!store) {
    return c.json({ success: false, error: "No active Shopify store found." }, 404);
  }

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  const storeProducts = await db.query.products.findMany({
    where: eq(products.storeId, store.id),
    columns: { id: true },
  });

  const productCount = storeProducts.length;

  return c.json({
    success: true,
    data: { productCount, storeProductCount: store.productCount },
  });
});

// ── POST /feeds/acp ─────────────────────────────────────────────────────────────
storeOpsRoute.post("/feeds/acp", async (c) => {
  const authAccount = c.get("authAccount");
  const store = await getActiveStore(authAccount.id);

  if (!store) {
    return c.json({ success: false, error: "No active Shopify store found." }, 404);
  }

  const storeConfig = await buildStoreConfig(store);
  const result = await generateAcpFeed(store.id, storeConfig);

  // TODO: Upload gzipped feed to R2 and return URL
  await saveFeedRecord(store.id, "acp", "pending-upload", result.productCount, 1440);

  return c.json({
    success: true,
    data: { productCount: result.productCount, skippedCount: result.skippedCount },
  });
});

// ── POST /feeds/gmc ─────────────────────────────────────────────────────────────
storeOpsRoute.post("/feeds/gmc", async (c) => {
  const authAccount = c.get("authAccount");
  const store = await getActiveStore(authAccount.id);

  if (!store) {
    return c.json({ success: false, error: "No active Shopify store found." }, 404);
  }

  const storeConfig = await buildStoreConfig(store);
  const tsv = await generateGmcSupplementalFeed(store.id, storeConfig);

  const productCount = tsv.split("\n").length - 1; // subtract header row

  await saveFeedRecord(store.id, "gmc", "pending-upload", productCount, 1440);

  return c.json({
    success: true,
    data: { productCount, tsv },
  });
});

export { storeOpsRoute };
