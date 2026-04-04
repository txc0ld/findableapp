/**
 * Schema Generator — builds complete, gold-standard JSON-LD from Shopify product data.
 *
 * Produces every schema type scored in the PRD rubric:
 * - Product / ProductGroup with hasVariant (+5 each)
 * - Full Offer: price, currency, availability, condition, seller, shipping, returns, priceValidUntil
 * - Brand, SKU, GTIN (13/14/12/8), MPN
 * - AggregateRating + Review
 * - Category-specific additionalProperty (material, dimensions, certifications)
 * - BreadcrumbList (from real Shopify collections)
 * - FAQPage
 * - Organization
 *
 * Every field maps to a scoring check in PRD section 3.1.
 */

import type { MappedProduct, ShopifySelectedOption } from "../types/shopify";

export interface StoreConfig {
  storeName: string;
  storeUrl: string;
  currency: string;
  country: string;
  shippingRate?: string;
  shippingMinDays?: number;
  shippingMaxDays?: number;
  handlingMinDays?: number;
  handlingMaxDays?: number;
  returnDays?: number;
  returnMethod?: string;
  freeReturns?: boolean;
  returnPolicyUrl?: string;
  logoUrl?: string;
}

const WEIGHT_UNIT_MAP: Record<string, string> = {
  GRAMS: "GRM",
  KILOGRAMS: "KGM",
  OUNCES: "ONZ",
  POUNDS: "LBR",
};

function sanitizeDescription(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyGtin(barcode: string): { key: string; value: string } | null {
  const clean = barcode.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(clean)) return null;
  if (clean.length === 14) return { key: "gtin14", value: clean };
  if (clean.length === 13) return { key: "gtin13", value: clean };
  if (clean.length === 12) return { key: "gtin12", value: clean };
  if (clean.length === 8) return { key: "gtin8", value: clean };
  return { key: "gtin", value: clean };
}

function extractOptionValue(options: ShopifySelectedOption[], ...names: string[]): string | null {
  for (const opt of options) {
    if (names.includes(opt.name.toLowerCase())) return opt.value;
  }
  return null;
}

function extractFromMetafields(metafields: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (metafields[key]) return metafields[key];
  }
  return null;
}

function extractMaterial(product: MappedProduct): string | null {
  // Metafields take priority (merchant-entered structured data)
  const fromMeta = extractFromMetafields(
    product.metafields,
    "custom.material", "custom.materials", "custom.fabric",
    "descriptors.material", "descriptors.subtitle.material",
    "shopify.material", "shopify.fabric",
  );
  if (fromMeta) return fromMeta;

  // Variant options
  for (const v of product.variants) {
    const val = extractOptionValue(v.options, "material", "fabric");
    if (val) return val;
  }

  return null;
}

function extractColor(product: MappedProduct): string | null {
  for (const v of product.variants) {
    const val = extractOptionValue(v.options, "color", "colour");
    if (val) return val;
  }
  return extractFromMetafields(product.metafields, "custom.color", "descriptors.color");
}

function extractSize(product: MappedProduct): string | null {
  for (const v of product.variants) {
    const val = extractOptionValue(v.options, "size");
    if (val) return val;
  }
  return null;
}

function priceValidUntil(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split("T")[0] ?? "";
}

function buildWeight(weight: number | null, weightUnit: string): Record<string, unknown> | null {
  if (!weight || weight <= 0) return null;
  return {
    "@type": "QuantitativeValue",
    value: weight.toString(),
    unitCode: WEIGHT_UNIT_MAP[weightUnit] ?? "GRM",
  };
}

function buildShippingDetails(config: StoreConfig): Record<string, unknown> | null {
  if (config.shippingRate === undefined) return null;

  const shipping: Record<string, unknown> = {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: config.shippingRate,
      currency: config.currency,
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: config.country,
    },
  };

  if (config.shippingMinDays !== undefined && config.shippingMaxDays !== undefined) {
    shipping.deliveryTime = {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: config.handlingMinDays ?? 1,
        maxValue: config.handlingMaxDays ?? 2,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: config.shippingMinDays,
        maxValue: config.shippingMaxDays,
        unitCode: "DAY",
      },
    };
  }

  return shipping;
}

