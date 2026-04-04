CREATE TABLE "shopify_webhook_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"store_id" uuid,
	"shop" text NOT NULL,
	"topic" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "shopify_scopes" text[];--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "shopify_installed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "shopify_uninstalled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shopify_webhook_deliveries" ADD CONSTRAINT "shopify_webhook_deliveries_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;