// Simple script to test database connection

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Test simple query
    const products = await prisma.product.findMany({
      take: 5,
      include: {
        variants: true
      }
    });
    
    console.log('Database connection successful!');
    console.log(`Found ${products.length} products`);
    
    // Test a raw query that previously failed
    const orders = await prisma.$queryRaw`
      SELECT 
        o.*,
        p.title as product_title,
        p.vendor as product_vendor,
        p."productType" as product_type
      FROM "Order" o
      JOIN "Product" p ON o."productId" = p.id
      ORDER BY o."purchaseDate" DESC
      LIMIT 5
    `;
    
    console.log(`Found ${orders.length} orders`);

  } catch (error) {
    console.error('Database connection error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();