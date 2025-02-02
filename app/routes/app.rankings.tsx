import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  ButtonGroup,
  Button,
  Box,
  Select,
  LegacyStack,
  Grid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import detailedRankingsData from "../../dev/recommendation-engine/detailed_rankings.json";

type RankingComponent = {
  new_in: number;
  bestseller: number;
  stock_based: number;
  sale_item: number;
  slow_mover: number;
};

type ProductRanking = {
  product_id: number;
  title: string;
  total_score: number;
  vendor: string;
  components: RankingComponent;
};

type Collections = {
  [key: string]: ProductRanking[];
};

type DetailedRankings = {
  ranking_weights: Record<string, number>;
  configuration: Record<string, number>;
  collections: Collections;
};

// Use the imported data directly
const detailedRankings = detailedRankingsData as DetailedRankings;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({ detailedRankings });
};

export default function Rankings() {
  const { detailedRankings } = useLoaderData<typeof loader>();
  const collections = Object.keys(detailedRankings.collections);
  const [selectedCollection, setSelectedCollection] = useState(collections[0]);

  const getBadgeStatus = (score: number): { status: string; label: string } => {
    if (score > 5) return { status: "success", label: "High" };
    if (score > 0) return { status: "info", label: "Medium" };
    if (score > -5) return { status: "warning", label: "Low" };
    return { status: "critical", label: "Poor" };
  };

  const getComponentLabels = (components: RankingComponent): string[] => {
    const labels = [];
    if (components.new_in > 0) labels.push("NEW IN");
    if (components.bestseller > 0) labels.push("BESTSELLER");
    if (components.stock_based > 0) labels.push("LOW STOCK");
    if (components.sale_item < 0) labels.push("ON SALE");
    if (components.slow_mover < 0) labels.push("SLOW MOVER");
    return labels;
  };

  const currentCollection = detailedRankings.collections[selectedCollection];

  return (
    <Page title="Product Rankings">
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: "16px" }}>
              <LegacyStack vertical>
                <Select
                  label="Collection"
                  options={collections.map(c => ({ label: c, value: c }))}
                  onChange={setSelectedCollection}
                  value={selectedCollection}
                />
                <div style={{ marginTop: "16px" }}>
                  <Grid>
                    {(currentCollection || []).map((item: ProductRanking) => {
                      const { status, label } = getBadgeStatus(item.total_score);
                      const componentLabels = getComponentLabels(item.components);

                      return (
                        <Grid.Cell columnSpan={{ xs: 6, md: 4 }} key={item.product_id}>
                          <div style={{ padding: "8px" }}>
                            <Card>
                              <div style={{ padding: "16px", minHeight: "320px" }}>
                                <LegacyStack vertical>
                                  <LegacyStack alignment="center" distribution="equalSpacing">
                                    <Text variant="headingMd" as="h3">
                                      {item.title}
                                    </Text>
                                    <Badge tone={status as any}>{label}</Badge>
                                  </LegacyStack>
                                  <Text variant="bodySm" as="p" tone="subdued">
                                    Vendor: {item.vendor}
                                  </Text>
                                  <Text variant="bodySm" as="p" tone="subdued">
                                    Score: {item.total_score}
                                  </Text>
                                  <div style={{ marginTop: "16px" }}>
                                    <LegacyStack vertical spacing="tight">
                                      {componentLabels.map((label, index) => (
                                        <Button key={index} fullWidth>
                                          {label}
                                        </Button>
                                      ))}
                                    </LegacyStack>
                                  </div>
                                </LegacyStack>
                              </div>
                            </Card>
                          </div>
                        </Grid.Cell>
                      );
                    })}
                  </Grid>
                </div>
              </LegacyStack>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 