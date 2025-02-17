import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  Box,
  Banner,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { syncProducts, syncOrders } from "../services/shopify.server";
import { prisma } from "../db.server";
import type { Prisma } from "@prisma/client";
import { ProductRankingSystem } from "../services/ranking_system.server";

type LoaderData = {
  products: Prisma.ProductGetPayload<{
    include: { variants: true };
  }>[];
  Orders: Array<{
    productId: string;
    purchaseDate: string;
    quantity: number;
  }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  const products = await prisma.product.findMany({
    take: 5,
    orderBy: { syncedAt: 'desc' },
    include: {
      variants: true,
    },
  });

  const Orders = await prisma.$queryRaw`
    SELECT 
      o.*,
      p.title as product_title,
      p.vendor as product_vendor,
      p.productType as product_type
    FROM "Order" o
    JOIN "Product" p ON o.productId = p.id
    ORDER BY o.purchaseDate DESC
    LIMIT 10
  `;

  const recentRankings = await prisma.productRanking.findMany({
    take: 10,
    orderBy: { updatedAt: 'desc' },
    include: {
      product: true,
    },
  });

  return json({ 
    products, 
    Orders: Orders as LoaderData['Orders'],
    recentRankings,
  });
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
    } else if (syncType === "rankings") {
      const rankingSystem = new ProductRankingSystem(prisma);
      await rankingSystem.updateAllRankings();
      return json({ status: "success", message: "Product rankings updated successfully" });
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
  const { products, Orders, recentRankings } = useLoaderData<typeof loader>();

  const isLoading = navigation.state === "submitting";

  const handleSync = (syncType: string) => {
    submit({ syncType }, { method: "POST" });
  };

  const productRows = products.map((product) => [
    product.title,
    product.vendor || 'N/A',
    product.productType || 'N/A',
    product.variants.length.toString(),
    new Date(product.syncedAt).toLocaleString(),
  ]);

  const purchaseRows = Orders.map((purchase) => [
    purchase.product_title,
    new Date(purchase.purchaseDate).toLocaleString(),
    purchase.quantity.toString(),
    purchase.product_vendor || 'N/A',
    purchase.product_type || 'N/A',
  ]);

  const rankingRows = recentRankings.map((ranking: LoaderData['recentRankings'][number]) => [
    ranking.product.title,
    ranking.score.toFixed(2),
    ranking.conversionScore.toFixed(2),
    ranking.aovScore.toFixed(2),
    ranking.sellThroughScore.toFixed(2),
    ranking.trafficScore.toFixed(2),
    new Date(ranking.updatedAt).toLocaleString(),
  ]);

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
                    <Button
                      onClick={() => handleSync("rankings")}
                      loading={isLoading}
                      disabled={isLoading}
                      tone="success"
                    >
                      Update Rankings
                    </Button>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Recently Synced Products
                  </Text>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
                    headings={['Title', 'Vendor', 'Type', 'Variants', 'Last Synced']}
                    rows={productRows}
                    footerContent={`Showing ${products.length} most recent products`}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Recent Orders
                  </Text>
                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric', 'text', 'text']}
                    headings={['Product', 'Purchase Date', 'Quantity', 'Vendor', 'Type']}
                    rows={purchaseRows}
                    footerContent={`Showing ${Orders.length} most recent orders`}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Recent Product Rankings
                  </Text>
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'text']}
                    headings={[
                      'Product',
                      'Total Score',
                      'Conversion',
                      'AOV',
                      'Sell Through',
                      'Traffic',
                      'Updated At'
                    ]}
                    rows={rankingRows}
                    footerContent={`Showing ${recentRankings.length} most recent rankings`}
                  />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
} 