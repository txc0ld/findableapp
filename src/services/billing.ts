/**
 * Shopify App Billing — creates and manages app subscriptions via Admin GraphQL.
 *
 * Maps FindAble plan tiers to Shopify recurring charges:
 * - Starter: $39/mo (or $29/mo annual)
 * - Growth:  $129/mo (or $89/mo annual)
 * - Pro:     $349/mo (or $239/mo annual)
 * - Agency:  $999/mo (or $699/mo annual)
 *
 * Usage:
 *   import { createSubscription, getActiveSubscription, changeSubscription } from "./billing";
 *
 *   const { confirmationUrl } = await createSubscription(shop, accessToken, "growth");
 *   // Redirect merchant to confirmationUrl to accept charge
 */

import { env } from "../lib/env";
import { shopifyGql } from "../lib/shopify-client";
import {
  APP_SUBSCRIPTION_CREATE,
  APP_SUBSCRIPTION_CANCEL,
  ACTIVE_SUBSCRIPTIONS_QUERY,
} from "../graphql/billing";

export type PlanTier = "starter" | "growth" | "pro" | "agency";

interface PlanConfig {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  trialDays: number;
  productLimit: number;
}

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  starter: { name: "FindAble Starter", monthlyPrice: "39.00", annualPrice: "29.00", trialDays: 7, productLimit: 500 },
  growth: { name: "FindAble Growth", monthlyPrice: "129.00", annualPrice: "89.00", trialDays: 7, productLimit: 5000 },
  pro: { name: "FindAble Pro", monthlyPrice: "349.00", annualPrice: "239.00", trialDays: 7, productLimit: -1 },
  agency: { name: "FindAble Agency", monthlyPrice: "999.00", annualPrice: "699.00", trialDays: 14, productLimit: -1 },
};

interface CreateSubscriptionResult {
  confirmationUrl: string;
  subscriptionId: string;
}

/**
 * Create a Shopify app subscription for a plan tier.
 * Returns a confirmationUrl — redirect the merchant there to accept the charge.
 */
export async function createSubscription(
  shop: string,
  accessToken: string,
  tier: PlanTier,
  interval: "monthly" | "annual" = "monthly",
): Promise<CreateSubscriptionResult> {
  const config = PLAN_CONFIGS[tier];
  const isTest = env.NODE_ENV !== "production";
  const price = interval === "annual" ? config.annualPrice : config.monthlyPrice;
  const billingInterval = interval === "annual" ? "ANNUAL" : "EVERY_30_DAYS";

  const returnUrl = new URL("/api/shopify/billing/callback", env.SHOPIFY_APP_URL);
  returnUrl.searchParams.set("shop", shop);
  returnUrl.searchParams.set("tier", tier);
  returnUrl.searchParams.set("interval", interval);

  const data = await shopifyGql<{
    appSubscriptionCreate: {
      appSubscription: { id: string; name: string; status: string } | null;
      confirmationUrl: string | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(shop, accessToken, APP_SUBSCRIPTION_CREATE, {
    name: config.name,
    returnUrl: returnUrl.toString(),
    test: isTest,
    trialDays: config.trialDays,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: parseFloat(price), currencyCode: "USD" },
            interval: billingInterval,
          },
        },
      },
    ],
  });

  const result = data.appSubscriptionCreate;

  if (result.userErrors.length > 0) {
    throw new Error(`Billing error: ${result.userErrors.map((e) => e.message).join("; ")}`);
  }

  if (!result.confirmationUrl || !result.appSubscription) {
    throw new Error("Failed to create Shopify subscription.");
  }

  return {
    confirmationUrl: result.confirmationUrl,
    subscriptionId: result.appSubscription.id,
  };
}

export interface ActiveSubscription {
  id: string;
  name: string;
  status: string;
  currentPeriodEnd: string | null;
  price: string;
  currency: string;
  interval: string;
  tier: PlanTier | null;
}

/** Get the active subscription for the current app installation */
export async function getActiveSubscription(
  shop: string,
  accessToken: string,
): Promise<ActiveSubscription | null> {
  const data = await shopifyGql<{
    appInstallation: {
      activeSubscriptions: Array<{
        id: string;
        name: string;
        status: string;
        currentPeriodEnd: string | null;
        lineItems: Array<{
          plan: {
            pricingDetails: {
              price?: { amount: string; currencyCode: string };
              interval?: string;
              cappedAmount?: { amount: string; currencyCode: string };
            };
          };
        }>;
      }>;
    };
  }>(shop, accessToken, ACTIVE_SUBSCRIPTIONS_QUERY);

  const sub = data.appInstallation.activeSubscriptions[0];
  if (!sub) return null;

  const pricing = sub.lineItems[0]?.plan.pricingDetails;

  return {
    id: sub.id,
    name: sub.name,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    price: pricing?.price?.amount ?? "0",
    currency: pricing?.price?.currencyCode ?? "USD",
    interval: pricing?.interval ?? "EVERY_30_DAYS",
    tier: subscriptionNameToTier(sub.name),
  };
}

/** Cancel an active Shopify app subscription */
export async function cancelSubscription(
  shop: string,
  accessToken: string,
  subscriptionId: string,
): Promise<void> {
  const data = await shopifyGql<{
    appSubscriptionCancel: {
      appSubscription: { id: string; status: string } | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(shop, accessToken, APP_SUBSCRIPTION_CANCEL, { id: subscriptionId });

  if (data.appSubscriptionCancel.userErrors.length > 0) {
    throw new Error(`Cancel error: ${data.appSubscriptionCancel.userErrors.map((e) => e.message).join("; ")}`);
  }
}

/**
 * Change plan — cancels existing subscription and creates a new one.
 * Returns the confirmation URL for the new plan.
 */
export async function changeSubscription(
  shop: string,
  accessToken: string,
  newTier: PlanTier,
  interval: "monthly" | "annual" = "monthly",
): Promise<CreateSubscriptionResult> {
  const current = await getActiveSubscription(shop, accessToken);

  if (current && current.status === "ACTIVE") {
    await cancelSubscription(shop, accessToken, current.id);
  }

  return createSubscription(shop, accessToken, newTier, interval);
}

/** Map a Shopify subscription name back to a FindAble PlanTier */
export function subscriptionNameToTier(name: string): PlanTier | null {
  const lower = name.toLowerCase();
  if (lower.includes("agency")) return "agency";
  if (lower.includes("pro")) return "pro";
  if (lower.includes("growth")) return "growth";
  if (lower.includes("starter")) return "starter";
  return null;
}
