/*
  Warnings:

  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Order";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Order" (
    "productId" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "quantity" INTEGER NOT NULL,

    PRIMARY KEY ("productId", "purchaseDate"),
    CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
