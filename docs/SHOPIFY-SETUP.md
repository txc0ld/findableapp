# Shopify Partners Configuration Guide

Step-by-step guide for configuring FindAble in the Shopify Partners dashboard and deploying the theme extension.

---

## 1. Create the app

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Navigate to **Apps** > **Create app**
3. Choose **Create app manually**
4. Set the app name to **FindAble**
5. Set the App URL to `https://api.getfindable.au/app` (or `https://findable-api.fly.dev/app` if not using a custom domain)

---

## 2. Get credentials

After creating the app, you'll land on the app overview page:

1. Copy the **Client ID** (also called API key)
2. Copy the **Client secret** (also called API secret key)
3. Set both in your Fly.io deployment:

```bash
fly secrets set \
  SHOPIFY_API_KEY="your-client-id" \
  SHOPIFY_API_SECRET="your-client-secret"
```

4. Update `client_id` in `shopify.app.toml`:

```toml
client_id = "your-client-id"
```

---

## 3. Configure URLs

In the Shopify Partners app settings, under **App setup**:

**App URL:**
```
https://api.getfindable.au/app
```

**Allowed redirection URL(s):**
```
https://api.getfindable.au/shopify/callback
http://localhost:3001/shopify/callback
```

The production callback handles the OAuth handshake after a merchant installs the app. The localhost entry is for local development.

These URLs must match exactly what's defined in `shopify.app.toml` under `[auth].redirect_urls`.

---

## 4. Configure GDPR webhooks (mandatory)

Shopify requires three GDPR webhook endpoints for app approval. Configure them under **App setup** > **Privacy compliance webhooks**:

| Webhook | URL |
|---|---|
| Customer data request | `https://api.getfindable.au/shopify/webhooks` |
| Customer data erasure | `https://api.getfindable.au/shopify/webhooks` |
| Shop data erasure | `https://api.getfindable.au/shopify/webhooks` |

All three point to the same webhook handler, which routes based on the `X-Shopify-Topic` header.

> **Important:** These webhooks must return a 200 response for your app to pass Shopify review. Even if FindAble doesn't store customer PII, the endpoints must acknowledge the request.

---

## 5. Configure App Proxy

The app proxy lets merchants access FindAble endpoints through their storefront domain (e.g., `your-store.myshopify.com/apps/findable/*`).

Under **App setup** > **App proxy**:

| Field | Value |
|---|---|
| Subpath prefix | `apps` |
| Subpath | `findable` |
| Proxy URL | `https://api.getfindable.au/api/proxy` |

This makes your proxy accessible at:
```
https://{shop}.myshopify.com/apps/findable/*
```

Shopify signs all proxy requests with an HMAC, so your `/api/proxy` handler must verify the `signature` query parameter.

---

## 6. Configure scopes

Under **App setup** > **API access scopes**, request the following:

| Scope | Purpose |
|---|---|
| `read_products` | Read product data for schema generation and scoring |
| `write_script_tags` | Install the JSON-LD loader script on the storefront |
| `read_script_tags` | Read installed scripts to check current state |
| `read_themes` | Theme compatibility check for schema injection |
| `read_locales` | Currency and locale detection for structured data |

These scopes are defined in `shopify.app.toml` under `[access_scopes]`:

```toml
scopes = "read_products,write_script_tags,read_script_tags,read_themes,read_locales"
```

Only request what you need. Additional scopes require re-approval.

---

## 7. App listing (for App Store submission)

When you're ready to submit to the Shopify App Store, fill out the listing details:

**Basic info:**

| Field | Value |
|---|---|
| App name | FindAble |
| Tagline | AI Commerce Readiness Scanner -- Get found by ChatGPT, Claude, Gemini |
| Category | Store design, SEO |

**Description:**

Cover these points in the long description:
- What FindAble does: scans your store for AI commerce readiness
- The AEO score: a 0-100 ring score showing how well AI engines can find and recommend your products
- Issue detection: identifies missing schema, incomplete product data, and structured data gaps
- Automated fixes: one-click JSON-LD injection and schema generation
- AI engine compatibility: optimised for ChatGPT, Claude, Gemini, and Perplexity product discovery

**Screenshots (required):**
- Score ring showing the AEO readiness score
- Issue list with severity indicators
- Schema preview showing generated JSON-LD
- Before/after comparison of product structured data

**Demo video (recommended):**
- 2-3 minute walkthrough of install, scan, and fix flow

