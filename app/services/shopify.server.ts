import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import type { LoaderFunctionArgs } from "@remix-run/node";

export async function syncProducts(request: Request) {
  const { admin } = await authenticate.admin(request);
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query ($cursor: String) {
        products(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              description
              vendor
              productType
              status
              handle
              createdAt
              updatedAt
              variants(first: 250) {
                edges {
                  node {
                    id
                    sku
                    price
                    title
                    inventoryQuantity
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: { cursor },
    });
    const json = await response.json();

    const products = json.data.products.edges;
    
    for (const { node: product } of products) {
      await prisma.product.upsert({
        where: { id: product.id },
        create: {
          id: product.id,
          title: product.title,
          description: product.description,
          vendor: product.vendor,
          productType: product.productType,
          status: product.status,
          handle: product.handle,
          createdAt: new Date(product.createdAt),
          updatedAt: new Date(product.updatedAt),
        },
        update: {
          title: product.title,
          description: product.description,
          vendor: product.vendor,
          productType: product.productType,
          status: product.status,
          handle: product.handle,
          updatedAt: new Date(product.updatedAt),
        },
      });

      // Sync variants
      for (const { node: variant } of product.variants.edges) {
        await prisma.productVariant.upsert({
          where: { id: variant.id },
          create: {
            id: variant.id,
            productId: product.id,
            sku: variant.sku,
            price: parseFloat(variant.price),
            title: variant.title,
            inventory: variant.inventoryQuantity || 0,
            createdAt: new Date(variant.createdAt),
            updatedAt: new Date(variant.updatedAt),
          },
          update: {
            sku: variant.sku,
            price: parseFloat(variant.price),
            title: variant.title,
            inventory: variant.inventoryQuantity || 0,
            updatedAt: new Date(variant.updatedAt),
          },
        });
      }
    }

    hasNextPage = json.data.products.pageInfo.hasNextPage;
    cursor = json.data.products.pageInfo.endCursor;
  }
}

export async function syncOrders(request: Request) {
  const { admin } = await authenticate.admin(request);
  let hasNextPage = true;
  let cursor: string | null = null;

  // Calculate date 59 days ago
  const date59DaysAgo = new Date();
  date59DaysAgo.setDate(date59DaysAgo.getDate() - 29);
  const formattedDate = date59DaysAgo.toISOString().split('T')[0];

  while (hasNextPage) {
    const query = `
      query ($cursor: String) {
        orders(
          first: 250, 
          after: $cursor,
          query: "created_at:>=${formattedDate}"
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              createdAt
              processedAt
              displayFinancialStatus
              lineItems(first: 250) {
                edges {
                  node {
                    id
                    quantity
                    variant {
                      id
                      product {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: { cursor },
    });
    const json = await response.json();

    const orders = json.data.orders.edges;
    
    for (const { node: order } of orders) {
      await prisma.order.upsert({
        where: { id: order.id },
        create: {
          id: order.id,
          financialStatus: order.displayFinancialStatus,
          createdAt: new Date(order.createdAt),
          processedAt: order.processedAt ? new Date(order.processedAt) : null,
        },
        update: {
          financialStatus: order.displayFinancialStatus,
          processedAt: order.processedAt ? new Date(order.processedAt) : null,
        },
      });

      // Sync order items
      for (const { node: item } of order.lineItems.edges) {
        if (item.variant) {
          await prisma.orderItem.upsert({
            where: { id: item.id },
            create: {
              id: item.id,
              orderId: order.id,
              productId: item.variant.product.id,
              variantId: item.variant.id,
              quantity: item.quantity,
            },
            update: {
              quantity: item.quantity,
            },
          });
        }
      }
    }

    hasNextPage = json.data.orders.pageInfo.hasNextPage;
    cursor = json.data.orders.pageInfo.endCursor;
  }
} 