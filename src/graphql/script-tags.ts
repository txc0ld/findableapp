/** GraphQL mutations for Shopify Script Tag API (REST also works — see src/script-tags.ts) */

export const SCRIPT_TAG_CREATE = `
  mutation ScriptTagCreate($input: ScriptTagInput!) {
    scriptTagCreate(input: $input) {
      scriptTag {
        id
        src
        displayScope
        createdAt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const SCRIPT_TAG_DELETE = `
  mutation ScriptTagDelete($id: ID!) {
    scriptTagDelete(id: $id) {
      deletedScriptTagId
      userErrors {
        field
        message
      }
    }
  }
`;

export const SCRIPT_TAGS_QUERY = `
  query ScriptTags($first: Int!) {
    scriptTags(first: $first) {
      edges {
        node {
          id
          src
          displayScope
          createdAt
          updatedAt
        }
      }
    }
  }
`;
