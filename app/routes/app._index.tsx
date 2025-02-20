import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Index() {
  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <BlockStack gap="800">
            <Card>
              <BlockStack gap="400" align="center" inlineAlign="center">
                <Text as="h1" variant="headingXl" alignment="center">
                  Welcome to Catalog AI
                </Text>
                <Text as="p" variant="bodyLg" alignment="center">
                  Your AI-powered assistant for catalog management
                </Text>
              </BlockStack>
            </Card>

            <Layout>
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Catalog Management
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Efficiently organize and manage your product catalog with smart tools
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      AI Assistance
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Let AI help you optimize your product descriptions and categorization
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
