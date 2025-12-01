import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin (cwallerstedt)
    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser?.username !== "cwallerstedt") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Get count of users with each subscription level before reset
    const beforeReset = {
      free: await prisma.user.count({ where: { subscriptionLevel: "Free" } }),
      paid: await prisma.user.count({ where: { subscriptionLevel: "Paid" } }),
      tester: await prisma.user.count({ where: { subscriptionLevel: "Tester" } }),
      mylittlepwettybebe: await prisma.user.count({ where: { subscriptionLevel: "mylittlepwettybebe" } }),
    };

    // Reset ALL users' subscriptions to Free (including Tester, mylittlepwettybebe, Paid, etc.)
    // This ensures everyone starts fresh and must use promo codes to upgrade
    const usersUpdated = await prisma.user.updateMany({
      where: {}, // Update all users regardless of current subscription level
      data: {
        subscriptionLevel: "Free",
        subscriptionStart: null,
        subscriptionEnd: null,
        billingPeriod: null,
        paymentStatus: null,
        promoCodeUsed: null,
      },
    });

    // Delete all promo codes (this will cascade delete redemptions)
    const promoCodesDeleted = await prisma.promoCode.deleteMany({});

    return NextResponse.json({
      ok: true,
      message: "All subscriptions reset and promo codes deleted",
      usersUpdated: usersUpdated.count,
      promoCodesDeleted: promoCodesDeleted.count,
      beforeReset,
      summary: `Reset ${usersUpdated.count} users (${beforeReset.paid} Paid, ${beforeReset.tester} Tester, ${beforeReset.mylittlepwettybebe} mylittlepwettybebe) to Free and deleted ${promoCodesDeleted.count} promo codes`,
    });
  } catch (err: any) {
    console.error("[admin/reset-subscriptions] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

