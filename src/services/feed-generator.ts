/**
 * Feed Generator — builds OpenAI ACP and Google GMC feeds from synced Shopify products.
 *
 * ACP spec: developers.openai.com/commerce/specs/feed/
 * Format: JSONL (gzip), refresh every 15 min (recommended)
 *
 * Important: OpenAI rejects feeds with marketing language in descriptions.
 * Always prefer rewritten_description (AEO-optimized) over original.
 *
 * Usage:
 *   const { gzipped, productCount } = await generateAcpFeed(storeId, storeConfig);
 *   // Upload gzipped to R2/S3, save URL with saveFeedRecord()
 */

import { eq, and } from "drizzle-orm";
import { gzipSync } from "node:zlib";

import { db } from "../db/client";
import { products, feeds } from "../db/schema";
import type { AcpFeedProduct } from "../types/shopify";
import type { StoreConfig } from "./schema-generator";

interface AcpFeedResult {
  jsonl: string;
  gzipped: Buffer;
  productCount: number;
  skippedCount: number;
}

/**
 * Generate an ACP-compliant JSONL feed from all synced products for a store.
 */
export async function generateAcpFeed(storeId: string, config: StoreConfig): Promise<AcpFeedResult> {
  if (!db) throw new Error("Database required for feed generation.");

  const storeProducts = await db.query.products.findMany({
    where: eq(products.storeId, storeId),
  });

  const lines: string[] = [];
  let skippedCount = 0;

  for (const product of storeProducts) {
    if (!product.name || !product.url) {
      skippedCount++;
      continue;
    }

    const attrs = (product.extractedAttributes ?? {}) as Record<string, unknown>;
    const variants = (attrs.variants as Array<Record<string, unknown>>) ?? [];
    const vendor = (attrs.vendor as string) ?? "";
    const productType = (attrs.productType as string) ?? "";
    const images = (attrs.images as Array<{ url: string }>) ?? [];
    const primaryImage = images[0]?.url ?? "";

    // Use AEO-rewritten description if available (factual, not marketing)
    const description = product.rewrittenDescription ?? product.originalDescription ?? product.name;

    const feedVariants: AcpFeedProduct["variants"] = variants.length > 0
      ? variants.map((v) => {
          const entry: AcpFeedProduct["variants"][0] = {
            id: (v.id as string) ?? product.id,
            title: (v.title as string) ?? product.name!,
            price: {
              amount: ((v.price as number) ?? parseFloat(product.price ?? "0")).toFixed(2),
              currency: product.currency ?? config.currency,
            },
            availability: (v.available as boolean) !== false ? "in_stock" : "out_of_stock",
            image_url: (v.image as string) ?? primaryImage,
          };

          const barcode = v.barcode as string | undefined;
          if (barcode && barcode.length >= 8) entry.gtin = barcode;

          return entry;
        })
      : [{
          id: product.platformProductId ?? product.id,
          title: product.name,
          price: {
            amount: product.price ?? "0.00",
            currency: product.currency ?? config.currency,
          },
          availability: product.availability === "InStock" ? "in_stock" as const : "out_of_stock" as const,
          image_url: primaryImage,
        }];

    const feedProduct: AcpFeedProduct = {
      product: {
        id: product.platformProductId ?? product.id,
        title: product.name,
        description,
        brand: vendor,
        category: product.googleCategory ?? productType,
        url: product.url,
      },
      variants: feedVariants,
      group_id: product.platformProductId ?? product.id,
      shipping: {
        methods: [{
          method: "Standard",
          rate: {
            amount: config.shippingRate ?? "0.00",
            currency: config.currency,
          },
          delivery_estimate: config.shippingMaxDays
            ? `${config.shippingMinDays ?? 3}-${config.shippingMaxDays} business days`
            : "3-7 business days",
        }],
      },
      policies: {
        return_policy: config.returnPolicyUrl ?? `${config.storeUrl}/policies/returns`,
      },
      enable_search: true,
      enable_checkout: false,
    };

    lines.push(JSON.stringify(feedProduct));
  }

  const jsonl = lines.join("\n");
  const gzipped = gzipSync(Buffer.from(jsonl, "utf-8"));

  return { jsonl, gzipped, productCount: lines.length, skippedCount };
}

/**
 * Generate a GMC supplemental feed as TSV.
 * Includes structured_title, structured_description, and native_commerce flag for UCP.
 */
export async function generateGmcSupplementalFeed(storeId: string, config: StoreConfig): Promise<string> {
  if (!db) throw new Error("Database required for feed generation.");

  const storeProducts = await db.query.products.findMany({
    where: eq(products.storeId, storeId),
  });

  const headers = [
    "id", "title", "structured_title", "description", "structured_description",
    "brand", "gtin", "condition", "product_type", "google_product_category", "native_commerce",
  ];

  const rows = [headers.join("\t")];

  for (const product of storeProducts) {
    if (!product.name) continue;

    const attrs = (product.extractedAttributes ?? {}) as Record<string, unknown>;
    const vendor = (attrs.vendor as string) ?? "";
    const productType = (attrs.productType as string) ?? "";
    const originalDesc = (product.originalDescription ?? "").replace(/[\t\n\r]/g, " ").trim();
    const aeoDesc = (product.rewrittenDescription ?? "").replace(/[\t\n\r]/g, " ").trim();
    const barcode = (attrs.variants as Array<{ barcode: string | null }>)?.[0]?.barcode ?? "";

    const row = [
      product.platformProductId ?? product.id,
      product.name,
      aeoDesc ? `${vendor} ${product.name}` : "", // structured_title — factual
      originalDesc,
      aeoDesc, // structured_description — AI-generated factual
      vendor,
      barcode,
      "new",
      productType,
      product.googleCategory ?? productType,
      "true",
    ];

    rows.push(row.join("\t"));
  }

  return rows.join("\n");
}

/** Save feed metadata to DB after generation + upload */
export async function saveFeedRecord(
  storeId: string,
  feedType: "acp" | "gmc",
  fileUrl: string,
  productCount: number,
  refreshMinutes: number = 1440,
): Promise<void> {
  if (!db) return;

  // Filter by BOTH storeId and feedType to prevent ACP/GMC from overwriting each other
  const existing = await db.query.feeds.findFirst({
    where: and(
      eq(feeds.storeId, storeId),
      eq(feeds.feedType, feedType),
    ),
  });

  const data = {
    fileUrl,
    productCount,
    refreshMinutes,
    lastGenerated: new Date(),
  };

  if (existing) {
    await db.update(feeds).set(data).where(eq(feeds.id, existing.id));
  } else {
    await db.insert(feeds).values({ storeId, feedType, ...data });
  }
}
