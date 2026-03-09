ALTER TABLE "UsageStats"
ADD COLUMN "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiCachedInputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiRequestCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "estimatedAiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "ModelUsageStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelUsageStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelUsageStat_userId_model_key" ON "ModelUsageStat"("userId", "model");
CREATE INDEX "ModelUsageStat_userId_estimatedCostUsd_idx" ON "ModelUsageStat"("userId", "estimatedCostUsd");

ALTER TABLE "ModelUsageStat" ADD CONSTRAINT "ModelUsageStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
