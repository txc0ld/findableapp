# FindAble — Shopify App

AI Commerce Readiness Scanner. Scans product pages, scores them for AI agent discoverability, and auto-fixes structured data.

## Architecture

```
findable-app/
├── shopify.app.toml               Shopify CLI manifest
├── extensions/findable-schema/    Theme App Extension (JSON-LD injection)
├── src/
│   ├── index.ts                   Hono API server
│   ├── db/                        Drizzle ORM (PostgreSQL)
│   ├── lib/                       Auth, Shopify client, secrets, queue
│   ├── routes/                    API endpoints
│   ├── services/                  Business logic
│   ├── graphql/                   Shopify Admin API queries
│   ├── types/                     Shopify TypeScript types
│   └── workers/                   BullMQ scan processor
├── packages/shared/               Shared types (@findable/shared)
├── docs/                          PRD + frontend design system
└── skills/                        Schema generation reference
```

## Stack

| Layer | Tech |
|---|---|
| Runtime | Bun |
| Framework | Hono |
| Database | PostgreSQL + Drizzle ORM |
| Queue | BullMQ (Redis) |
| Auth | JWT (Jose) + Argon2 |
| Shopify | OAuth2, Admin GraphQL/REST, Theme App Extension |
| Payments | Shopify App Billing API |
| Bot Protection | Cloudflare Turnstile |
| Deploy | Fly.io (API) + Shopify (extensions) |

## API Routes

### Public
```
GET  /api/health                      Health check
POST /api/scan                        Free scan (1-3 URLs + email)
GET  /api/schema/product              JSON-LD for storefront loader
```

### Auth
```
POST /api/auth/signup                 Create account
POST /api/auth/login                  Login
POST /api/auth/refresh                Refresh JWT
POST /api/auth/forgot-password        Request password reset
POST /api/auth/reset-password         Reset with token
```

### Account (authenticated)
```
GET  /api/account/workspace           Full workspace data
POST /api/account/plan                Update plan tier
```

### Shopify
```
GET  /shopify                         OAuth install redirect
GET  /shopify/callback                OAuth callback + post-install setup
POST /shopify/webhooks                Webhook receiver (HMAC verified)
```

### Shopify Billing (authenticated)
```
POST /api/shopify/billing/subscribe   Create subscription
GET  /api/shopify/billing/callback    Merchant acceptance redirect
GET  /api/shopify/billing/status      Current subscription
POST /api/shopify/billing/cancel      Cancel subscription
```

### Store Operations (authenticated)
```
POST /api/shopify/store/sync          Trigger product sync
GET  /api/shopify/store/sync/status   Sync progress
POST /api/shopify/store/feeds/acp     Generate ACP feed
POST /api/shopify/store/feeds/gmc     Generate GMC feed
POST /api/shopify/store/script-tags/install   Install schema loader
GET  /api/shopify/store/script-tags          List script tags
DELETE /api/shopify/store/script-tags        Remove script tags
```

## Shopify App Flow

```
Install → OAuth → Token stored (encrypted) → Webhooks registered
  → Products synced (paginated or bulk for 1000+)
  → Script tag installed (JSON-LD loader on storefront)
  → Schemas generated per product page via /api/schema/product
```

Webhook-driven:
- `products/create` / `products/update` → single product re-sync
- `products/delete` → product removed from DB
- `bulk_operations/finish` → bulk results downloaded and processed
- `app/uninstalled` → store deactivated
- GDPR webhooks → data deletion (mandatory for app review)

## Development

```bash
bun install
bun run dev                    # API server on :3001

# Shopify CLI
bun run shopify:dev            # Extension dev mode
bun run shopify:deploy         # Deploy extensions

# Database
bun run db:generate            # Generate Drizzle migrations
bun run db:migrate             # Run migrations
bun run db:seed                # Seed demo data

bun run typecheck              # TypeScript check
bun run build                  # Production build
```

## Environment

Copy `.env.example` → `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — BullMQ queue
- `JWT_SECRET` — 32+ char secret
- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` — from Partners dashboard
- `SHOPIFY_TOKEN_ENCRYPTION_KEY` — 32-byte key for token encryption
- `SHOPIFY_APP_URL` — public URL for OAuth callbacks

## Deploy

```bash
# API → Fly.io
fly deploy

# Extensions → Shopify
shopify app deploy
```
