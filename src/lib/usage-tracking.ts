import { prisma } from "@/lib/db";

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
    };
  } catch (err) {
    console.error("[usage-tracking] Error:", err);
    return {
      coursesCreated: 0,
      lessonsGenerated: 0,
      apiCalls: 0,
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
        lastResetAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[usage-tracking] Error:", err);
  }
}


