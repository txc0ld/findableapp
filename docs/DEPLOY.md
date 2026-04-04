# Fly.io Deployment Guide

Deploy the FindAble API (`findable-api`) to Fly.io in the Sydney (`syd`) region.

The app runs on Bun 1.3 via a multi-stage Docker build, exposing port 3001 behind Fly's HTTPS proxy. Machines auto-stop when idle and auto-start on incoming requests, with a minimum of 1 machine always running.

---

## Prerequisites

Install the Fly CLI and authenticate:

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login to your Fly.io account
fly auth login
```

---

## First-time setup

### 1. Create the app

The app name and region are already defined in `fly.toml`:

```bash
fly apps create findable-api
```

### 2. Provision PostgreSQL

```bash
fly postgres create \
  --name findable-db \
  --region syd \
  --vm-size shared-cpu-1x \
  --initial-cluster-size 1 \
  --volume-size 1

fly postgres attach findable-db --app findable-api
```

The `attach` command automatically sets the `DATABASE_URL` secret on the app.

### 3. Provision Redis (for BullMQ)

```bash
fly redis create findable-redis --region syd --plan free
```

Copy the connection URL from the output and set it as a secret:

```bash
fly secrets set REDIS_URL="redis://default:xxxxxxxx@fly-findable-redis.upstash.io:6379"
```

### 4. Set secrets

Generate secure values for JWT and encryption keys. Fill in the Shopify and Cloudflare values from their respective dashboards.

```bash
fly secrets set \
  JWT_SECRET="$(openssl rand -base64 32)" \
  SHOPIFY_API_KEY="your-key-from-partners" \
  SHOPIFY_API_SECRET="your-secret-from-partners" \
  SHOPIFY_APP_URL="https://findable-api.fly.dev/shopify" \
  SHOPIFY_TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  CLOUDFLARE_TURNSTILE_SECRET="your-turnstile-secret" \
  FRONTEND_URL="https://getfindable.au" \
  CORS_ORIGINS="https://getfindable.au,https://www.getfindable.au"
```

> **Note:** `NODE_ENV`, `PORT`, `JWT_ISSUER`, `FRONTEND_URL`, and `CORS_ORIGINS` are set in `fly.toml` under `[env]` and do not need to be configured as secrets. Secrets override env vars, so only set them as secrets if you need to differ from the `fly.toml` defaults.

---

## Deploy

```bash
fly deploy
```

This builds the Docker image (multi-stage: `oven/bun:1.3` base, dependency install, then runtime copy) and deploys it to the `syd` region on a `shared-cpu-1x` VM with 512 MB memory.

---

## Post-deploy

### Run database migrations

```bash
fly ssh console -C "bun src/db/migrate.ts"
```

### Verify the deployment

```bash
curl https://findable-api.fly.dev/api/health
```

You should get a 200 response confirming the API is live.

---

## Monitoring

```bash
# Stream live logs
fly logs

# Check app status and machine state
fly status

# Open an interactive shell on the running machine
fly ssh console
```

---

## Scaling

```bash
# Horizontal: add more machines
fly scale count 2

# Vertical: upgrade VM size
fly scale vm shared-cpu-2x

# Increase memory
fly scale memory 1024
```

The current config in `fly.toml`:

| Setting | Value |
|---|---|
| VM size | `shared-cpu-1x` |
| Memory | `512mb` |
| Min machines | `1` |
| Auto-stop | `stop` (stops idle machines) |
| Auto-start | `true` (starts on request) |

---

## Custom domain

To serve the API from `api.getfindable.au` instead of `findable-api.fly.dev`:

```bash
fly certs create api.getfindable.au
```

Then add a CNAME record in your DNS provider:

```
api.getfindable.au  CNAME  findable-api.fly.dev
```

Fly handles TLS certificate provisioning automatically. After DNS propagates, verify:

```bash
fly certs show api.getfindable.au
```

Once the custom domain is active, update `SHOPIFY_APP_URL` if it still points to the `.fly.dev` domain:

```bash
fly secrets set SHOPIFY_APP_URL="https://api.getfindable.au/shopify"
```

---

## Environment variable reference

These are set in `fly.toml` under `[env]` (non-sensitive):

| Variable | Value | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Runtime mode |
| `PORT` | `3001` | Server listen port |
| `JWT_ISSUER` | `findable-api` | JWT token issuer claim |
| `FRONTEND_URL` | `https://getfindable.au` | Frontend origin |
| `CORS_ORIGINS` | `https://getfindable.au,https://www.getfindable.au` | Allowed CORS origins |

These must be set via `fly secrets set` (sensitive):

| Secret | Source |
|---|---|
| `DATABASE_URL` | Auto-set by `fly postgres attach` |
| `REDIS_URL` | From `fly redis create` output |
| `JWT_SECRET` | Generate with `openssl rand -base64 32` |
| `SHOPIFY_API_KEY` | Shopify Partners dashboard |
| `SHOPIFY_API_SECRET` | Shopify Partners dashboard |
| `SHOPIFY_APP_URL` | Your app's Shopify endpoint |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY` | Generate with `openssl rand -hex 32` |
| `CLOUDFLARE_TURNSTILE_SECRET` | Cloudflare dashboard |

---

## Troubleshooting

**Deploy fails during build:**
```bash
# Check build logs
fly logs --instance <instance-id>

# Rebuild without cache
fly deploy --no-cache
```

**Machine won't start:**
```bash
# Check machine status
fly machine list

# Restart a specific machine
fly machine restart <machine-id>
```

**Database connection issues:**
```bash
# Verify DATABASE_URL is set
fly secrets list

# Test Postgres connectivity from the machine
fly ssh console -C "bun -e \"const db = require('./src/db'); console.log('connected')\""

# Connect to Postgres directly
fly postgres connect -a findable-db
```
