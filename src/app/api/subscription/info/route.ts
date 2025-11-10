import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUsageStats } from "@/lib/usage-tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        subscriptionLevel: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        billingPeriod: true,
        paymentStatus: true,
        promoCodeUsed: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const usage = await getUsageStats(user.id);

    return NextResponse.json({
      ok: true,
      subscription: {
        level: dbUser.subscriptionLevel,
        start: dbUser.subscriptionStart,
        end: dbUser.subscriptionEnd,
        billingPeriod: dbUser.billingPeriod,
        paymentStatus: dbUser.paymentStatus,
        promoCodeUsed: dbUser.promoCodeUsed,
      },
      usage,
    });
  } catch (err: any) {
    console.error("[subscription/info] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}