function buildReturnPolicy(config: StoreConfig): Record<string, unknown> | null {
  if (config.returnDays === undefined) return null;

  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: config.country,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: config.returnDays,
    returnMethod: config.returnMethod
      ? `https://schema.org/${config.returnMethod}`
      : "https://schema.org/ReturnByMail",
    returnFees: config.freeReturns
      ? "https://schema.org/FreeReturn"
      : "https://schema.org/ReturnShippingFees",
    ...(config.returnPolicyUrl ? { merchantReturnLink: config.returnPolicyUrl } : {}),
  };
}

function buildOffer(
  product: MappedProduct,
  variant: MappedProduct["variants"][0],
  config: StoreConfig,
): Record<string, unknown> {
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    "@id": `${product.url}#offer`,
    price: variant.price.toFixed(2),
    priceCurrency: variant.currency || config.currency,
    availability: variant.available
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    priceValidUntil: priceValidUntil(),
    seller: {
      "@type": "Organization",
      "@id": `https://${config.storeUrl.replace(/^https?:\/\//, "")}#organization`,
      name: config.storeName,
    },
    url: product.url,
  };

  if (variant.sku) offer.sku = variant.sku;

  const shipping = buildShippingDetails(config);
  if (shipping) offer.shippingDetails = shipping;

  const returnPolicy = buildReturnPolicy(config);
  if (returnPolicy) offer.hasMerchantReturnPolicy = returnPolicy;

  return offer;
}

function buildAdditionalProperties(product: MappedProduct): Array<Record<string, unknown>> {
  const props: Array<Record<string, unknown>> = [];

  // Extract from metafields — common product attribute metafields
  const attrMetafields: Array<[string[], string]> = [
    [["custom.fabric_weight", "custom.gsm"], "Fabric Weight"],
    [["custom.fit", "descriptors.fit"], "Fit"],
    [["custom.body_length", "custom.length"], "Body Length"],
    [["custom.certification", "custom.certifications"], "Certification"],
    [["custom.origin", "custom.country_of_origin", "custom.made_in"], "Country of Origin"],
    [["custom.care", "custom.care_instructions"], "Care Instructions"],
    [["custom.dimensions"], "Dimensions"],
    [["custom.capacity", "custom.volume"], "Capacity"],
    [["custom.power", "custom.wattage"], "Power"],
    [["custom.compatibility"], "Compatibility"],
  ];

  for (const [keys, label] of attrMetafields) {
    const value = extractFromMetafields(product.metafields, ...keys);
    if (value) {
      props.push({
        "@type": "PropertyValue",
        name: label,
        value,
      });
    }
  }

  // Extract from tags (e.g., "gsm:300", "fit:relaxed")
  for (const tag of product.tags) {
    const colonIndex = tag.indexOf(":");
    if (colonIndex > 0) {
      const key = tag.slice(0, colonIndex).trim();
      const value = tag.slice(colonIndex + 1).trim();
      if (key && value && !props.some((p) => (p.name as string).toLowerCase() === key.toLowerCase())) {
        props.push({
          "@type": "PropertyValue",
          name: key.charAt(0).toUpperCase() + key.slice(1),
          value,
        });
      }
    }
  }

  return props;
}

function buildAggregateRating(
  product: MappedProduct,
): Record<string, unknown> | null {
  if (!product.ratingValue || !product.reviewCount || product.reviewCount === 0) {
    return null;
  }

  return {
    "@type": "AggregateRating",
    ratingValue: product.ratingValue.toFixed(1),
    reviewCount: product.reviewCount.toString(),
  };
}

