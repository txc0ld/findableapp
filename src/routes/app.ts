import { Hono } from "hono";
import { eq, desc, and, sql, inArray, or, lt, isNotNull, gt } from "drizzle-orm";

import { db } from "../db/client";
import { accounts, stores, products, issues, scans, type Store } from "../db/schema";
import type { ShopifySessionVariables } from "../lib/shopify-session";
import { verifyShopifySessionToken } from "../lib/shopify-session";
import { encryptShopifyAccessToken } from "../lib/shopify";
import { decryptAccessToken } from "../lib/shopify-client";
import { syncAllProducts, getProductCount, getShopInfo } from "../services/product-sync";
import { startBulkProductSync } from "../services/bulk-operations";
import { installScriptTag } from "../services/script-tags";
import { testLlmVisibility } from "../services/llm-tester";
import { analyzeWithAi } from "../services/ai-analyzer";
import type { AiAnalysisInput } from "../services/ai-analyzer";
import { auditEntityConsistency } from "../services/entity-audit";
import { detectMismatches } from "../services/mismatch-detector";
import type { MappedProduct } from "../types/shopify";
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
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-marketing { background: #fef3c7; color: #92400e; }
    .badge-factual { background: #d1fae5; color: #065f46; }
    .badge-mixed { background: #e0e7ff; color: #3730a3; }
    .badge-success { background: #dcfce7; color: #16a34a; }
    .badge-warning { background: #fef9c3; color: #854d0e; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .detail-grid.full { grid-template-columns: 1fr; }
    .side-by-side { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 768px) { .detail-grid, .side-by-side { grid-template-columns: 1fr; } }
    .desc-box { background: #f9fafb; border-radius: 8px; padding: 16px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; }
    .schema-preview { background: #1e1e2e; color: #cdd6f4; border-radius: 8px; padding: 16px; font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; }
    .faq-item { background: #f9fafb; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
    .faq-q { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .faq-a { font-size: 13px; color: #4b5563; }
    .attr-tag { display: inline-block; padding: 2px 8px; background: #f3f4f6; border-radius: 4px; font-size: 12px; margin: 2px; }
    .attr-tag.missing { background: #fef2f2; color: #dc2626; }
    .step-card { background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .step-number { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #4f46e5; color: white; font-size: 14px; font-weight: 700; margin-right: 12px; }
    .step-title { font-size: 15px; font-weight: 600; }
    .step-desc { font-size: 13px; color: #4b5563; margin-top: 8px; line-height: 1.6; }
    .code-block { background: #1e1e2e; color: #cdd6f4; border-radius: 6px; padding: 8px 12px; font-size: 12px; font-family: monospace; word-break: break-all; margin-top: 8px; }
    .health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 16px; }
    .health-card { background: #f9fafb; border-radius: 8px; padding: 16px; }
    .health-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
    .health-value { font-size: 24px; font-weight: 700; }
    .health-desc { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .action-status { display: none; margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="page">
    <nav class="nav">
      <a href="/app" class="${title === "Dashboard" ? "active" : ""}">Dashboard</a>
      <a href="/app/products" class="${title === "Products" ? "active" : ""}">Products</a>
      <a href="/app/setup" class="${title === "Setup" ? "active" : ""}">Setup</a>
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

  /* ---- Fix ALL in-app links: add shop param for navigation ---- */
  var shop = new URLSearchParams(window.location.search).get('shop') || '';
  if (shop) {
    document.querySelectorAll('a[href^="/app"]').forEach(function(a) {
      var url = new URL(a.href, window.location.origin);
      if (!url.searchParams.has('shop')) {
        url.searchParams.set('shop', shop);
        a.href = url.toString();
      }
    });
  }

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
    status.style.display = 'block';

    try {
      var res = await fetch('/app/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok) {
        var scanId = data.data.scanId;
        var total = data.data.productCount || 0;
        status.className = 'loading';
        status.textContent = 'Scanning... 0/' + total + ' products';

        // Poll scan-status every 2 seconds
        var pollInterval = setInterval(async function() {
          try {
            var pollRes = await fetch('/app/scan-status?scanId=' + encodeURIComponent(scanId));
            var pollData = await pollRes.json();
            if (pollRes.ok && pollData.success) {
              var s = pollData.data;
              if (s.status === 'complete') {
                clearInterval(pollInterval);
                status.className = 'success';
                status.textContent = 'Scan complete! ' + (s.pagesTotal || total) + ' products scored. Overall: ' + (s.scoreOverall || 0) + '. Reloading...';
                btn.disabled = false;
                btn.textContent = 'Scan Store';
                setTimeout(function() { window.location.reload(); }, 1500);
              } else if (s.status === 'failed') {
                clearInterval(pollInterval);
                status.className = 'error';
                status.textContent = 'Scan failed. Please try again.';
                btn.disabled = false;
                btn.textContent = 'Scan Store';
              } else {
                status.className = 'loading';
                status.textContent = 'Scanning... ' + (s.pagesScanned || 0) + '/' + (s.pagesTotal || total) + ' products';
              }
            }
          } catch(pollErr) {
            // Ignore transient poll errors
          }
        }, 2000);
      } else {
        status.className = 'error';
        status.textContent = data.error || 'Scan failed. Please try again.';
        btn.disabled = false;
        btn.textContent = 'Scan Store';
      }
    } catch(e) {
      status.className = 'error';
      status.textContent = 'Network error. Please check your connection.';
      btn.disabled = false;
      btn.textContent = 'Scan Store';
    }
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

  /* ---- Product Detail: auto-fix ---- */
  window.findableAutoFix = async function(productId) {
    var btn = document.getElementById('fix-btn');
    var status = document.getElementById('fix-status');
    if (!btn || !status) return;

    btn.disabled = true;
    btn.textContent = 'Fixing...';
    status.style.display = 'block';
    status.style.background = '#eff6ff';
    status.style.color = '#2563eb';
    status.textContent = 'Running AI analysis... this may take 15-30 seconds.';

    try {
      var res = await fetch('/app/products/' + productId + '/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok && data.success) {
        status.style.background = '#f0fdf4';
        status.style.color = '#16a34a';
        status.textContent = 'Product fixed! New AEO score: ' + (data.data.aeoScore || 'N/A') + '. Reloading...';
        setTimeout(function() { window.location.reload(); }, 1500);
      } else {
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.textContent = data.error || 'Auto-fix failed. Please try again.';
      }
    } catch(e) {
      status.style.background = '#fef2f2';
      status.style.color = '#dc2626';
      status.textContent = 'Network error. Please check your connection.';
    }

    btn.disabled = false;
    btn.textContent = 'Auto-Fix This Product';
  };

  /* ---- Product Detail: restore original ---- */
  window.findableRestore = async function(productId) {
    if (!confirm('Restore this product to its pre-fix state?')) return;
    var btn = document.getElementById('restore-btn');
    var status = document.getElementById('fix-status');
    if (!btn || !status) return;

    btn.disabled = true;
    btn.textContent = 'Restoring...';
    status.style.display = 'block';
    status.style.background = '#eff6ff';
    status.style.color = '#2563eb';
    status.textContent = 'Restoring original data...';

    try {
      var res = await fetch('/app/products/' + productId + '/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok && data.success) {
        status.style.background = '#f0fdf4';
        status.style.color = '#16a34a';
        status.textContent = 'Restored to original. Reloading...';
        setTimeout(function() { window.location.reload(); }, 1500);
      } else {
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.textContent = data.error || 'Restore failed.';
      }
    } catch(e) {
      status.style.background = '#fef2f2';
      status.style.color = '#dc2626';
      status.textContent = 'Network error.';
    }

    btn.disabled = false;
    btn.textContent = 'Restore Original';
  };

  /* ---- Dashboard: bulk fix all ---- */
  window.findableFixAll = async function() {
    if (!confirm('Run AI auto-fix on ALL products? This may take a while.')) return;
    var btn = document.getElementById('fix-all-btn');
    var status = document.getElementById('fix-all-status');
    if (!btn || !status) return;

    btn.disabled = true;
    btn.textContent = 'Starting...';
    status.style.display = 'block';
    status.style.background = '#eff6ff';
    status.style.color = '#2563eb';
    status.textContent = 'Queuing bulk AI fix...';

    try {
      var res = await fetch('/app/fix-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      if (res.ok && data.success) {
        status.style.background = '#f0fdf4';
        status.style.color = '#16a34a';
        status.textContent = 'Bulk fix started for ' + (data.data.productCount || 0) + ' products. Processing in background — results will appear when complete.';
      } else {
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.textContent = data.error || 'Bulk fix failed.';
      }
    } catch(e) {
      status.style.background = '#fef2f2';
      status.style.color = '#dc2626';
      status.textContent = 'Network error.';
    }

    btn.disabled = false;
    btn.textContent = 'Fix All Products';
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
    status.textContent = 'Starting LLM visibility tests...';
    if (resultsDiv) resultsDiv.innerHTML = '';

    try {
      // Start the test (returns immediately)
      var startRes = await fetch('/app/visibility-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!startRes.ok) {
        var errData = await startRes.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Failed to start test');
      }

      // Poll for results
      status.textContent = 'Running LLM visibility tests (5 prompts)...';
      var report = null;
      for (var attempt = 0; attempt < 30; attempt++) {
        await new Promise(function(r) { setTimeout(r, 2000); });
        var pollRes = await fetch('/app/visibility-status');
        var pollData = await pollRes.json();
        if (pollData.status === 'complete') {
          report = pollData.data;
          break;
        } else if (pollData.status === 'error') {
          throw new Error(pollData.error || 'Test failed');
        }
        status.textContent = 'Running LLM visibility tests... (' + (attempt + 1) * 2 + 's)';
      }
      if (!report) throw new Error('Test timed out');

      if (true) {
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
  // App Bridge adds Authorization: Bearer to all fetch() calls (including GET).
  // Treat requests with Authorization header as fetch requests, not document loads.
  const hasAuthHeader = Boolean(c.req.header("authorization"));
  const isDocumentRequest = c.req.method === "GET" && !hasAuthHeader;

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
    // No id_token — try shop query param for in-app navigation.
    // If the store already exists, serve the page (read-only is safe).
    // POST actions still require the session token via Authorization header.
    const shopParam = c.req.query("shop")?.replace(/^https?:\/\//, "");
    if (shopParam) {
      const existingStore = await db.query.stores.findFirst({
        where: eq(stores.shopifyShop, shopParam),
      });
      if (existingStore) {
        console.log(`[app] No id_token but store exists for ${shopParam} — serving page`);
        c.set("shopifyStore", existingStore);
        c.set("shopifyShop", shopParam);
        return next();
      }
    }

    // No token AND no existing store — serve bounce page.
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
    // Token expired/invalid — fall back to shop param if store exists
    const shopFallback = c.req.query("shop")?.replace(/^https?:\/\//, "");
    if (shopFallback) {
      const existingStore = await db.query.stores.findFirst({
        where: eq(stores.shopifyShop, shopFallback),
      });
      if (existingStore) {
        console.log(`[app] Expired id_token but store exists for ${shopFallback} — serving page`);
        c.set("shopifyStore", existingStore);
        c.set("shopifyShop", shopFallback);
        return next();
      }
    }
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

/* ------------------------------------------------------------------ */
/*  POST /cleanup  — Delete all products + issues for this store      */
/* ------------------------------------------------------------------ */

appRoute.post("/cleanup", async (c) => {
  const store = c.get("shopifyStore");
  if (!db) return c.json({ success: false, error: "No database" }, 503);

  // Delete issues linked to this store's products
  const storeProducts = await db.select({ id: products.id }).from(products).where(eq(products.storeId, store.id));
  for (const p of storeProducts) {
    await db.delete(issues).where(eq(issues.productId, p.id));
  }
  // Delete all products
  await db.delete(products).where(eq(products.storeId, store.id));
  // Delete all scans
  await db.delete(scans).where(eq(scans.storeId, store.id));

  return c.json({ success: true, deleted: storeProducts.length });
});

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
/*  POST /scan  — Score all synced products from DB (heuristic)       */
/* ------------------------------------------------------------------ */

appRoute.post("/scan", async (c) => {
  const store = c.get("shopifyStore");

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  // Count synced products for this store
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.storeId, store.id));
  const productCount = countRows[0]?.count ?? 0;

  if (productCount === 0) {
    return c.json({
      success: false,
      error: "No products synced yet. Sync your products first.",
    }, 400);
  }

  // Create a scan record
  const inserted = await db
    .insert(scans)
    .values({
      accountId: store.accountId,
      storeId: store.id,
      scanType: "full",
      status: "scanning",
      pagesTotal: productCount,
      startedAt: new Date(),
    })
    .returning({ id: scans.id });

  const scanRecord = inserted[0];
  if (!scanRecord) {
    return c.json({ success: false, error: "Failed to create scan record." }, 500);
  }

  // Fire-and-forget: score all products from DB data (no HTTP, no AI)
  scoreProductsFromDb(scanRecord.id, store.id).catch((err) =>
    console.error("[app/scan] Background scan failed:", err),
  );

  return c.json({
    success: true,
    data: {
      scanId: scanRecord.id,
      productCount,
    },
  });
});

/* ------------------------------------------------------------------ */
/*  GET /scan-status  — Poll scan progress                            */
/* ------------------------------------------------------------------ */

appRoute.get("/scan-status", async (c) => {
  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  const scanId = c.req.query("scanId");
  if (!scanId) {
    return c.json({ success: false, error: "scanId is required." }, 400);
  }

  const scan = await db.query.scans.findFirst({
    where: eq(scans.id, scanId),
  });

  if (!scan) {
    return c.json({ success: false, error: "Scan not found." }, 404);
  }

  return c.json({
    success: true,
    data: {
      status: scan.status,
      pagesScanned: scan.pagesScanned,
      pagesTotal: scan.pagesTotal,
      scoreOverall: scan.scoreOverall,
      scoreSchema: scan.scoreSchema,
      scoreLlm: scan.scoreLlm,
      scoreProtocol: scan.scoreProtocol,
    },
  });
});

/* ------------------------------------------------------------------ */
/*  Background: score products from DB fields (heuristic, no AI)      */
/* ------------------------------------------------------------------ */

interface ScoredIssue {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  dimension: "schema" | "llm" | "protocol";
  pointsImpact: number;
}

function scoreProductFromDb(product: {
  hasJsonld: boolean;
  hasGtin: boolean;
  hasBrand: boolean;
  hasShippingSchema: boolean;
  hasReturnSchema: boolean;
  hasReviewSchema: boolean;
  hasFaqSchema: boolean;
  hasVariantsStructured: boolean;
  hasMaterial: boolean;
  hasColor: boolean;
  hasSize: boolean;
  originalDescription: string | null;
  rewrittenDescription: string | null;
  generatedSchema: unknown;
  suggestedFaq: unknown;
  aeoScore: number | null;
}): { schema: number; llm: number; protocol: number; issues: ScoredIssue[] } {
  const scoredIssues: ScoredIssue[] = [];
  let schema = 18; // base
  let llm = 22; // base
  let protocol = 10; // base

  // Account for FindAble-generated content
  const hasSchema = product.hasJsonld || product.generatedSchema != null;
  const hasFaq = product.hasFaqSchema || (Array.isArray(product.suggestedFaq) && product.suggestedFaq.length > 0);

  // Schema scoring
  if (hasSchema) schema += 12;
  else scoredIssues.push({ severity: "critical", title: "No JSON-LD schema detected", dimension: "schema", pointsImpact: 12 });

  if (product.hasGtin) schema += 10;
  else scoredIssues.push({ severity: "medium", title: "Missing GTIN/barcode", dimension: "schema", pointsImpact: 10 });

  if (product.hasBrand) schema += 8;
  else scoredIssues.push({ severity: "high", title: "Missing brand", dimension: "schema", pointsImpact: 8 });

  if (product.hasShippingSchema) schema += 7;
  else scoredIssues.push({ severity: "high", title: "Missing shipping information", dimension: "schema", pointsImpact: 7 });

  if (product.hasReturnSchema) schema += 7;
  else scoredIssues.push({ severity: "high", title: "Missing return policy", dimension: "schema", pointsImpact: 7 });

  if (product.hasReviewSchema) schema += 6;
  else scoredIssues.push({ severity: "medium", title: "No review/rating schema", dimension: "schema", pointsImpact: 6 });

  if (hasFaq) schema += 4;

  if (product.hasVariantsStructured) schema += 4;

  // LLM scoring — use rewritten description if available (longer, better quality)
  const desc = product.rewrittenDescription ?? product.originalDescription ?? "";
  const descLength = desc.length;
  llm += Math.min(26, Math.floor(descLength / 12));

  if (product.hasBrand) llm += 8;
  if (hasFaq) llm += 12;
  if (product.hasMaterial || product.hasColor || product.hasSize) llm += 10;
  if (product.hasReviewSchema) llm += 10;

  if (descLength < 100)
    scoredIssues.push({ severity: "high", title: "Description too short for AI discovery", dimension: "llm", pointsImpact: 15 });

  // Protocol scoring
  if (product.hasJsonld) protocol += 20;
  if (product.hasShippingSchema) protocol += 12;
  if (product.hasReturnSchema) protocol += 12;
  if (product.hasGtin) protocol += 10;
  protocol += 8; // canonical URL (assume present for Shopify)

  // Cap at 100
  schema = Math.min(100, schema);
  llm = Math.min(100, llm);
  protocol = Math.min(100, protocol);

  return { schema, llm, protocol, issues: scoredIssues };
}

async function scoreProductsFromDb(scanId: string, storeId: string): Promise<void> {
  if (!db) return;

  try {
    // Fetch all products for this store
    const allProducts = await db
      .select({
        id: products.id,
        hasJsonld: products.hasJsonld,
        hasGtin: products.hasGtin,
        hasBrand: products.hasBrand,
        hasShippingSchema: products.hasShippingSchema,
        hasReturnSchema: products.hasReturnSchema,
        hasReviewSchema: products.hasReviewSchema,
        hasFaqSchema: products.hasFaqSchema,
        hasVariantsStructured: products.hasVariantsStructured,
        hasMaterial: products.hasMaterial,
        hasColor: products.hasColor,
        hasSize: products.hasSize,
        originalDescription: products.originalDescription,
        rewrittenDescription: products.rewrittenDescription,
        generatedSchema: products.generatedSchema,
        suggestedFaq: products.suggestedFaq,
        aeoScore: products.aeoScore,
      })
      .from(products)
      .where(eq(products.storeId, storeId));

    let totalSchema = 0;
    let totalLlm = 0;
    let totalProtocol = 0;
    let processed = 0;

    for (const product of allProducts) {
      const result = scoreProductFromDb(product);

      // Blend AI AEO score if available
      const finalLlm = product.aeoScore
        ? Math.round(product.aeoScore * 0.7 + result.llm * 0.3)
        : result.llm;

      // Update product scores
      await db
        .update(products)
        .set({
          schemaScore: result.schema,
          llmScore: finalLlm,
          scanId: scanId,
        })
        .where(eq(products.id, product.id));

      // Delete old issues for this product, then insert new ones
      await db.delete(issues).where(eq(issues.productId, product.id));

      if (result.issues.length > 0) {
        await db.insert(issues).values(
          result.issues.map((issue) => ({
            scanId: scanId,
            productId: product.id,
            severity: issue.severity,
            dimension: issue.dimension,
            code: issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            title: issue.title,
            description: issue.title,
            pointsImpact: issue.pointsImpact,
          })),
        );
      }

      processed++;
      totalSchema += result.schema;
      totalLlm += result.llm;
      totalProtocol += result.protocol;

      // Update scan progress every product (fast enough since no I/O per product)
      if (processed % 50 === 0 || processed === allProducts.length) {
        const avgSchema = Math.round(totalSchema / processed);
        const avgLlm = Math.round(totalLlm / processed);
        const avgProtocol = Math.round(totalProtocol / processed);
        const avgOverall = Math.round((avgSchema + avgLlm + avgProtocol) / 3);

        await db
          .update(scans)
          .set({
            pagesScanned: processed,
            scoreSchema: avgSchema,
            scoreLlm: avgLlm,
            scoreProtocol: avgProtocol,
            scoreOverall: avgOverall,
          })
          .where(eq(scans.id, scanId));
      }
    }

    // Final update: mark scan complete
    const avgSchema = allProducts.length > 0 ? Math.round(totalSchema / allProducts.length) : 0;
    const avgLlm = allProducts.length > 0 ? Math.round(totalLlm / allProducts.length) : 0;
    const avgProtocol = allProducts.length > 0 ? Math.round(totalProtocol / allProducts.length) : 0;
    const avgOverall = Math.round((avgSchema + avgLlm + avgProtocol) / 3);

    await db
      .update(scans)
      .set({
        status: "complete",
        pagesScanned: allProducts.length,
        scoreSchema: avgSchema,
        scoreLlm: avgLlm,
        scoreProtocol: avgProtocol,
        scoreOverall: avgOverall,
        completedAt: new Date(),
      })
      .where(eq(scans.id, scanId));

    console.log(
      `[app/scan] Scan ${scanId} complete: ${allProducts.length} products scored (schema=${avgSchema} llm=${avgLlm} protocol=${avgProtocol} overall=${avgOverall})`,
    );
  } catch (err) {
    console.error(`[app/scan] Scan ${scanId} failed:`, err);
    // Mark scan as failed
    await db
      ?.update(scans)
      .set({ status: "failed" })
      .where(eq(scans.id, scanId));
  }
}

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

// In-memory store for visibility test results (keyed by storeId)
const visibilityResults = new Map<string, { status: string; data?: unknown; error?: string }>();

appRoute.post("/visibility-test", async (c) => {
  const store = c.get("shopifyStore");

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  if (!env.OPENAI_API_KEY) {
    return c.json({ success: false, error: "OpenAI API key not configured." }, 503);
  }

  // Return immediately, process in background
  visibilityResults.set(store.id, { status: "running" });

  // Fire and forget
  (async () => {
    try {
      let brandName = store.name ?? store.shopifyShop?.replace(".myshopify.com", "") ?? "Unknown";

      const storeProducts = await db!
        .select({
          extractedAttributes: products.extractedAttributes,
          googleCategory: products.googleCategory,
          price: products.price,
        })
        .from(products)
        .where(eq(products.storeId, store.id))
        .limit(20);

      const firstAttrs = storeProducts[0]?.extractedAttributes as Record<string, unknown> | null;
      if (firstAttrs?.vendor && typeof firstAttrs.vendor === "string" && firstAttrs.vendor.length > 0) {
        brandName = firstAttrs.vendor;
      }

      const categorySet = new Set<string>();
      for (const p of storeProducts) {
        const attrs = p.extractedAttributes as Record<string, unknown> | null;
        if (attrs?.productType && typeof attrs.productType === "string") categorySet.add(attrs.productType);
        if (p.googleCategory) categorySet.add(p.googleCategory);
      }
      const productCategory = categorySet.size > 0 ? Array.from(categorySet)[0]! : "products";

      // Get average price for price-constrained prompt
      const prices = storeProducts
        .map((p) => parseFloat(p.price ?? "0"))
        .filter((p) => p > 0);
      const avgPrice = prices.length > 0
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 1.5)
        : 100;

      // Research-backed prompts:
      // - "best [product]" triggers 83% of AI Overviews
      // - Brand discovery tests 0.334 correlation factor
      // - Price-constrained is most common real shopping query
      // - "recommend" mirrors how people talk to LLMs
      // - "buy right now" tests freshness signal (3.2x citation boost for recent content)
      const report = await testLlmVisibility({
        brandName,
        productCategory,
        useCases: [
          `__RAW__What are the best ${productCategory}?`,
          `__RAW__Best ${productCategory} to buy right now`,
          `__RAW__What ${productCategory} do you recommend?`,
          `__RAW__I need a ${productCategory}, what brands should I consider?`,
          `__RAW__Best ${productCategory} under $${avgPrice}`,
        ],
      });

      visibilityResults.set(store.id, { status: "complete", data: report });
    } catch (err) {
      console.error("[app] Visibility test error:", err);
      visibilityResults.set(store.id, { status: "error", error: err instanceof Error ? err.message : "Failed" });
    }
  })();

  return c.json({ success: true, status: "running" });
});

appRoute.get("/visibility-status", async (c) => {
  const store = c.get("shopifyStore");
  const result = visibilityResults.get(store.id);
  if (!result) return c.json({ status: "none" });
  return c.json(result);
});

/* ------------------------------------------------------------------ */
/*  GET /  — Dashboard home                                           */
/* ------------------------------------------------------------------ */

appRoute.get("/", async (c) => {
  const store = c.get("shopifyStore");
  const apiKey = env.SHOPIFY_API_KEY ?? "";
  const frontendUrl = env.FRONTEND_URL;
  const shopDomain = store.shopifyShop ?? store.url ?? "unknown";
  const shopName = shopDomain.replace(/\.myshopify\.com$/, "");

  // ── Queries ──────────────────────────────────────────────────────

  // Latest completed scan
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

  // Products with rewrittenDescription (Step 4 progress)
  const optimizedRows = db
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            eq(products.storeId, store.id),
            isNotNull(products.rewrittenDescription),
          ),
        )
    : [];
  const optimizedCount = optimizedRows[0]?.count ?? 0;

  // Products with schemaScore > 0 (Step 2 progress)
  const scannedRows = db
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            eq(products.storeId, store.id),
            gt(products.schemaScore, 0),
          ),
        )
    : [];
  const scannedCount = scannedRows[0]?.count ?? 0;

  // Issue counts by severity (unfixed only)
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 } as { critical: number; high: number; medium: number; low: number; [key: string]: number };
  if (db) {
    const sevRows = await db
      .select({
        severity: issues.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .innerJoin(products, eq(issues.productId, products.id))
      .where(
        and(
          eq(products.storeId, store.id),
          eq(issues.fixed, false),
        ),
      )
      .groupBy(issues.severity);
    for (const row of sevRows) {
      if (row.severity) severityCounts[row.severity] = row.count;
    }
  }
  const totalIssues = severityCounts.critical + severityCounts.high + severityCounts.medium + severityCounts.low;

  // Top 8 issues for display
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
          ),
        )
        .orderBy(desc(issues.createdAt))
        .limit(8)
    : [];

  // Entity consistency audit (non-blocking)
  let entityConsistent = true;
  let entityIssueCount = 0;
  let entityPrimaryBrand = "";
  try {
    const entityResult = await auditEntityConsistency(store.id);
    entityConsistent = entityResult.consistent;
    entityIssueCount = entityResult.issues.length;
    entityPrimaryBrand = entityResult.primaryBrand;
  } catch {
    // Non-critical
  }

  // Mismatch detection (non-blocking)
  let mismatchCount = 0;
  try {
    const mismatchResults = await detectMismatches(store.id);
    mismatchCount = mismatchResults.length;
  } catch {
    // Non-critical
  }

  const overallScore = latestScan?.scoreOverall ?? 0;

  // ── Step completion logic ────────────────────────────────────────

  const step1Done = productCount > 0;
  const step2Done = !!latestScan;
  const step3Done = step2Done; // accessible once scan exists
  const step4Progress = optimizedCount;
  const step5Done = false; // can't auto-detect
  const step6Done = false; // informational
  const step7Done = false; // always accessible

  // Determine which step is "current" (first incomplete)
  let currentStep = 1;
  if (step1Done) currentStep = 2;
  if (step1Done && step2Done) currentStep = 3;
  if (step1Done && step2Done && totalIssues === 0) currentStep = 4;
  if (step1Done && step2Done && step4Progress >= productCount && productCount > 0) currentStep = 5;
  // Steps 5-7 don't auto-advance; merchant drives them
  // If step 3 has issues, stay on 3; if no issues, go to 4
  // Recalculate: step 3 is "review", step 4 is "fix"
  if (step1Done && step2Done) {
    currentStep = 3;
    if (totalIssues === 0 && scannedCount > 0) currentStep = 4;
    if (step4Progress >= productCount && productCount > 0) currentStep = 5;
  }

  // ── Feed URLs ────────────────────────────────────────────────────
  const themeEditorUrl = `https://admin.shopify.com/store/${escapeHtml(shopName)}/themes/current/editor?context=apps`;
  const acpFeedUrl = `https://api.getfindable.au/feeds/acp/${escapeHtml(shopDomain)}`;
  const gmcFeedUrl = `https://api.getfindable.au/feeds/gmc/${escapeHtml(shopDomain)}`;
  const llmsTxtUrl = `https://api.getfindable.au/feeds/llms-txt/${escapeHtml(shopDomain)}`;

  // ── Helper to render step state ─────────────────────────────────
  function stepState(num: number): "done" | "current" | "future" {
    if (num < currentStep) return "done";
    if (num === currentStep) return "current";
    return "future";
  }

  function stepCircle(num: number, label: string): string {
    const state = stepState(num);
    const bg = state === "done" ? "#16a34a" : state === "current" ? "#4f46e5" : "#d1d5db";
    const text = state === "done" ? "#fff" : state === "current" ? "#fff" : "#9ca3af";
    const labelColor = state === "future" ? "#9ca3af" : "#374151";
    const icon = state === "done"
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<span style="font-size:13px;font-weight:700;color:${text};">${num}</span>`;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:60px;">
      <div style="width:32px;height:32px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;">${icon}</div>
      <span style="font-size:11px;color:${labelColor};font-weight:500;text-align:center;line-height:1.2;">${label}</span>
    </div>`;
  }

  function stepConnector(fromNum: number): string {
    const state = stepState(fromNum);
    const color = state === "done" ? "#16a34a" : "#e5e7eb";
    return `<div style="flex:1;height:2px;background:${color};margin-top:16px;min-width:8px;"></div>`;
  }

  // ── Step content builders ────────────────────────────────────────

  // Step 1: Sync Products
  const step1Content = stepState(1) === "done"
    ? `<div style="display:flex;align-items:center;gap:8px;color:#16a34a;font-size:14px;font-weight:500;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        ${productCount} product${productCount !== 1 ? "s" : ""} synced
      </div>`
    : `<div>
        <p style="color:#4b5563;font-size:14px;margin:0 0 16px;">Pull your products from Shopify so FindAble can analyze them.</p>
        <button class="btn btn-primary" id="sync-btn" onclick="findableSyncProducts()">Sync Products</button>
        <div id="sync-status"></div>
      </div>`;

  // Step 2: Scan & Score
  const step2Content = stepState(2) === "done"
    ? `<div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:32px;font-weight:800;color:${scoreColor(overallScore)};">${overallScore}</span>
        <span style="color:#6b7280;font-size:14px;">Overall AEO Score</span>
      </div>`
    : stepState(2) === "current"
    ? `<div>
        <p style="color:#4b5563;font-size:14px;margin:0 0 16px;">Analyze your products for AI commerce readiness.</p>
        <button class="btn btn-primary" id="scan-btn" onclick="findableScanStore()">Scan Store</button>
        <div id="sync-status"></div>
      </div>`
    : `<p style="color:#9ca3af;font-size:14px;margin:0;">Sync products first to unlock scanning.</p>`;

  // Step 3: Review Issues
  const issuesListHtml = topIssues.length
    ? topIssues.map((issue) => `
        <div class="issue-row">
          <span class="severity severity-${issue.severity ?? "medium"}" style="margin-right:12px;">${escapeHtml(issue.severity ?? "medium")}</span>
          <span style="flex:1;font-size:13px;">${escapeHtml(issue.title)}</span>
          <span style="font-size:11px;color:#9ca3af;">${escapeHtml(issue.dimension ?? "")}</span>
        </div>`).join("")
    : "";

  const step3Content = stepState(3) === "future"
    ? `<p style="color:#9ca3af;font-size:14px;margin:0;">Complete a scan first.</p>`
    : totalIssues === 0 && step2Done
    ? `<div style="display:flex;align-items:center;gap:8px;color:#16a34a;font-size:14px;font-weight:500;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        No issues found
      </div>`
    : `<div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          ${severityCounts.critical > 0 ? `<div style="display:flex;align-items:center;gap:6px;"><span class="severity severity-critical">${severityCounts.critical} critical</span></div>` : ""}
          ${severityCounts.high > 0 ? `<div style="display:flex;align-items:center;gap:6px;"><span class="severity severity-high">${severityCounts.high} high</span></div>` : ""}
          ${severityCounts.medium > 0 ? `<div style="display:flex;align-items:center;gap:6px;"><span class="severity severity-medium">${severityCounts.medium} medium</span></div>` : ""}
          ${severityCounts.low > 0 ? `<div style="display:flex;align-items:center;gap:6px;"><span class="severity severity-low">${severityCounts.low} low</span></div>` : ""}
        </div>
        ${issuesListHtml}
        ${topIssues.length > 0 ? `<div style="margin-top:12px;"><a href="/app/products" style="color:#4f46e5;font-size:13px;font-weight:500;text-decoration:none;">View all products &rarr;</a></div>` : ""}
      </div>`;

  // Step 4: Fix Products
  const step4Content = stepState(4) === "future"
    ? `<p style="color:#9ca3af;font-size:14px;margin:0;">Review issues first.</p>`
    : `<div>
        <p style="color:#4b5563;font-size:14px;margin:0 0 12px;">Let AI optimize your product data for better discoverability.</p>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="flex:1;background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;">
            <div style="width:${productCount > 0 ? Math.round((optimizedCount / productCount) * 100) : 0}%;height:100%;background:#4f46e5;border-radius:99px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:13px;font-weight:600;color:#374151;white-space:nowrap;">${optimizedCount} of ${productCount} optimized</span>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="fix-all-btn" onclick="findableFixAll()">Auto-Fix All Products</button>
          <a href="/app/products" class="btn btn-secondary">Fix individually</a>
        </div>
        <div id="fix-all-status" class="action-status"></div>
      </div>`;

  // Step 5: Activate Schema
  const step5Content = stepState(5) === "future"
    ? `<p style="color:#9ca3af;font-size:14px;margin:0;">Fix your products first.</p>`
    : `<div>
        <p style="color:#4b5563;font-size:14px;margin:0 0 12px;">Enable rich structured data on your store by activating the FindAble app embed in your Shopify theme.</p>
        <ol style="color:#4b5563;font-size:13px;margin:0 0 16px;padding-left:20px;line-height:2;">
          <li>Open your Theme Editor</li>
          <li>Go to <strong>App Embeds</strong></li>
          <li>Toggle on <strong>FindAble Schema</strong></li>
          <li>Save</li>
        </ol>
        <a href="${themeEditorUrl}" target="_blank" class="btn btn-primary" style="font-size:13px;">Open Theme Editor &rarr;</a>
      </div>`;

  // Step 6: Submit Feeds
  const step6Content = stepState(6) === "future"
    ? `<p style="color:#9ca3af;font-size:14px;margin:0;">Activate schema first.</p>`
    : `<div>
        <p style="color:#4b5563;font-size:14px;margin:0 0 16px;">Get your products into ChatGPT and Google Shopping.</p>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">ACP Feed (ChatGPT)</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <code style="flex:1;background:#f3f4f6;padding:8px 12px;border-radius:6px;font-size:12px;word-break:break-all;">${escapeHtml(acpFeedUrl)}</code>
            <button class="btn btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;" onclick="navigator.clipboard.writeText('${acpFeedUrl}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500);">Copy</button>
          </div>
          <a href="https://chatgpt.com/merchants" target="_blank" style="font-size:12px;color:#4f46e5;text-decoration:none;margin-top:4px;display:inline-block;">Submit to ChatGPT Merchants &rarr;</a>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">GMC Feed (Google)</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <code style="flex:1;background:#f3f4f6;padding:8px 12px;border-radius:6px;font-size:12px;word-break:break-all;">${escapeHtml(gmcFeedUrl)}</code>
            <button class="btn btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;" onclick="navigator.clipboard.writeText('${gmcFeedUrl}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500);">Copy</button>
          </div>
          <a href="https://merchants.google.com/" target="_blank" style="font-size:12px;color:#4f46e5;text-decoration:none;margin-top:4px;display:inline-block;">Open Google Merchant Center &rarr;</a>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">llms.txt</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <code style="flex:1;background:#f3f4f6;padding:8px 12px;border-radius:6px;font-size:12px;word-break:break-all;">${escapeHtml(llmsTxtUrl)}</code>
            <button class="btn btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;" onclick="navigator.clipboard.writeText('${llmsTxtUrl}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500);">Copy</button>
          </div>
        </div>
      </div>`;

  // Step 7: Monitor
  const step7Content = stepState(7) === "future"
    ? `<p style="color:#9ca3af;font-size:14px;margin:0;">Complete earlier steps first.</p>`
    : `<div>
        <p style="color:#4b5563;font-size:14px;margin:0 0 16px;">Track your store's AI visibility and health.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">
          <div style="background:#f9fafb;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:${entityConsistent ? "#16a34a" : "#dc2626"};">${entityConsistent ? "OK" : entityIssueCount}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">Entity Consistency</div>
          </div>
          <div style="background:#f9fafb;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:${mismatchCount === 0 ? "#16a34a" : "#dc2626"};">${mismatchCount}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">Mismatches</div>
          </div>
          ${entityPrimaryBrand ? `<div style="background:#f9fafb;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:16px;font-weight:700;color:#374151;">${escapeHtml(entityPrimaryBrand)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">Primary Brand</div>
          </div>` : ""}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn" id="visibility-btn" onclick="findableTestVisibility()" style="background:#7c3aed;color:white;">Test LLM Visibility</button>
        </div>
        <div id="visibility-status" style="display:none;margin-top:8px;padding:8px 12px;border-radius:6px;font-size:13px;"></div>
        <div id="visibility-results"></div>
      </div>`;

  // ── Build step card ──────────────────────────────────────────────

  const stepLabels = ["Sync", "Scan", "Review", "Fix", "Schema", "Feeds", "Monitor"];
  const stepTitles = [
    "Sync Products",
    "Scan & Score",
    "Review Issues",
    "Fix Products",
    "Activate Schema",
    "Submit Feeds",
    "Monitor",
  ];
  const stepDescriptions = [
    "Pull your products from Shopify",
    "Analyze your products for AI commerce readiness",
    "See what's holding your products back",
    "Let AI optimize your product data",
    "Enable rich structured data on your store",
    "Get your products into ChatGPT and Google Shopping",
    "Track LLM visibility and store health",
  ];
  const stepContents = [step1Content, step2Content, step3Content, step4Content, step5Content, step6Content, step7Content];

  // Build progress tracker
  let trackerHtml = `<div style="display:flex;align-items:flex-start;justify-content:center;gap:0;padding:8px 0;overflow-x:auto;">`;
  for (let i = 1; i <= 7; i++) {
    trackerHtml += stepCircle(i, stepLabels[i - 1]!);
    if (i < 7) trackerHtml += stepConnector(i);
  }
  trackerHtml += `</div>`;

  // Build step cards
  let stepsHtml = "";
  for (let i = 1; i <= 7; i++) {
    const state = stepState(i);
    const borderColor = state === "current" ? "#4f46e5" : state === "done" ? "#e5e7eb" : "#f3f4f6";
    const bgColor = state === "current" ? "#fafbff" : "#ffffff";
    const opacity = state === "future" ? "0.6" : "1";
    const borderWidth = state === "current" ? "2px" : "1px";

    stepsHtml += `
      <div style="border:${borderWidth} solid ${borderColor};border-radius:12px;padding:20px;margin-bottom:12px;background:${bgColor};opacity:${opacity};transition:all 0.2s;">
        <div style="display:flex;align-items:center;gap:12px;${state !== "current" && state !== "done" ? "cursor:default;" : ""}">
          <div style="width:28px;height:28px;border-radius:50%;background:${state === "done" ? "#16a34a" : state === "current" ? "#4f46e5" : "#d1d5db"};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            ${state === "done"
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
              : `<span style="font-size:13px;font-weight:700;color:${state === "current" ? "#fff" : "#9ca3af"};">${i}</span>`}
          </div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:600;color:${state === "future" ? "#9ca3af" : "#1a1a1a"};">${stepTitles[i - 1]}</div>
            ${state !== "current" ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${stepDescriptions[i - 1]}</div>` : ""}
          </div>
        </div>
        ${state === "current" ? `
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;">
            <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">${stepDescriptions[i - 1]}</p>
            ${stepContents[i - 1]}
          </div>
        ` : ""}
        ${state === "done" ? `
          <div style="margin-top:8px;padding-left:40px;">
            ${stepContents[i - 1]}
          </div>
        ` : ""}
      </div>`;
  }

  // Overall score hero (only show after scan)
  const scoreHeroHtml = latestScan ? `
    <div class="card" style="text-align:center;padding:32px 24px;">
      <div style="font-size:64px;font-weight:800;color:${scoreColor(overallScore)};line-height:1;">${overallScore}</div>
      <div style="font-size:14px;color:#6b7280;margin-top:8px;">Overall AEO Score</div>
      <div style="display:flex;justify-content:center;gap:24px;margin-top:20px;">
        <div><span style="font-size:22px;font-weight:700;color:${scoreColor(latestScan.scoreSchema ?? 0)};">${latestScan.scoreSchema ?? 0}</span><div style="font-size:11px;color:#6b7280;margin-top:2px;">Schema</div></div>
        <div><span style="font-size:22px;font-weight:700;color:${scoreColor(latestScan.scoreLlm ?? 0)};">${latestScan.scoreLlm ?? 0}</span><div style="font-size:11px;color:#6b7280;margin-top:2px;">LLM</div></div>
        <div><span style="font-size:22px;font-weight:700;color:${scoreColor(latestScan.scoreProtocol ?? 0)};">${latestScan.scoreProtocol ?? 0}</span><div style="font-size:11px;color:#6b7280;margin-top:2px;">Protocol</div></div>
        <div><span style="font-size:22px;font-weight:700;color:${scoreColor(latestScan.scoreCompetitive ?? 0)};">${latestScan.scoreCompetitive ?? 0}</span><div style="font-size:11px;color:#6b7280;margin-top:2px;">Competitive</div></div>
      </div>
    </div>
  ` : "";

  const content = `
    <!-- Progress Tracker -->
    <div class="card" style="padding:16px 20px;">
      ${trackerHtml}
    </div>

    ${scoreHeroHtml}

    <!-- Step Cards -->
    ${stepsHtml}
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
        const detailUrl = `/app/products/${encodeURIComponent(p.id)}`;

        return `
          <tr>
            <td><a href="${detailUrl}" style="color: #4f46e5; text-decoration: none; font-weight: 500;">${name}</a></td>
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

/* ------------------------------------------------------------------ */
/*  GET /products/:id  — Per-product detail page                      */
/* ------------------------------------------------------------------ */

appRoute.get("/products/:id", async (c) => {
  const store = c.get("shopifyStore");
  const apiKey = env.SHOPIFY_API_KEY ?? "";
  const productId = c.req.param("id");

  if (!db) {
    return c.text("Database not configured", 503);
  }

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.storeId, store.id)),
  });

  if (!product) {
    return c.html(renderPage("Product Not Found", `<div class="card"><div class="empty">Product not found.</div><a href="/app/products" class="btn btn-secondary" style="margin-top: 16px;">Back to Products</a></div>`, apiKey));
  }

  // Fetch issues for this product
  const productIssues = await db
    .select({
      id: issues.id,
      severity: issues.severity,
      dimension: issues.dimension,
      title: issues.title,
      description: issues.description,
      fixType: issues.fixType,
      fixed: issues.fixed,
    })
    .from(issues)
    .where(eq(issues.productId, productId))
    .orderBy(desc(issues.createdAt));

  const attrs = (product.extractedAttributes ?? {}) as Record<string, unknown>;
  const schema = product.schemaScore ?? 0;
  const llm = product.llmScore ?? 0;
  const aeo = product.aeoScore ?? 0;
  const density = product.attributeDensity != null ? Math.round(product.attributeDensity * 100) : 0;
  const descType = product.descriptionType ?? "unknown";
  const missing = product.missingAttributes ?? [];
  const faqs = product.suggestedFaq as Array<{ question: string; answer: string }> | null;
  const generatedSchema = product.generatedSchema;
  const hasBackup = !!(attrs._backup);

  // Description type badge
  const descBadgeClass = descType === "factual" ? "badge-factual" : descType === "marketing" ? "badge-marketing" : "badge-mixed";

  // Issues HTML
  const unfixedIssues = productIssues.filter((i) => !i.fixed);
  const issuesHtml = unfixedIssues.length > 0
    ? unfixedIssues.map((issue) => `
      <div class="issue-row">
        <span class="severity severity-${issue.severity ?? "medium"}" style="margin-right: 12px;">${escapeHtml(issue.severity ?? "medium")}</span>
        <span style="flex: 1;">
          <strong>${escapeHtml(issue.title)}</strong>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(issue.description)}</div>
        </span>
        <span style="font-size: 12px; color: #9ca3af;">${escapeHtml(issue.dimension ?? "")}</span>
      </div>`).join("")
    : '<div class="empty">No open issues for this product.</div>';

  // Missing attributes HTML
  const missingHtml = missing.length > 0
    ? missing.map((a) => `<span class="attr-tag missing">${escapeHtml(a)}</span>`).join("")
    : '<span style="color: #16a34a; font-size: 13px;">No missing attributes detected.</span>';

  // FAQs HTML
  const faqsHtml = faqs && faqs.length > 0
    ? faqs.map((faq) => `
      <div class="faq-item">
        <div class="faq-q">Q: ${escapeHtml(faq.question)}</div>
        <div class="faq-a">${escapeHtml(faq.answer)}</div>
      </div>`).join("")
    : '<div style="color: #9ca3af; font-size: 13px;">No FAQs generated yet. Run Auto-Fix to generate.</div>';

  // Schema preview HTML
  const schemaHtml = generatedSchema
    ? `<div class="schema-preview">${escapeHtml(JSON.stringify(generatedSchema, null, 2))}</div>`
    : '<div style="color: #9ca3af; font-size: 13px;">No schema generated yet. Run Auto-Fix to generate.</div>';

  // Product image
  const images = (attrs.images as Array<{ url: string; alt: string | null }>) ?? [];
  const imageUrl = images.length > 0 ? images[0]!.url : null;

  const content = `
    <div style="margin-bottom: 16px;">
      <a href="/app/products" style="color: #6b7280; text-decoration: none; font-size: 14px;">&larr; Back to Products</a>
    </div>

    <div class="card">
      <div style="display: flex; gap: 20px; align-items: flex-start;">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name ?? "")}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; flex-shrink: 0;" />` : ""}
        <div style="flex: 1;">
          <h2 class="card-title" style="margin-bottom: 8px;">${escapeHtml(product.name ?? "Untitled")}</h2>
          <a href="${escapeHtml(product.url)}" target="_blank" style="color: #6b7280; font-size: 13px; word-break: break-all;">${escapeHtml(product.url)}</a>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Scores</h2>
      <div class="dimensions">
        <div class="dim-card">
          <div class="dim-score" style="color: ${scoreColor(schema)};">${schema}</div>
          <div class="dim-label">Schema</div>
        </div>
        <div class="dim-card">
          <div class="dim-score" style="color: ${scoreColor(llm)};">${llm}</div>
          <div class="dim-label">LLM Readiness</div>
        </div>
        <div class="dim-card">
          <div class="dim-score" style="color: ${scoreColor(aeo)};">${aeo}</div>
          <div class="dim-label">AEO Score</div>
        </div>
      </div>
      <div class="detail-grid" style="margin-top: 16px;">
        <div class="stat-row">
          <span class="stat-label">Attribute Density</span>
          <span class="stat-value">${density}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Description Type</span>
          <span class="badge ${descBadgeClass}">${escapeHtml(descType)}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Issues (${unfixedIssues.length})</h2>
      ${issuesHtml}
    </div>

    <div class="card">
      <h2 class="card-title">Missing Attributes</h2>
      <div style="margin-top: 8px;">${missingHtml}</div>
    </div>

    <div class="card">
      <h2 class="card-title">Descriptions</h2>
      <div class="side-by-side">
        <div>
          <h3 style="font-size: 13px; font-weight: 600; margin: 0 0 8px; color: #6b7280;">Original</h3>
          <div class="desc-box">${product.originalDescription ? escapeHtml(product.originalDescription) : '<span style="color: #9ca3af;">No original description stored.</span>'}</div>
        </div>
        <div>
          <h3 style="font-size: 13px; font-weight: 600; margin: 0 0 8px; color: #6b7280;">AI-Rewritten (AEO Optimized)</h3>
          <div class="desc-box">${product.rewrittenDescription ? escapeHtml(product.rewrittenDescription) : '<span style="color: #9ca3af;">No rewritten description yet. Run Auto-Fix to generate.</span>'}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Suggested FAQs</h2>
      ${faqsHtml}
    </div>

    <div class="card">
      <h2 class="card-title">Generated Schema (JSON-LD)</h2>
      ${schemaHtml}
    </div>

    <div class="card">
      <h2 class="card-title">Actions</h2>
      <div class="actions">
        <button class="btn btn-primary" id="fix-btn" onclick="findableAutoFix('${escapeHtml(productId)}')">Auto-Fix This Product</button>
        ${hasBackup ? `<button class="btn btn-secondary" id="restore-btn" onclick="findableRestore('${escapeHtml(productId)}')">Restore Original</button>` : ""}
      </div>
      <div id="fix-status" class="action-status"></div>
    </div>
  `;

  return c.html(renderPage("Product Detail", content, apiKey));
});

/* ------------------------------------------------------------------ */
/*  POST /products/:id/fix  — Auto-fix a single product               */
/* ------------------------------------------------------------------ */

appRoute.post("/products/:id/fix", async (c) => {
  const store = c.get("shopifyStore");
  const productId = c.req.param("id");

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.storeId, store.id)),
  });

  if (!product) {
    return c.json({ success: false, error: "Product not found." }, 404);
  }

  // Reconstruct AiAnalysisInput from DB
  const attrs = (product.extractedAttributes ?? {}) as Record<string, unknown>;
  const visibleAttributes: string[] = [];
  for (const key of ["vendor", "productType", "material", "color", "size"]) {
    if (attrs[key] && typeof attrs[key] === "string") {
      visibleAttributes.push(`${key}: ${attrs[key] as string}`);
    }
  }

  const aiInput: AiAnalysisInput = {
    url: product.url,
    productName: product.name ?? "",
    description: product.originalDescription ?? "",
    existingSchema: product.existingSchema ?? null,
    visiblePrice: product.price ? parseFloat(product.price) : null,
    visibleAttributes,
    htmlSnippet: (attrs.descriptionHtml as string) ?? "",
  };

  const aiResult = await analyzeWithAi(aiInput);

  if (!aiResult) {
    return c.json({ success: false, error: "AI analysis failed. Check that OPENAI_API_KEY is configured." }, 500);
  }

  // Save backup before overwriting
  const backup: Record<string, unknown> = {
    originalDescription: product.originalDescription,
    rewrittenDescription: product.rewrittenDescription,
    generatedSchema: product.generatedSchema,
    suggestedFaq: product.suggestedFaq,
    schemaScore: product.schemaScore,
    llmScore: product.llmScore,
    aeoScore: product.aeoScore,
    descriptionType: product.descriptionType,
    attributeDensity: product.attributeDensity,
    missingAttributes: product.missingAttributes,
    backedUpAt: new Date().toISOString(),
  };

  const updatedAttrs = { ...attrs, _backup: backup };

  // Update boolean flags based on what was generated
  const hasGeneratedSchema = aiResult.generatedSchema != null;
  const hasGeneratedFaq = Array.isArray(aiResult.suggestedFaq) && aiResult.suggestedFaq.length > 0;
  const descLen = (aiResult.rewrittenDescription ?? product.originalDescription ?? "").length;

  // Re-score with updated flags
  let schemaScore = 18;
  if (hasGeneratedSchema || product.hasJsonld) schemaScore += 12;
  if (product.hasGtin) schemaScore += 10;
  if (product.hasBrand) schemaScore += 8;
  if (product.hasShippingSchema) schemaScore += 7;
  if (product.hasReturnSchema) schemaScore += 7;
  if (product.hasReviewSchema) schemaScore += 6;
  if (hasGeneratedFaq || product.hasFaqSchema) schemaScore += 4;
  if (product.hasVariantsStructured) schemaScore += 4;
  schemaScore = Math.min(100, schemaScore);

  let llmScore = 22;
  llmScore += Math.min(26, Math.floor(descLen / 12));
  if (product.hasBrand) llmScore += 8;
  if (hasGeneratedFaq || product.hasFaqSchema) llmScore += 12;
  if (product.hasMaterial || product.hasColor || product.hasSize) llmScore += 10;
  if (product.hasReviewSchema) llmScore += 10;
  llmScore = Math.min(100, llmScore);

  // Blend AI AEO score with heuristic LLM score
  const finalLlmScore = aiResult.aeoScore
    ? Math.round(aiResult.aeoScore * 0.7 + llmScore * 0.3)
    : llmScore;

  // Update the product record with AI results + updated scores
  await db
    .update(products)
    .set({
      rewrittenDescription: aiResult.rewrittenDescription,
      suggestedFaq: aiResult.suggestedFaq as Record<string, unknown>[],
      generatedSchema: aiResult.generatedSchema,
      missingAttributes: aiResult.missingAttributes,
      aeoScore: aiResult.aeoScore,
      descriptionType: aiResult.descriptionType,
      attributeDensity: aiResult.attributeDensity,
      googleCategory: aiResult.googleCategory,
      extractedAttributes: updatedAttrs,
      // Updated flags
      hasJsonld: hasGeneratedSchema || product.hasJsonld,
      hasFaqSchema: hasGeneratedFaq || product.hasFaqSchema,
      // Updated scores
      schemaScore,
      llmScore: finalLlmScore,
    })
    .where(eq(products.id, productId));

  return c.json({
    success: true,
    data: {
      aeoScore: aiResult.aeoScore,
      descriptionType: aiResult.descriptionType,
      attributeDensity: aiResult.attributeDensity,
      missingAttributes: aiResult.missingAttributes,
    },
  });
});

/* ------------------------------------------------------------------ */
/*  POST /products/:id/restore  — Restore product to pre-fix state    */
/* ------------------------------------------------------------------ */

appRoute.post("/products/:id/restore", async (c) => {
  const store = c.get("shopifyStore");
  const productId = c.req.param("id");

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.storeId, store.id)),
  });

  if (!product) {
    return c.json({ success: false, error: "Product not found." }, 404);
  }

  const attrs = (product.extractedAttributes ?? {}) as Record<string, unknown>;
  const backup = attrs._backup as Record<string, unknown> | undefined;

  if (!backup) {
    return c.json({ success: false, error: "No backup found. This product has not been auto-fixed." }, 400);
  }

  // Restore from backup
  const { _backup: _, ...attrsWithoutBackup } = attrs;

  await db
    .update(products)
    .set({
      originalDescription: (backup.originalDescription as string) ?? product.originalDescription,
      rewrittenDescription: (backup.rewrittenDescription as string | null) ?? null,
      generatedSchema: (backup.generatedSchema as Record<string, unknown> | null) ?? null,
      suggestedFaq: (backup.suggestedFaq as Record<string, unknown>[] | null) ?? null,
      schemaScore: (backup.schemaScore as number | null) ?? null,
      llmScore: (backup.llmScore as number | null) ?? null,
      aeoScore: (backup.aeoScore as number | null) ?? null,
      descriptionType: (backup.descriptionType as string | null) ?? null,
      attributeDensity: (backup.attributeDensity as number | null) ?? null,
      missingAttributes: (backup.missingAttributes as string[] | null) ?? null,
      extractedAttributes: attrsWithoutBackup,
    })
    .where(eq(products.id, productId));

  return c.json({ success: true });
});

/* ------------------------------------------------------------------ */
/*  POST /fix-all  — Bulk AI fix for all products                     */
/* ------------------------------------------------------------------ */

appRoute.post("/fix-all", async (c) => {
  const store = c.get("shopifyStore");

  if (!db) {
    return c.json({ success: false, error: "Database not configured." }, 503);
  }

  const storeProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.storeId, store.id));

  if (storeProducts.length === 0) {
    return c.json({ success: false, error: "No products found. Sync your products first." }, 400);
  }

  // Process in background — return immediately
  const productIds = storeProducts.map((p) => p.id);

  // Fire-and-forget background processing
  (async () => {
    for (const pid of productIds) {
      try {
        const product = await db!.query.products.findFirst({
          where: eq(products.id, pid),
        });
        if (!product) continue;

        const attrs = (product.extractedAttributes ?? {}) as Record<string, unknown>;
        const visibleAttributes: string[] = [];
        for (const key of ["vendor", "productType", "material", "color", "size"]) {
          if (attrs[key] && typeof attrs[key] === "string") {
            visibleAttributes.push(`${key}: ${attrs[key] as string}`);
          }
        }

        const aiInput: AiAnalysisInput = {
          url: product.url,
          productName: product.name ?? "",
          description: product.originalDescription ?? "",
          existingSchema: product.existingSchema ?? null,
          visiblePrice: product.price ? parseFloat(product.price) : null,
          visibleAttributes,
          htmlSnippet: (attrs.descriptionHtml as string) ?? "",
        };

        const aiResult = await analyzeWithAi(aiInput);
        if (!aiResult) continue;

        // Save backup
        const backup: Record<string, unknown> = {
          originalDescription: product.originalDescription,
          rewrittenDescription: product.rewrittenDescription,
          generatedSchema: product.generatedSchema,
          suggestedFaq: product.suggestedFaq,
          schemaScore: product.schemaScore,
          llmScore: product.llmScore,
          aeoScore: product.aeoScore,
          descriptionType: product.descriptionType,
          attributeDensity: product.attributeDensity,
          missingAttributes: product.missingAttributes,
          backedUpAt: new Date().toISOString(),
        };

        const updatedAttrs = { ...attrs, _backup: backup };

        await db!
          .update(products)
          .set({
            rewrittenDescription: aiResult.rewrittenDescription,
            suggestedFaq: aiResult.suggestedFaq as Record<string, unknown>[],
            generatedSchema: aiResult.generatedSchema,
            missingAttributes: aiResult.missingAttributes,
            aeoScore: aiResult.aeoScore,
            descriptionType: aiResult.descriptionType,
            attributeDensity: aiResult.attributeDensity,
            googleCategory: aiResult.googleCategory,
            extractedAttributes: updatedAttrs,
          })
          .where(eq(products.id, pid));
      } catch (err) {
        console.error(`[fix-all] Failed to fix product ${pid}:`, err);
      }
    }
    console.log(`[fix-all] Bulk fix complete for ${productIds.length} products in store ${store.id}`);
  })().catch((err) => console.error("[fix-all] Background process error:", err));

  return c.json({
    success: true,
    data: { productCount: productIds.length },
  });
});

/* ------------------------------------------------------------------ */
/*  GET /setup  — Setup guide page                                    */
/* ------------------------------------------------------------------ */

appRoute.get("/setup", async (c) => {
  const store = c.get("shopifyStore");
  const apiKey = env.SHOPIFY_API_KEY ?? "";
  const shopDomain = store.shopifyShop ?? store.url ?? "unknown";
  const shopName = shopDomain.replace(/\.myshopify\.com$/, "");

  const themeEditorUrl = `https://admin.shopify.com/store/${escapeHtml(shopName)}/themes/current/editor?context=apps`;
  const acpFeedUrl = `https://api.getfindable.au/feeds/acp/${escapeHtml(shopDomain)}`;
  const gmcFeedUrl = `https://api.getfindable.au/feeds/gmc/${escapeHtml(shopDomain)}`;
  const llmsTxtUrl = `https://api.getfindable.au/feeds/llms-txt/${escapeHtml(shopDomain)}`;

  const content = `
    <div class="card">
      <h2 class="card-title">Setup Guide</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px;">Follow these steps to maximize your store's AI discoverability.</p>

      <div class="step-card">
        <div style="display: flex; align-items: center;">
          <span class="step-number">1</span>
          <span class="step-title">Enable Schema Injection</span>
        </div>
        <div class="step-desc">
          Go to your Shopify Theme Editor, then navigate to <strong>Theme Settings &rarr; App Embeds</strong> and enable the <strong>FindAble Schema</strong> block.
          This injects optimized JSON-LD structured data into every product page.
          <br /><br />
          <a href="${themeEditorUrl}" target="_blank" class="btn btn-primary" style="font-size: 13px; padding: 8px 16px;">Open Theme Editor &rarr;</a>
        </div>
      </div>

      <div class="step-card">
        <div style="display: flex; align-items: center;">
          <span class="step-number">2</span>
          <span class="step-title">Submit ACP Feed to ChatGPT</span>
        </div>
        <div class="step-desc">
          Submit your product feed to ChatGPT's merchant program so your products appear in AI shopping recommendations.
          <div class="code-block">${escapeHtml(acpFeedUrl)}</div>
          <br />
          <a href="https://chatgpt.com/merchants" target="_blank" class="btn btn-secondary" style="font-size: 13px; padding: 8px 16px;">Go to ChatGPT Merchants &rarr;</a>
        </div>
      </div>

      <div class="step-card">
        <div style="display: flex; align-items: center;">
          <span class="step-number">3</span>
          <span class="step-title">Submit GMC Feed to Google</span>
        </div>
        <div class="step-desc">
          Add this as a <strong>supplemental feed</strong> in Google Merchant Center to enrich your product data with FindAble's optimized attributes.
          <div class="code-block">${escapeHtml(gmcFeedUrl)}</div>
          <br />
          <a href="https://merchants.google.com/" target="_blank" class="btn btn-secondary" style="font-size: 13px; padding: 8px 16px;">Open Google Merchant Center &rarr;</a>
        </div>
      </div>

      <div class="step-card">
        <div style="display: flex; align-items: center;">
          <span class="step-number">4</span>
          <span class="step-title">Verify Schema</span>
        </div>
        <div class="step-desc">
          Visit any product page on your store and check the page source for <code>&lt;script type="application/ld+json"&gt;</code> blocks.
          You can also use Google's Rich Results Test to validate your structured data.
          <br /><br />
          <a href="https://search.google.com/test/rich-results" target="_blank" class="btn btn-secondary" style="font-size: 13px; padding: 8px 16px;">Google Rich Results Test &rarr;</a>
        </div>
      </div>

      <div class="step-card">
        <div style="display: flex; align-items: center;">
          <span class="step-number">5</span>
          <span class="step-title">llms.txt</span>
        </div>
        <div class="step-desc">
          Your <code>llms.txt</code> file tells AI agents what your store offers. Add a link to it from your homepage or navigation footer.
          <div class="code-block">${escapeHtml(llmsTxtUrl)}</div>
        </div>
      </div>
    </div>
  `;

  return c.html(renderPage("Setup", content, apiKey));
});

export { appRoute };
