/** GraphQL mutations for Shopify App Billing API */

/** Create a recurring app subscription (maps to FindAble plan tiers) */
export const APP_SUBSCRIPTION_CREATE = `
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $test: Boolean
    $trialDays: Int
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
    ) {
      appSubscription {
        id
        name
        status
        createdAt
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

/** Cancel an active subscription */
export const APP_SUBSCRIPTION_CANCEL = `
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Query active subscription for a store */
export const ACTIVE_SUBSCRIPTIONS_QUERY = `
  query ActiveSubscriptions {
    appInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
              ... on AppUsagePricing {
                cappedAmount {
                  amount
                  currencyCode
                }
                terms
              }
            }
          }
        }
      }
    }
  }
`;
