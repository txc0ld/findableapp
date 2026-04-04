import { Hono } from "hono";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { accounts, stores, products, issues, scans, type Store } from "../db/schema";
import type { ShopifySessionVariables } from "../lib/shopify-session";
import { verifyShopifySessionToken } from "../lib/shopify-session";
import { encryptShopifyAccessToken } from "../lib/shopify";
import { decryptAccessToken } from "../lib/shopify-client";
import { syncAllProducts, getProductCount, getShopInfo } from "../services/product-sync";
import { startBulkProductSync } from "../services/bulk-operations";
import { installScriptTag } from "../services/script-tags";
import { enqueueScanJob } from "../lib/queue";
import { testLlmVisibility } from "../services/llm-tester";
import { env } from "../lib/env";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score <= 25) return "#ef4444";
  if (score <= 40) return "#f97316";
  if (score <= 55) return "#f59e0b";
  if (score <= 70) return "#84cc16";
  if (score <= 85) return "#10b981";
  return "#06b6d4";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a full dashboard page with App Bridge loaded in <head>.
 */
function renderPage(title: string, content: string, apiKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="shopify-api-key" content="${escapeHtml(apiKey)}" />
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <title>${escapeHtml(title)} — FindAble</title>
  <link rel="stylesheet" href="https://unpkg.com/@shopify/polaris@13/build/esm/styles.css" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f6f6f7; }
    .page { max-width: 1000px; margin: 0 auto; }
    .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 16px; font-weight: 600; margin: 0 0 16px; color: #1a1a1a; }
    .score-ring { display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 32px; }
    .score-number { font-size: 72px; font-weight: 800; line-height: 1; }
    .score-label { font-size: 14px; color: #6b7280; margin-top: 8px; }
    .dimensions { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
    .dim-card { background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; }
    .dim-score { font-size: 28px; font-weight: 700; }
    .dim-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .issue-row { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .issue-row:last-child { border-bottom: none; }
    .severity { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .severity-critical { background: #fef2f2; color: #dc2626; }
    .severity-high { background: #fff7ed; color: #ea580c; }
    .severity-medium { background: #fffbeb; color: #d97706; }
    .severity-low { background: #f0fdf4; color: #16a34a; }
    .btn { display: inline-block; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; border: none; }
    .btn-primary { background: #4f46e5; color: white; }
    .btn-primary:hover { background: #4338ca; }
    .btn-secondary { background: white; color: #1a1a1a; border: 1px solid #d1d5db; }
    .btn-secondary:hover { background: #f9fafb; }
    .actions { display: flex; gap: 12px; margin-top: 16px; }
    .stat-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: #6b7280; }
    .stat-value { font-weight: 600; }
    .nav { display: flex; gap: 8px; margin-bottom: 20px; }
    .nav a { padding: 8px 16px; border-radius: 6px; text-decoration: none; color: #6b7280; font-size: 14px; font-weight: 500; }
    .nav a.active { background: white; color: #1a1a1a; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .nav a:hover { color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .empty { text-align: center; padding: 48px; color: #9ca3af; }
    #sync-status { display: none; margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    #sync-status.success { display: block; background: #f0fdf4; color: #16a34a; }
    #sync-status.error { display: block; background: #fef2f2; color: #dc2626; }
    #sync-status.loading { display: block; background: #eff6ff; color: #2563eb; }
  </style>
</head>
<body>
  <div class="page">
    <nav class="nav">
      <a href="/app" class="${title === "Dashboard" ? "active" : ""}">Dashboard</a>
      <a href="/app/products" class="${title === "Products" ? "active" : ""}">Products</a>
      <a href="/app/settings" class="${title === "Settings" ? "active" : ""}">Settings</a>
    </nav>
    ${content}
  </div>
  <script src="/app/assets/app.js"></script>
</body>
</html>`;
}

/**
 * Bounce page — minimal page that loads App Bridge.
 * App Bridge auto-detects it's in the Shopify admin iframe, obtains a
 * session token, and reloads the page with id_token in the URL.
 */
function bouncePage(apiKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="shopify-api-key" content="${escapeHtml(apiKey)}" />
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
</head>
<body></body>
</html>`;
}

/**
 * Exchange a Shopify session token (JWT) for an offline access token.
 */
async function performTokenExchange(
  shop: string,
  sessionToken: string,
): Promise<{ accessToken: string; scope: string } | null> {
  if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET) return null;

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[app] Token exchange failed: ${response.status} ${errText}`);
    return null;
  }

  const data = (await response.json()) as { access_token: string; scope?: string };
  return { accessToken: data.access_token, scope: data.scope ?? "" };
}

/**
 * Find or create a store record after a successful token exchange.
 */
async function ensureStoreRecord(
  shop: string,
  accessToken: string,
  scope: string,
): Promise<Store | undefined> {
  if (!db) return undefined;

  const encryptedToken = encryptShopifyAccessToken(accessToken);

  // Check for existing store
  const existing = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
  });

  if (existing) {
    await db
      .update(stores)
      .set({
        shopifyAccessToken: encryptedToken,
        shopifyScopes: scope.split(",").map((s) => s.trim()).filter(Boolean),
        shopifyInstalledAt: new Date(),
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, existing.id));
    return (await db.query.stores.findFirst({ where: eq(stores.id, existing.id) })) ?? undefined;
  }

  // Fetch shop info to create the account + store
  const shopResponse = await fetch(
    `https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/shop.json`,
    { headers: { "x-shopify-access-token": accessToken } },
  );
  const shopData = shopResponse.ok
    ? ((await shopResponse.json()) as { shop: { name: string; email: string; domain?: string; primary_domain?: { url?: string } } }).shop
    : null;

  const email = shopData?.email ?? `${shop}@shop.findable`;
  const primaryUrl = shopData?.primary_domain?.url
    ?? (shopData?.domain ? `https://${shopData.domain}` : `https://${shop}`);

  let account = await db.query.accounts.findFirst({
    where: eq(accounts.email, email.trim().toLowerCase()),
  });
  if (!account) {
    const inserted = await db.insert(accounts).values({
      email: email.trim().toLowerCase(),
    }).returning();
    account = inserted[0];
  }

  const inserted = await db.insert(stores).values({
    accountId: account?.id,
    name: shopData?.name ?? shop,
    url: primaryUrl,
    platform: "shopify",
    shopifyShop: shop,
    shopifyAccessToken: encryptedToken,
    shopifyScopes: scope.split(",").map((s) => s.trim()).filter(Boolean),
    shopifyInstalledAt: new Date(),
    productCount: 0,
  }).returning();

  return inserted[0] ?? undefined;
}

/* ------------------------------------------------------------------ */
/*  Hono app + middleware                                             */
/* ------------------------------------------------------------------ */

const appRoute = new Hono<{ Variables: ShopifySessionVariables }>();

// CSP: allow Shopify admin to iframe this app
appRoute.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
  c.res.headers.delete("X-Frame-Options");
});

/* ------------------------------------------------------------------ */
/*  External JavaScript — /app/assets/app.js                          */
/* ------------------------------------------------------------------ */

const APP_JS = `(function() {
  'use strict';

  /* ---- Dashboard: sync products ---- */
  window.findableSyncProducts = async function() {
    var btn = document.getElementById('sync-btn');
    var status = document.getElementById('sync-status');
    if (!btn || !status) return;

    btn.disabled = true;
    btn.textContent = 'Syncing...';
    status.className = 'loading';
    status.textContent = 'Starting product sync...';

    try {
      // App Bridge automatically adds Authorization: Bearer header
      var res = await fetch('/app/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok) {
        status.className = 'success';
        status.textContent = 'Sync started successfully. Products will update shortly.';
      } else {
        status.className = 'error';
        status.textContent = data.error || 'Sync failed. Please try again.';
      }
    } catch(e) {
      status.className = 'error';
      status.textContent = 'Network error. Please check your connection.';
    }

    btn.disabled = false;
    btn.textContent = 'Sync Products';
  };

  /* ---- Dashboard: scan store ---- */
  window.findableScanStore = async function() {
    var btn = document.getElementById('scan-btn');
    var status = document.getElementById('sync-status');
    if (!btn || !status) return;

    btn.disabled = true;
    btn.textContent = 'Scanning...';
    status.className = 'loading';
    status.textContent = 'Starting store scan...';

    try {
      var res = await fetch('/app/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok) {
        status.className = 'success';
        status.textContent = 'Scan started! Scanning ' + (data.data.productCount || 0) + ' products. Results will appear shortly.';
      } else {
        status.className = 'error';
        status.textContent = data.error || 'Scan failed. Please try again.';
      }
    } catch(e) {
      status.className = 'error';
      status.textContent = 'Network error. Please check your connection.';
    }

    btn.disabled = false;
    btn.textContent = 'Scan Store';
  };

  /* ---- Settings: install script tags ---- */
  window.findableInstallScriptTag = async function() {
    var btn = document.getElementById('install-script-btn');
    var status = document.getElementById('script-status');
    if (!btn || !status) return;

    btn.disabled = true;
    btn.textContent = 'Installing...';
    status.style.display = 'block';
    status.style.background = '#eff6ff';
    status.style.color = '#2563eb';
    status.textContent = 'Installing script tags...';

    try {
      var res = await fetch('/app/script-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok) {
        status.style.background = '#f0fdf4';
        status.style.color = '#16a34a';
        status.textContent = 'Script tags installed successfully.';
      } else {
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.textContent = data.error || 'Installation failed. Please try again.';
      }
    } catch(e) {
      status.style.background = '#fef2f2';
      status.style.color = '#dc2626';
      status.textContent = 'Network error. Please check your connection.';
    }

    btn.disabled = false;
    btn.textContent = 'Install Script Tags';
  };

  /* ---- Dashboard: LLM visibility test ---- */
  window.findableTestVisibility = async function() {
    var btn = document.getElementById('visibility-btn');
    var status = document.getElementById('visibility-status');
    var resultsDiv = document.getElementById('visibility-results');
    if (!btn || !status) return;

    btn.disabled = true;
    btn.textContent = 'Testing...';
    status.style.display = 'block';
    status.style.background = '#eff6ff';
    status.style.color = '#2563eb';
    status.textContent = 'Running LLM visibility tests (this may take 15-30 seconds)...';
    if (resultsDiv) resultsDiv.innerHTML = '';

    try {
      var res = await fetch('/app/visibility-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok && data.success) {
        var report = data.data;
        var pct = Math.round(report.mentionRate * 100);
        var color = pct >= 50 ? '#16a34a' : pct >= 20 ? '#d97706' : '#dc2626';
        status.style.background = '#f0fdf4';
        status.style.color = '#16a34a';
        status.textContent = 'Visibility test complete!';

        if (resultsDiv) {
          var html = '<div style="margin-top:16px;">';
          html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">';
          html += '<div style="font-size:48px;font-weight:800;color:' + color + ';">' + pct + '%</div>';
          html += '<div><div style="font-size:14px;font-weight:600;">LLM Mention Rate</div>';
          html += '<div style="font-size:12px;color:#6b7280;">Brand &ldquo;' + report.brandName + '&rdquo; mentioned in ' + report.mentionCount + ' of ' + report.testsRun + ' tests</div></div>';
          html += '</div>';

          for (var i = 0; i < report.results.length; i++) {
            var r = report.results[i];
            var badge = r.mentioned
              ? '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">MENTIONED</span>'
              : '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">NOT FOUND</span>';
            html += '<div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:8px;">';
            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' + badge;
            html += '<span style="font-size:13px;color:#374151;font-weight:500;">' + r.prompt + '</span></div>';
            if (r.mentionContext) {
              html += '<div style="font-size:12px;color:#4b5563;background:#ecfdf5;padding:8px;border-radius:4px;margin-bottom:4px;">&ldquo;' + r.mentionContext + '&rdquo;</div>';
            }
            if (r.competitorsMentioned && r.competitorsMentioned.length > 0) {
              html += '<div style="font-size:11px;color:#9ca3af;">Competitors mentioned: ' + r.competitorsMentioned.join(', ') + '</div>';
            }
            html += '</div>';
          }
          html += '</div>';
          resultsDiv.innerHTML = html;
        }
      } else {
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.textContent = data.error || 'Visibility test failed. Please try again.';
      }
    } catch(e) {
      status.style.background = '#fef2f2';
      status.style.color = '#dc2626';
      status.textContent = 'Network error. Please check your connection.';
    }

    btn.disabled = false;
    btn.textContent = 'Test LLM Visibility';
  };
})();
`;

appRoute.get("/assets/app.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(APP_JS);
});

/* ------------------------------------------------------------------ */
/*  Auth middleware                                                    */
/*                                                                    */
/*  Document requests (GET): check id_token query param.              */
/*  Fetch requests (POST etc): check Authorization: Bearer header.    */
/*  If no token, serve bounce page (GET) or return 401 (POST).       */
/* ------------------------------------------------------------------ */

appRoute.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;

  // Static assets need no auth
  if (pathname.startsWith("/app/assets/")) {
    return next();
  }

  if (!db) {
    return c.text("Database not configured", 503);
  }

  const apiKey = env.SHOPIFY_API_KEY ?? "";
  const isDocumentRequest = c.req.method === "GET";

  // ── FETCH / XHR requests (from App Bridge) ──────────────────────
  if (!isDocumentRequest) {
    const authorization = c.req.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : null;

    if (!token) {
      c.header("X-Shopify-Retry-Invalid-Session-Request", "1");
      return c.json({ success: false, error: "Session token required." }, 401);
    }

    let shop: string;
    try {
      const result = await verifyShopifySessionToken(token);
      shop = result.shop;
    } catch {
      c.header("X-Shopify-Retry-Invalid-Session-Request", "1");
      return c.json({ success: false, error: "Invalid session token." }, 401);
    }

    let store = await db.query.stores.findFirst({
      where: eq(stores.shopifyShop, shop),
    });

    // Token exchange if no stored access token
    if (!store?.shopifyAccessToken) {
      const exchangeResult = await performTokenExchange(shop, token);
      if (exchangeResult) {
        store = await ensureStoreRecord(shop, exchangeResult.accessToken, exchangeResult.scope);
      }
    }

    if (!store) {
      c.header("X-Shopify-Retry-Invalid-Session-Request", "1");
      return c.json({ success: false, error: "Store not found." }, 401);
    }

    c.set("shopifyStore", store);
    c.set("shopifyShop", shop);
    return next();
  }

  // ── DOCUMENT requests (initial page load from Shopify admin) ────
  const idToken = c.req.query("id_token");

  if (!idToken) {
    // No session token — serve bounce page. App Bridge will handle
    // obtaining a token and reloading the page with id_token.
    console.log("[app] No id_token — serving bounce page");
    return c.html(bouncePage(apiKey));
  }

  // Validate the JWT
  let shop: string;
  try {
    const result = await verifyShopifySessionToken(idToken);
    shop = result.shop;
    console.log(`[app] id_token verified for shop: ${shop}`);
  } catch (err) {
    console.error("[app] id_token verification failed:", err);
    return c.html(bouncePage(apiKey));
  }

  // Look up existing store
  let store = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shop),
  });

  // Token exchange if no stored access token
  if (!store?.shopifyAccessToken) {
    console.log(`[app] No access token for ${shop} — exchanging session token`);
    const exchangeResult = await performTokenExchange(shop, idToken);
    if (exchangeResult) {
      console.log(`[app] Token exchange succeeded for ${shop}`);
      store = await ensureStoreRecord(shop, exchangeResult.accessToken, exchangeResult.scope);
    }
  }

  if (!store) {
    return c.text("Failed to set up store. Please reinstall the app.", 500);
  }

  console.log(`[app] Authenticated: store=${store.id}, shop=${shop}`);
  c.set("shopifyStore", store);
  c.set("shopifyShop", shop);
  await next();
});

/* ------------------------------------------------------------------ */
/*  POST /sync  — Trigger product sync                                */
/* ------------------------------------------------------------------ */

appRoute.post("/sync", async (c) => {
  const store = c.get("shopifyStore");

  if (!store.shopifyShop || !store.shopifyAccessToken) {
    return c.json({ success: false, error: "Store is missing Shopify credentials." }, 400);
  }

  const accessToken = decryptAccessToken(store.shopifyAccessToken);
  const shopInfo = await getShopInfo(store.shopifyShop, accessToken);
  const count = await getProductCount(store.shopifyShop, accessToken);

  if (count > 1000) {
    const opId = await startBulkProductSync(store.shopifyShop, accessToken);
    return c.json({ success: true, data: { mode: "bulk", operationId: opId } });
  }

  syncAllProducts(store.shopifyShop, accessToken, store.id, shopInfo.currencyCode).catch(console.error);
  return c.json({ success: true, data: { mode: "incremental", productCount: count } });
});

/* ------------------------------------------------------------------ */
/*  POST /scan  — Trigger AI scan of all synced products              */
/* ------------------------------------------------------------------ */

appRoute.post("/scan", async (c) => {
  const store = c.get("shopifyStore");

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  // Look up all synced products for this store that have a URL
  const storeProducts = await db
    .select({ url: products.url })
    .from(products)
    .where(eq(products.storeId, store.id));

  const urls = storeProducts.map((p) => p.url).filter(Boolean);

  if (urls.length === 0) {
    return c.json({
      success: false,
      error: "No products synced yet. Sync your products first.",
    }, 400);
  }

  // Look up the account email for the scan payload
  const account = store.accountId
    ? await db.query.accounts.findFirst({
        where: eq(accounts.id, store.accountId),
      })
    : null;
  const email = account?.email ?? `${store.shopifyShop ?? "store"}@shop.findable`;

  // Create a scan record
  const inserted = await db
    .insert(scans)
    .values({
      accountId: store.accountId,
      storeId: store.id,
      scanType: "full",
      status: "queued",
      urlsInput: urls,
      pagesTotal: urls.length,
    })
    .returning({ id: scans.id });

  const scanRecord = inserted[0];
  if (!scanRecord) {
    return c.json({ success: false, error: "Failed to create scan record." }, 500);
  }

  // Enqueue the scan job
  await enqueueScanJob({
    scanId: scanRecord.id,
    urls,
    email,
  });

  return c.json({
    success: true,
    data: {
      scanId: scanRecord.id,
      productCount: urls.length,
    },
  });
});

/* ------------------------------------------------------------------ */
/*  POST /script-tags  — Install script tags                          */
/* ------------------------------------------------------------------ */

appRoute.post("/script-tags", async (c) => {
  const store = c.get("shopifyStore");

  if (!store.shopifyShop || !store.shopifyAccessToken) {
    return c.json({ success: false, error: "Store is missing Shopify credentials." }, 400);
  }

  const accessToken = decryptAccessToken(store.shopifyAccessToken);
  await installScriptTag(store.shopifyShop, accessToken, store.id);
  return c.json({ success: true });
});

/* ------------------------------------------------------------------ */
/*  POST /visibility-test  — LLM visibility testing (Pro tier)        */
/* ------------------------------------------------------------------ */

appRoute.post("/visibility-test", async (c) => {
  const store = c.get("shopifyStore");

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  if (!env.OPENAI_API_KEY) {
    return c.json({ success: false, error: "OpenAI API key not configured." }, 503);
  }

  // Get brand name from store name (fallback to shop domain)
  let brandName = store.name ?? store.shopifyShop?.replace(".myshopify.com", "") ?? "Unknown";

  // Try to get vendor from the first product's extractedAttributes
  const firstProduct = await db
    .select({
      name: products.name,
      extractedAttributes: products.extractedAttributes,
      googleCategory: products.googleCategory,
    })
    .from(products)
    .where(eq(products.storeId, store.id))
    .limit(5);

  if (firstProduct.length === 0) {
    return c.json({
      success: false,
      error: "No products synced yet. Sync your products first.",
    }, 400);
  }

  // Use the vendor from the first product if available
  const firstAttrs = firstProduct[0]?.extractedAttributes as Record<string, unknown> | null;
  if (firstAttrs?.vendor && typeof firstAttrs.vendor === "string" && firstAttrs.vendor.length > 0) {
    brandName = firstAttrs.vendor;
  }

  // Determine product categories from extractedAttributes
  const categorySet = new Set<string>();
  for (const p of firstProduct) {
    const attrs = p.extractedAttributes as Record<string, unknown> | null;
    if (attrs?.productType && typeof attrs.productType === "string" && attrs.productType.length > 0) {
      categorySet.add(attrs.productType);
    }
    if (p.googleCategory) {
      categorySet.add(p.googleCategory);
    }
  }

  // Fallback to a generic category from product names
  const productCategory = categorySet.size > 0
    ? Array.from(categorySet)[0]!
    : "products";

  // Build 3-5 use cases for testing
  const defaultUseCases = [
    "everyday use",
    "beginners",
    "professionals",
    "value for money",
    "sustainability",
  ];
  const useCases = defaultUseCases.slice(0, Math.min(5, Math.max(3, defaultUseCases.length)));

  try {
    const report = await testLlmVisibility({
      brandName,
      productCategory,
      useCases,
    });

    return c.json({ success: true, data: report });
  } catch (err) {
    console.error("[app] Visibility test error:", err);
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : "Visibility test failed.",
    }, 500);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /  — Dashboard home                                           */
/* ------------------------------------------------------------------ */

appRoute.get("/", async (c) => {
  const store = c.get("shopifyStore");
  const apiKey = env.SHOPIFY_API_KEY ?? "";
  const frontendUrl = env.FRONTEND_URL;

  // Latest completed scan for this store
  const latestScan = db
    ? await db.query.scans.findFirst({
        where: and(eq(scans.storeId, store.id), eq(scans.status, "complete")),
        orderBy: [desc(scans.completedAt)],
      })
    : null;

  // Product count
  const productRows = db
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.storeId, store.id))
    : [];
  const productCount = productRows[0]?.count ?? 0;

  // Top 5 critical/high issues (unfixed, most recent first)
  const topIssues = db
    ? await db
        .select({
          id: issues.id,
          severity: issues.severity,
          title: issues.title,
          dimension: issues.dimension,
          code: issues.code,
        })
        .from(issues)
        .innerJoin(products, eq(issues.productId, products.id))
        .where(
          and(
            eq(products.storeId, store.id),
            eq(issues.fixed, false),
            inArray(issues.severity, ["critical", "high"]),
          ),
        )
        .orderBy(desc(issues.createdAt))
        .limit(5)
    : [];

  const overallScore = latestScan?.scoreOverall ?? 0;
  const schemaScore = latestScan?.scoreSchema ?? 0;
  const llmScore = latestScan?.scoreLlm ?? 0;
  const protocolScore = latestScan?.scoreProtocol ?? 0;
  const competitiveScore = latestScan?.scoreCompetitive ?? 0;

  const lastSyncTime = latestScan?.completedAt
    ? new Date(latestScan.completedAt).toLocaleString("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

  const issuesHtml = topIssues.length
    ? topIssues
        .map(
          (issue) => `
        <div class="issue-row">
          <span class="severity severity-${issue.severity ?? "medium"}" style="margin-right: 12px;">${escapeHtml(issue.severity ?? "medium")}</span>
          <span style="flex: 1;">${escapeHtml(issue.title)}</span>
          <span style="font-size: 12px; color: #9ca3af;">${escapeHtml(issue.dimension ?? "")}</span>
        </div>`,
        )
        .join("")
    : '<div class="empty">No critical issues found. Run a scan to check your store.</div>';

  const content = `
    <div class="card">
      <h2 class="card-title">FindAble Score</h2>
      <div class="score-ring">
        <div class="score-number" style="color: ${scoreColor(overallScore)};">${overallScore}</div>
        <div class="score-label">Overall AEO Score${latestScan ? "" : " — No scan yet"}</div>
      </div>
      <div class="dimensions">
        <div class="dim-card">
          <div class="dim-score" style="color: ${scoreColor(schemaScore)};">${schemaScore}</div>
          <div class="dim-label">Schema</div>
        </div>
        <div class="dim-card">
          <div class="dim-score" style="color: ${scoreColor(llmScore)};">${llmScore}</div>
          <div class="dim-label">LLM Readiness</div>
        </div>
        <div class="dim-card">
          <div class="dim-score" style="color: ${scoreColor(protocolScore)};">${protocolScore}</div>
          <div class="dim-label">Protocol</div>
        </div>
        <div class="dim-card">
          <div class="dim-score" style="color: ${scoreColor(competitiveScore)};">${competitiveScore}</div>
          <div class="dim-label">Competitive</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Product Sync</h2>
      <div class="stat-row">
        <span class="stat-label">Products synced</span>
        <span class="stat-value">${productCount}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Last scan completed</span>
        <span class="stat-value">${escapeHtml(lastSyncTime)}</span>
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="sync-btn" onclick="findableSyncProducts()">Sync Products</button>
        <button class="btn" id="scan-btn" onclick="findableScanStore()" style="background: #22c55e; color: white;">Scan Store</button>
        <a class="btn btn-secondary" href="${escapeHtml(frontendUrl)}/dashboard" target="_top">Open Full Dashboard</a>
      </div>
      <div id="sync-status"></div>
    </div>

    <div class="card">
      <h2 class="card-title">Top Issues</h2>
      ${issuesHtml}
    </div>

    <div class="card">
      <h2 class="card-title">LLM Visibility Test <span style="background: #ede9fe; color: #7c3aed; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; vertical-align: middle;">PRO</span></h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">Test whether AI assistants (ChatGPT, etc.) recommend your brand when shoppers ask questions about your product category.</p>
      <div class="actions">
        <button class="btn" id="visibility-btn" onclick="findableTestVisibility()" style="background: #7c3aed; color: white;">Test LLM Visibility</button>
      </div>
      <div id="visibility-status" style="display: none; margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px;"></div>
      <div id="visibility-results"></div>
    </div>

  `;

  return c.html(renderPage("Dashboard", content, apiKey));
});

/* ------------------------------------------------------------------ */
/*  GET /products  — Products list                                    */
/* ------------------------------------------------------------------ */

appRoute.get("/products", async (c) => {
  const store = c.get("shopifyStore");
  const apiKey = env.SHOPIFY_API_KEY ?? "";
  const frontendUrl = env.FRONTEND_URL;

  // Fetch products for this store
  const storeProducts = db
    ? await db
        .select({
          id: products.id,
          name: products.name,
          url: products.url,
          schemaScore: products.schemaScore,
          llmScore: products.llmScore,
        })
        .from(products)
        .where(eq(products.storeId, store.id))
        .orderBy(desc(products.createdAt))
        .limit(100)
    : [];

  // Get issue counts per product
  const productIds = storeProducts.map((p) => p.id);
  const issueCounts: Record<string, number> = {};

  if (db && productIds.length > 0) {
    const counts = await db
      .select({
        productId: issues.productId,
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(and(inArray(issues.productId, productIds), eq(issues.fixed, false)))
      .groupBy(issues.productId);

    for (const row of counts) {
      if (row.productId) {
        issueCounts[row.productId] = row.count;
      }
    }
  }

  let tableHtml: string;

  if (storeProducts.length === 0) {
    tableHtml = '<div class="empty">No products synced yet. Sync your products from the Dashboard.</div>';
  } else {
    const rows = storeProducts
      .map((p) => {
        const name = escapeHtml(p.name ?? "Untitled");
        const url = escapeHtml(p.url);
        const schema = p.schemaScore ?? 0;
        const llm = p.llmScore ?? 0;
        const count = issueCounts[p.id] ?? 0;
        const detailUrl = `${escapeHtml(frontendUrl)}/dashboard/products/${p.id}`;

        return `
          <tr>
            <td><a href="${detailUrl}" target="_top" style="color: #4f46e5; text-decoration: none; font-weight: 500;">${name}</a></td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><a href="${url}" target="_blank" style="color: #6b7280; text-decoration: none; font-size: 12px;">${url}</a></td>
            <td><span style="color: ${scoreColor(schema)}; font-weight: 600;">${schema}</span></td>
            <td><span style="color: ${scoreColor(llm)}; font-weight: 600;">${llm}</span></td>
            <td>${count > 0 ? `<span style="color: #dc2626; font-weight: 600;">${count}</span>` : '<span style="color: #16a34a;">0</span>'}</td>
          </tr>`;
      })
      .join("");

    tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>URL</th>
            <th>Schema</th>
            <th>LLM</th>
            <th>Issues</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>`;
  }

  const content = `
    <div class="card">
      <h2 class="card-title">Products (${storeProducts.length})</h2>
      ${tableHtml}
    </div>
  `;

  return c.html(renderPage("Products", content, apiKey));
});

/* ------------------------------------------------------------------ */
/*  GET /settings  — Settings page                                    */
/* ------------------------------------------------------------------ */

appRoute.get("/settings", async (c) => {
  const store = c.get("shopifyStore");
  const apiKey = env.SHOPIFY_API_KEY ?? "";
  const frontendUrl = env.FRONTEND_URL;

  // Look up the account to get the plan
  const account =
    db && store.accountId
      ? await db.query.accounts.findFirst({
          where: eq(accounts.id, store.accountId),
        })
      : null;

  const plan = account?.plan ?? "free";
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  const hasScriptTag = Boolean(store.shopifyAccessToken);
  const shopDomain = store.shopifyShop ?? store.url ?? "Unknown";
  const installedAt = store.shopifyInstalledAt
    ? new Date(store.shopifyInstalledAt).toLocaleString("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Unknown";
  const scopes = store.shopifyScopes?.join(", ") ?? "None";

  const content = `
    <div class="card">
      <h2 class="card-title">Plan</h2>
      <div class="stat-row">
        <span class="stat-label">Current plan</span>
        <span class="stat-value">${escapeHtml(planLabel)}</span>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="${escapeHtml(frontendUrl)}/dashboard/settings" target="_top">Manage Billing</a>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Script Tag</h2>
      <div class="stat-row">
        <span class="stat-label">Status</span>
        <span class="stat-value">${hasScriptTag ? '<span style="color: #16a34a;">Installed</span>' : '<span style="color: #dc2626;">Not installed</span>'}</span>
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="install-script-btn" onclick="findableInstallScriptTag()">Install Script Tags</button>
      </div>
      <div id="script-status" style="display: none; margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px;"></div>
    </div>

    <div class="card">
      <h2 class="card-title">Store Connection</h2>
      <div class="stat-row">
        <span class="stat-label">Shop domain</span>
        <span class="stat-value">${escapeHtml(shopDomain)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Installed at</span>
        <span class="stat-value">${escapeHtml(installedAt)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Scopes</span>
        <span class="stat-value" style="max-width: 400px; word-break: break-all; font-size: 12px;">${escapeHtml(scopes)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Platform</span>
        <span class="stat-value">${escapeHtml(store.platform ?? "shopify")}</span>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Product Feeds</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">Submit these URLs to Google Merchant Center and ChatGPT to power AI-driven product discovery.</p>
      <div class="stat-row">
        <span class="stat-label">ACP Feed (ChatGPT)</span>
        <span class="stat-value" style="font-size: 12px; word-break: break-all;">
          <a href="https://api.getfindable.au/feeds/acp/${escapeHtml(shopDomain)}" target="_blank" style="color: #2563eb;">
            https://api.getfindable.au/feeds/acp/${escapeHtml(shopDomain)}
          </a>
        </span>
      </div>
      <div class="stat-row">
        <span class="stat-label">GMC Feed (Google)</span>
        <span class="stat-value" style="font-size: 12px; word-break: break-all;">
          <a href="https://api.getfindable.au/feeds/gmc/${escapeHtml(shopDomain)}" target="_blank" style="color: #2563eb;">
            https://api.getfindable.au/feeds/gmc/${escapeHtml(shopDomain)}
          </a>
        </span>
      </div>
      <div class="stat-row">
        <span class="stat-label">llms.txt</span>
        <span class="stat-value" style="font-size: 12px; word-break: break-all;">
          <a href="https://api.getfindable.au/feeds/llms-txt/${escapeHtml(shopDomain)}" target="_blank" style="color: #2563eb;">
            https://api.getfindable.au/feeds/llms-txt/${escapeHtml(shopDomain)}
          </a>
        </span>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Full Dashboard</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">Access advanced analytics, competitor tracking, feed generation, and more.</p>
      <a class="btn btn-secondary" href="${escapeHtml(frontendUrl)}/dashboard" target="_top">Open Full Dashboard</a>
    </div>

  `;

  return c.html(renderPage("Settings", content, apiKey));
});

export { appRoute };
