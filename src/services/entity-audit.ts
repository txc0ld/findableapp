/**
 * Entity Consistency Audit — detects brand name inconsistencies across a store.
 *
 * If the brand is "Acme Co" on the homepage, "ACME" in schema, and
 * "Acme Company" in the feed, AI agents see multiple entities and
 * reduce confidence in answers about the store.
 *
 * Usage:
 *   import { auditEntityConsistency } from "./entity-audit";
 *   const result = await auditEntityConsistency(storeId);
 */

import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { products, stores } from "../db/schema";

export interface EntityAuditResult {
  consistent: boolean;
  primaryBrand: string;
  variants: { source: string; value: string }[];
  issues: string[];
}

/**
 * Audit brand/entity consistency across all products in a store.
 *
 * Collects vendor/brand values from extractedAttributes, generatedSchema,
 * and the store name itself. Reports any mismatches so operators can fix
 * them before AI agents penalise discoverability.
 */
export async function auditEntityConsistency(
  storeId: string,
): Promise<EntityAuditResult> {
  if (!db) throw new Error("Database not configured");

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  if (!store) throw new Error(`Store ${storeId} not found`);

  const storeProducts = await db.query.products.findMany({
    where: eq(products.storeId, storeId),
  });

  // ---- Collect every brand/vendor mention with its source ----

  const seen: { source: string; value: string }[] = [];

  // Store-level name
  if (store.name) {
    seen.push({ source: "store.name", value: store.name });
  }

  // Shopify shop domain (strip .myshopify.com for comparison)
  if (store.shopifyShop) {
    const shopLabel = store.shopifyShop
      .replace(/\.myshopify\.com$/, "")
      .replace(/-/g, " ");
    seen.push({ source: "store.shopifyShop", value: shopLabel });
  }

  for (const p of storeProducts) {
    const attrs = p.extractedAttributes as Record<string, unknown> | null;
    if (attrs?.vendor && typeof attrs.vendor === "string") {
      seen.push({
        source: `product[${p.id}].extractedAttributes.vendor`,
        value: attrs.vendor,
      });
    }

    // Brand inside generatedSchema (JSON-LD "brand.name")
    const schema = p.generatedSchema as Record<string, unknown> | null;
    if (schema) {
      const brand = schema.brand as Record<string, unknown> | undefined;
      if (brand?.name && typeof brand.name === "string") {
        seen.push({
          source: `product[${p.id}].generatedSchema.brand.name`,
          value: brand.name,
        });
      }
    }
  }

  if (seen.length === 0) {
    return {
      consistent: true,
      primaryBrand: store.name ?? "",
      variants: [],
      issues: ["No brand data found across products — nothing to audit."],
    };
  }

  // ---- Determine primary brand (most common value, case-insensitive) ----

  const freq = new Map<string, { original: string; count: number }>();
  for (const s of seen) {
    const key = s.value.trim().toLowerCase();
    const existing = freq.get(key);
    if (existing) {
      existing.count++;
    } else {
      freq.set(key, { original: s.value.trim(), count: 1 });
    }
  }

  let primaryBrand = "";
  let maxCount = 0;
  for (const entry of freq.values()) {
    if (entry.count > maxCount) {
      maxCount = entry.count;
      primaryBrand = entry.original;
    }
  }

  // ---- Build unique variants list ----

  const uniqueVariants = new Map<string, { source: string; value: string }>();
  for (const s of seen) {
    const key = s.value.trim().toLowerCase();
    if (!uniqueVariants.has(key)) {
      uniqueVariants.set(key, { source: s.source, value: s.value.trim() });
    }
  }
  const variants = [...uniqueVariants.values()];

  // ---- Flag issues ----

  const issues: string[] = [];
  const primaryKey = primaryBrand.toLowerCase();

  for (const v of variants) {
    const vKey = v.value.toLowerCase();
    if (vKey === primaryKey) continue;

    // Exact mismatch
    issues.push(
      `Brand mismatch: "${v.value}" (from ${v.source}) differs from primary brand "${primaryBrand}".`,
    );
  }

  // Case-only differences (e.g. "ACME" vs "Acme")
  for (const v of variants) {
    const vKey = v.value.toLowerCase();
    if (vKey !== primaryKey) continue;
    if (v.value !== primaryBrand) {
      issues.push(
        `Casing inconsistency: "${v.value}" (from ${v.source}) vs "${primaryBrand}" — same brand, different casing.`,
      );
    }
  }

  const consistent = issues.length === 0;

  return { consistent, primaryBrand, variants, issues };
}
