/**
 * Product Sync — pulls products from Shopify Admin GraphQL API into FindAble DB.
 *
 * Three modes:
 * 1. Full sync (initial install or manual re-sync) — paginates all ACTIVE products
 * 2. Single product sync (webhook-triggered) — fetches one product by GID
 * 3. Bulk sync (1000+ products) — see bulk-operations.ts
 *
 * Usage:
 *   import { syncAllProducts, syncSingleProduct, getShopInfo } from "./product-sync";
 *
 *   const shopInfo = await getShopInfo(shop, accessToken);
 *   await syncAllProducts(shop, accessToken, store.id, shopInfo.currencyCode);
 */

import { eq, and } from "drizzle-orm";

import { db } from "../db/client";
import { products, stores } from "../db/schema";
import { shopifyGql, decryptAccessToken } from "../lib/shopify-client";
import type { StoreConfig } from "./schema-generator";
import type { Store } from "../db/schema";
import {
  PRODUCTS_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCT_COUNT_QUERY,
  SHOP_QUERY,
  SHOP_POLICIES_QUERY,
  type ShopInfoResponse,
  type ShopPoliciesResponse,
} from "../graphql/products";
import type {
  ShopifyProduct,
  ShopifyProductsResponse,
  MappedProduct,
} from "../types/shopify";

const PAGE_SIZE = 50;

const MATERIAL_KEYWORDS = [
  "cotton", "polyester", "nylon", "leather", "suede", "silk", "wool", "linen",
  "canvas", "denim", "fleece", "mesh", "rubber", "steel", "aluminum", "titanium",
  "ceramic", "wood", "bamboo", "acrylic", "spandex", "lycra", "viscose", "rayon",
  "cashmere", "organic", "recycled", "gore-tex", "cordura",
];

const MATERIAL_METAFIELD_KEYS = [
  "custom.material", "custom.materials", "custom.fabric",
  "descriptors.material", "descriptors.subtitle.material",
  "shopify.material", "shopify.fabric",
];

/** Fetch shop-level info (currency, country, domain). Call once per store, cache the result. */
export async function getShopInfo(
  shop: string,
  accessToken: string,
): Promise<{
  name: string;
  currencyCode: string;
  domain: string;
  country: string;
  timezone: string;
}> {
  const data = await shopifyGql<ShopInfoResponse>(shop, accessToken, SHOP_QUERY);
  return {
    name: data.shop.name,
    currencyCode: data.shop.currencyCode,
    domain: data.shop.primaryDomain.url,
    country: data.shop.billingAddress.countryCodeV2,
    timezone: data.shop.ianaTimezone,
  };
}

function resolveVariantCurrency(variant: ShopifyProduct["variants"]["edges"][0]["node"]): string {
  const presentment = variant.presentmentPrices?.edges?.[0]?.node;
  return presentment?.price.currencyCode ?? "USD";
}

function mapShopifyProduct(product: ShopifyProduct, shopDomain: string, fallbackCurrency: string): MappedProduct {
  const firstVariant = product.variants.edges[0]?.node;
  const currency = firstVariant ? resolveVariantCurrency(firstVariant) : fallbackCurrency;

  return {
    platformProductId: product.id,
    url: product.onlineStoreUrl ?? `https://${shopDomain}/products/${product.handle}`,
    name: product.title,
    description: product.description,
    descriptionHtml: product.descriptionHtml,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    price: firstVariant ? parseFloat(firstVariant.price) : null,
    currency,
    compareAtPrice: firstVariant?.compareAtPrice ? parseFloat(firstVariant.compareAtPrice) : null,
    availability: firstVariant?.availableForSale ? "InStock" : "OutOfStock",
    sku: firstVariant?.sku ?? null,
    barcode: firstVariant?.barcode ?? null,
    images: product.images.edges.map((e) => ({ url: e.node.url, alt: e.node.altText })),
    variants: product.variants.edges.map((e) => ({
      id: e.node.id,
      title: e.node.title,
      sku: e.node.sku,
      barcode: e.node.barcode,
      price: parseFloat(e.node.price),
      currency: resolveVariantCurrency(e.node),
      available: e.node.availableForSale,
      options: e.node.selectedOptions,
      image: e.node.image?.url ?? null,
      weight: e.node.weight ?? null,
      weightUnit: e.node.weightUnit ?? null,
    })),
    collections: product.collections.edges.map((e) => ({
      title: e.node.title,
      handle: e.node.handle,
    })),
    metafields: Object.fromEntries(
      product.metafields.edges.map((e) => [`${e.node.namespace}.${e.node.key}`, e.node.value]),
    ),
    seoTitle: product.seo.title,
    seoDescription: product.seo.description,
    handle: product.handle,
    reviewCount: null,
    ratingValue: null,
    updatedAt: product.updatedAt,
  };
}

