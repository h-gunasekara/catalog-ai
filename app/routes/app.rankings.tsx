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
  Icon,
  ChoiceList,
  RangeSlider,
  TextField,
  Popover,
  ActionList,
} from "@shopify/polaris";
import { PinIcon, PinFilledIcon, DragHandleIcon, DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import detailedRankingsData from "../../dev/recommendation-engine/detailed_rankings.json";
import type { 
  DropResult, 
  DroppableProvided, 
  DraggableProvided 
} from "@hello-pangea/dnd";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

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

type SortRule = {
  id: string;
  name: string;
  section: "promote" | "demote" | "ignore";
};

type SortMode = "manual" | "mixed";

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
  const [pinnedProducts, setPinnedProducts] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("mixed");
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { id: "new-in", name: "NEW IN", section: "promote" },
    { id: "bestseller", name: "BESTSELLER", section: "promote" },
    { id: "trending", name: "TRENDING", section: "promote" },
    { id: "low-stock", name: "LOW STOCK", section: "demote" },
    { id: "out-of-stock", name: "OUT OF STOCK", section: "demote" },
    { id: "sale-item", name: "ON SALE", section: "ignore" },
    { id: "slow-mover", name: "SLOW MOVER", section: "ignore" },
  ]);

  const togglePin = (productId: number) => {
    setPinnedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

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

  const getComponentBadgeProps = (label: string): { tone: "success" | "info" | "warning" | "critical" | "attention" } => {
    switch (label) {
      case "NEW IN":
        return { tone: "success" };
      case "BESTSELLER":
        return { tone: "attention" };
      case "LOW STOCK":
        return { tone: "warning" };
      case "ON SALE":
        return { tone: "info" };
      case "SLOW MOVER":
        return { tone: "critical" };
      default:
        return { tone: "info" };
    }
  };

  const currentCollection = detailedRankings.collections[selectedCollection];
  
  // Sort products to show pinned items first
  const sortedProducts = [...(currentCollection || [])].sort((a, b) => {
    const aIsPinned = pinnedProducts.includes(a.product_id);
    const bIsPinned = pinnedProducts.includes(b.product_id);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });

  const handleSortModeChange = (value: SortMode) => {
    setSortMode(value);
  };

  const handleRuleOrderChange = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination } = result;
    const updatedRules = Array.from(sortRules);
    const [movedRule] = updatedRules.splice(source.index, 1);
    
    // Update the section of the moved rule
    movedRule.section = destination.droppableId as "promote" | "demote" | "ignore";
    
    // Find the correct position in the destination section
    const destinationSectionRules = updatedRules.filter(rule => rule.section === destination.droppableId);
    const otherRules = updatedRules.filter(rule => rule.section !== destination.droppableId);
    
    destinationSectionRules.splice(destination.index, 0, movedRule);
    
    // Combine all rules back together
    setSortRules([...destinationSectionRules, ...otherRules]);
  };

  const SortingPanel = () => {
    const getRulesForSection = (section: "promote" | "demote" | "ignore") => 
      sortRules.filter(rule => rule.section === section);

    const getSectionTitle = (section: string): { text: string; tone: "success" | "critical" | "subdued" } => {
      switch (section) {
        case "promote":
          return { text: "Promote", tone: "success" };
        case "demote":
          return { text: "Demote", tone: "critical" };
        case "ignore":
          return { text: "Ignore", tone: "subdued" };
        default:
          return { text: "Unknown", tone: "subdued" };
      }
    };

    return (
      <Card>
        <div style={{ padding: "12px" }}>
          <LegacyStack vertical spacing="tight">
            <Text variant="headingMd" as="h2">Sort</Text>
            
            <ChoiceList
              title="Sorting Mode"
              choices={[
                { label: "Manual", value: "manual" },
                { label: "Mixed: Manual + Automated", value: "mixed" }
              ]}
              selected={[sortMode]}
              onChange={([value]) => handleSortModeChange(value as SortMode)}
            />

            <DragDropContext onDragEnd={handleRuleOrderChange}>
              {(["promote", "demote", "ignore"] as const).map((section) => {
                const { text, tone } = getSectionTitle(section);
                return (
                  <div key={section} style={{ marginTop: "16px" }}>
                    <LegacyStack vertical spacing="tight">
                      <Text variant="headingMd" as="h3" tone={tone}>{text}</Text>
                      <Droppable droppableId={section}>
                        {(provided: DroppableProvided) => (
                          <div 
                            {...provided.droppableProps} 
                            ref={provided.innerRef}
                            style={{
                              minHeight: "100px",
                              padding: "4px",
                              backgroundColor: "#f6f6f7",
                              borderRadius: "8px"
                            }}
                          >
                            <LegacyStack vertical spacing="tight">
                              {getRulesForSection(section).map((rule, index) => (
                                <Draggable key={rule.id} draggableId={rule.id} index={index}>
                                  {(provided: DraggableProvided) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                    >
                                      <Card>
                                        <div style={{ padding: "4px" }}>
                                          <LegacyStack alignment="center">
                                            <Icon source={DragHandleIcon} />
                                            <Badge {...getComponentBadgeProps(rule.name)}>{rule.name}</Badge>
                                          </LegacyStack>
                                        </div>
                                      </Card>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </LegacyStack>
                          </div>
                        )}
                      </Droppable>
                    </LegacyStack>
                  </div>
                );
              })}
            </DragDropContext>
          </LegacyStack>
        </div>
      </Card>
    );
  };

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
                    {sortedProducts.map((item: ProductRanking) => {
                      const { status, label } = getBadgeStatus(item.total_score);
                      const componentLabels = getComponentLabels(item.components);
                      const isPinned = pinnedProducts.includes(item.product_id);

                      return (
                        <Grid.Cell columnSpan={{ xs: 6, md: 4 }} key={item.product_id}>
                          <div style={{ padding: "4px" }}>
                            <Card>
                              <div style={{ padding: "16px", minHeight: "320px" }}>
                                <LegacyStack vertical>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <LegacyStack alignment="center" distribution="equalSpacing" spacing="tight">
                                      <Text variant="headingMd" as="h3">
                                        {item.title}
                                      </Text>
                                      <Badge tone={status as any}>{label}</Badge>
                                    </LegacyStack>
                                    <Button
                                      icon={isPinned ? <Icon source={PinFilledIcon} /> : <Icon source={PinIcon} />}
                                      onClick={() => togglePin(item.product_id)}
                                      variant="plain"
                                      tone={isPinned ? "success" : undefined}
                                    />
                                  </div>
                                  <Text variant="bodySm" as="p" tone="subdued">
                                    Vendor: {item.vendor}
                                  </Text>
                                  <Text variant="bodySm" as="p" tone="subdued">
                                    Score: {item.total_score}
                                  </Text>
                                  <div style={{ marginTop: "16px" }}>
                                    <LegacyStack vertical spacing="tight">
                                      {componentLabels.map((label, index) => (
                                        <Badge
                                          key={index}
                                          {...getComponentBadgeProps(label)}
                                        >
                                          {label}
                                        </Badge>
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
        <Layout.Section variant="oneThird">
          <SortingPanel />
        </Layout.Section>
      </Layout>
    </Page>
  );
} 