/**
 * FindAble Schema Loader v2
 *
 * Loaded on Shopify product pages via Theme App Extension or Script Tag.
 * Fetches pre-generated JSON-LD from FindAble API and injects into <head>.
 *
 * Features:
 * - Auto-detects API base from script src (no hardcoded URL)
 * - Caches schemas in sessionStorage to avoid redundant fetches on SPA navigation
 * - Removes stale FindAble schemas before injecting (prevents duplicates)
 * - Handles Shopify section rendering API (theme editor live reload)
 * - Silent failure — never breaks the storefront
 *
 * < 1.5KB minified.
 */
(function () {
  "use strict";

  var CACHE_PREFIX = "findable:schema:";
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  var script = document.getElementById("findable-schema-loader") || document.currentScript;
  if (!script) return;

  // Detect API base from script src or data attribute
  var apiBase = script.getAttribute("data-api-base");
  if (!apiBase) {
    var src = script.getAttribute("src") || "";
    var match = src.match(/^(https?:\/\/[^/]+)/);
    apiBase = match ? match[1] : "https://api.getfindable.au";
  }

  var productId = script.getAttribute("data-product-id");
  var productHandle = script.getAttribute("data-product-handle");
  var shop = script.getAttribute("data-shop");
  var storeId = script.getAttribute("data-store-id");

  // Script Tag mode: detect product from URL if no data attributes
  if (!productId && !productHandle) {
    var pathMatch = window.location.pathname.match(/\/products\/([^/?#]+)/);
    if (pathMatch) productHandle = pathMatch[1];
  }

  if (!productHandle && !productId) return;

  // Remove any previously injected FindAble schemas (SPA navigation, section re-render)
  var existing = document.querySelectorAll('script[data-findable="true"]');
  for (var i = 0; i < existing.length; i++) {
    existing[i].parentNode.removeChild(existing[i]);
  }

  // Build cache key and check sessionStorage
  var cacheKey = CACHE_PREFIX + (productId || productHandle);
  try {
    var cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed.expires > Date.now()) {
        injectSchemas(parsed.schemas);
        return;
      }
      sessionStorage.removeItem(cacheKey);
    }
  } catch (_e) {
    // sessionStorage unavailable (private mode, quota) — proceed with fetch
  }

  // Build API URL
  var url = apiBase + "/api/schema/product";
  var params = [];
  if (shop) params.push("shop=" + encodeURIComponent(shop));
  if (storeId) params.push("store=" + encodeURIComponent(storeId));
  if (productId) params.push("productId=" + encodeURIComponent(productId));
  if (productHandle) params.push("handle=" + encodeURIComponent(productHandle));
  if (params.length > 0) url += "?" + params.join("&");

  fetch(url, { credentials: "omit", cache: "default" })
    .then(function (response) {
      if (!response.ok) return null;
      return response.json();
    })
    .then(function (data) {
      if (!data || !data.schemas) return;

      var schemas = Array.isArray(data.schemas) ? data.schemas : [data.schemas];
      injectSchemas(schemas);

      // Cache in sessionStorage
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({
          schemas: schemas,
          expires: Date.now() + CACHE_TTL_MS,
        }));
      } catch (_e) {
        // Quota exceeded or unavailable — ignore
      }
    })
    .catch(function () {
      // Silent fail — never break the storefront
    });

  function injectSchemas(schemas) {
    for (var j = 0; j < schemas.length; j++) {
      var el = document.createElement("script");
      el.type = "application/ld+json";
      el.textContent = JSON.stringify(schemas[j]);
      el.setAttribute("data-findable", "true");
      document.head.appendChild(el);
    }
  }
})();
