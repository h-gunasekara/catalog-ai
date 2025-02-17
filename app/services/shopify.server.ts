import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

// Helper function to extract numeric ID from Shopify GID
function extractNumericId(gid: string): string {
  return gid.split('/').pop() || gid;
}

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
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
              collections(first: 250) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
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
        where: { id: extractNumericId(product.id) },
        create: {
          id: extractNumericId(product.id),
          title: product.title,
          description: product.description,
          vendor: product.vendor,
          productType: product.productType,
          status: product.status,
          handle: product.handle,
          createdAt: new Date(product.createdAt),
          updatedAt: new Date(product.updatedAt),
          imageUrl: product.images.edges[0]?.node.url || null,
        },
        update: {
          title: product.title,
          description: product.description,
          vendor: product.vendor,
          productType: product.productType,
          status: product.status,
          handle: product.handle,
          updatedAt: new Date(product.updatedAt),
          imageUrl: product.images.edges[0]?.node.url || null,
        },
      });

      // Sync collections
      for (const { node: collection } of product.collections.edges) {
        // Upsert collection
        await prisma.collection.upsert({
          where: { id: extractNumericId(collection.id) },
          create: {
            id: extractNumericId(collection.id),
            title: collection.title,
            handle: collection.handle,
          },
          update: {
            title: collection.title,
            handle: collection.handle,
          },
        });

        // Create product-collection relationship
        await prisma.productCollection.upsert({
          where: {
            productId_collectionId: {
              productId: extractNumericId(product.id),
              collectionId: extractNumericId(collection.id),
            },
          },
          create: {
            productId: extractNumericId(product.id),
            collectionId: extractNumericId(collection.id),
          },
          update: {},
        });
      }

      // Sync variants
      for (const { node: variant } of product.variants.edges) {
        await prisma.productVariant.upsert({
          where: { id: extractNumericId(variant.id) },
          create: {
            id: extractNumericId(variant.id),
            productId: extractNumericId(product.id),
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
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              createdAt
              lineItems(first: 250) {
                edges {
                  node {
                    quantity
                    variant {
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
      const orderDate = new Date(order.createdAt);
      
      // Process each line item in the order
      for (const { node: item } of order.lineItems.edges) {
        if (item.variant?.product) {
          const productId = extractNumericId(item.variant.product.id);
          
          try {
            // First check if the product exists
            const product = await prisma.product.findUnique({
              where: { id: productId }
            });

            if (product) {
              await prisma.productPurchase.upsert({
                where: {
                  productId_purchaseDate: {
                    productId: productId,
                    purchaseDate: orderDate
                  }
                },
                create: {
                  productId: productId,
                  purchaseDate: orderDate,
                  quantity: item.quantity
                },
                update: {}
              });
            } else {
              console.log(`Skipping purchase record for product ${productId} - product not found in database`);
            }
          } catch (error) {
            console.error(`Error processing purchase for product ${productId}:`, error);
          }
        }
      }
    }

    hasNextPage = json.data.orders.pageInfo.hasNextPage;
    cursor = json.data.orders.pageInfo.endCursor;
  }
}