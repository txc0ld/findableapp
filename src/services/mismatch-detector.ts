/**
 * Mismatch Detector — compares product data across DB and generated schema.
 *
 * The #1 cause of Google product disapprovals is mismatched data between
 * what the merchant database says and what the structured data on the page
 * (or feed) declares.  This service detects those mismatches so the scan
 * report can surface actionable fixes.
 *
 * Usage:
 *   import { detectMismatches } from "./mismatch-detector";
 *   const results = await detectMismatches(storeId);
 */

import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { products } from "../db/schema";

export interface MismatchResult {
  productId: string;
  productName: string;
  mismatches: {
    field: string; // "price", "availability", "title", "gtin"
    severity: "critical" | "high" | "medium";
    dbValue: string;
    schemaValue: string;
    message: string;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a price string for comparison (strip currency symbols, trailing zeros). */
function normalisePrice(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[^0-9.]/g, "");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return n.toFixed(2);
}

/** Map common availability strings to a canonical form. */
function normaliseAvailability(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().trim();
  if (s.includes("instock") || s.includes("in_stock") || s === "in stock") {
    return "InStock";
  }
  if (s.includes("outofstock") || s.includes("out_of_stock") || s === "out of stock") {
    return "OutOfStock";
  }
  if (s.includes("preorder") || s.includes("pre_order") || s === "pre order") {
    return "PreOrder";
  }
  return s;
}

/** Trim & collapse whitespace for title comparison. */
function normaliseTitle(raw: unknown): string | null {
  if (raw == null) return null;
  return String(raw).trim().replace(/\s+/g, " ");
}

/** Strip non-digit characters from GTIN/barcode values. */
function normaliseGtin(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\D/g, "");
  return s.length > 0 ? s : null;
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Scan every product in `storeId` and compare DB fields against the
 * corresponding values inside `generatedSchema` (JSON-LD).
 *
 * Also persists `priceMismatch` and `availabilityMismatch` booleans back to
 * the products table so downstream reports can query them cheaply.
 */
export async function detectMismatches(
  storeId: string,
): Promise<MismatchResult[]> {
  if (!db) throw new Error("Database not configured");

  const storeProducts = await db.query.products.findMany({
    where: eq(products.storeId, storeId),
  });

  const results: MismatchResult[] = [];

  for (const p of storeProducts) {
    const schema = p.generatedSchema as Record<string, unknown> | null;
    if (!schema) continue; // nothing to compare

    const mismatches: MismatchResult["mismatches"] = [];

    // --- Offers sub-object (holds price + availability in JSON-LD) ---
    const offers = (schema.offers ?? schema.Offers) as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined;
    const offer: Record<string, unknown> | undefined = Array.isArray(offers)
      ? offers[0]
      : offers;

    // 1. Price
    const dbPrice = normalisePrice(p.price);
    const schemaPrice = normalisePrice(offer?.price);
    if (dbPrice && schemaPrice && dbPrice !== schemaPrice) {
      mismatches.push({
        field: "price",
        severity: "critical",
        dbValue: dbPrice,
        schemaValue: schemaPrice,
        message: `DB price $${dbPrice} does not match schema price $${schemaPrice}.`,
      });
    }

    // 2. Availability
    const dbAvail = normaliseAvailability(p.availability);
    const schemaAvail = normaliseAvailability(offer?.availability);
    if (dbAvail && schemaAvail && dbAvail !== schemaAvail) {
      mismatches.push({
        field: "availability",
        severity: "critical",
        dbValue: dbAvail,
        schemaValue: schemaAvail,
        message: `DB availability "${dbAvail}" does not match schema "${schemaAvail}".`,
      });
    }

    // 3. Title / Name
    const dbName = normaliseTitle(p.name);
    const schemaName = normaliseTitle(schema.name);
    if (dbName && schemaName && dbName !== schemaName) {
      mismatches.push({
        field: "title",
        severity: "high",
        dbValue: dbName,
        schemaValue: schemaName,
        message: `DB title "${dbName}" does not match schema name "${schemaName}".`,
      });
    }

    // 4. GTIN / Barcode
    const attrs = p.extractedAttributes as Record<string, unknown> | null;
    const dbGtin = normaliseGtin(attrs?.barcode ?? attrs?.gtin);
    const schemaGtin = normaliseGtin(schema.gtin);
    if (dbGtin && schemaGtin && dbGtin !== schemaGtin) {
      mismatches.push({
        field: "gtin",
        severity: "medium",
        dbValue: dbGtin,
        schemaValue: schemaGtin,
        message: `DB barcode "${dbGtin}" does not match schema GTIN "${schemaGtin}".`,
      });
    }

    // ---- Persist mismatch flags ----
    const hasPriceMismatch = mismatches.some((m) => m.field === "price");
    const hasAvailMismatch = mismatches.some((m) => m.field === "availability");

    if (hasPriceMismatch !== p.priceMismatch || hasAvailMismatch !== p.availabilityMismatch) {
      await db
        .update(products)
        .set({
          priceMismatch: hasPriceMismatch,
          availabilityMismatch: hasAvailMismatch,
        })
        .where(eq(products.id, p.id));
    }

    if (mismatches.length > 0) {
      results.push({
        productId: p.id,
        productName: p.name ?? "(unnamed)",
        mismatches,
      });
    }
  }

  return results;
}
