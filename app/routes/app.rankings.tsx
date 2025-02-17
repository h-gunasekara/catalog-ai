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
import { motion, AnimatePresence } from "framer-motion";
import { PinIcon, PinFilledIcon, DragHandleIcon, DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { 
  DropResult, 
  DroppableProvided, 
  DraggableProvided 
} from "@hello-pangea/dnd";

type RankingComponent = {
  new_in: number;
  bestseller: number;
  stock_based: number;
  sale_item: number;
  slow_mover: number;
};

type ProductRankingDisplay = {
  product_id: number;
  title: string;
  total_score: number;
  vendor: string;
  components: RankingComponent;
  image_url?: string;
};

type Collections = {
  [key: string]: ProductRankingDisplay[];
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

type OptimizationMetric = 'Conversion' | 'AOV' | 'Sell Through' | 'Product Views';

type OptimizationWeights = {
  [key in OptimizationMetric]: {
    formula: string;
    weights: Record<string, number>;
  };
};

const OPTIMIZATION_WEIGHTS: OptimizationWeights = {
  'Conversion': {
    formula: '(0.4 × Bestseller_Rank) + (0.3 × Trending_Score) + (0.3 × ATC_Rate)',
    weights: {
      bestseller: 0.4,
      trending: 0.3,
      atcRate: 0.3
    }
  },
  'AOV': {
    formula: '(0.5 × Price_Percentile) + (0.3 × Margin) + (0.2 × Historical_Sales)',
    weights: {
      pricePercentile: 0.5,
      margin: 0.3,
      historicalSales: 0.2
    }
  },
  'Sell Through': {
    formula: '(0.4 × Days_In_Stock) + (0.4 × Current_Stock_Level) + (0.2 × Sales_Velocity)',
    weights: {
      daysInStock: 0.4,
      stockLevel: 0.4,
      salesVelocity: 0.2
    }
  },
  'Product Views': {
    formula: '(0.6 × View_Count) + (0.25 × Click_Through_Rate) + (0.15 × Time_On_Page)',
    weights: {
      viewCount: 0.6,
      clickThroughRate: 0.25,
      timeOnPage: 0.15
    }
  }
};

type SortingPanelProps = {
  selectedMetric: OptimizationMetric;
  setSelectedMetric: (metric: OptimizationMetric) => void;
};

const springTransition = {
  type: "spring",
  stiffness: 250,
  damping: 30,
  mass: 0.5
};

const fadeInVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: {
      ...springTransition,
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  },
  exit: { 
    opacity: 0,
    scale: 0.95,
    transition: { 
      duration: 0.2,
      ease: [0.32, 0, 0.67, 0] 
    }
  }
};

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: springTransition
  },
  exit: { 
    y: 20, 
    opacity: 0,
    transition: { 
      duration: 0.2,
      ease: [0.32, 0, 0.67, 0]
    }
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  // Fetch collections with their products and rankings
  const collections = await prisma.$queryRaw`
    SELECT 
      c.id as collection_id,
      c.title as collection_title,
      p.id as product_id,
      p.title as product_title,
      p.vendor,
      p.imageUrl,
      p.createdAt,
      pr.score,
      pr.conversionScore,
      pr.aovScore,
      pr.sellThroughScore,
      pr.trafficScore
    FROM Collection c
    LEFT JOIN ProductCollection pc ON c.id = pc.collectionId
    LEFT JOIN Product p ON pc.productId = p.id
    LEFT JOIN ProductRanking pr ON p.id = pr.productId
    WHERE pr.id IN (
      SELECT id
      FROM ProductRanking pr2
      WHERE pr2.productId = p.id
      ORDER BY pr2.updatedAt DESC
      LIMIT 1
    )
  `;

  // Transform the data into the format expected by the frontend
  const collectionsData = (collections as any[]).reduce((acc: Collections, row) => {
    if (!acc[row.collection_title]) {
      acc[row.collection_title] = [];
    }

    if (row.product_id) {
      const placeholderImage = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png';
      
      acc[row.collection_title].push({
        product_id: parseInt(row.product_id),
        title: row.product_title,
        total_score: row.score || 0,
        vendor: row.vendor || '',
        image_url: row.imageUrl || placeholderImage,
        components: {
          new_in: isNewProduct(row.createdAt) ? 5 : 0,
          bestseller: row.conversionScore || 0,
          stock_based: row.sellThroughScore || 0,
          sale_item: row.aovScore < 0 ? Math.abs(row.aovScore) : 0,
          slow_mover: row.sellThroughScore < 0 ? Math.abs(row.sellThroughScore) : 0,
        }
      });
    }
    return acc;
  }, {});

  return json({ 
    detailedRankings: {
      collections: collectionsData,
      ranking_weights: {
        new_in: 5,
        bestseller: 10,
        slow_mover: 3,
        low_stock: 8,
        trending: 15,
        out_of_stock: -50,
        sale_item: -10,
      },
      configuration: {
        new_product_days: 30,
        bestseller_percentage: 10,
        low_stock_threshold: 50,
        trending_period_days: 7,
        trending_threshold: 2.0,
        sale_discount_threshold: 15,
      }
    }
  });
};

