/**
 * FindAble Schema Loader v3
 *
 * Loaded on Shopify product pages via Theme App Extension or Script Tag.
 * Fetches pre-generated JSON-LD from FindAble API and injects into <head>.
 *
 * v3 changes:
 * - Checks validation.safe flag from API response before injecting
 * - Wraps multiple schemas in a @graph array instead of separate script tags
 * - Cleans up stale enhanced schemas before injecting (data-findable="enhanced")
 * - Works alongside base Liquid schema (data-findable="base")
 *
 * Features:
 * - Auto-detects API base from script src (no hardcoded URL)
 * - Caches schemas in sessionStorage to avoid redundant fetches on SPA navigation
 * - Removes stale FindAble enhanced schemas before injecting (prevents duplicates)
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

  // Remove any previously injected FindAble enhanced schemas (SPA navigation, section re-render)
  cleanupEnhancedSchemas();

  // Build cache key and check sessionStorage
  var cacheKey = CACHE_PREFIX + (productId || productHandle);
  try {
    var cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed.expires > Date.now()) {
        injectGraph(parsed.schemas);
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

      // Check validation.safe flag — only inject if validation passes
      if (data.validation && !data.validation.safe) return;

      var schemas = Array.isArray(data.schemas) ? data.schemas : [data.schemas];
      injectGraph(schemas);

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

  /**
   * Remove any stale FindAble enhanced schema blocks before injecting new ones.
   * Leaves base Liquid schemas (data-findable="base") intact.
   */
  function cleanupEnhancedSchemas() {
    var stale = document.querySelectorAll('script[data-findable="enhanced"], script[data-findable="true"]');
    for (var i = 0; i < stale.length; i++) {
      // Clear content of the inline enhanced block (placed by Liquid) rather than removing it
      if (stale[i].id === "findable-enhanced") {
        stale[i].textContent = "";
      } else {
        stale[i].parentNode.removeChild(stale[i]);
      }
    }
  }

  /**
   * Inject schemas as a single @graph JSON-LD block instead of separate script tags.
   * Uses the existing findable-enhanced element if present, otherwise creates a new one.
   */
  function injectGraph(schemas) {
    if (!schemas || !schemas.length) return;

    var graphPayload = {
      "@context": "https://schema.org",
      "@graph": schemas,
    };

    // Try to use the existing enhanced element placed by Liquid
    var el = document.getElementById("findable-enhanced");
    if (el) {
      el.textContent = JSON.stringify(graphPayload);
    } else {
      // Fallback: create a new script element (Script Tag mode, no Liquid block)
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.setAttribute("data-findable", "enhanced");
      el.textContent = JSON.stringify(graphPayload);
      document.head.appendChild(el);
    }
  }
})();
