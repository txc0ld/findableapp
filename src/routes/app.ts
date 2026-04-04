import { Hono } from "hono";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { accounts, stores, products, issues, scans } from "../db/schema";
import type { ShopifySessionVariables } from "../lib/shopify-session";
import { verifyShopifySessionToken } from "../lib/shopify-session";
import { encryptShopifyAccessToken } from "../lib/shopify";
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

function renderPage(title: string, content: string, apiKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
  <script src="https://unpkg.com/@shopify/app-bridge@4/umd/index.js"></script>
  <script>
    var AppBridge = window['app-bridge'];
    if (AppBridge) {
      AppBridge.createApp({ apiKey: '${escapeHtml(apiKey)}', host: new URLSearchParams(location.search).get('host') || '' });
    }
  </script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Embedded-page auth middleware                                     */
/*                                                                    */
/*  For the initial page load Shopify sends an `id_token` query param */
/*  (a JWT signed with our API secret). We verify it and look up the  */
/*  store record. If no id_token is provided we fall back to the      */
/*  `shop` query param (basic lookup, no signature check).            */
/* ------------------------------------------------------------------ */

const appRoute = new Hono<{ Variables: ShopifySessionVariables }>();

appRoute.use("*", async (c, next) => {
  if (!db) {
    return c.html("<p>Database not configured.</p>", 503);
  }

  const idToken = c.req.query("id_token");
  const shopParam = c.req.query("shop");

  let shopDomain: string | null = null;

  // Prefer verifying the signed id_token from Shopify
  if (idToken) {
    try {
      const result = await verifyShopifySessionToken(idToken);
      shopDomain = result.shop;
    } catch {
      // Token verification failed — fall through to shop param
    }
  }

  // Fallback: use shop query param (unsigned, but still useful for dev/initial loads)
  if (!shopDomain && shopParam) {
    shopDomain = shopParam.replace(/^https?:\/\//, "");
  }

  if (!shopDomain) {
    return c.html("<p>Missing shop parameter. Please open this app from the Shopify admin.</p>", 400);
  }

  let store = await db.query.stores.findFirst({
    where: eq(stores.shopifyShop, shopDomain),
  });

  // First-time install: store doesn't exist yet. Exchange session token for
  // an offline access token and create the store + account records.
  if (!store && idToken && env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET) {
    try {
      const tokenExchangeResponse = await fetch(
        `https://${shopDomain}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            client_id: env.SHOPIFY_API_KEY,
            client_secret: env.SHOPIFY_API_SECRET,
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token: idToken,
            subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
            requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
          }),
        },
      );

      if (tokenExchangeResponse.ok) {
        const tokenData = (await tokenExchangeResponse.json()) as {
          access_token: string;
          scope?: string;
        };

        // Fetch shop info
        const shopResponse = await fetch(
          `https://${shopDomain}/admin/api/${env.SHOPIFY_API_VERSION}/shop.json`,
          { headers: { "x-shopify-access-token": tokenData.access_token } },
        );
        const shopData = shopResponse.ok
          ? ((await shopResponse.json()) as { shop: { name: string; email: string; domain?: string; primary_domain?: { url?: string } } }).shop
          : null;

        const email = shopData?.email ?? `${shopDomain}@shop.findable`;
        const primaryUrl = shopData?.primary_domain?.url
          ?? (shopData?.domain ? `https://${shopData.domain}` : `https://${shopDomain}`);

        // Find or create account by email
        let account = await db.query.accounts.findFirst({
          where: eq(accounts.email, email.trim().toLowerCase()),
        });
        if (!account) {
          const inserted = await db.insert(accounts).values({
            email: email.trim().toLowerCase(),
          }).returning();
          account = inserted[0];
        }

        // Create store
        const encryptedToken = encryptShopifyAccessToken(tokenData.access_token);
        const inserted = await db.insert(stores).values({
          accountId: account?.id,
          name: shopData?.name ?? shopDomain,
          url: primaryUrl,
          platform: "shopify",
          shopifyShop: shopDomain,
          shopifyAccessToken: encryptedToken,
          shopifyScopes: (tokenData.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          shopifyInstalledAt: new Date(),
          productCount: 0,
        }).returning();

        store = inserted[0];
      }
    } catch (e) {
      console.error("[app] Token exchange failed:", e);
    }
  }

  if (!store) {
    // Redirect to OAuth install as fallback
    const installUrl = `/shopify?shop=${encodeURIComponent(shopDomain)}`;
    return c.redirect(installUrl);
  }

  c.set("shopifyStore", store);
  c.set("shopifyShop", shopDomain);
  await next();
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
        <button class="btn btn-primary" id="sync-btn" onclick="syncProducts()">Sync Products</button>
        <a class="btn btn-secondary" href="${escapeHtml(frontendUrl)}/dashboard" target="_top">Open Full Dashboard</a>
      </div>
      <div id="sync-status"></div>
    </div>

    <div class="card">
      <h2 class="card-title">Top Issues</h2>
      ${issuesHtml}
    </div>

    <script>
      async function syncProducts() {
        var btn = document.getElementById('sync-btn');
        var status = document.getElementById('sync-status');
        btn.disabled = true;
        btn.textContent = 'Syncing...';
        status.className = 'loading';
        status.textContent = 'Starting product sync...';

        try {
          var res = await fetch('/api/shopify/store/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (await getSessionToken())
            }
          });
          var data = await res.json();
          if (res.ok) {
            status.className = 'success';
            status.textContent = 'Sync started successfully. Products will update shortly.';
          } else {
            status.className = 'error';
            status.textContent = data.error || 'Sync failed. Please try again.';
          }
        } catch (e) {
          status.className = 'error';
          status.textContent = 'Network error. Please check your connection.';
        }

        btn.disabled = false;
        btn.textContent = 'Sync Products';
      }

      async function getSessionToken() {
        try {
          var AppBridge = window['app-bridge'];
          if (AppBridge && AppBridge.getSessionToken) {
            return await AppBridge.getSessionToken();
          }
        } catch (e) {}
        return '';
      }
    </script>
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
        <button class="btn btn-primary" id="install-script-btn" onclick="installScriptTag()">Install Script Tags</button>
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
      <h2 class="card-title">Full Dashboard</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">Access advanced analytics, competitor tracking, feed generation, and more.</p>
      <a class="btn btn-secondary" href="${escapeHtml(frontendUrl)}/dashboard" target="_top">Open Full Dashboard</a>
    </div>

    <script>
      async function installScriptTag() {
        var btn = document.getElementById('install-script-btn');
        var status = document.getElementById('script-status');
        btn.disabled = true;
        btn.textContent = 'Installing...';
        status.style.display = 'block';
        status.style.background = '#eff6ff';
        status.style.color = '#2563eb';
        status.textContent = 'Installing script tags...';

        try {
          var res = await fetch('/api/shopify/store/script-tags', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (await getSessionToken())
            }
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
        } catch (e) {
          status.style.background = '#fef2f2';
          status.style.color = '#dc2626';
          status.textContent = 'Network error. Please check your connection.';
        }

        btn.disabled = false;
        btn.textContent = 'Install Script Tags';
      }

      async function getSessionToken() {
        try {
          var AppBridge = window['app-bridge'];
          if (AppBridge && AppBridge.getSessionToken) {
            return await AppBridge.getSessionToken();
          }
        } catch (e) {}
        return '';
      }
    </script>
  `;

  return c.html(renderPage("Settings", content, apiKey));
});

export { appRoute };
