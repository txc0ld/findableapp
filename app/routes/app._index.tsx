import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][Math.floor(Math.random() * 4)];

  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );

  const responseJson = await response.json();
  const product = responseJson.data!.productCreate!.product!;
  const variantId = product.variants.edges[0]!.node!.id!;

  const variantResponse = await admin.graphql(
    `#graphql
      mutation findableAppUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            barcode
            createdAt
          }
        }
      }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data!.productCreate!.product,
    variant: variantResponseJson.data!.productVariantsBulkUpdate!.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Sample product created");
    }
  }, [fetcher.data?.product?.id, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Findable Shopify App">
      <s-button slot="primary-action" onClick={generateProduct}>
        Generate a sample product
      </s-button>

      <s-section heading="Findable is connected to your Shopify store">
        <s-paragraph>
          This repo is the dedicated Shopify app surface for Findable. It ships with embedded app
          auth, App Bridge, Admin GraphQL access, Prisma session storage, and webhook plumbing so
          you can build store-level sync, scan triggers, and remediation workflows on top.
        </s-paragraph>
      </s-section>

      <s-section heading="Starter product workflow">
        <s-paragraph>
          Generate a sample product with GraphQL and inspect the response payload. This is a clean
          way to verify auth and Admin API access before replacing the starter action with Findable
          catalog sync and scan actions.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button onClick={generateProduct} {...(isLoading ? { loading: true } : {})}>
            Generate a sample product
          </s-button>
          {fetcher.data?.product && (
            <s-button
              onClick={() => {
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: fetcher.data?.product?.id,
                });
              }}
              target="_blank"
              variant="tertiary"
            >
              Edit product
            </s-button>
          )}
        </s-stack>

        {fetcher.data?.product && (
          <s-section heading="Admin API response">
            <s-stack direction="block" gap="base">
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>Variant update response</s-heading>
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
                </pre>
              </s-box>
            </s-stack>
          </s-section>
        )}
      </s-section>

      <s-section slot="aside" heading="App stack">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Interface: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/app-home/using-polaris-components"
            target="_blank"
          >
            Polaris web components
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>API: </s-text>
          <s-link href="https://shopify.dev/docs/api/admin-graphql" target="_blank">
            Admin GraphQL
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma
          </s-link>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            Link the local config to your Shopify app with{" "}
            <s-link href="https://shopify.dev/docs/api/shopify-cli/app/app-config-link" target="_blank">
              shopify app config link
            </s-link>
          </s-list-item>
          <s-list-item>
            Replace the sample product action with Findable catalog sync and scan triggers
          </s-list-item>
          <s-list-item>
            Add product remediation and feed generation flows inside the embedded admin UI
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