---

## 8. Deploy the theme extension

The FindAble Schema block is distributed as a Shopify Theme App Extension. Deploy it from the project root:

```bash
cd findable-app
shopify app deploy
```

This pushes the theme extension to Shopify so merchants can add the FindAble Schema block to their theme via the theme editor.

To test during development without deploying to production:

```bash
shopify app dev
```

---

## 9. Test with a development store

Before submitting for review, test the full flow:

### Create a development store
1. In Shopify Partners, go to **Stores** > **Add store**
2. Choose **Development store**
3. Fill in the store details and create it

### Test checklist

- [ ] **OAuth flow:** Install the app on the dev store. Confirm the consent screen shows the correct scopes and the callback redirects properly.
- [ ] **Product sync:** After install, verify that product data is fetched via the `read_products` scope. Check your logs for successful API calls.
- [ ] **Webhook delivery:** In Partners, go to your app > **Webhooks** > check delivery attempts. Verify `products/create`, `products/update`, `products/delete`, and `app/uninstalled` are all being received and acknowledged with 200.
- [ ] **GDPR webhooks:** Trigger test GDPR webhook deliveries from the Partners dashboard. Confirm 200 responses.
- [ ] **App proxy:** Visit `https://{dev-store}.myshopify.com/apps/findable/` and confirm the proxy serves your endpoint correctly.
- [ ] **Theme extension:** In the dev store's theme editor, add the FindAble Schema block. Verify the JSON-LD output in the page source.
- [ ] **Embedded admin UI:** Open the app from the dev store's admin sidebar. Confirm the scanning and scoring interface loads correctly.
- [ ] **Script tags:** Verify the JSON-LD loader script is installed on the storefront via `read_script_tags`.
- [ ] **Billing (test mode):** If applicable, test the billing flow with Shopify's test charges.

---

## 10. Submit for review

Before submitting, confirm:

- [ ] All GDPR webhooks return 200
- [ ] OAuth install and uninstall flows work end to end
- [ ] The app listing has all required fields, screenshots, and descriptions
- [ ] The app respects all requested scopes (no over-requesting)
- [ ] Billing works in test mode (if applicable)
- [ ] The theme extension installs cleanly in the theme editor
- [ ] The app handles rate limits gracefully (Shopify API throttling)

### Submit

1. Go to Partners > **Apps** > **FindAble** > **Distribution**
2. Choose **Shopify App Store** (public) or **Custom distribution** (single-merchant)
3. Fill in any remaining listing requirements
4. Click **Submit for review**

Shopify typically reviews within 5-7 business days. They may request changes related to:
- Scope justification (why you need each scope)
- GDPR compliance
- UI/UX standards for embedded apps
- App listing quality (screenshots, description)

---

## Configuration file reference

The `shopify.app.toml` in the project root defines the app's configuration. Here's what each section controls:

```toml
name = "FindAble"                                      # App name
client_id = ""                                         # From Partners dashboard
application_url = "https://api.getfindable.au/shopify" # Entry point
embedded = false                                       # Not an embedded app

[access_scopes]
scopes = "read_products,write_script_tags,read_script_tags,read_themes,read_locales"

[auth]
redirect_urls = [
  "https://api.getfindable.au/shopify/callback",       # Production OAuth callback
  "http://localhost:3001/shopify/callback"              # Dev OAuth callback
]

[webhooks]
api_version = "2026-01"                                # Shopify API version

  [webhooks.privacy_compliance]                        # Mandatory GDPR endpoints
  customer_data_request_url = "https://api.getfindable.au/shopify/webhooks"
  customer_deletion_url = "https://api.getfindable.au/shopify/webhooks"
  shop_deletion_url = "https://api.getfindable.au/shopify/webhooks"

[[webhooks.subscriptions]]                             # Event subscriptions
topics = ["products/create", "products/update", "products/delete",
          "app/uninstalled", "bulk_operations/finish"]
uri = "https://api.getfindable.au/shopify/webhooks"

[app_proxy]                                            # Storefront proxy
url = "https://api.getfindable.au/api/proxy"
subpath = "findable"
prefix = "apps"
# Accessible at: https://{shop}.myshopify.com/apps/findable/*

[pos]
embedded = false                                       # No POS support
```

Keep this file in sync with your Partners dashboard configuration. The Shopify CLI reads this file during `shopify app deploy` and `shopify app dev`.
