import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
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
  Thumbnail,
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
import fs from "fs/promises";

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
  image_url?: string;
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

type SortMode = "manual" | "automate" | "optimize";

// Add new types at the top of the file
type OptimizationMetric = 'Conversion' | 'Sell-Through' | 'AOV';

// Use the imported data directly
const detailedRankings = detailedRankingsData as DetailedRankings;

// Add new types at the top of the file after other type definitions
type SortingPanelProps = {
  selectedMetric: OptimizationMetric;
  setSelectedMetric: (metric: OptimizationMetric) => void;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  // Read and parse products.csv to get image URLs
  const productsData = await fs.readFile('dev/recommendation-engine/products.csv', 'utf-8');
  const productRows = productsData.split('\n').slice(1); // Skip header row
  const productImages = new Map();
  
  const parseCSVRow = (row: string) => {
    const matches = row.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g);
    if (!matches) return [];
    return matches.map(value => 
      value.startsWith(',') ? value.slice(1) : value
    ).map(value => 
      value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value
    );
  };

  productRows.forEach((row) => {
    try {
      if (!row.trim()) return; // Skip empty rows
      
      const columns = parseCSVRow(row);
      if (columns.length >= 21) {
        const productId = parseInt(columns[0]);
        let imageUrl = columns[20]?.trim();
        
        // Remove any surrounding quotes
        if (imageUrl?.startsWith('"') && imageUrl?.endsWith('"')) {
          imageUrl = imageUrl.slice(1, -1);
        }
        
        if (productId && imageUrl && typeof imageUrl === 'string' && 
            (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
          productImages.set(productId, imageUrl);
        }
      }
    } catch (error) {
      // Silently skip any rows that can't be processed
    }
  });

  // Add image URLs to the rankings data
  const rankingsWithImages = {
    ...detailedRankings,
    collections: Object.fromEntries(
      Object.entries(detailedRankings.collections).map(([key, products]) => [
        key,
        products.map(product => ({
          ...product,
          image_url: productImages.get(product.product_id) || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png'
        }))
      ])
    )
  };

  return json({ detailedRankings: rankingsWithImages });
};

