/** GraphQL queries and fragments for Shopify Product operations */

export const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    title
    handle
    descriptionHtml
    description
    vendor
    productType
    tags
    status
    onlineStoreUrl
    createdAt
    updatedAt
    seo {
      title
      description
    }
    featuredImage {
      id
      url
      altText
      width
      height
    }
    images(first: 10) {
      edges {
        node {
          id
          url
          altText
          width
          height
        }
      }
    }
    collections(first: 5) {
      edges {
        node {
          id
          title
          handle
        }
      }
    }
    variants(first: 100) {
      edges {
        node {
          id
          title
          sku
          barcode
          price
          compareAtPrice
          inventoryQuantity
          availableForSale
          selectedOptions {
            name
            value
          }
          image {
            id
            url
            altText
            width
            height
          }
          presentmentPrices(first: 1) {
            edges {
              node {
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
    metafields(first: 30) {
      edges {
        node {
          namespace
          key
          value
          type
        }
      }
    }
  }
`;

/** Paginated product list — use for stores with <1000 products */
export const PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:ACTIVE") {
      edges {
        cursor
        node {
          ...ProductFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Single product by GID — use for webhook-triggered sync */
export const PRODUCT_BY_ID_QUERY = `
  ${PRODUCT_FRAGMENT}
  query Product($id: ID!) {
    product(id: $id) {
      ...ProductFields
    }
  }
`;

/** Product count — use to decide between paginated vs bulk sync */
export const PRODUCT_COUNT_QUERY = `
  query ProductCount {
    productsCount(query: "status:ACTIVE") {
      count
    }
  }
`;

/** Shop info — currency, domain, timezone */
export const SHOP_QUERY = `
  query ShopInfo {
    shop {
      name
      currencyCode
      primaryDomain {
        url
        host
      }
      ianaTimezone
      contactEmail
      billingAddress {
        countryCodeV2
      }
    }
  }
`;

export interface ShopInfoResponse {
  shop: {
    name: string;
    currencyCode: string;
    primaryDomain: { url: string; host: string };
    ianaTimezone: string;
    contactEmail: string;
    billingAddress: { countryCodeV2: string };
  };
}

/** Shop policies — uses shopPolicies query (Admin API 2026-04) */
export const SHOP_POLICIES_QUERY = `
  query ShopPolicies {
    shopPolicies {
      type
      url
      body
    }
  }
`;

export interface ShopPolicyNode {
  type: string;
  url: string | null;
  body: string;
}

export interface ShopPoliciesResponse {
  shopPolicies: ShopPolicyNode[];
}

/** Bulk operation mutation — for stores with 1000+ products */
export const BULK_PRODUCTS_QUERY = `
  mutation BulkProducts {
    bulkOperationRunQuery(
      query: """
      {
        products(query: "status:ACTIVE") {
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              description
              vendor
              productType
              tags
              status
              onlineStoreUrl
              createdAt
              updatedAt
              seo {
                title
                description
              }
              featuredImage {
                id
                url
                altText
              }
              images(first: 10) {
                edges {
                  node {
                    id
                    url
                    altText
                  }
                }
              }
              collections(first: 5) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    price
                    compareAtPrice
                    inventoryQuantity
                    availableForSale
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
              metafields(first: 30) {
                edges {
                  node {
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        }
      }
      """
    ) {
      bulkOperation {
        id
        status
        url
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Poll bulk operation status */
export const BULK_OPERATION_STATUS_QUERY = `
  query BulkOperationStatus($id: ID!) {
    node(id: $id) {
      ... on BulkOperation {
        id
        status
        errorCode
        url
        objectCount
        partialDataUrl
      }
    }
  }
`;
