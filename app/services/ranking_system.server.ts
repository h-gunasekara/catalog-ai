import { PrismaClient, Product, type ProductRanking } from "@prisma/client";
import { addDays, subDays, differenceInDays } from "date-fns";

export class ProductRankingSystem {
  private prisma: PrismaClient;

  // AI Optimization Weights
  private optimizationWeights = {
    conversion_rate: {
      bestseller_rank: 0.4,
      trending_score: 0.3,
      atc_rate: 0.3,
    },
    aov: {
      price_percentile: 0.5,
      margin: 0.3,
      historical_sales: 0.2,
    },
    sell_through: {
      days_in_stock: 0.4,
      current_stock: 0.4,
      sales_velocity: 0.2,
    },
    traffic: {
      view_count: 0.6,
      click_through_rate: 0.25,
      time_on_page: 0.15,
    },
  };

  // Legacy weights for backward compatibility
  private weights = {
    new_in: 5,
    bestseller: 10,
    slow_mover: 3,
    low_stock: 8,
    trending: 15,
    out_of_stock: -50,
    sale_item: -10,
  };

  private config = {
    new_product_days: 30,
    bestseller_percentage: 10,
    low_stock_threshold: 50,
    trending_period_days: 7,
    trending_threshold: 2.0,
    sale_discount_threshold: 15,
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private getCurrentTimeUtc(): Date {
    return new Date();
  }

  private async calculateNewInScore(product: Product): Promise<number> {
    const daysSinceCreation = differenceInDays(
      this.getCurrentTimeUtc(),
      product.createdAt
    );
    return daysSinceCreation <= this.config.new_product_days
      ? this.weights.new_in
      : 0;
  }

  private async calculateBestsellerScore(
    productId: string,
    allPurchases: { productId: string; quantity: number }[]
  ): Promise<number> {
    const productPurchases = allPurchases.filter((p) => p.productId === productId);
    if (productPurchases.length > 0) {
      const totalSales = productPurchases.reduce(
        (sum, purchase) => sum + purchase.quantity,
        0
      );
      
      // Calculate total sales for each product
      const allProductSales = new Map<string, number>();
      allPurchases.forEach((purchase) => {
        const currentTotal = allProductSales.get(purchase.productId) || 0;
        allProductSales.set(
          purchase.productId,
          currentTotal + purchase.quantity
        );
      });

      // Convert to array and sort for percentile calculation
      const salesValues = Array.from(allProductSales.values()).sort((a, b) => a - b);
      const percentileIndex = Math.floor(
        salesValues.length * (1 - this.config.bestseller_percentage / 100)
      );
      
      if (totalSales >= (salesValues[percentileIndex] || 0)) {
        return this.weights.bestseller;
      }
    }
    return 0;
  }

  private async calculateStockBasedScore(product: Product): Promise<number> {
    // Get total inventory from variants
    const variants = await this.prisma.productVariant.findMany({
      where: { productId: product.id },
    });
    
    const totalInventory = variants.reduce(
      (sum, variant) => sum + variant.inventory,
      0
    );

    if (totalInventory <= 0) {
      return this.weights.out_of_stock;
    } else if (totalInventory <= this.config.low_stock_threshold) {
      return this.weights.low_stock;
    }
    return 0;
  }

  private async calculateTrendingScore(
    productId: string,
    allPurchases: { productId: string; purchaseDate: Date; quantity: number }[]
  ): Promise<number> {
    const currentTime = this.getCurrentTimeUtc();
    const trendingPeriodStart = subDays(currentTime, this.config.trending_period_days);
    const previousPeriodStart = subDays(trendingPeriodStart, this.config.trending_period_days);

    const recentPurchases = allPurchases.filter(
      (p) =>
        p.productId === productId && p.purchaseDate > trendingPeriodStart
    );

    const previousPurchases = allPurchases.filter(
      (p) =>
        p.productId === productId &&
        p.purchaseDate <= trendingPeriodStart &&
        p.purchaseDate > previousPeriodStart
    );

    const recentSales = recentPurchases.reduce(
      (sum, purchase) => sum + purchase.quantity,
      0
    );
    const previousSales = previousPurchases.reduce(
      (sum, purchase) => sum + purchase.quantity,
      0
    );

    if (previousSales > 0) {
      const salesRatio = recentSales / previousSales;
      if (salesRatio >= this.config.trending_threshold) {
        return this.weights.trending;
      }
    } else if (recentSales > 0) {
      return this.weights.trending;
    }

    return 0;
  }

  private async calculateConversionRateScore(
    product: Product,
    allPurchases: { productId: string; purchaseDate: Date; quantity: number }[]
  ): Promise<number> {
    const bestsellerRank =
      (await this.calculateBestsellerScore(product.id, allPurchases)) /
      this.weights.bestseller;
    const trendingScore =
      (await this.calculateTrendingScore(product.id, allPurchases)) /
      this.weights.trending;

    // Since we don't have view data in the schema, we'll use a default atc_rate
    const atcRate = 0.5; // Default value since we don't have view data

    const weights = this.optimizationWeights.conversion_rate;
    return (
      weights.bestseller_rank * bestsellerRank +
      weights.trending_score * trendingScore +
      weights.atc_rate * atcRate
    );
  }

  private async calculateAovScore(
    product: Product,
    allPurchases: { productId: string; purchaseDate: Date; quantity: number }[]
  ): Promise<number> {
    // Get product variants for price calculation
    const variants = await this.prisma.productVariant.findMany({
      where: { productId: product.id },
    });

    const avgPrice =
      variants.reduce((sum, variant) => sum + variant.price, 0) / variants.length;

    // Get all product prices for percentile calculation
    const allVariants = await this.prisma.productVariant.findMany();
    const allPrices = allVariants.map((v) => v.price).sort((a, b) => a - b);
    const pricePercentile =
      allPrices.filter((price) => price <= avgPrice).length / allPrices.length;

    // Calculate margin (using a default 50% margin since we don't have compare-at prices)
    const margin = 0.5;

    // Historical sales value
    const productPurchases = allPurchases.filter(
      (p) => p.productId === product.id
    );
    const historicalSales = productPurchases.reduce(
      (sum, purchase) => sum + purchase.quantity * avgPrice,
      0
    );

    // Calculate max historical sales
    const salesByProduct = new Map<string, number>();
    allPurchases.forEach((purchase) => {
      const currentTotal = salesByProduct.get(purchase.productId) || 0;
      salesByProduct.set(
        purchase.productId,
        currentTotal + purchase.quantity * avgPrice
      );
    });

    const maxHistoricalSales = Math.max(
      ...Array.from(salesByProduct.values())
    );

    const historicalSalesNormalized =
      maxHistoricalSales > 0 ? historicalSales / maxHistoricalSales : 0;

    const weights = this.optimizationWeights.aov;
    return (
      weights.price_percentile * pricePercentile +
      weights.margin * margin +
      weights.historical_sales * historicalSalesNormalized
    );
  }

  private async calculateSellThroughScore(
    product: Product,
    allPurchases: { productId: string; purchaseDate: Date; quantity: number }[]
  ): Promise<number> {
    const daysInStock = differenceInDays(
      this.getCurrentTimeUtc(),
      product.createdAt
    );
    const daysNormalized = Math.min(daysInStock / 365, 1);

    // Get current stock level
    const variants = await this.prisma.productVariant.findMany({
      where: { productId: product.id },
    });
    const currentStock = variants.reduce(
      (sum, variant) => sum + variant.inventory,
      0
    );
    const maxStock = (
      await this.prisma.productVariant.aggregate({
        _sum: { inventory: true },
      })
    )._sum.inventory || 1;
    const stockLevelNormalized = 1 - currentStock / maxStock;

    // Sales velocity calculation
    const recentDate = subDays(this.getCurrentTimeUtc(), 30);
    const recentPurchases = allPurchases.filter(
      (p) => p.productId === product.id && p.purchaseDate > recentDate
    );
    const salesVelocity = recentPurchases.length / 30;

    // Calculate max velocity
    const velocityByProduct = new Map<string, number>();
    allPurchases
      .filter((p) => p.purchaseDate > recentDate)
      .forEach((purchase) => {
        const count = (velocityByProduct.get(purchase.productId) || 0) + 1;
        velocityByProduct.set(purchase.productId, count);
      });

    const maxVelocity = Math.max(...Array.from(velocityByProduct.values())) / 30;
    const velocityNormalized = maxVelocity > 0 ? salesVelocity / maxVelocity : 0;

    const weights = this.optimizationWeights.sell_through;
    return (
      weights.days_in_stock * daysNormalized +
      weights.current_stock * stockLevelNormalized +
      weights.sales_velocity * velocityNormalized
    );
  }

  private calculateTrafficScore(): number {
    // Since we don't have traffic data in the schema, return a neutral score
    return 0.5;
  }

  private async calculateRankingScore(
    product: Product,
    allPurchases: { productId: string; purchaseDate: Date; quantity: number }[]
  ): Promise<void> {
    const conversionScore = await this.calculateConversionRateScore(
      product,
      allPurchases
    );
    const aovScore = await this.calculateAovScore(product, allPurchases);
    const sellThroughScore = await this.calculateSellThroughScore(
      product,
      allPurchases
    );
    const trafficScore = this.calculateTrafficScore();

    // Ensure all scores are valid numbers, default to 0 if NaN
    const validatedScores = {
      conversionScore: isNaN(conversionScore) ? 0 : conversionScore,
      aovScore: isNaN(aovScore) ? 0 : aovScore,
      sellThroughScore: isNaN(sellThroughScore) ? 0 : sellThroughScore,
      trafficScore: isNaN(trafficScore) ? 0 : trafficScore
    };

    const totalScore = (
      validatedScores.conversionScore + 
      validatedScores.aovScore + 
      validatedScores.sellThroughScore + 
      validatedScores.trafficScore
    ) / 4;

    // Store the ranking in the database
    await this.prisma.productRanking.upsert({
      where: {
        productId_updatedAt: {
          productId: product.id,
          updatedAt: this.getCurrentTimeUtc(),
        },
      },
      create: {
        score: totalScore,
        conversionScore: validatedScores.conversionScore,
        aovScore: validatedScores.aovScore,
        sellThroughScore: validatedScores.sellThroughScore,
        trafficScore: validatedScores.trafficScore,
        product: {
          connect: {
            id: product.id
          }
        }
      },
      update: {
        score: totalScore,
        conversionScore: validatedScores.conversionScore,
        aovScore: validatedScores.aovScore,
        sellThroughScore: validatedScores.sellThroughScore,
        trafficScore: validatedScores.trafficScore
      },
    });
  }

  public async updateAllRankings(): Promise<void> {
    const products = await this.prisma.product.findMany();
    const allPurchases = await this.prisma.productPurchase.findMany({
      select: {
        productId: true,
        purchaseDate: true,
        quantity: true,
      },
    });

    for (const product of products) {
      await this.calculateRankingScore(product, allPurchases);
    }
  }

  public async getRankedProducts(options?: {
    limit?: number;
    category?: string;
    vendor?: string;
  }): Promise<ProductRanking[]> {
    const where = {
      product: {
        ...(options?.category ? { productType: options.category } : {}),
        ...(options?.vendor ? { vendor: options.vendor } : {}),
      },
    };

    return this.prisma.productRanking.findMany({
      where,
      orderBy: { score: 'desc' },
      take: options?.limit,
      include: {
        product: true,
      },
    });
  }

  public updateWeights(newWeights: Partial<typeof this.weights>): void {
    this.weights = { ...this.weights, ...newWeights };
    this.updateAllRankings();
  }

  public updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    this.updateAllRankings();
  }
} 