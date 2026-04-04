/**
 * Feed hosting endpoints — public URLs that merchants submit to Google/OpenAI.
 *
 * No auth required. Feeds are generated on-demand from synced product data.
 *
 * Routes:
 *   GET /acp/:shop    — ACP JSONL feed (gzipped) for ChatGPT
 *   GET /gmc/:shop    — GMC supplemental TSV feed for Google Merchant Center
 *   GET /llms-txt/:shop — Auto-generated llms.txt
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { products, stores } from "../db/schema";
import { generateAcpFeed, generateGmcSupplementalFeed } from "../services/feed-generator";
import { getShopInfo } from "../services/product-sync";
import { decryptAccessToken } from "../lib/shopify-client";
import type { StoreConfig } from "../services/schema-generator";

export const feedsRoute = new Hono();

/* ------------------------------------------------------------------ */
/*  Helper: look up store by shopify domain                           */
/* ------------------------------------------------------------------ */

async function findStoreByShop(shop: string) {
  if (!db) return null;
  return db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
  });
}

/** Derive a simple feed token from the store UUID (first 16 hex chars). */
function feedToken(storeId: string): string {
  return storeId.replace(/-/g, "").slice(0, 16);
}

async function buildStoreConfig(store: {
  name: string | null;
  url: string;
  shopifyShop: string | null;
  shopifyAccessToken: string | null;
}): Promise<StoreConfig> {
  const config: StoreConfig = {
    storeName: store.name ?? "Store",
    storeUrl: store.url,
    currency: "AUD",
    country: "AU",
  };

  if (store.shopifyShop && store.shopifyAccessToken) {
    try {
      const accessToken = decryptAccessToken(store.shopifyAccessToken);
      const shopInfo = await getShopInfo(store.shopifyShop, accessToken);
      config.currency = shopInfo.currencyCode || "AUD";
      config.country = shopInfo.country || "AU";
    } catch (err) {
      console.error("[feeds] Failed to fetch shop info for currency:", err);
    }
  }

  return config;
}

/* ------------------------------------------------------------------ */
/*  GET /acp/:shop — ACP JSONL feed (gzipped)                        */
/* ------------------------------------------------------------------ */

feedsRoute.get("/acp/:shop", async (c) => {
  const shop = c.req.param("shop");
  const store = await findStoreByShop(shop);
  if (!store) {
    return c.json({ error: "Store not found" }, 404);
  }

  const token = c.req.query("token");
  if (!token || token !== feedToken(store.id)) {
    return c.json({ error: "Invalid or missing feed token" }, 403);
  }

  try {
    const config = await buildStoreConfig(store);
    const { gzipped, productCount } = await generateAcpFeed(store.id, config);

    if (productCount === 0) {
      return c.json({ error: "No products available for feed" }, 404);
    }

    return new Response(gzipped, {
      status: 200,
      headers: {
        "Content-Type": "application/jsonl",
        "Content-Encoding": "gzip",
        "Cache-Control": "public, max-age=900", // 15 min
        "X-Product-Count": String(productCount),
      },
    });
  } catch (err) {
    console.error(`[feeds] ACP generation failed for ${shop}:`, err);
    return c.json({ error: "Feed generation failed" }, 500);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /gmc/:shop — GMC supplemental TSV feed                       */
/* ------------------------------------------------------------------ */

feedsRoute.get("/gmc/:shop", async (c) => {
  const shop = c.req.param("shop");
  const store = await findStoreByShop(shop);
  if (!store) {
    return c.json({ error: "Store not found" }, 404);
  }

  const token = c.req.query("token");
  if (!token || token !== feedToken(store.id)) {
    return c.json({ error: "Invalid or missing feed token" }, 403);
  }

  try {
    const config = await buildStoreConfig(store);
    const tsv = await generateGmcSupplementalFeed(store.id, config);

    c.header("Content-Type", "text/tab-separated-values; charset=utf-8");
    c.header("Cache-Control", "public, max-age=900"); // 15 min
    c.header("Content-Disposition", `inline; filename="${shop}-gmc.tsv"`);

    return c.body(tsv);
  } catch (err) {
    console.error(`[feeds] GMC generation failed for ${shop}:`, err);
    return c.json({ error: "Feed generation failed" }, 500);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /llms-txt/:shop — Auto-generated llms.txt                    */
/* ------------------------------------------------------------------ */

feedsRoute.get("/llms-txt/:shop", async (c) => {
  const shop = c.req.param("shop");
  const store = await findStoreByShop(shop);
  if (!store) {
    return c.json({ error: "Store not found" }, 404);
  }

  const storeUrl = store.url.replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);

  const llmsTxt = [
    "# llms.txt",
    `# Store: ${store.name ?? shop}`,
    `# URL: ${storeUrl}`,
    `# Products: ${storeUrl}/products/`,
    `# Collections: ${storeUrl}/collections/`,
    `# Policies: ${storeUrl}/policies/`,
    "# Schema: All product pages include JSON-LD Product schema via FindAble",
    `# ACP Feed: https://api.getfindable.au/feeds/acp/${shop}`,
    `# Updated: ${today}`,
  ].join("\n");

  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600"); // 1 hour

  return c.body(llmsTxt);
});
