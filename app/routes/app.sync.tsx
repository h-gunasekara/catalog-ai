import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  Box,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { syncProducts, syncOrders } from "../services/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const formData = await request.formData();
    const syncType = formData.get("syncType");

    if (syncType === "products") {
      await syncProducts(request);
      return json({ status: "success", message: "Products synced successfully" });
    } else if (syncType === "orders") {
      await syncOrders(request);
      return json({ status: "success", message: "Orders synced successfully" });
    } else if (syncType === "all") {
      await syncProducts(request);
      await syncOrders(request);
      return json({ status: "success", message: "All data synced successfully" });
    }

    return json({ status: "error", message: "Invalid sync type" }, { status: 400 });
  } catch (error) {
    console.error("Sync error:", error);
    return json(
      { status: "error", message: "An error occurred during synchronization" },
      { status: 500 }
    );
  }
};

export default function SyncPage() {
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isLoading = navigation.state === "submitting";

  const handleSync = (syncType: string) => {
    submit({ syncType }, { method: "POST" });
  };

  return (
    <Page title="Sync Shopify Data">
      <BlockStack gap="500">
        {actionData?.status === "success" && (
          <Banner title="Success" tone="success">
            <p>{actionData.message}</p>
          </Banner>
        )}
        {actionData?.status === "error" && (
          <Banner title="Error" tone="critical">
            <p>{actionData.message}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Synchronize your Shopify data
                </Text>
                <Text as="p" variant="bodyMd">
                  Use the buttons below to sync your products and orders data from
                  Shopify to the local database.
                </Text>
                <Box>
                  <BlockStack gap="300">
                    <Button
                      onClick={() => handleSync("products")}
                      loading={isLoading}
                      disabled={isLoading}
                    >
                      Sync Products
                    </Button>
                    <Button
                      onClick={() => handleSync("orders")}
                      loading={isLoading}
                      disabled={isLoading}
                    >
                      Sync Orders
                    </Button>
                    <Button
                      onClick={() => handleSync("all")}
                      loading={isLoading}
                      disabled={isLoading}
                      variant="primary"
                    >
                      Sync All Data
                    </Button>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
} 