/*
  Warnings:

  - You are about to drop the column `description` on the `Collection` table. All the data in the column will be lost.
  - The primary key for the `ProductCollection` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `ProductCollection` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `ProductCollection` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Collection" ("createdAt", "handle", "id", "title", "updatedAt") SELECT "createdAt", "handle", "id", "title", "updatedAt" FROM "Collection";
DROP TABLE "Collection";
ALTER TABLE "new_Collection" RENAME TO "Collection";
CREATE TABLE "new_ProductCollection" (
    "productId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,

    PRIMARY KEY ("productId", "collectionId"),
    CONSTRAINT "ProductCollection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductCollection" ("collectionId", "productId") SELECT "collectionId", "productId" FROM "ProductCollection";
DROP TABLE "ProductCollection";
ALTER TABLE "new_ProductCollection" RENAME TO "ProductCollection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