function detectMaterial(mapped: MappedProduct): boolean {
  // Check metafields first (most reliable)
  for (const key of MATERIAL_METAFIELD_KEYS) {
    if (mapped.metafields[key]) return true;
  }
  // Check variant options
  if (mapped.variants.some((v) => v.options.some((o) => o.name.toLowerCase() === "material"))) {
    return true;
  }
  // Check description text
  const descLower = mapped.description.toLowerCase();
  return MATERIAL_KEYWORDS.some((keyword) => descLower.includes(keyword));
}

function hasAnyGtin(mapped: MappedProduct): boolean {
  return mapped.variants.some((v) => v.barcode !== null && v.barcode.length >= 8);
}

async function upsertProduct(storeId: string, mapped: MappedProduct) {
  if (!db) return;

  const existing = await db.query.products.findFirst({
    where: and(
      eq(products.storeId, storeId),
      eq(products.platformProductId, mapped.platformProductId),
    ),
  });

  const optionNames = new Set(
    mapped.variants.flatMap((v) => v.options.map((o) => o.name.toLowerCase())),
  );

  const record = {
    storeId,
    platformProductId: mapped.platformProductId,
    url: mapped.url,
    name: mapped.name,
    price: mapped.price?.toString() ?? null,
    currency: mapped.currency,
    availability: mapped.availability,
    hasGtin: hasAnyGtin(mapped),
    hasBrand: mapped.vendor.length > 0,
    hasColor: optionNames.has("color") || optionNames.has("colour"),
    hasSize: optionNames.has("size"),
    hasMaterial: detectMaterial(mapped),
    hasWeight: mapped.variants.some((v) => v.weight !== null && v.weight > 0),
    hasVariantsStructured: mapped.variants.length > 1,
    originalDescription: mapped.description,
    extractedAttributes: {
      vendor: mapped.vendor,
      productType: mapped.productType,
      tags: mapped.tags,
      images: mapped.images,
      variants: mapped.variants,
      collections: mapped.collections,
      metafields: mapped.metafields,
      seoTitle: mapped.seoTitle,
      seoDescription: mapped.seoDescription,
      descriptionHtml: mapped.descriptionHtml,
    } as Record<string, unknown>,
  };

  if (existing) {
    await db.update(products).set(record).where(eq(products.id, existing.id));
  } else {
    await db.insert(products).values(record);
  }
}

/** Get the total active product count for a store */
export async function getProductCount(shop: string, accessToken: string): Promise<number> {
  const data = await shopifyGql<{ productsCount: { count: number } }>(
    shop,
    accessToken,
    PRODUCT_COUNT_QUERY,
  );
  return data.productsCount.count;
}

export interface SyncProgress {
  synced: number;
  page: number;
}

/**
 * Full catalog sync — paginates through all ACTIVE products and upserts to DB.
 *
 * @param onProgress - Optional callback fired after each page for UI updates
 */
export async function syncAllProducts(
  shop: string,
  accessToken: string,
  storeId: string,
  shopCurrency: string,
  onProgress?: (progress: SyncProgress) => void,
): Promise<number> {
  let cursor: string | null = null;
  let totalSynced = 0;
  let page = 0;

  while (true) {
    const data: ShopifyProductsResponse = await shopifyGql<ShopifyProductsResponse>(shop, accessToken, PRODUCTS_QUERY, {
      first: PAGE_SIZE,
      after: cursor,
    });

    const edges = data.products.edges;
    page++;

    for (const edge of edges) {
      const mapped = mapShopifyProduct(edge.node, shop, shopCurrency);
      await upsertProduct(storeId, mapped);
      totalSynced++;
    }

    onProgress?.({ synced: totalSynced, page });

    if (!data.products.pageInfo.hasNextPage || !data.products.pageInfo.endCursor) {
      break;
    }

    cursor = data.products.pageInfo.endCursor;
  }

  if (db) {
    await db.update(stores).set({ productCount: totalSynced, updatedAt: new Date() }).where(eq(stores.id, storeId));
  }

  return totalSynced;
}

