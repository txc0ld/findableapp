/**
 * Shared Shopify API client — single source of truth for all GraphQL and REST calls.
 *
 * Handles:
 * - Rate limit detection and retry with exponential backoff
 * - GraphQL throttle awareness (cost-based, Shopify returns cost info)
 * - Token decryption from DB-stored encrypted tokens
 * - Consistent error handling and structured error types
 */

import { env } from "./env";
import { decryptSecret } from "./secrets";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10_000;

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly shopifyErrors?: Array<{ message: string; extensions?: Record<string, unknown> }>,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

/** Decrypt a stored access token. Call this before passing to API methods. */
export function decryptAccessToken(encryptedToken: string): string {
  if (!env.SHOPIFY_TOKEN_ENCRYPTION_KEY) {
    throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY is required to decrypt access tokens.");
  }
  return decryptSecret(encryptedToken, env.SHOPIFY_TOKEN_ENCRYPTION_KEY);
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number): number {
  const jitter = Math.random() * 200;
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt) + jitter, MAX_DELAY_MS);
}

/**
 * Execute a Shopify GraphQL query with automatic retry on throttle (423/429).
 *
 * Shopify's GraphQL rate limit: 1000-point bucket, restores at 50 points/sec.
 * On throttle, the response includes a `Retry-After` header or `THROTTLED` error code.
 */
export async function shopifyGql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(retryDelay(attempt - 1));
    }

    const response = await fetch(
      `https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-access-token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    // Shopify returns 200 for throttled GraphQL — check body.
    // But 429/503 can also happen at the HTTP level.
    if (response.status === 429 || response.status === 503) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : retryDelay(attempt);
      lastError = new ShopifyApiError(
        `Shopify rate limited (${response.status})`,
        response.status,
        true,
      );
      if (attempt < MAX_RETRIES) {
        await delay(waitMs);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      throw new ShopifyApiError(
        `Shopify GraphQL HTTP ${response.status}: ${response.statusText}`,
        response.status,
        false,
      );
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
      extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
    };

    // Check for throttled GraphQL errors (HTTP 200 but error in body)
    const throttled = payload.errors?.some(
      (e) => e.extensions?.code === "THROTTLED" || e.message?.toLowerCase().includes("throttled"),
    );

    if (throttled && attempt < MAX_RETRIES) {
      lastError = new ShopifyApiError("Shopify GraphQL throttled", 429, true, payload.errors);
      continue;
    }

    if (payload.errors?.length) {
      throw new ShopifyApiError(
        `Shopify GraphQL: ${payload.errors.map((e) => e.message).join("; ")}`,
        200,
        false,
        payload.errors,
      );
    }

    if (!payload.data) {
      throw new ShopifyApiError("Shopify GraphQL response missing data", 200, false);
    }

    return payload.data;
  }

  throw lastError ?? new Error("Shopify GraphQL request failed after retries.");
}

/**
 * Execute a Shopify REST API call with automatic retry on 429.
 *
 * Shopify REST rate limit: leaky bucket, 40 requests/sec for Plus, 2 req/sec for standard.
 */
export async function shopifyRest<T>(
  shop: string,
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(retryDelay(attempt - 1));
    }

    const response = await fetch(
      `https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}${path}`,
      {
        method,
        headers: {
          "content-type": "application/json",
          "x-shopify-access-token": accessToken,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : retryDelay(attempt);
      lastError = new ShopifyApiError("Shopify REST rate limited", 429, true);
      if (attempt < MAX_RETRIES) {
        await delay(waitMs);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new ShopifyApiError(
        `Shopify REST ${response.status}: ${text}`,
        response.status,
        false,
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  throw lastError ?? new Error("Shopify REST request failed after retries.");
}
