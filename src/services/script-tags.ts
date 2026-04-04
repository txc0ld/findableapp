/**
 * Script Tag API — injects FindAble JSON-LD into Shopify storefronts.
 *
 * Creates a <script> tag pointing to a FindAble-hosted JS file that:
 * 1. Detects the current product page (via canonical URL or Shopify product handle)
 * 2. Fetches pre-generated JSON-LD from FindAble API
 * 3. Injects it into the page <head>
 *
 * This is the "zero theme changes" approach. Works on any theme.
 * Alternative: Theme App Extension (see extensions/findable-schema/).
 *
 * Usage:
 *   import { installScriptTag, removeScriptTag, listScriptTags } from "./script-tags";
 *
 *   await installScriptTag(shop, accessToken, storeId);
 */

import { env } from "../lib/env";
import { shopifyRest } from "../lib/shopify-client";

interface ScriptTagResponse {
  script_tag: {
    id: number;
    src: string;
    display_scope: string;
    created_at: string;
    updated_at: string;
  };
}

interface ScriptTagsListResponse {
  script_tags: Array<{
    id: number;
    src: string;
    display_scope: string;
    created_at: string;
    updated_at: string;
  }>;
}

/**
 * Build the script tag src URL.
 * This URL should serve the findable-loader.js asset (see extensions/findable-schema/assets/).
 */
function buildScriptSrc(storeId: string): string {
  const baseUrl = env.SHOPIFY_APP_URL ?? `http://localhost:${env.PORT}`;
  return `${baseUrl}/api/schema-loader.js?store=${encodeURIComponent(storeId)}`;
}

/** List all Script Tags created by this app */
export async function listScriptTags(
  shop: string,
  accessToken: string,
): Promise<Array<{ id: number; src: string; display_scope: string }>> {
  const data = await shopifyRest<ScriptTagsListResponse>(
    shop, accessToken, "GET", "/script_tags.json",
  );
  return data.script_tags;
}

/** Install a Script Tag on the Shopify storefront. Idempotent — updates existing if present. */
export async function installScriptTag(
  shop: string,
  accessToken: string,
  storeId: string,
): Promise<{ id: number; src: string }> {
  const existing = await listScriptTags(shop, accessToken);
  const newSrc = buildScriptSrc(storeId);

  // Check for existing FindAble script tag
  const findableTag = existing.find(
    (tag) => tag.src.includes("schema-loader") || tag.src.includes("findable"),
  );

  if (findableTag) {
    if (findableTag.src === newSrc) {
      return { id: findableTag.id, src: findableTag.src };
    }
    // Remove stale tag before creating updated one
    await removeScriptTag(shop, accessToken, findableTag.id);
  }

  const data = await shopifyRest<ScriptTagResponse>(
    shop, accessToken, "POST", "/script_tags.json",
    {
      script_tag: {
        event: "onload",
        src: newSrc,
        display_scope: "online_store",
      },
    },
  );

  return { id: data.script_tag.id, src: data.script_tag.src };
}

/** Remove a Script Tag by ID */
export async function removeScriptTag(
  shop: string,
  accessToken: string,
  scriptTagId: number,
): Promise<void> {
  await shopifyRest(shop, accessToken, "DELETE", `/script_tags/${scriptTagId}.json`);
}

/** Remove all FindAble script tags from a store */
export async function removeAllScriptTags(
  shop: string,
  accessToken: string,
): Promise<number> {
  const tags = await listScriptTags(shop, accessToken);
  const findableTags = tags.filter(
    (tag) => tag.src.includes("schema-loader") || tag.src.includes("findable"),
  );

  for (const tag of findableTags) {
    await removeScriptTag(shop, accessToken, tag.id);
  }

  return findableTags.length;
}
