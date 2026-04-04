# FindAble App — Setup Guide

This is the Shopify app repo. The marketing website lives in a separate `findable-web` repo.

## Directory Structure

```
findable-app/
├── shopify.app.toml                        # Shopify CLI (at root — required)
├── package.json                            # Merged root + API deps
├── tsconfig.json                           # Merged base + API config
├── Dockerfile                              # Updated paths (no apps/api nesting)
├── drizzle.config.ts                       # Same, paths unchanged
├── fly.toml                                # Updated build.dockerfile path
├── .env.example
├── .gitignore
│
├── extensions/                             # Shopify Theme App Extension
│   └── findable-schema/
│       ├── shopify.extension.toml
│       ├── blocks/schema-injection.liquid
│       └── assets/findable-loader.js
│
├── src/                                    # API server
│   ├── index.ts                            # ← FROM apps/api/src/index.ts (unchanged)
│   │
│   ├── db/                                 # ← COPY entire apps/api/src/db/
│   │   ├── client.ts
│   │   ├── migrate.ts
│   │   ├── schema.ts
│   │   ├── seed.ts
│   │   └── migrations/                     # Copy all migration files
│   │
│   ├── lib/                                # ← COPY entire apps/api/src/lib/
│   │   ├── app-state.ts
│   │   ├── auth-email.ts
│   │   ├── auth-middleware.ts
│   │   ├── auth-rate-limit.ts
│   │   ├── auth.ts
│   │   ├── email.ts
│   │   ├── env.ts
│   │   ├── free-scan-store.ts
│   │   ├── queue.ts
│   │   ├── secrets.ts
│   │   ├── shopify.ts
│   │   ├── shopify-client.ts               # ← FROM shopify-app-kit/src/shopify-client.ts (fix imports*)
│   │   ├── turnstile.ts
│   │   └── workspace-data.ts
│   │
│   ├── routes/                             # ← COPY entire apps/api/src/routes/
│   │   ├── account.ts
│   │   ├── auth.ts
│   │   ├── health.ts
│   │   ├── scan.ts
│   │   └── shopify.ts
│   │
│   ├── services/                           # ← COPY apps/api/src/services/ + kit modules
│   │   ├── ai-analyzer.ts                  # ← FROM apps/api/src/services/
│   │   ├── scanner.ts                      # ← FROM apps/api/src/services/
│   │   ├── product-sync.ts                 # ← FROM shopify-app-kit/src/
│   │   ├── schema-generator.ts             # ← FROM shopify-app-kit/src/
│   │   ├── script-tags.ts                  # ← FROM shopify-app-kit/src/
│   │   ├── billing.ts                      # ← FROM shopify-app-kit/src/
│   │   ├── gdpr-handlers.ts                # ← FROM shopify-app-kit/src/
│   │   ├── bulk-operations.ts              # ← FROM shopify-app-kit/src/
│   │   └── feed-generator.ts               # ← FROM shopify-app-kit/src/
│   │
│   ├── graphql/                            # ← FROM shopify-app-kit/graphql/
│   │   ├── products.ts
│   │   ├── billing.ts
│   │   └── script-tags.ts
│   │
│   ├── types/                              # ← FROM shopify-app-kit/types/
│   │   └── shopify.ts
│   │
│   └── workers/                            # ← COPY entire apps/api/src/workers/
│       └── scan-worker.ts
│
├── packages/
│   └── shared/                             # ← COPY entire packages/shared/
│       ├── package.json
│       ├── tsconfig.json                   # Fix: "extends": "../../tsconfig.json" → see note
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── categories.ts
│           ├── scoring.ts
│           ├── workspace.ts
│           └── email.ts
│
├── docs/                                   # ← COPY entire docs/ (except agnt-network.jsx, ecom/)
│   ├── PRD.md
│   └── FRONTEND.md
│
└── skills/                                 # ← COPY entire skills/
    └── schema/
        └── SCHEMA-SKILL.md
```

## Copy Commands

Run from the OLD monorepo root (`FindAble/`):

```bash
# Source files — direct copy, no changes needed
cp -r apps/api/src/db findable-app/src/
cp -r apps/api/src/lib findable-app/src/
cp -r apps/api/src/routes findable-app/src/
cp -r apps/api/src/services findable-app/src/
cp -r apps/api/src/workers findable-app/src/
cp apps/api/src/index.ts findable-app/src/

# Shared package
cp -r packages/shared/src findable-app/packages/shared/
cp packages/shared/package.json findable-app/packages/shared/

# Kit modules → their final locations
cp shopify-app-kit/src/shopify-client.ts findable-app/src/lib/
cp shopify-app-kit/src/product-sync.ts findable-app/src/services/
cp shopify-app-kit/src/schema-generator.ts findable-app/src/services/
cp shopify-app-kit/src/script-tags.ts findable-app/src/services/
cp shopify-app-kit/src/billing.ts findable-app/src/services/
cp shopify-app-kit/src/gdpr-handlers.ts findable-app/src/services/
cp shopify-app-kit/src/bulk-operations.ts findable-app/src/services/
cp shopify-app-kit/src/feed-generator.ts findable-app/src/services/
cp -r shopify-app-kit/graphql findable-app/src/
cp -r shopify-app-kit/types findable-app/src/

# Docs and skills
cp docs/PRD.md findable-app/docs/
cp docs/FRONTEND.md findable-app/docs/
cp -r skills/schema findable-app/skills/
```

## Import Path Fixes After Copying

### 1. `src/lib/shopify-client.ts`
This file was written for `shopify-app-kit/src/` but now lives in `src/lib/`.
Change these imports:
```diff
- import { env } from "../lib/env";
- import { decryptSecret } from "../lib/secrets";
+ import { env } from "./env";
+ import { decryptSecret } from "./secrets";
```

### 2. `src/services/product-sync.ts`
Change:
```diff
- import { shopifyGql } from "./shopify-client";
+ import { shopifyGql } from "../lib/shopify-client";
```

### 3. `src/services/script-tags.ts`
Change:
```diff
- import { env } from "../lib/env";
- import { shopifyRest } from "./shopify-client";
+ import { env } from "../lib/env";
+ import { shopifyRest } from "../lib/shopify-client";
```

### 4. `src/services/billing.ts`
Change:
```diff
- import { shopifyGql } from "./shopify-client";
+ import { shopifyGql } from "../lib/shopify-client";
```

### 5. `src/services/bulk-operations.ts`
Change:
```diff
- import { shopifyGql } from "./shopify-client";
+ import { shopifyGql } from "../lib/shopify-client";
```

### 6. `packages/shared/tsconfig.json`
Create this file:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```
(Points to root tsconfig.json — no more tsconfig.base.json)

## What Stays in `findable-web` (the other repo)

```
findable-web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── vercel.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/
│   ├── components/
│   ├── lib/
│   └── hooks/
└── public/
```

The web repo calls the API over HTTPS at `VITE_API_URL`. It doesn't need `@findable/shared` as a workspace — just copy the few types it uses (ScanStatus, ScoreBreakdown, WorkspaceData) into a local `src/types/api.ts`.

## Development

```bash
# Install
bun install

# Run API server
bun run dev

# Run Shopify CLI (for extension dev/deploy)
bun run shopify:dev
bun run shopify:deploy

# Database
bun run db:generate
bun run db:migrate
bun run db:seed

# Typecheck
bun run typecheck
```

## Deploy

```bash
# API → Fly.io
fly deploy

# Extensions → Shopify
shopify app deploy
```
