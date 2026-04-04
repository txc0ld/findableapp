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
import { stores } from "../db/schema";
import { generateAcpFeed, generateGmcSupplementalFeed } from "../services/feed-generator";
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

function buildStoreConfig(store: { name: string | null; url: string }): StoreConfig {
  return {
    storeName: store.name ?? "Store",
    storeUrl: store.url,
    currency: "AUD",
    country: "AU",
  };
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

  try {
    const config = buildStoreConfig(store);
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

  try {
    const config = buildStoreConfig(store);
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