export default function Rankings() {
  const { detailedRankings } = useLoaderData<typeof loader>();
  const collections = Object.keys(detailedRankings.collections);
  const [selectedCollection, setSelectedCollection] = useState(collections[0]);
  const [pinnedProducts, setPinnedProducts] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [optimizedProducts, setOptimizedProducts] = useState<ProductRanking[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<OptimizationMetric>('Conversion');
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

  // Function to calculate optimized rankings
  const calculateOptimizedRankings = (metric: OptimizationMetric, products: ProductRanking[]) => {
    return [...products].sort((a, b) => {
      switch (metric) {
        case 'Conversion':
          // Conversion Score = (Sales/Product Views) × 100
          const aConversion = (a.components.bestseller / 100);
          const bConversion = (b.components.bestseller / 100);
          return bConversion - aConversion;
        
        case 'Sell-Through':
          // Sell-Through Score = Units Sold / (Beginning Inventory + Received Inventory - Ending Inventory)
          const aSellThrough = a.components.stock_based;
          const bSellThrough = b.components.stock_based;
          return bSellThrough - aSellThrough;
        
        case 'AOV':
          // AOV Score = ∑Revenue from Product / ∑Orders Containing Product
          const aAOV = a.components.bestseller * (a.total_score || 0);
          const bAOV = b.components.bestseller * (b.total_score || 0);
          return bAOV - aAOV;
        
        default:
          return b.total_score - a.total_score;
      }
    });
  };

  // Effect to update rankings when collection or metric changes
  useEffect(() => {
    if (sortMode === 'optimize') {
      const products = detailedRankings.collections[selectedCollection];
      const optimized = calculateOptimizedRankings(selectedMetric, products);
      setOptimizedProducts(optimized);
    }
  }, [selectedCollection, selectedMetric, sortMode]);

  // Get the products to display based on sort mode
  const getDisplayProducts = () => {
    const currentCollection = detailedRankings.collections[selectedCollection];
    
    if (sortMode === 'optimize') {
      return optimizedProducts;
    }
    
    // Sort products to show pinned items first for manual mode
    return [...currentCollection].sort((a, b) => {
      const aIsPinned = pinnedProducts.includes(a.product_id);
      const bIsPinned = pinnedProducts.includes(b.product_id);
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      return 0;
    });
  };

  const displayProducts = getDisplayProducts();

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

  const SortingPanel = ({ selectedMetric, setSelectedMetric }: SortingPanelProps) => {
    const [selectedBoostTags, setSelectedBoostTags] = useState(['Best Sellers', 'New In']);
    const [selectedSinkTags, setSelectedSinkTags] = useState(['Out of Stock']);
    const [applyScope, setApplyScope] = useState('Locally');
    const [categoryType, setCategoryType] = useState('Traits');

    const renderManualMode = () => (
      <div style={{ padding: '16px' }}>
        <Text variant="headingMd" as="h2">Collection Page Sorting</Text>
        <div style={{ marginTop: '16px' }}>
          <Text as="p" variant="bodyMd">
            Drag and drop styles to edit the collection page. Click preview to switch to shopper view and Publish when you're ready!
          </Text>
        </div>
      </div>
    );

    const renderAutomateMode = () => {
    type DragItemsState = {
      boost: string[];
      sink: string[];
      categories: string[];
    };

    const [dragItems, setDragItems] = useState<DragItemsState>({
      boost: ['NEW IN', 'BESTSELLER'],
      sink: ['LOW STOCK', 'ON SALE', 'SLOW MOVER'],
      categories: []
    });

    const handleDragEnd = (result: DropResult) => {
      if (!result.destination) return;

      const { source, destination } = result;
        const sourceList = dragItems[source.droppableId as keyof typeof dragItems];
        const destList = dragItems[destination.droppableId as keyof typeof dragItems];

        const [removed] = sourceList.splice(source.index, 1);
        destList.splice(destination.index, 0, removed);

        setDragItems({
          ...dragItems,
          [source.droppableId]: sourceList,
          [destination.droppableId]: destList
        });
    };

    const DroppableArea = ({ id, title, items }: { id: string; title: string; items: string[] }) => (
      <Box paddingBlockEnd="400">
          <Text variant="headingMd" as="h2">{title}</Text>
        <div style={{ 
            minHeight: '100px', 
            padding: '8px',
          border: '2px dashed #e1e3e5',
          borderRadius: '8px',
            marginTop: '8px'
        }}>
            <Droppable droppableId={id}>
              {(provided: DroppableProvided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                <LegacyStack spacing="tight" wrap>
                    {items.map((item, index) => (
                      <Draggable key={item} draggableId={item} index={index}>
                        {(provided: DraggableProvided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...provided.draggableProps.style,

                              display: 'inline-block',
                              margin: '4px'
                            }}
                          >
                            <Badge {...getComponentBadgeProps(item)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icon source={DragHandleIcon} />
                              {item}
                              </div>
                            </Badge>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                </LegacyStack>
              </div>
            )}
          </Droppable>
        </div>
      </Box>
    );

      return (
      <div style={{ padding: '16px' }}>
        <Box paddingBlockEnd="400">
          <Text variant="headingMd" as="h2">Apply</Text>
          <ButtonGroup>
            <Button 
              pressed={applyScope === 'Locally'} 
              onClick={() => setApplyScope('Locally')}
              fullWidth
            >
              Locally
            </Button>
            <Button 
              pressed={applyScope === 'Globally'} 
              onClick={() => setApplyScope('Globally')}
              fullWidth
            >
              Globally
            </Button>
          </ButtonGroup>
        </Box>

        <DragDropContext onDragEnd={handleDragEnd}>
            <DroppableArea id="boost" title="Boost" items={dragItems.boost} />
            <DroppableArea id="sink" title="Sink" items={dragItems.sink} />
                <Box>
                  <Text variant="headingMd" as="h2">Categories</Text>
                  <ButtonGroup>
                    <Button 
                      pressed={categoryType === 'Traits'} 
                      onClick={() => setCategoryType('Traits')}
                      fullWidth
                    >
                      Traits
                    </Button>
                    <Button 
                      pressed={categoryType === 'Tags'} 
                      onClick={() => setCategoryType('Tags')}
                      fullWidth
                    >
                      Tags
                    </Button>
                  </ButtonGroup>

                  <Box paddingBlockStart="400">
                <DroppableArea id="categories" title="" items={dragItems.categories} />
                  </Box>
                </Box>
        </DragDropContext>
      </div>
    );
    };

    const renderOptimizeMode = () => {
      return (
        <div style={{ padding: '16px' }}>
          <Box paddingBlockEnd="400">
            <Text variant="headingMd" as="h2">Let AI Decide ✨</Text>
            <Box paddingBlockStart="400">
              <Button tone="success" fullWidth>{selectedMetric}</Button>
            </Box>
          </Box>

          <Box paddingBlockEnd="400">
            <Text as="p" variant="bodyMd">
              Select a metric to optimize and let AI auto-sort your collection page!
            </Text>
          </Box>

          <Box>
            <Text variant="headingMd" as="h2">Metrics</Text>
            <Box paddingBlockStart="400">
              <ButtonGroup>
                <Button 
                  pressed={selectedMetric === 'Conversion'}
                  onClick={() => setSelectedMetric('Conversion')}
                  fullWidth
                >
                  Conversion
                </Button>
                <Button 
                  pressed={selectedMetric === 'Sell-Through'}
                  onClick={() => setSelectedMetric('Sell-Through')}
                  fullWidth
                >
                  Sell-Through
                </Button>
                <Button 
                  pressed={selectedMetric === 'AOV'}
                  onClick={() => setSelectedMetric('AOV')}
                  fullWidth
                >
                  $ AOV
                </Button>
              </ButtonGroup>
            </Box>
          </Box>
        </div>
      );
    };

    return (
      <Card>
        <Box padding="400">
          <ButtonGroup>
            <Button
              pressed={sortMode === 'manual'}
              onClick={() => handleSortModeChange('manual')}
              fullWidth
            >
              Manual
            </Button>
            <Button
              pressed={sortMode === 'automate'}
              onClick={() => handleSortModeChange('automate')}
              fullWidth
            >
              Automate
            </Button>
            <Button
              pressed={sortMode === 'optimize'}
              onClick={() => handleSortModeChange('optimize')}
              fullWidth
            >
              Optimize
            </Button>
          </ButtonGroup>
        </Box>

        {sortMode === 'manual' && renderManualMode()}
        {sortMode === 'automate' && renderAutomateMode()}
        {sortMode === 'optimize' && renderOptimizeMode()}
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
                    {displayProducts.map((item: ProductRanking) => {
                      const { status, label } = getBadgeStatus(item.total_score);
                      const componentLabels = getComponentLabels(item.components);
                      const isPinned = pinnedProducts.includes(item.product_id);
                
                      return (
                        <Grid.Cell columnSpan={{ xs: 6, md: 4 }} key={item.product_id}>
                          <Card padding="0">
                            <div style={{ position: 'relative' }}>
                              <div style={{ 
                                position: 'relative',
                                width: '100%',
                                paddingBottom: '170%', // Changed from 100% to 133% for taller 4:3 aspect ratio
                                overflow: 'hidden'
                              }}>
                                <img 
                                  src={item.image_url} 
                                  alt={item.title}
                                  style={{ 
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                />
                              </div>
                              <div style={{ 
                                position: 'absolute', 
                                top: '12px', 
                                right: '12px',
                                zIndex: 1 
                              }}>
                                <Button
                                  icon={isPinned ? <Icon source={PinFilledIcon} /> : <Icon source={PinIcon} />}
                                  onClick={() => togglePin(item.product_id)}
                                  variant="plain"
                                  tone={isPinned ? "success" : undefined}
                                />
                              </div>
                              <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                zIndex: 1,
                                padding: '12px',
                                display: 'flex',
                                gap: '4px',
                                flexWrap: 'wrap',
                                alignItems: 'flex-end'
                              }}>
                                {componentLabels.map((label, index) => (
                                  <Badge
                                    key={index}
                                    {...getComponentBadgeProps(label)}
                                  >
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text variant="headingMd" as="h3">
                                  {item.title}
                                </Text>
                                <Badge tone={status as any}>{label}</Badge>
                              </div>
                            </div>
                          </Card>
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
          <SortingPanel 
            selectedMetric={selectedMetric}
            setSelectedMetric={setSelectedMetric}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
} 