import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Page, Layout, Card, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Index() {
  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">
              Welcome to Catalog AI
            </Text>
            <Text as="p" variant="bodyMd">
              Use the navigation menu to explore the app's features.
            </Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
