import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import IORedis from "ioredis";

import { env } from "./env";
import { encryptSecret } from "./secrets";

const SHOP_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
const OAUTH_STATE_TTL_SECONDS = 60 * 5;
const SHOPIFY_SCOPES = [
  "read_products",
  "write_script_tags",
  "read_script_tags",
  "read_themes",
  "read_locales",
];

interface ShopifyOAuthState {
  accountId?: string;
  shop: string;
}

interface ShopifyTokenResponse {
  access_token: string;
  associated_user_scope?: string;
  scope?: string;
}

interface ShopifyShopResponse {
  shop: {
    domain?: string;
    email: string;
    myshopify_domain: string;
    name: string;
    primary_domain?: { host?: string; url?: string };
  };
}

const redis = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    })
  : null;

const memoryOAuthStates = new Map<string, { expiresAt: number; value: ShopifyOAuthState }>();

export function getShopifyScopes() {
  return SHOPIFY_SCOPES;
}

export function validateShopifyShop(shop: string) {
  return SHOP_REGEX.test(shop);
}

function compareDigests(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyShopifyQueryHmac(url: string) {
  if (!env.SHOPIFY_API_SECRET) {
    throw new Error("SHOPIFY_API_SECRET is required.");
  }

  const searchParams = new URL(url).searchParams;
  const providedHmac = searchParams.get("hmac");

  if (!providedHmac) {
    return false;
  }

  const message = Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = createHmac("sha256", env.SHOPIFY_API_SECRET).update(message).digest("hex");
  return compareDigests(digest, providedHmac);
}

export function verifyShopifyWebhookHmac(body: string, providedHmac: string | null) {
  if (!env.SHOPIFY_API_SECRET || !providedHmac) {
    return false;
  }

  const digest = createHmac("sha256", env.SHOPIFY_API_SECRET).update(body).digest("base64");
  return compareDigests(digest, providedHmac);
}

export async function createShopifyOAuthState(input: ShopifyOAuthState) {
  const state = randomBytes(24).toString("base64url");
  const key = `shopify:oauth:${state}`;
  const payload = JSON.stringify(input);

  if (redis) {
    await redis.set(key, payload, "EX", OAUTH_STATE_TTL_SECONDS);
    return state;
  }

  memoryOAuthStates.set(state, {
    expiresAt: Date.now() + OAUTH_STATE_TTL_SECONDS * 1000,
    value: input,
  });

  return state;
}

export async function consumeShopifyOAuthState(state: string) {
  const key = `shopify:oauth:${state}`;

  if (redis) {
    const payload = await redis.get(key);

    if (!payload) {
      return null;
    }

    await redis.del(key);
    return JSON.parse(payload) as ShopifyOAuthState;
  }

  const existing = memoryOAuthStates.get(state);

  if (!existing || existing.expiresAt <= Date.now()) {
    memoryOAuthStates.delete(state);
    return null;
  }

  memoryOAuthStates.delete(state);
  return existing.value;
}

export function getShopifyAuthorizeUrl(shop: string, state: string) {
  if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_APP_URL) {
    throw new Error("Shopify app configuration is incomplete.");
  }

  const authorizeUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  const callbackUrl = new URL("/shopify/callback", env.SHOPIFY_APP_URL);

  authorizeUrl.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  authorizeUrl.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("state", state);

  return authorizeUrl.toString();
}

export async function exchangeShopifyCodeForToken(shop: string, code: string) {
  if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET) {
    throw new Error("Shopify app configuration is incomplete.");
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Shopify authorization code.");
  }

  return (await response.json()) as ShopifyTokenResponse;
}

export async function fetchShopifyShop(shop: string, accessToken: string) {
  const response = await fetch(`https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/shop.json`, {
    headers: {
      "x-shopify-access-token": accessToken,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Shopify shop details.");
  }

  return (await response.json()) as ShopifyShopResponse;
}

async function shopifyGraphqlRequest<TData>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await fetch(`https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error("Shopify GraphQL request failed.");
  }

  const payload = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Shopify GraphQL request failed.");
  }

  if (!payload.data) {
    throw new Error("Shopify GraphQL response missing data.");
  }

  return payload.data;
}

export async function registerShopifyWebhooks(shop: string, accessToken: string) {
  if (!env.SHOPIFY_APP_URL) {
    throw new Error("SHOPIFY_APP_URL is required.");
  }

  const webhookUrl = new URL("/shopify/webhooks", env.SHOPIFY_APP_URL).toString();
  const topics = [
    "PRODUCTS_CREATE",
    "PRODUCTS_UPDATE",
    "PRODUCTS_DELETE",
    "APP_UNINSTALLED",
    "CUSTOMERS_DATA_REQUEST",
    "CUSTOMERS_REDACT",
    "SHOP_REDACT",
  ];

  const query = `
    mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
      webhookSubscriptionCreate(
        topic: $topic
        webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
      ) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  for (const topic of topics) {
    const data = await shopifyGraphqlRequest<{
      webhookSubscriptionCreate: {
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(shop, accessToken, query, {
      callbackUrl: webhookUrl,
      topic,
    });

    const firstError = data.webhookSubscriptionCreate.userErrors[0];

    if (firstError && !firstError.message.toLowerCase().includes("address for this topic has already been taken")) {
      throw new Error(firstError.message);
    }
  }
}

export function encryptShopifyAccessToken(accessToken: string) {
  if (!env.SHOPIFY_TOKEN_ENCRYPTION_KEY) {
    throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY is required.");
  }

  return encryptSecret(accessToken, env.SHOPIFY_TOKEN_ENCRYPTION_KEY);
}
