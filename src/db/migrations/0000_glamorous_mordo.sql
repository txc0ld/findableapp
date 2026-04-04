CREATE TYPE "public"."alert_severity" AS ENUM('critical', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."feed_type" AS ENUM('acp', 'gmc');--> statement-breakpoint
CREATE TYPE "public"."fix_type" AS ENUM('auto', 'manual', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."issue_dimension" AS ENUM('schema', 'llm', 'protocol', 'consistency');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'growth', 'pro', 'agency');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('shopify', 'woocommerce', 'bigcommerce', 'custom');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('queued', 'scanning', 'scoring', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scan_type" AS ENUM('free', 'full', 'competitor', 'monitor');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"free_scan_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"alert_type" text NOT NULL,
	"severity" "alert_severity",
	"message" text NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"url" text NOT NULL,
	"name" text,
	"last_scan_id" uuid,
	"score_overall" integer,
	"score_schema" integer,
	"score_llm" integer,
	"score_protocol" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"feed_type" "feed_type",
	"file_url" text,
	"product_count" integer,
	"refresh_minutes" integer DEFAULT 1440 NOT NULL,
	"last_generated" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid,
	"product_id" uuid,
	"severity" "issue_severity",
	"dimension" "issue_dimension",
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"fix_type" "fix_type",
	"points_impact" integer,
	"fixed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid,
	"store_id" uuid,
	"url" text NOT NULL,
	"name" text,
	"platform_product_id" text,
	"google_category" text,
	"price" numeric(10, 2),
	"currency" text,
	"availability" text,
	"has_jsonld" boolean DEFAULT false NOT NULL,
	"has_gtin" boolean DEFAULT false NOT NULL,
	"has_brand" boolean DEFAULT false NOT NULL,
	"has_shipping_schema" boolean DEFAULT false NOT NULL,
	"has_return_schema" boolean DEFAULT false NOT NULL,
	"has_review_schema" boolean DEFAULT false NOT NULL,
	"has_faq_schema" boolean DEFAULT false NOT NULL,
	"has_material" boolean DEFAULT false NOT NULL,
	"has_color" boolean DEFAULT false NOT NULL,
	"has_size" boolean DEFAULT false NOT NULL,
	"has_weight" boolean DEFAULT false NOT NULL,
	"has_breadcrumb" boolean DEFAULT false NOT NULL,
	"has_variants_structured" boolean DEFAULT false NOT NULL,
	"duplicate_schema_count" integer DEFAULT 0 NOT NULL,
	"price_mismatch" boolean DEFAULT false NOT NULL,
	"availability_mismatch" boolean DEFAULT false NOT NULL,
	"schema_score" integer,
	"aeo_score" integer,
	"description_type" text,
	"attribute_density" real,
	"review_count" integer,
	"rating_value" real,
	"llm_score" integer,
	"extracted_attributes" jsonb,
	"existing_schema" jsonb,
	"generated_schema" jsonb,
	"original_description" text,
	"rewritten_description" text,
	"suggested_faq" jsonb,
	"missing_attributes" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"store_id" uuid,
	"scan_type" "scan_type",
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"urls_input" text[],
	"pages_scanned" integer DEFAULT 0 NOT NULL,
	"pages_total" integer,
	"score_overall" integer,
	"score_schema" integer,
	"score_llm" integer,
	"score_protocol" integer,
	"score_competitive" integer,
	"report_json" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"url" text NOT NULL,
	"name" text,
	"platform" "platform",
	"shopify_shop" text,
	"shopify_access_token" text,
	"wc_url" text,
	"wc_key" text,
	"wc_secret" text,
	"product_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_last_scan_id_scans_id_fk" FOREIGN KEY ("last_scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;