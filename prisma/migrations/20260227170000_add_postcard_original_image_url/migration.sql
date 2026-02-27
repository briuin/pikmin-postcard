ALTER TABLE "Postcard"
ADD COLUMN IF NOT EXISTS "originalImageUrl" TEXT;

UPDATE "Postcard"
SET "originalImageUrl" = REPLACE("imageUrl", '/uploads/postcard/', '/uploads/original/')
WHERE "originalImageUrl" IS NULL
  AND "imageUrl" IS NOT NULL
  AND POSITION('/uploads/postcard/' IN "imageUrl") > 0;