/** Generate a single Product schema */
function buildSingleProductSchema(
  product: MappedProduct,
  config: StoreConfig,
  skipAggregateRating = false,
): Record<string, unknown> {
  const variant = product.variants[0];
  if (!variant) {
    throw new Error(`Product ${product.platformProductId} has no variants.`);
  }

  const description = sanitizeDescription(product.description);
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${product.url}#product`,
    name: product.name,
    url: product.url,
    image: product.images.length > 0 ? product.images.map((i) => i.url) : undefined,
    brand: product.vendor
      ? { "@type": "Brand", "@id": `${product.url}#brand`, name: product.vendor }
      : undefined,
    offers: buildOffer(product, variant, config),
  };

  if (description.length > 0) schema.description = description;
  if (variant.sku) schema.sku = variant.sku;
  if (product.productType) schema.category = product.productType;

  // GTIN — scored at +5 points
  if (variant.barcode) {
    const gtin = classifyGtin(variant.barcode);
    if (gtin) schema[gtin.key] = gtin.value;
  }

  // MPN — scored at +2 points
  const mpn = extractFromMetafields(product.metafields, "custom.mpn", "custom.manufacturer_part_number");
  if (mpn) schema.mpn = mpn;

  // Color, size, material — scored at +2/+2/+3 points
  const color = extractColor(product);
  if (color) schema.color = color;
  const size = extractSize(product);
  if (size) schema.size = size;
  const material = extractMaterial(product);
  if (material) schema.material = material;

  // Weight — scored at +2 points
  const weight = buildWeight(variant.weight, variant.weightUnit);
  if (weight) schema.weight = weight;

  // AdditionalProperty — scored at +3 points
  const additionalProps = buildAdditionalProperties(product);
  if (additionalProps.length > 0) schema.additionalProperty = additionalProps;

  // AggregateRating — scored at +3 points (skip if a review app already owns this)
  if (!skipAggregateRating) {
    const rating = buildAggregateRating(product);
    if (rating) schema.aggregateRating = rating;
  }

  return schema;
}

/** Generate ProductGroup + hasVariant schema */
function buildProductGroupSchema(
  product: MappedProduct,
  config: StoreConfig,
  skipAggregateRating = false,
): Record<string, unknown> {
  const description = sanitizeDescription(product.description);

  // Determine what varies between variants
  const varyingOptions = new Set<string>();
  for (const v of product.variants) {
    for (const opt of v.options) {
      if (opt.name.toLowerCase() !== "title" && opt.value.toLowerCase() !== "default title") {
        varyingOptions.add(opt.name);
      }
    }
  }

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${product.url}#product`,
    name: product.name,
    url: product.url,
    image: product.images.length > 0 ? product.images.map((i) => i.url) : undefined,
    brand: product.vendor
      ? { "@type": "Brand", "@id": `${product.url}#brand`, name: product.vendor }
      : undefined,
    productGroupID: product.platformProductId,
    variesBy: Array.from(varyingOptions).map(
      (opt) => `https://schema.org/${opt.toLowerCase()}`,
    ),
  };

  if (description.length > 0) schema.description = description;
  if (product.productType) schema.category = product.productType;

  const material = extractMaterial(product);
  if (material) schema.material = material;

  const mpn = extractFromMetafields(product.metafields, "custom.mpn", "custom.manufacturer_part_number");
  if (mpn) schema.mpn = mpn;

  const additionalProps = buildAdditionalProperties(product);
  if (additionalProps.length > 0) schema.additionalProperty = additionalProps;

  // AggregateRating (skip if a review app already owns this)
  if (!skipAggregateRating) {
    const rating = buildAggregateRating(product);
    if (rating) schema.aggregateRating = rating;
  }

  schema.hasVariant = product.variants.map((variant) => {
    const variantSchema: Record<string, unknown> = {
      "@type": "Product",
      name: `${product.name} - ${variant.title}`,
      url: product.url,
      offers: buildOffer(product, variant, config),
    };

    if (variant.sku) variantSchema.sku = variant.sku;
    if (variant.image) variantSchema.image = variant.image;

    if (variant.barcode) {
      const gtin = classifyGtin(variant.barcode);
      if (gtin) variantSchema[gtin.key] = gtin.value;
    }

    for (const opt of variant.options) {
      const key = opt.name.toLowerCase();
      if (key === "color" || key === "colour") variantSchema.color = opt.value;
      else if (key === "size") variantSchema.size = opt.value;
      else if (key === "material" || key === "fabric") variantSchema.material = opt.value;
    }

    const weight = buildWeight(variant.weight, variant.weightUnit);
    if (weight) variantSchema.weight = weight;

    return variantSchema;
  });

  return schema;
}

