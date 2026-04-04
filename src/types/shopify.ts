/** Shopify Admin API types (GraphQL response shapes) */

export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  id: string;
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ShopifySelectedOption {
  name: string;
  value: string;
}

export type ShopifyWeightUnit = "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS";

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  selectedOptions: ShopifySelectedOption[];
  image: ShopifyImage | null;
  weight: number | null;
  weightUnit: ShopifyWeightUnit;
  presentmentPrices: {
    edges: Array<{
      node: {
        price: ShopifyMoney;
        compareAtPrice: ShopifyMoney | null;
      };
    }>;
  };
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  onlineStoreUrl: string | null;
  featuredImage: ShopifyImage | null;
  images: { edges: Array<{ node: ShopifyImage }> };
  variants: { edges: Array<{ node: ShopifyVariant }> };
  metafields: { edges: Array<{ node: ShopifyMetafield }> };
  collections: { edges: Array<{ node: { id: string; title: string; handle: string } }> };
  seo: { title: string | null; description: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyProductEdge {
  cursor: string;
  node: ShopifyProduct;
}

export interface ShopifyProductsResponse {
  products: {
    edges: ShopifyProductEdge[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export interface ShopifyBulkOperation {
  bulkOperationRunQuery: {
    bulkOperation: {
      id: string;
      status: string;
      url: string | null;
    } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

export type BulkOperationStatus = "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";

export interface ShopifyBulkOperationStatus {
  node: {
    id: string;
    status: BulkOperationStatus;
    errorCode: string | null;
    url: string | null;
    objectCount: string;
    partialDataUrl: string | null;
  } | null;
}

export interface ShopifyScriptTag {
  id: string;
  src: string;
  displayScope: "ALL" | "ONLINE_STORE" | "ORDER_STATUS";
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = "ACTIVE" | "DECLINED" | "EXPIRED" | "FROZEN" | "PENDING";
export type BillingInterval = "EVERY_30_DAYS" | "ANNUAL";

export interface ShopifyAppSubscription {
  id: string;
  name: string;
  status: SubscriptionStatus;
  lineItems: Array<{
    id: string;
    plan: {
      pricingDetails:
        | { price: ShopifyMoney; interval: BillingInterval }
        | { cappedAmount: ShopifyMoney; terms: string };
    };
  }>;
  currentPeriodEnd: string | null;
  createdAt: string;
}

/** Shopify webhook payload types */
export interface ShopifyWebhookProduct {
  id: number;
  admin_graphql_api_id: string;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  status: string;
  variants: Array<{
    id: number;
    admin_graphql_api_id: string;
    title: string;
    price: string;
    sku: string | null;
    barcode: string | null;
  }>;
}

export interface GdprCustomerPayload {
  shop_id: number;
  shop_domain: string;
  customer: {
    id: number;
    email: string;
    phone: string;
  };
  orders_requested?: number[];
  data_request?: { id: number };
}

export interface GdprShopPayload {
  shop_id: number;
  shop_domain: string;
}

/** Mapped product ready for FindAble DB storage */
export interface MappedProduct {
  platformProductId: string;
  url: string;
  name: string;
  description: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  price: number | null;
  currency: string;
  compareAtPrice: number | null;
  availability: string;
  sku: string | null;
  barcode: string | null;
  images: Array<{ url: string; alt: string | null }>;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    barcode: string | null;
    price: number;
    currency: string;
    available: boolean;
    options: ShopifySelectedOption[];
    image: string | null;
    weight: number | null;
    weightUnit: string;
  }>;
  collections: Array<{ title: string; handle: string }>;
  metafields: Record<string, string>;
  seoTitle: string | null;
  seoDescription: string | null;
  handle: string;
  reviewCount: number | null;
  ratingValue: number | null;
  updatedAt: string;
}

/** ACP feed product record (OpenAI spec — developers.openai.com/commerce/specs/feed/) */
export interface AcpFeedProduct {
  product: {
    id: string;
    title: string;
    description: string;
    brand: string;
    category: string;
    url: string;
  };
  variants: Array<{
    id: string;
    title: string;
    price: { amount: string; currency: string };
    availability: "in_stock" | "out_of_stock" | "preorder";
    image_url: string;
    gtin?: string;
  }>;
  group_id: string;
  shipping: {
    methods: Array<{
      method: string;
      rate: { amount: string; currency: string };
      delivery_estimate: string;
    }>;
  };
  policies: {
    return_policy: string;
  };
  enable_search: boolean;
  enable_checkout: boolean;
}
