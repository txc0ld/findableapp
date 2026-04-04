import { and, eq, like } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db/client";
import { products, stores } from "../db/schema";
import { generateAllSchemas } from "../services/schema-generator";
import type { StoreConfig } from "../services/schema-generator";
import type { MappedProduct } from "../types/shopify";

const QuerySchema = z
  .object({
    shop: z.string().trim().min(1, "shop is required"),
    handle: z.string().trim().min(1).optional(),
    productId: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.handle || data.productId, {
    message: "Either handle or productId is required",
  });

export const schemaApiRoute = new Hono();

schemaApiRoute.get("/product", async (c) => {
  const parseResult = QuerySchema.safeParse(c.req.query());

  if (!parseResult.success) {
    return c.json(
      {
        error: parseResult.error.issues[0]?.message ?? "Invalid query parameters.",
        schemas: null,
      },
      400,
    );
  }

  const { shop, handle, productId } = parseResult.data;

  if (!db) {
    return c.json({ error: "Database not available.", schemas: null }, 503);
  }

  // Look up the store by shopifyShop field
  const store = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
  });

  if (!store) {
    return c.json({ error: "Store not found.", schemas: null }, 404);
  }

  // Find the product
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
    return c.json({ schemas: null }, 404);
  }

  // Build StoreConfig
  const storeConfig: StoreConfig = {
    storeName: store.name ?? shop,
    storeUrl: store.url,
    currency: "USD",
    country: "US",
  };

  // Build MappedProduct from the DB record
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

  // Build FAQ list if available
  const faqs = product.suggestedFaq as
    | Array<{ question: string; answer: string }>
    | null
    | undefined;

  const schemas = generateAllSchemas(mapped, storeConfig, faqs ?? undefined);

  c.header("Cache-Control", "public, max-age=300, s-maxage=300");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json({ schemas });
});
