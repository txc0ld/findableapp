import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "starter", "growth", "pro", "agency"]);
export const platformEnum = pgEnum("platform", [
  "shopify",
  "woocommerce",
  "bigcommerce",
  "custom",
]);
export const scanTypeEnum = pgEnum("scan_type", ["free", "full", "competitor", "monitor"]);
export const scanStatusEnum = pgEnum("scan_status", [
  "queued",
  "scanning",
  "scoring",
  "complete",
  "failed",
]);
export const issueSeverityEnum = pgEnum("issue_severity", [
  "critical",
  "high",
  "medium",
  "low",
]);
export const issueDimensionEnum = pgEnum("issue_dimension", [
  "schema",
  "llm",
  "protocol",
  "consistency",
]);
export const fixTypeEnum = pgEnum("fix_type", ["auto", "manual", "hybrid"]);
export const feedTypeEnum = pgEnum("feed_type", ["acp", "gmc"]);
export const alertSeverityEnum = pgEnum("alert_severity", ["critical", "warning", "info"]);

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  plan: planEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  freeScanUsed: boolean("free_scan_used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authRefreshTokens = pgTable("auth_refresh_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").references(() => accounts.id),
  url: text("url").notNull(),
  name: text("name"),
  platform: platformEnum("platform"),
  shopifyShop: text("shopify_shop"),
  shopifyAccessToken: text("shopify_access_token"),
  shopifyScopes: text("shopify_scopes").array(),
  shopifyInstalledAt: timestamp("shopify_installed_at", { withTimezone: true }),
  shopifyUninstalledAt: timestamp("shopify_uninstalled_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  wcUrl: text("wc_url"),
  wcKey: text("wc_key"),
  wcSecret: text("wc_secret"),
  productCount: integer("product_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shopifyWebhookDeliveries = pgTable("shopify_webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }),
  shop: text("shop").notNull(),
  topic: text("topic").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scans = pgTable("scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").references(() => accounts.id),
  storeId: uuid("store_id").references(() => stores.id),
  scanType: scanTypeEnum("scan_type"),
  status: scanStatusEnum("status").notNull().default("queued"),
  urlsInput: text("urls_input").array(),
  pagesScanned: integer("pages_scanned").notNull().default(0),
  pagesTotal: integer("pages_total"),
  scoreOverall: integer("score_overall"),
  scoreSchema: integer("score_schema"),
  scoreLlm: integer("score_llm"),
  scoreProtocol: integer("score_protocol"),
  scoreCompetitive: integer("score_competitive"),
  reportJson: jsonb("report_json").$type<Record<string, unknown> | null>(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scan_id").references(() => scans.id),
  storeId: uuid("store_id").references(() => stores.id),
  url: text("url").notNull(),
  name: text("name"),
  platformProductId: text("platform_product_id"),
  googleCategory: text("google_category"),
  price: numeric("price", { precision: 10, scale: 2 }),
  currency: text("currency"),
  availability: text("availability"),
  hasJsonld: boolean("has_jsonld").notNull().default(false),
  hasGtin: boolean("has_gtin").notNull().default(false),
  hasBrand: boolean("has_brand").notNull().default(false),
  hasShippingSchema: boolean("has_shipping_schema").notNull().default(false),
  hasReturnSchema: boolean("has_return_schema").notNull().default(false),
  hasReviewSchema: boolean("has_review_schema").notNull().default(false),
  hasFaqSchema: boolean("has_faq_schema").notNull().default(false),
  hasMaterial: boolean("has_material").notNull().default(false),
  hasColor: boolean("has_color").notNull().default(false),
  hasSize: boolean("has_size").notNull().default(false),
  hasWeight: boolean("has_weight").notNull().default(false),
  hasBreadcrumb: boolean("has_breadcrumb").notNull().default(false),
  hasVariantsStructured: boolean("has_variants_structured").notNull().default(false),
  duplicateSchemaCount: integer("duplicate_schema_count").notNull().default(0),
  priceMismatch: boolean("price_mismatch").notNull().default(false),
  availabilityMismatch: boolean("availability_mismatch").notNull().default(false),
  schemaScore: integer("schema_score"),
  aeoScore: integer("aeo_score"),
  descriptionType: text("description_type"),
  attributeDensity: real("attribute_density"),
  reviewCount: integer("review_count"),
  ratingValue: real("rating_value"),
  llmScore: integer("llm_score"),
  extractedAttributes: jsonb("extracted_attributes").$type<Record<string, unknown> | null>(),
  existingSchema: jsonb("existing_schema").$type<Record<string, unknown> | null>(),
  generatedSchema: jsonb("generated_schema").$type<Record<string, unknown> | null>(),
  originalDescription: text("original_description"),
  rewrittenDescription: text("rewritten_description"),
  suggestedFaq: jsonb("suggested_faq").$type<Record<string, unknown>[] | null>(),
  missingAttributes: text("missing_attributes").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const issues = pgTable("issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scan_id").references(() => scans.id),
  productId: uuid("product_id").references(() => products.id),
  severity: issueSeverityEnum("severity"),
  dimension: issueDimensionEnum("dimension"),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  fixType: fixTypeEnum("fix_type"),
  pointsImpact: integer("points_impact"),
  fixed: boolean("fixed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitors = pgTable("competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").references(() => stores.id),
  url: text("url").notNull(),
  name: text("name"),
  lastScanId: uuid("last_scan_id").references(() => scans.id),
  scoreOverall: integer("score_overall"),
  scoreSchema: integer("score_schema"),
  scoreLlm: integer("score_llm"),
  scoreProtocol: integer("score_protocol"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feeds = pgTable("feeds", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").references(() => stores.id),
  feedType: feedTypeEnum("feed_type"),
  fileUrl: text("file_url"),
  productCount: integer("product_count"),
  refreshMinutes: integer("refresh_minutes").notNull().default(1440),
  lastGenerated: timestamp("last_generated", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").references(() => stores.id),
  alertType: text("alert_type").notNull(),
  severity: alertSeverityEnum("severity"),
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountsRelations = relations(accounts, ({ many }) => ({
  authRefreshTokens: many(authRefreshTokens),
  passwordResetTokens: many(passwordResetTokens),
  stores: many(stores),
  scans: many(scans),
}));

export const authRefreshTokensRelations = relations(authRefreshTokens, ({ one }) => ({
  account: one(accounts, {
    fields: [authRefreshTokens.accountId],
    references: [accounts.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  account: one(accounts, {
    fields: [passwordResetTokens.accountId],
    references: [accounts.id],
  }),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  account: one(accounts, {
    fields: [stores.accountId],
    references: [accounts.id],
  }),
  scans: many(scans),
  products: many(products),
  competitors: many(competitors),
  feeds: many(feeds),
  alerts: many(alerts),
  shopifyWebhookDeliveries: many(shopifyWebhookDeliveries),
}));

export const shopifyWebhookDeliveriesRelations = relations(shopifyWebhookDeliveries, ({ one }) => ({
  store: one(stores, {
    fields: [shopifyWebhookDeliveries.storeId],
    references: [stores.id],
  }),
}));

export const scansRelations = relations(scans, ({ one, many }) => ({
  account: one(accounts, {
    fields: [scans.accountId],
    references: [accounts.id],
  }),
  store: one(stores, {
    fields: [scans.storeId],
    references: [stores.id],
  }),
  products: many(products),
  issues: many(issues),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  scan: one(scans, {
    fields: [products.scanId],
    references: [scans.id],
  }),
  store: one(stores, {
    fields: [products.storeId],
    references: [stores.id],
  }),
  issues: many(issues),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  scan: one(scans, {
    fields: [issues.scanId],
    references: [scans.id],
  }),
  product: one(products, {
    fields: [issues.productId],
    references: [products.id],
  }),
}));

export const competitorsRelations = relations(competitors, ({ one }) => ({
  store: one(stores, {
    fields: [competitors.storeId],
    references: [stores.id],
  }),
  lastScan: one(scans, {
    fields: [competitors.lastScanId],
    references: [scans.id],
  }),
}));

export const feedsRelations = relations(feeds, ({ one }) => ({
  store: one(stores, {
    fields: [feeds.storeId],
    references: [stores.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  store: one(stores, {
    fields: [alerts.storeId],
    references: [stores.id],
  }),
}));

export const schema = {
  accounts,
  accountsRelations,
  authRefreshTokens,
  authRefreshTokensRelations,
  passwordResetTokens,
  passwordResetTokensRelations,
  stores,
  storesRelations,
  shopifyWebhookDeliveries,
  shopifyWebhookDeliveriesRelations,
  scans,
  scansRelations,
  products,
  productsRelations,
  issues,
  issuesRelations,
  competitors,
  competitorsRelations,
  feeds,
  feedsRelations,
  alerts,
  alertsRelations,
};

export type Account = typeof accounts.$inferSelect;
export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type ShopifyWebhookDelivery = typeof shopifyWebhookDeliveries.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type Feed = typeof feeds.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
