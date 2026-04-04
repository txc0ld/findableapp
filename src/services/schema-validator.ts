/**
 * Schema Validator — checks generated JSON-LD before serving.
 *
 * Returns a "safe to publish" indicator and any issues found.
 * The storefront loader uses the `safe` flag to skip injection
 * when critical validation fails.
 */

export interface ValidationResult {
  safe: boolean;
  errors: string[]; // blocking issues
  warnings: string[]; // non-blocking suggestions
}

interface ProductContext {
  price?: number | undefined;
  availability?: string | undefined;
  name?: string | undefined;
}

/**
 * Validate a single JSON-LD schema object against Google Rich Results
 * requirements and product data parity.
 */
export function validateSchema(
  schema: unknown,
  product: ProductContext,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── JSON shape check ──────────────────────────────────────────────
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return { safe: false, errors: ["Schema is not a valid object."], warnings };
  }

  const s = schema as Record<string, unknown>;

  if (!s["@type"]) {
    errors.push("Missing @type field.");
    return { safe: false, errors, warnings };
  }

  const schemaType = String(s["@type"]);

  // Only run product-specific checks on Product / ProductGroup schemas
  if (schemaType !== "Product" && schemaType !== "ProductGroup") {
    return { safe: true, errors, warnings };
  }

  // ── Required Google Rich Results fields ───────────────────────────
  if (!s.name) {
    errors.push("Missing required field: name.");
  }

  if (!s.offers) {
    errors.push("Missing required field: offers.");
  } else {
    validateOffers(s.offers, errors, warnings);
  }

  // ── Image presence ────────────────────────────────────────────────
  if (!s.image) {
    warnings.push("No image provided. Google recommends at least one image.");
  } else if (Array.isArray(s.image) && s.image.length === 0) {
    warnings.push("Image array is empty. Google recommends at least one image.");
  }

  // ── Brand presence ────────────────────────────────────────────────
  if (!s.brand) {
    warnings.push("No brand provided. Brand improves Rich Results eligibility.");
  }

  // ── Price parity ──────────────────────────────────────────────────
  if (product.price !== undefined && product.price !== null && s.offers) {
    const offerPrice = extractOfferPrice(s.offers);
    if (offerPrice !== null && Math.abs(offerPrice - product.price) > 0.01) {
      errors.push(
        `Price mismatch: schema has ${offerPrice}, product has ${product.price}.`,
      );
    }
  }

  // ── Availability parity ───────────────────────────────────────────
  if (product.availability && s.offers) {
    const offerAvailability = extractOfferAvailability(s.offers);
    if (offerAvailability !== null) {
      const normalizedSchema = normalizeAvailability(offerAvailability);
      const normalizedProduct = normalizeAvailability(product.availability);
      if (normalizedSchema && normalizedProduct && normalizedSchema !== normalizedProduct) {
        errors.push(
          `Availability mismatch: schema has "${offerAvailability}", product has "${product.availability}".`,
        );
      }
    }
  }

  // ── Name parity ───────────────────────────────────────────────────
  if (product.name && s.name) {
    const schemaName = String(s.name).trim().toLowerCase();
    const productName = product.name.trim().toLowerCase();
    if (schemaName !== productName) {
      errors.push(
        `Name mismatch: schema has "${s.name}", product has "${product.name}".`,
      );
    }
  }

  // ── Duplicate @type in @graph ─────────────────────────────────────
  if (s["@graph"] && Array.isArray(s["@graph"])) {
    const productTypes = (s["@graph"] as Array<Record<string, unknown>>).filter(
      (node) => node["@type"] === "Product",
    );
    if (productTypes.length > 1) {
      warnings.push(
        `Multiple Product @type nodes found in @graph (${productTypes.length}). This may confuse parsers.`,
      );
    }
  }

  return { safe: errors.length === 0, errors, warnings };
}

/**
 * Validate an array of schemas and merge results into a single ValidationResult.
 */
export function validateAllSchemas(
  schemas: unknown[],
  product: ProductContext,
): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const schema of schemas) {
    const result = validateSchema(schema, product);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  // Check for duplicate Product types across the full schema array
  const productTypeCount = schemas.filter((s) => {
    if (typeof s !== "object" || s === null) return false;
    const type = (s as Record<string, unknown>)["@type"];
    return type === "Product";
  }).length;

  if (productTypeCount > 1) {
    allWarnings.push(
      `Multiple standalone Product schemas detected (${productTypeCount}). Consider using ProductGroup with hasVariant.`,
    );
  }

  return {
    safe: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function validateOffers(
  offers: unknown,
  errors: string[],
  warnings: string[],
): void {
  const offerObj = resolveFirstOffer(offers);
  if (!offerObj) return;

  if (!offerObj.price && offerObj.price !== 0) {
    errors.push("Offer is missing price.");
  }
  if (!offerObj.priceCurrency) {
    errors.push("Offer is missing priceCurrency.");
  }
  if (!offerObj.availability) {
    warnings.push("Offer is missing availability.");
  }
}

function resolveFirstOffer(
  offers: unknown,
): Record<string, unknown> | null {
  if (typeof offers !== "object" || offers === null) return null;

  // Single offer object
  const o = offers as Record<string, unknown>;
  if (o["@type"] === "Offer") return o;

  // AggregateOffer or array
  if (Array.isArray(offers) && offers.length > 0) {
    return resolveFirstOffer(offers[0]);
  }

  if (o.offers) {
    return resolveFirstOffer(o.offers);
  }

  return o;
}

function extractOfferPrice(offers: unknown): number | null {
  const offer = resolveFirstOffer(offers);
  if (!offer || offer.price === undefined || offer.price === null) return null;
  const parsed = parseFloat(String(offer.price));
  return Number.isNaN(parsed) ? null : parsed;
}

function extractOfferAvailability(offers: unknown): string | null {
  const offer = resolveFirstOffer(offers);
  if (!offer || !offer.availability) return null;
  return String(offer.availability);
}

function normalizeAvailability(value: string): string | null {
  const lower = value.toLowerCase();
  if (lower.includes("instock")) return "instock";
  if (lower.includes("outofstock")) return "outofstock";
  if (lower.includes("preorder")) return "preorder";
  if (lower.includes("discontinue")) return "discontinued";
  return lower;
}