/**
 * Generate complete Product or ProductGroup JSON-LD.
 * Automatically uses ProductGroup when there are meaningful variants.
 */
export function generateProductSchema(
  product: MappedProduct,
  config: StoreConfig,
  skipAggregateRating = false,
): Record<string, unknown> {
  const hasMeaningfulVariants = product.variants.length > 1
    && product.variants.some((v) =>
      v.options.some((o) => o.name.toLowerCase() !== "title" && o.value.toLowerCase() !== "default title"),
    );

  return hasMeaningfulVariants
    ? buildProductGroupSchema(product, config, skipAggregateRating)
    : buildSingleProductSchema(product, config, skipAggregateRating);
}

/**
 * Generate BreadcrumbList JSON-LD.
 * Uses real Shopify collection data when available; falls back to productType.
 */
export function generateBreadcrumbSchema(product: MappedProduct, config: StoreConfig): Record<string, unknown> {
  const items: Array<{ name: string; url: string }> = [
    { name: "Home", url: config.storeUrl },
  ];

  // Use real collection from Shopify if available
  const collection = product.collections?.[0];
  if (collection) {
    items.push({
      name: collection.title,
      url: `${config.storeUrl}/collections/${collection.handle}`,
    });
  } else if (product.productType) {
    items.push({
      name: product.productType,
      url: `${config.storeUrl}/collections/${product.productType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    });
  }

  items.push({ name: product.name, url: product.url });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Generate FAQPage JSON-LD — scored at +3 points in PRD */
export function generateFaqSchema(faqs: Array<{ question: string; answer: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/** Generate Organization JSON-LD for the store */
export function generateOrganizationSchema(config: StoreConfig): Record<string, unknown> {
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `https://${config.storeUrl.replace(/^https?:\/\//, "")}#organization`,
    name: config.storeName,
    url: config.storeUrl,
  };

  if (config.logoUrl) org.logo = config.logoUrl;

  return org;
}

/** Known review app markers in existingSchema that indicate third-party AggregateRating ownership */
const REVIEW_APP_MARKERS = [
  "judge.me",
  "judgeme",
  "stamped.io",
  "stamped",
  "loox.io",
  "loox",
  "yotpo",
  "okendo",
  "rivyo",
  "ali reviews",
  "shopify-product-reviews",
];

/**
 * Detect whether existingSchema contains AggregateRating from a known review app.
 * Checks for app identifiers in the JSON blob's string representation.
 */
function existingSchemaHasReviewApp(existingSchema: Record<string, unknown> | null | undefined): boolean {
  if (!existingSchema) return false;
  const blob = JSON.stringify(existingSchema).toLowerCase();
  if (!blob.includes("aggregaterating")) return false;
  return REVIEW_APP_MARKERS.some((marker) => blob.includes(marker));
}

/**
 * Generate all schema blocks for a product page.
 * Returns an array of JSON-LD objects to wrap in <script type="application/ld+json">.
 *
 * @param hasReviewSchema - If true (from DB), the page already has review markup
 *   from a third-party app, so we skip emitting our own AggregateRating.
 * @param existingSchema - Raw JSON-LD found on the page during scanning; checked
 *   for known review app signatures as a secondary signal.
 */
export function generateAllSchemas(
  product: MappedProduct,
  config: StoreConfig,
  faqs?: Array<{ question: string; answer: string }>,
  hasReviewSchema?: boolean,
  existingSchema?: Record<string, unknown> | null,
): Record<string, unknown>[] {
  // Skip our AggregateRating if a review app already owns it
  const skipAggregateRating = !!hasReviewSchema || existingSchemaHasReviewApp(existingSchema);

  const schemas: Record<string, unknown>[] = [
    generateProductSchema(product, config, skipAggregateRating),
    generateBreadcrumbSchema(product, config),
  ];

  if (faqs && faqs.length > 0) {
    schemas.push(generateFaqSchema(faqs));
  }

  return schemas;
}