/** Single product sync — fetch one product by Shopify GID and upsert */
export async function syncSingleProduct(
  shop: string,
  accessToken: string,
  storeId: string,
  productGid: string,
  shopCurrency: string,
): Promise<MappedProduct> {
  const data = await shopifyGql<{ product: ShopifyProduct | null }>(shop, accessToken, PRODUCT_BY_ID_QUERY, {
    id: productGid,
  });

  if (!data.product) {
    throw new Error(`Product not found: ${productGid}`);
  }

  const mapped = mapShopifyProduct(data.product, shop, shopCurrency);
  await upsertProduct(storeId, mapped);

  return mapped;
}

/** Fetch store-level policies from Shopify Admin API */
export async function fetchShopPolicies(
  shop: string,
  accessToken: string,
): Promise<{ shippingPolicy: { url: string | null; body: string } | null; refundPolicy: { url: string | null; body: string } | null }> {
  try {
    const data = await shopifyGql<ShopPoliciesResponse>(shop, accessToken, SHOP_POLICIES_QUERY);
    const policies = data.shopPolicies ?? [];

    const shipping = policies.find((p) => p.type === "SHIPPING_POLICY") ?? null;
    const refund = policies.find((p) => p.type === "REFUND_POLICY") ?? null;

    return {
      shippingPolicy: shipping ? { url: shipping.url, body: shipping.body } : null,
      refundPolicy: refund ? { url: refund.url, body: refund.body } : null,
    };
  } catch (err) {
    console.error("[fetchShopPolicies] Failed:", err);
    return { shippingPolicy: null, refundPolicy: null };
  }
}

/**
 * Build a complete StoreConfig from a store record + live Shopify policies.
 * Falls back gracefully if API calls fail.
 */
export async function buildStoreConfig(store: Store): Promise<StoreConfig> {
  const config: StoreConfig = {
    storeName: store.name ?? store.shopifyShop ?? "Store",
    storeUrl: store.url,
    currency: "AUD",
    country: "AU",
  };

  if (store.shopifyShop && store.shopifyAccessToken) {
    try {
      const accessToken = decryptAccessToken(store.shopifyAccessToken);

      // Fetch shop info for accurate currency/country
      try {
        const shopInfo = await getShopInfo(store.shopifyShop, accessToken);
        config.currency = shopInfo.currencyCode || "AUD";
        config.country = shopInfo.country || "AU";
      } catch (err) {
        console.error("[buildStoreConfig] Failed to fetch shop info:", err);
      }

      // Fetch policies (never throws — returns nulls on failure)
      const policies = await fetchShopPolicies(store.shopifyShop, accessToken);

      if (policies.refundPolicy?.url) {
        config.returnPolicyUrl = policies.refundPolicy.url;
        const daysMatch = policies.refundPolicy.body?.match(/(\d+)\s*days?/i);
        if (daysMatch) config.returnDays = parseInt(daysMatch[1]!, 10);
        else config.returnDays = 30;
        config.returnMethod = "ReturnByMail";
      }

      if (policies.shippingPolicy?.url) {
        config.shippingRate = "0";
        config.shippingMinDays = 3;
        config.shippingMaxDays = 10;
      }
    } catch (err) {
      console.error("[buildStoreConfig] Failed:", err);
    }
  }

  return config;
}

/**
 * Check whether the store has shipping/return policies configured in Shopify.
 * Returns flags that can be used to update product records after auto-fix.
 */
export function policyFlags(config: StoreConfig): {
  hasShippingPolicy: boolean;
  hasReturnPolicy: boolean;
} {
  return {
    hasShippingPolicy: config.shippingRate !== undefined,
    hasReturnPolicy: config.returnDays !== undefined,
  };
}