// Helper function to determine if a product is new
function isNewProduct(createdAt: string | Date): boolean {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return new Date(createdAt) > thirtyDaysAgo;
}

export default function Rankings() {
  const { detailedRankings } = useLoaderData<typeof loader>();
  const collections = Object.keys(detailedRankings.collections);
  const [selectedCollection, setSelectedCollection] = useState(collections[0]);
  const [pinnedProducts, setPinnedProducts] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [optimizedProducts, setOptimizedProducts] = useState<ProductRankingDisplay[]>([]);
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
  const calculateOptimizedRankings = (metric: OptimizationMetric, products: ProductRankingDisplay[]) => {
    return [...products].sort((a, b) => {
      const getScore = (product: ProductRankingDisplay): number => {
        switch (metric) {
          case 'Conversion':
            return product.components.bestseller; // Using conversionScore
          case 'AOV':
            return product.components.sale_item; // Using aovScore
          case 'Sell Through':
            return product.components.stock_based; // Using sellThroughScore
          case 'Product Views':
            return product.total_score; // Using trafficScore
          default:
            return product.total_score;
        }
      };

      const scoreA = getScore(a);
      const scoreB = getScore(b);
      return scoreB - scoreA; // Higher scores first
    });
  };

  // Effect to update rankings when collection or metric changes
  useEffect(() => {
    if (sortMode === 'optimize') {
      const products = detailedRankings.collections[selectedCollection];
      const optimized = calculateOptimizedRankings(selectedMetric, products);
      setOptimizedProducts(optimized);
    }
  }, [selectedCollection, selectedMetric, sortMode, detailedRankings]);

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
    const [applyScope, setApplyScope] = useState('This collection');
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
      <Box paddingBlockEnd="500">
        <Box paddingBlockEnd="300">
          <Text variant="headingMd" as="h3" alignment="start">{title}</Text>
        </Box>
        <div style={{ 
          minHeight: '100px', 
          padding: '16px',
          border: '2px dashed #e1e3e5',
          borderRadius: '8px'
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
                            {item}
                          </Badge>
                          <div style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            marginLeft: '4px'
                          }}>
                            <Icon source={DragHandleIcon} />
                          </div>
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
              pressed={applyScope === 'This collection'} 
              onClick={() => setApplyScope('This collection')}
              fullWidth
            >
              This collection
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
        <div style={{ padding: '24px' }}>
          <Box paddingBlockEnd="600">
            <Text variant="headingLg" as="h2" alignment="start">
              AI is optimizing for
            </Text>
            <Text variant="headingLg" as="h2" alignment="start">
         <span style={{color: '#00B259'}}>{selectedMetric}</span> ✨
            </Text>
          </Box>

          <Box paddingBlockEnd="600">
            <Box paddingBlockEnd="400">
              <Text variant="headingMd" as="h3" alignment="start">Metrics</Text>
              <Box paddingBlockStart="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  Select a metric below to sort this collection by.
                </Text>
              </Box>
            </Box>

            <Box paddingBlockStart="400">
              <LegacyStack vertical spacing="tight">
                <Button 
                  pressed={selectedMetric === 'Conversion'}
                  onClick={() => setSelectedMetric('Conversion')}
                  fullWidth
                  textAlign="start"
                >
                  <Text as="span" variant="bodyMd" tone={selectedMetric === 'Conversion' ? 'success' : undefined}>
                    Conversion
                  </Text>
                </Button>
                <Button 
                  pressed={selectedMetric === 'AOV'}
                  onClick={() => setSelectedMetric('AOV')}
                  fullWidth
                  textAlign="start"
                >
                  <Text as="span" variant="bodyMd" tone={selectedMetric === 'AOV' ? 'success' : undefined}>
                    AOV
                  </Text>
                </Button>
                <Button 
                  pressed={selectedMetric === 'Sell Through'}
                  onClick={() => setSelectedMetric('Sell Through')}
                  fullWidth
                  textAlign="start"
                >
                  <Text as="span" variant="bodyMd" tone={selectedMetric === 'Sell Through' ? 'success' : undefined}>
                    Sell Through
                  </Text>
                </Button>
              </LegacyStack>
            </Box>

            <Box paddingBlockStart="400">
              <Text as="p" variant="bodySm" tone="subdued">
                {selectedMetric === 'Conversion' ? 
                  "Based on sales data, product trends, and customer engagement" :
                  selectedMetric === 'AOV' ?
                  "Optimizing pricing, margins, and revenue performance" :
                  selectedMetric === 'Sell Through' ?
                  "Optimizing inventory levels, stock turnover, and sales velocity" :
                  "Measuring traffic, engagement, and browsing behavior"}
              </Text>
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
                  <motion.div
                    style={{ 
                      position: 'relative',
                      minHeight: displayProducts.length > 0 ? '400px' : '0'
                    }}
                  >
                    <AnimatePresence mode="popLayout">
                      <Grid>
                        {displayProducts.map((item: ProductRankingDisplay) => {
                          const { status, label } = getBadgeStatus(item.total_score);
                          const componentLabels = getComponentLabels(item.components);
                          const isPinned = pinnedProducts.includes(item.product_id);
                  
                          return (
                            <Grid.Cell columnSpan={{ xs: 6, md: 4 }} key={item.product_id}>
                              <motion.div
                                layout
                                layoutId={`card-${item.product_id}`}
                                variants={cardVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                style={{ 
                                  height: '100%',
                                  position: 'relative',
                                  transformOrigin: 'center center'
                                }}
                                transition={{
                                  layout: { 
                                    type: "spring",
                                    stiffness: 200,
                                    damping: 25
                                  }
                                }}
                              >
                                <Card padding="0">
                                  <motion.div 
                                    style={{ position: 'relative' }}
                                    layoutId={`card-content-${item.product_id}`}
                                  >
                                    <div style={{ 
                                      position: 'relative',
                                      width: '100%',
                                      paddingBottom: '170%',
                                      overflow: 'hidden',
                                      borderRadius: '8px 8px 0 0'
                                    }}>
                                      <motion.img 
                                        layoutId={`image-${item.product_id}`}
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
                                        transition={springTransition}
                                      />
                                    </div>
                                    <motion.div 
                                      style={{ 
                                        position: 'absolute', 
                                        top: '12px', 
                                        right: '12px',
                                        zIndex: 1 
                                      }}
                                      initial={{ scale: 0.8, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      transition={{ delay: 0.2, ...springTransition }}
                                    >
                                      <Button
                                        icon={isPinned ? <Icon source={PinFilledIcon} /> : <Icon source={PinIcon} />}
                                        onClick={() => togglePin(item.product_id)}
                                        variant="plain"
                                        tone={isPinned ? "success" : undefined}
                                      />
                                    </motion.div>
                                    <motion.div 
                                      layout
                                      style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        zIndex: 1,
                                        padding: '12px',
                                        display: 'flex',
                                        gap: '4px',
                                        flexWrap: 'wrap',
                                        alignItems: 'flex-end',
                                        background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)'
                                      }}
                                      initial={{ opacity: 0, y: 20 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: 0.1, ...springTransition }}
                                    >
                                      {componentLabels.map((label, index) => (
                                        <motion.div
                                          key={`${item.product_id}-${label}`}
                                          variants={fadeInVariants}
                                          custom={index}
                                          initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                          animate={{ 
                                            opacity: 1, 
                                            scale: 1, 
                                            y: 0,
                                            transition: {
                                              delay: index * 0.05,
                                              ...springTransition
                                            }
                                          }}
                                        >
                                          <Badge {...getComponentBadgeProps(label)}>
                                            {label}
                                          </Badge>
                                        </motion.div>
                                      ))}
                                    </motion.div>
                                  </motion.div>
                                  <motion.div 
                                    layout
                                    style={{ padding: '12px' }}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2, ...springTransition }}
                                  >
                                    <div style={{ 
                                      display: 'flex', 
                                      justifyContent: 'space-between', 
                                      alignItems: 'center'
                                    }}>
                                      <Text variant="headingMd" as="h3">
                                        {item.title}
                                      </Text>
                                      <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.3, ...springTransition }}
                                      >
                                        <Badge tone={status as any}>{label}</Badge>
                                      </motion.div>
                                    </div>
                                  </motion.div>
                                </Card>
                              </motion.div>
                            </Grid.Cell>
                          );
                        })}
                      </Grid>
                    </AnimatePresence>
                  </motion.div>
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