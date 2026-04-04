import { eq } from "drizzle-orm";

import { db } from "./client";
import {
  accounts,
  alerts,
  competitors,
  feeds,
  issues,
  products,
  scans,
  stores,
} from "./schema";

if (!db) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const existingAccount = await db
  .select({ id: accounts.id })
  .from(accounts)
  .where(eq(accounts.email, "demo@getfindable.au"))
  .limit(1);

if (existingAccount.length > 0) {
  console.log("Seed data already exists.");
  process.exit(0);
}

const [account] = await db
  .insert(accounts)
  .values({
    email: "demo@getfindable.au",
    plan: "starter",
    freeScanUsed: true,
  })
  .returning({ id: accounts.id });

if (!account) {
  throw new Error("Failed to create seed account.");
}

const [store] = await db
  .insert(stores)
  .values({
    accountId: account.id,
    url: "https://demo-store.getfindable.au",
    name: "Demo Store",
    platform: "shopify",
    shopifyShop: "demo-store.myshopify.com",
    productCount: 3,
  })
  .returning({ id: stores.id });

if (!store) {
  throw new Error("Failed to create seed store.");
}

const [scan] = await db
  .insert(scans)
  .values({
    accountId: account.id,
    storeId: store.id,
    scanType: "full",
    status: "complete",
    urlsInput: [
      "https://demo-store.getfindable.au/products/heavyweight-tee",
      "https://demo-store.getfindable.au/products/canvas-sneaker",
      "https://demo-store.getfindable.au/products/everyday-tote",
    ],
    pagesScanned: 3,
    pagesTotal: 3,
    scoreOverall: 41,
    scoreSchema: 52,
    scoreLlm: 28,
    scoreProtocol: 15,
    scoreCompetitive: 33,
    reportJson: {
      summary: "Seed scan report for local development.",
      issues: 4,
    },
    startedAt: new Date(),
    completedAt: new Date(),
  })
  .returning({ id: scans.id });

if (!scan) {
  throw new Error("Failed to create seed scan.");
}

const [product] = await db
  .insert(products)
  .values({
    scanId: scan.id,
    storeId: store.id,
    url: "https://demo-store.getfindable.au/products/heavyweight-tee",
    name: "Heavyweight Tee",
    platformProductId: "gid://shopify/Product/1",
    googleCategory: "Apparel > Shirts > T-Shirts",
    price: "49.95",
    currency: "AUD",
    availability: "in_stock",
    hasJsonld: false,
    hasGtin: false,
    hasBrand: true,
    hasShippingSchema: false,
    hasReturnSchema: false,
    hasReviewSchema: true,
    hasFaqSchema: false,
    hasMaterial: true,
    hasColor: true,
    hasSize: true,
    hasWeight: true,
    hasBreadcrumb: true,
    hasVariantsStructured: false,
    duplicateSchemaCount: 0,
    priceMismatch: false,
    availabilityMismatch: false,
    schemaScore: 52,
    aeoScore: 34,
    descriptionType: "marketing-heavy",
    attributeDensity: 0.68,
    reviewCount: 24,
    ratingValue: 4.6,
    llmScore: 28,
    extractedAttributes: {
      material: "100% organic cotton",
      color: "Black",
      size: ["S", "M", "L", "XL"],
      fabricWeight: "300gsm",
    },
    existingSchema: null,
    generatedSchema: null,
    originalDescription: "A premium tee designed to elevate your everyday wardrobe.",
    rewrittenDescription: null,
    suggestedFaq: [
      {
        question: "What is the fabric weight of this tee?",
        answer: "The tee uses 300gsm organic cotton.",
      },
    ],
    missingAttributes: ["gtin", "shippingDetails", "hasMerchantReturnPolicy", "faq"],
  })
  .returning({ id: products.id });

if (!product) {
  throw new Error("Failed to create seed product.");
}

await db.insert(issues).values([
  {
    scanId: scan.id,
    productId: product.id,
    severity: "critical",
    dimension: "schema",
    code: "missing-schema",
    title: "Product schema is missing",
    description: "No Product JSON-LD was found on the page.",
    fixType: "auto",
    pointsImpact: 25,
    fixed: false,
  },
  {
    scanId: scan.id,
    productId: product.id,
    severity: "medium",
    dimension: "llm",
    code: "marketing-copy",
    title: "Description is not AEO-ready",
    description: "The product description is written as marketing copy instead of extractable facts.",
    fixType: "auto",
    pointsImpact: 8,
    fixed: false,
  },
]);

await db.insert(competitors).values({
  storeId: store.id,
  url: "https://competitor.example/products/heavyweight-tee",
  name: "Competitor Apparel",
  lastScanId: scan.id,
  scoreOverall: 74,
  scoreSchema: 80,
  scoreLlm: 69,
  scoreProtocol: 72,
});

await db.insert(feeds).values({
  storeId: store.id,
  feedType: "acp",
  fileUrl: "https://feeds.getfindable.au/demo/acp.jsonl.gz",
  productCount: 3,
  refreshMinutes: 1440,
  lastGenerated: new Date(),
});

await db.insert(alerts).values({
  storeId: store.id,
  alertType: "score_drop",
  severity: "warning",
  message: "Schema score dropped after the last theme update.",
  acknowledged: false,
});

console.log("Seed data created.");
