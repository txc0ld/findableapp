# findableapp

Standalone Shopify app repo for Findable.

This repo is intentionally separate from the main `FindAble` marketing/report/dashboard product so Shopify app auth, embedded admin UI, webhooks, and store-specific backend logic can evolve independently.

## Stack

- Shopify app template
- React Router
- Vite
- Prisma
- Shopify App Bridge

## Getting started

Install dependencies:

```bash
npm install
```

Link the app config to your Shopify app:

```bash
shopify app config link
```

Run local development:

```bash
shopify app dev
```

## Next setup items

- Set the Shopify app `client_id` in [shopify.app.toml](./shopify.app.toml)
- Configure app URLs after you have a stable dev/prod host
- Replace the starter embedded UI with Findable-specific merchant flows
- Wire product sync, scan triggers, and remediation actions
