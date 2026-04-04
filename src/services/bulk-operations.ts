/**
 * Bulk Operations — async product sync for stores with 1000+ products.
 *
 * Instead of paginating (hitting rate limits), Shopify runs the query server-side
 * and produces a JSONL file you download when ready.
 *
 * Flow:
 * 1. Start bulk operation → returns operation ID
 * 2. Poll for completion (or use BULK_OPERATIONS_FINISH webhook)
 * 3. Download JSONL from the URL Shopify provides
 * 4. Parse parent/child objects and upsert into FindAble DB
 *
 * Usage:
 *   const operationId = await startBulkProductSync(shop, accessToken);
 *   // later...
 *   const status = await pollBulkOperation(shop, accessToken, operationId);
 *   if (status.status === "COMPLETED" && status.url) {
 *     await processBulkResults(status.url, storeId, shop, "AUD");
 *   }
 */

import { eq, and } from "drizzle-orm";

import { db } from "../db/client";
import { products, stores } from "../db/schema";
import { shopifyGql } from "../lib/shopify-client";
import { BULK_PRODUCTS_QUERY, BULK_OPERATION_STATUS_QUERY } from "../graphql/products";
import type { ShopifyBulkOperation, ShopifyBulkOperationStatus, BulkOperationStatus } from "../types/shopify";

/** GID prefix constants for reliable child object classification */
const GID_PREFIX = {
  PRODUCT: "gid://shopify/Product/",
  VARIANT: "gid://shopify/ProductVariant/",
  IMAGE: "gid://shopify/ProductImage/",
  MEDIA_IMAGE: "gid://shopify/MediaImage/",
  METAFIELD: "gid://shopify/Metafield/",
  COLLECTION: "gid://shopify/Collection/",
};

/** Start a bulk product export. Returns the operation ID. */
export async function startBulkProductSync(shop: string, accessToken: string): Promise<string> {
  const data = await shopifyGql<ShopifyBulkOperation>(shop, accessToken, BULK_PRODUCTS_QUERY);
  const op = data.bulkOperationRunQuery;

  if (op.userErrors.length > 0) {
    throw new Error(`Bulk operation error: ${op.userErrors.map((e) => e.message).join("; ")}`);
  }

  if (!op.bulkOperation) {
    throw new Error("Failed to start bulk operation.");
  }

  return op.bulkOperation.id;
}

export interface BulkOperationResult {
  id: string;
  status: BulkOperationStatus;
  url: string | null;
  partialDataUrl: string | null;
  objectCount: number;
  errorCode: string | null;
}

/** Poll a bulk operation for its current status. */
export async function pollBulkOperation(
  shop: string,
  accessToken: string,
  operationId: string,
): Promise<BulkOperationResult> {
  const data = await shopifyGql<ShopifyBulkOperationStatus>(
    shop, accessToken, BULK_OPERATION_STATUS_QUERY, { id: operationId },
  );

  if (!data.node) {
    throw new Error(`Bulk operation not found: ${operationId}`);
  }

  return {
    id: data.node.id,
    status: data.node.status,
    url: data.node.url,
    partialDataUrl: data.node.partialDataUrl,
    objectCount: parseInt(data.node.objectCount, 10),
    errorCode: data.node.errorCode,
  };
}

type BulkLine = Record<string, unknown>;

function classifyChild(obj: BulkLine): "variant" | "image" | "metafield" | "collection" | "unknown" {
  const id = obj.id as string;
  if (id.startsWith(GID_PREFIX.VARIANT)) return "variant";
  if (id.startsWith(GID_PREFIX.IMAGE) || id.startsWith(GID_PREFIX.MEDIA_IMAGE)) return "image";
  if (id.startsWith(GID_PREFIX.METAFIELD)) return "metafield";
  if (id.startsWith(GID_PREFIX.COLLECTION)) return "collection";
  return "unknown";
}

interface ParsedBulkProduct {
  data: BulkLine;
  variants: BulkLine[];
  images: BulkLine[];
  metafields: BulkLine[];
  collections: BulkLine[];
}

