import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { stores, type Store } from "../db/schema";
import { env } from "./env";

export interface ShopifySessionVariables {
  shopifyStore: Store;
  shopifyShop: string;
}

interface ShopifySessionTokenPayload {
  iss?: string;
  dest?: string;
  sub?: string;
  aud?: string;
}

/**
 * Verify a Shopify session token (JWT) from App Bridge.
 *
 * The token is signed by Shopify using the app's API secret (HMAC-SHA256).
 * Returns the shop domain and Shopify user ID on success, or throws on failure.
 */
export async function verifyShopifySessionToken(token: string): Promise<{
  shop: string;
  userId: string;
}> {
  if (!env.SHOPIFY_API_SECRET || !env.SHOPIFY_API_KEY) {
    throw new Error("Shopify app configuration is incomplete.");
  }

  const secret = new TextEncoder().encode(env.SHOPIFY_API_SECRET);

  const { payload } = await jwtVerify<ShopifySessionTokenPayload>(token, secret, {
    algorithms: ["HS256"],
  });

  // Verify the audience matches our API key
  const aud = payload.aud;
  if (aud !== env.SHOPIFY_API_KEY) {
    throw new Error("Session token audience mismatch.");
  }

  // Extract shop domain from the dest claim (e.g. "https://store.myshopify.com")
  const dest = payload.dest;
  if (typeof dest !== "string") {
    throw new Error("Session token missing dest claim.");
  }

  const shop = dest.replace(/^https?:\/\//, "");
  if (!shop) {
    throw new Error("Session token has invalid dest claim.");
  }

  const userId = typeof payload.sub === "string" ? payload.sub : "";

  return { shop, userId };
}

/**
 * Hono middleware that verifies a Shopify session token from the Authorization
 * header, looks up the associated store record, and sets `shopifyStore` and
 * `shopifyShop` on the context.
 */
export function requireShopifySession(): MiddlewareHandler<{
  Variables: ShopifySessionVariables;
}> {
  return async (c, next) => {
    // Ensure Shopify env vars are configured
    if (!env.SHOPIFY_API_SECRET || !env.SHOPIFY_API_KEY) {
      return c.json(
        {
          success: false,
          error: "Shopify app configuration is not available.",
        },
        503,
      );
    }

    // Ensure database is available
    if (!db) {
      return c.json(
        {
          success: false,
          error: "Authentication requires a configured database.",
        },
        503,
      );
    }

    // Extract Bearer token from Authorization header
    const authorization = c.req.header("authorization");
    const token =
      authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;

    if (!token) {
      return c.json(
        {
          success: false,
          error: "Shopify session token required.",
        },
        401,
      );
    }

    try {
      const { shop } = await verifyShopifySessionToken(token);

      // Look up the store record by Shopify shop domain
      const store = await db.query.stores.findFirst({
        where: eq(stores.shopifyShop, shop),
      });

      if (!store) {
        return c.json(
          {
            success: false,
            error: "Store not found. Please reinstall the app.",
          },
          401,
        );
      }

      c.set("shopifyStore", store);
      c.set("shopifyShop", shop);
      await next();
    } catch {
      return c.json(
        {
          success: false,
          error: "Invalid or expired session token.",
        },
        401,
      );
    }
  };
}
