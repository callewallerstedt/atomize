import { prisma } from "@/lib/db";

type ModelPricing = {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Estimated from current OpenAI API pricing. gpt-5.2 is billed using gpt-5 rates.
  "gpt-5": { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
  "gpt-5-mini": { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2 },
  "gpt-5-nano": { inputPerMillion: 0.05, cachedInputPerMillion: 0.005, outputPerMillion: 0.4 },
  "gpt-4.1": { inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 8 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, cachedInputPerMillion: 0.1, outputPerMillion: 1.6 },
  "gpt-4.1-nano": { inputPerMillion: 0.1, cachedInputPerMillion: 0.025, outputPerMillion: 0.4 },
  "gpt-4o": { inputPerMillion: 2.5, cachedInputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-4o-mini": { inputPerMillion: 0.15, cachedInputPerMillion: 0.075, outputPerMillion: 0.6 },
  "o4-mini": { inputPerMillion: 1.1, cachedInputPerMillion: 0.275, outputPerMillion: 4.4 },
};

type RecordModelUsageInput = {
  userId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  requestCount?: number;
};

function clampInt(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value || 0));
}

export function normalizeModelName(model: string): string {
  const value = String(model || "unknown").trim();
  if (!value) return "unknown";
  if (value === "gpt-5.2" || value.startsWith("gpt-5.2-")) return "gpt-5.2";
  if (value === "gpt-5" || value.startsWith("gpt-5-")) return "gpt-5";
  if (value === "gpt-5-mini" || value.startsWith("gpt-5-mini-")) return "gpt-5-mini";
  if (value === "gpt-5-nano" || value.startsWith("gpt-5-nano-")) return "gpt-5-nano";
  if (value === "gpt-4.1" || value.startsWith("gpt-4.1-")) return "gpt-4.1";
  if (value === "gpt-4.1-mini" || value.startsWith("gpt-4.1-mini-")) return "gpt-4.1-mini";
  if (value === "gpt-4.1-nano" || value.startsWith("gpt-4.1-nano-")) return "gpt-4.1-nano";
  if (value === "gpt-4o" || value.startsWith("gpt-4o-")) return "gpt-4o";
  if (value === "gpt-4o-mini" || value.startsWith("gpt-4o-mini-")) return "gpt-4o-mini";
  if (value === "o4-mini" || value.startsWith("o4-mini-")) return "o4-mini";
  return value;
}

function pricingForModel(model: string): ModelPricing | null {
  const normalized = normalizeModelName(model);
  if (normalized === "gpt-5.2") {
    return MODEL_PRICING["gpt-5"];
  }
  return MODEL_PRICING[normalized] || null;
}

export function estimateModelCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0
) {
  const pricing = pricingForModel(model);
  if (!pricing) return 0;
  const safeInput = clampInt(inputTokens);
  const safeOutput = clampInt(outputTokens);
  const safeCached = Math.min(clampInt(cachedInputTokens), safeInput);
  const nonCachedInput = Math.max(0, safeInput - safeCached);

  return (
    (nonCachedInput / 1_000_000) * pricing.inputPerMillion +
    (safeCached / 1_000_000) * pricing.cachedInputPerMillion +
    (safeOutput / 1_000_000) * pricing.outputPerMillion
  );
}

export async function recordModelUsage({
  userId,
  model,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  requestCount,
}: RecordModelUsageInput) {
  const normalizedModel = normalizeModelName(model);
  const safeInput = clampInt(inputTokens);
  const safeOutput = clampInt(outputTokens);
  const safeCached = Math.min(clampInt(cachedInputTokens), safeInput);
  const safeRequests = Math.max(1, clampInt(requestCount));

  if (!userId || (!safeInput && !safeOutput && !safeCached && !safeRequests)) {
    return;
  }

  const estimatedCostUsd = estimateModelCostUsd(normalizedModel, safeInput, safeOutput, safeCached);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.usageStats.upsert({
        where: { userId },
        create: {
          userId,
          aiInputTokens: safeInput,
          aiOutputTokens: safeOutput,
          aiCachedInputTokens: safeCached,
          aiRequestCount: safeRequests,
          estimatedAiCostUsd: estimatedCostUsd,
        },
        update: {
          aiInputTokens: { increment: safeInput },
          aiOutputTokens: { increment: safeOutput },
          aiCachedInputTokens: { increment: safeCached },
          aiRequestCount: { increment: safeRequests },
          estimatedAiCostUsd: { increment: estimatedCostUsd },
        },
      });

      await tx.modelUsageStat.upsert({
        where: {
          userId_model: {
            userId,
            model: normalizedModel,
          },
        },
        create: {
          userId,
          model: normalizedModel,
          inputTokens: safeInput,
          outputTokens: safeOutput,
          cachedInputTokens: safeCached,
          requestCount: safeRequests,
          estimatedCostUsd,
          lastUsedAt: new Date(),
        },
        update: {
          inputTokens: { increment: safeInput },
          outputTokens: { increment: safeOutput },
          cachedInputTokens: { increment: safeCached },
          requestCount: { increment: safeRequests },
          estimatedCostUsd: { increment: estimatedCostUsd },
          lastUsedAt: new Date(),
        },
      });
    });
  } catch (err) {
    console.error("[usage-tracking] Model usage error:", err);
  }
}

export async function incrementUsage(
  userId: string,
  type: "coursesCreated" | "lessonsGenerated" | "apiCalls"
) {
  try {
    await prisma.usageStats.upsert({
      where: { userId },
      create: {
        userId,
        [type]: 1,
      },
      update: {
        [type]: { increment: 1 },
      },
    });
  } catch (err) {
    console.error("[usage-tracking] Error:", err);
  }
}

export async function getUsageStats(userId: string) {
  try {
    const stats = await prisma.usageStats.findUnique({
      where: { userId },
    });
    return stats || {
      coursesCreated: 0,
      lessonsGenerated: 0,
      apiCalls: 0,
      aiInputTokens: 0,
      aiOutputTokens: 0,
      aiCachedInputTokens: 0,
      aiRequestCount: 0,
      estimatedAiCostUsd: 0,
    };
  } catch (err) {
    console.error("[usage-tracking] Error:", err);
    return {
      coursesCreated: 0,
      lessonsGenerated: 0,
      apiCalls: 0,
      aiInputTokens: 0,
      aiOutputTokens: 0,
      aiCachedInputTokens: 0,
      aiRequestCount: 0,
      estimatedAiCostUsd: 0,
    };
  }
}

export async function resetMonthlyUsage(userId: string) {
  try {
    await prisma.usageStats.update({
      where: { userId },
      data: {
        coursesCreated: 0,
        lessonsGenerated: 0,
        apiCalls: 0,
        aiInputTokens: 0,
        aiOutputTokens: 0,
        aiCachedInputTokens: 0,
        aiRequestCount: 0,
        estimatedAiCostUsd: 0,
        lastResetAt: new Date(),
      },
    });
    await prisma.modelUsageStat.deleteMany({
      where: { userId },
    });
  } catch (err) {
    console.error("[usage-tracking] Error:", err);
  }
}


