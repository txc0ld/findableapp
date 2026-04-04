/**
 * GDPR Handlers — mandatory for Shopify app review.
 *
 * Shopify requires apps to handle three GDPR webhook topics:
 * 1. customers/data_request — merchant requests customer data export
 * 2. customers/redact — merchant requests customer data deletion
 * 3. shop/redact — 48 hours after app uninstall, delete ALL store data
 *
 * Wire into the webhook switch in apps/api/src/routes/shopify.ts:
 *
 *   case "customers/data_request":
 *     await handleCustomersDataRequest(store?.id ?? null, payload);
 *     break;
 *   case "customers/redact":
 *     await handleCustomersRedact(payload);
 *     break;
 *   case "shop/redact":
 *     await handleShopRedact(store?.id ?? null, payload);
 *     break;
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import {
  stores,
  products,
  issues,
  scans,
  feeds,
  competitors,
  alerts,
  shopifyWebhookDeliveries,
} from "../db/schema";
import type { GdprCustomerPayload, GdprShopPayload } from "../types/shopify";

/**
 * CUSTOMERS_DATA_REQUEST
 *
 * FindAble stores product and store-level data only — no individual customer PII.
 */
export async function handleCustomersDataRequest(
  _storeId: string | null,
  payload: GdprCustomerPayload,
): Promise<void> {
  console.log(
    `[GDPR] customers/data_request for customer ${payload.customer.id} from ${payload.shop_domain} — no customer data stored`,
  );
}

/**
 * CUSTOMERS_REDACT
 *
 * No-op — FindAble does not store individual customer data.
 */
export async function handleCustomersRedact(payload: GdprCustomerPayload): Promise<void> {
  console.log(
    `[GDPR] customers/redact for customer ${payload.customer.id} from ${payload.shop_domain} — no customer data to delete`,
  );
}

/**
 * SHOP_REDACT
 *
 * Shopify sends this 48 hours after app uninstall.
 * Deletes ALL data associated with the store. This is mandatory.
 */
export async function handleShopRedact(
  storeId: string | null,
  payload: GdprShopPayload,
): Promise<void> {
  if (!db) {
    console.error("[GDPR] shop/redact received but no database configured.");
    return;
  }

  console.log(`[GDPR] shop/redact for ${payload.shop_domain} — deleting all store data`);

  // Resolve storeId from shop domain if not passed
  let targetStoreId = storeId;
  if (!targetStoreId) {
    const store = await db.query.stores.findFirst({
      where: eq(stores.shopifyShop, payload.shop_domain),
      columns: { id: true },
    });
    targetStoreId = store?.id ?? null;
  }

  if (!targetStoreId) {
    console.log(`[GDPR] shop/redact — no store found for ${payload.shop_domain}, nothing to delete`);
    return;
  }

  // Collect product IDs for batch issue deletion
  const storeProducts = await db.query.products.findMany({
    where: eq(products.storeId, targetStoreId),
    columns: { id: true },
  });

  const productIds = storeProducts.map((p) => p.id);

  // Batch delete issues by product IDs (avoids N+1 loop)
  if (productIds.length > 0) {
    await db.delete(issues).where(inArray(issues.productId, productIds));
  }

  // Collect scan IDs for orphaned issue cleanup
  const storeScans = await db.query.scans.findMany({
    where: eq(scans.storeId, targetStoreId),
    columns: { id: true },
  });
  const scanIds = storeScans.map((s) => s.id);
  if (scanIds.length > 0) {
    await db.delete(issues).where(inArray(issues.scanId, scanIds));
  }

  // Delete all store data in dependency order
  await db.delete(products).where(eq(products.storeId, targetStoreId));
  await db.delete(scans).where(eq(scans.storeId, targetStoreId));
  await db.delete(feeds).where(eq(feeds.storeId, targetStoreId));
  await db.delete(competitors).where(eq(competitors.storeId, targetStoreId));
  await db.delete(alerts).where(eq(alerts.storeId, targetStoreId));
  await db.delete(shopifyWebhookDeliveries).where(eq(shopifyWebhookDeliveries.storeId, targetStoreId));
  await db.delete(stores).where(eq(stores.id, targetStoreId));

  console.log(`[GDPR] shop/redact complete for ${payload.shop_domain} (store ${targetStoreId}) — ${productIds.length} products, ${scanIds.length} scans deleted`);
}
