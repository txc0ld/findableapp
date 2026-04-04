import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, like } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db/client";
import { products, scans, stores } from "../db/schema";
import { env } from "../lib/env";
import { generateAllSchemas } from "../services/schema-generator";
import type { StoreConfig } from "../services/schema-generator";
import type { MappedProduct } from "../types/shopify";

/* ------------------------------------------------------------------ */
/*  Shopify App Proxy signature verification                          */
/*                                                                    */
/*  App proxy requests include a `signature` query param computed as: */
/*    HMAC-SHA256(secret, sorted params joined with no separator)     */
/*  where each param is formatted as `key=value`.                     */
/* ------------------------------------------------------------------ */

function verifyProxySignature(query: Record<string, string>): boolean {
  const secret = env.SHOPIFY_API_SECRET;
  if (!secret) return false;

  const signature = query.signature;
  if (!signature) return false;

  const params = Object.entries(query)
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("");

  const digest = createHmac("sha256", secret).update(params).digest("hex");

  // Timing-safe comparison
  const expectedBuf = Buffer.from(digest);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/* ------------------------------------------------------------------ */
/*  Route setup                                                       */
/* ------------------------------------------------------------------ */

export const proxyRoute = new Hono();

/* Verify proxy signature on all requests */
proxyRoute.use("*", async (c, next) => {
  const query = c.req.query() as Record<string, string>;

  if (!verifyProxySignature(query)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

/* ------------------------------------------------------------------ */
/*  GET /  — Proxy health check                                       */
/* ------------------------------------------------------------------ */

proxyRoute.get("/", (c) => {
  return c.json({ app: "findable", status: "ok" }, 200, {
    "Content-Type": "application/liquid",
  });
});

/* ------------------------------------------------------------------ */
/*  GET /schema  — Product structured-data (same logic as schema-api) */
/* ------------------------------------------------------------------ */

const SchemaQuerySchema = z
  .object({
    shop: z.string().trim().min(1, "shop is required"),
    handle: z.string().trim().min(1).optional(),
    productId: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.handle || data.productId, {
    message: "Either handle or productId is required",
  });

proxyRoute.get("/schema", async (c) => {
  const parseResult = SchemaQuerySchema.safeParse(c.req.query());

  if (!parseResult.success) {
    return c.json(
      {
        error: parseResult.error.issues[0]?.message ?? "Invalid query parameters.",
        schemas: null,
      },
      400,
      { "Content-Type": "application/liquid" },
    );
  }

  const { shop, handle, productId } = parseResult.data;

  if (!db) {
    return c.json({ error: "Database not available.", schemas: null }, 503, {
      "Content-Type": "application/liquid",
    });
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
  });

  if (!store) {
    return c.json({ error: "Store not found.", schemas: null }, 404, {
      "Content-Type": "application/liquid",
    });
  }

  let product;

  if (productId) {
    product = await db.query.products.findFirst({
      where: and(
        eq(products.platformProductId, productId),
        eq(products.storeId, store.id),
      ),
    });
  } else if (handle) {
    product = await db.query.products.findFirst({
      where: and(
        eq(products.storeId, store.id),
        like(products.url, `%/products/${handle}`),
      ),
    });
  }

  if (!product) {
    return c.json({ schemas: null }, 404, {
      "Content-Type": "application/liquid",
    });
  }

  const storeConfig: StoreConfig = {
    storeName: store.name ?? shop,
    storeUrl: store.url,
    currency: "USD",
    country: "US",
  };

  const attrs = (product.extractedAttributes ?? {}) as Record<string, unknown>;

  const mapped: MappedProduct = {
    platformProductId: product.platformProductId ?? product.id,
    url: product.url,
    name: product.name ?? "",
    description: product.originalDescription ?? "",
    descriptionHtml: (attrs.descriptionHtml as string) ?? "",
    vendor: (attrs.vendor as string) ?? "",
    productType: (attrs.productType as string) ?? "",
    tags: (attrs.tags as string[]) ?? [],
    price: product.price ? parseFloat(product.price) : null,
    currency: product.currency ?? "USD",
    compareAtPrice: null,
    availability: product.availability ?? "InStock",
    sku: null,
    barcode: null,
    images: (attrs.images as Array<{ url: string; alt: string | null }>) ?? [],
    variants: (attrs.variants as MappedProduct["variants"]) ?? [],
    collections: (attrs.collections as Array<{ title: string; handle: string }>) ?? [],
    metafields: (attrs.metafields as Record<string, string>) ?? {},
    seoTitle: (attrs.seoTitle as string) ?? null,
    seoDescription: (attrs.seoDescription as string) ?? null,
    handle: product.url.split("/products/").pop()?.split("?")[0] ?? "",
    reviewCount: product.reviewCount,
    ratingValue: product.ratingValue,
    updatedAt: product.createdAt.toISOString(),
  };

  const faqs = product.suggestedFaq as
    | Array<{ question: string; answer: string }>
    | null
    | undefined;

  const schemas = generateAllSchemas(mapped, storeConfig, faqs ?? undefined);

  return c.json({ schemas }, 200, {
    "Content-Type": "application/liquid",
    "Cache-Control": "public, max-age=300, s-maxage=300",
  });
});

/* ------------------------------------------------------------------ */
/*  GET /score  — Store overall score as an HTML snippet               */
/* ------------------------------------------------------------------ */

proxyRoute.get("/score", async (c) => {
  const shop = c.req.query("shop");

  if (!shop) {
    return c.body("Missing shop parameter.", 400, {
      "Content-Type": "application/liquid",
    });
  }

  if (!db) {
    return c.body("Database not available.", 503, {
      "Content-Type": "application/liquid",
    });
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
  });

  if (!store) {
    return c.body("Store not found.", 404, {
      "Content-Type": "application/liquid",
    });
  }

  const latestScan = await db.query.scans.findFirst({
    where: and(eq(scans.storeId, store.id), eq(scans.status, "complete")),
    orderBy: [desc(scans.completedAt)],
  });

  const score = latestScan?.scoreOverall ?? null;

  const html = score !== null
    ? `<div class="findable-score" data-score="${score}"><strong>FindAble AEO Score:</strong> ${score}/100</div>`
    : `<div class="findable-score"><strong>FindAble AEO Score:</strong> No scan completed yet.</div>`;

  return c.body(html, 200, {
    "Content-Type": "application/liquid",
  });
});