function parseBulkJsonl(text: string): Map<string, ParsedBulkProduct> {
  const lines = text.trim().split("\n").filter(Boolean);
  const productMap = new Map<string, ParsedBulkProduct>();

  for (const line of lines) {
    const obj = JSON.parse(line) as BulkLine;
    const id = obj.id as string;
    const parentId = obj.__parentId as string | undefined;

    if (!parentId) {
      productMap.set(id, { data: obj, variants: [], images: [], metafields: [], collections: [] });
    } else {
      const parent = productMap.get(parentId);
      if (!parent) continue;

      const type = classifyChild(obj);
      switch (type) {
        case "variant": parent.variants.push(obj); break;
        case "image": parent.images.push(obj); break;
        case "metafield": parent.metafields.push(obj); break;
        case "collection": parent.collections.push(obj); break;
      }
    }
  }

  return productMap;
}

/**
 * Download and process bulk operation JSONL results.
 *
 * @param shopCurrency - The store's currency code from getShopInfo()
 */
export async function processBulkResults(
  downloadUrl: string,
  storeId: string,
  shopDomain: string,
  shopCurrency: string,
): Promise<number> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download bulk results: ${response.status}`);
  }

  const text = await response.text();
  const productMap = parseBulkJsonl(text);
  let totalSynced = 0;

  for (const [productId, parsed] of productMap) {
    const { data, variants, images, metafields, collections } = parsed;

    const title = data.title as string;
    const handle = data.handle as string;
    const vendor = (data.vendor as string) ?? "";
    const onlineStoreUrl = data.onlineStoreUrl as string | null;
    const url = onlineStoreUrl ?? `https://${shopDomain}/products/${handle}`;
    const description = (data.description as string) ?? "";

    const firstVariant = variants[0];
    const barcode = firstVariant?.barcode as string | null;
    const price = firstVariant?.price ? parseFloat(firstVariant.price as string) : null;
    const available = firstVariant?.availableForSale as boolean | undefined;

    const variantOptions = variants.flatMap((v) => {
      const opts = v.selectedOptions as Array<{ name: string; value: string }> | undefined;
      return opts ?? [];
    });
    const optionNames = new Set(variantOptions.map((o) => o.name.toLowerCase()));

    const record = {
      storeId,
      platformProductId: productId,
      url,
      name: title,
      price: price?.toString() ?? null,
      currency: shopCurrency,
      availability: available !== false ? "InStock" : "OutOfStock",
      hasGtin: barcode !== null && barcode !== undefined && barcode.length >= 8,
      hasBrand: vendor.length > 0,
      hasColor: optionNames.has("color") || optionNames.has("colour"),
      hasSize: optionNames.has("size"),
      hasMaterial: optionNames.has("material") || optionNames.has("fabric"),
      hasWeight: variants.some((v) => {
        const w = v.weight as number | null;
        return w !== null && w > 0;
      }),
      hasVariantsStructured: variants.length > 1,
      originalDescription: description,
      extractedAttributes: {
        vendor,
        productType: data.productType as string,
        tags: data.tags as string[],
        images: images.map((i) => ({ url: i.url as string, alt: i.altText as string | null })),
        collections: collections.map((c) => ({ title: c.title as string, handle: c.handle as string })),
        variants: variants.map((v) => ({
          id: v.id as string,
          title: v.title as string,
          sku: v.sku as string | null,
          barcode: v.barcode as string | null,
          price: parseFloat((v.price as string) ?? "0"),
          available: v.availableForSale as boolean,
          weight: v.weight as number | null,
          weightUnit: v.weightUnit as string,
          options: v.selectedOptions as Array<{ name: string; value: string }> | undefined,
        })),
        metafields: Object.fromEntries(
          metafields.map((m) => [`${m.namespace}.${m.key}`, m.value as string]),
        ),
        seo: data.seo as { title: string | null; description: string | null } | undefined,
        descriptionHtml: data.descriptionHtml as string | undefined,
      } as Record<string, unknown>,
    };

    if (!db) continue;

    const existing = await db.query.products.findFirst({
      where: and(
        eq(products.storeId, storeId),
        eq(products.platformProductId, productId),
      ),
    });

    if (existing) {
      await db.update(products).set(record).where(eq(products.id, existing.id));
    } else {
      await db.insert(products).values(record);
    }

    totalSynced++;
  }

  if (db) {
    await db.update(stores).set({ productCount: totalSynced, updatedAt: new Date() }).where(eq(stores.id, storeId));
  }

  return totalSynced;
}
