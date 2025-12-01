import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ ok: false, error: "Code is required" }, { status: 400 });
    }

    // Find promo code in database (no more hardcoded special cases - all codes must be in DB)
    const promoCode = await prisma.promoCode.findUnique({
      where: { code },
      include: { redemptions: true },
    });

    if (!promoCode) {
      return NextResponse.json({ ok: false, error: "Invalid promo code" }, { status: 400 });
    }

    // Check if expired
    if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
      return NextResponse.json({ ok: false, error: "This promo code has expired" }, { status: 400 });
    }

    // Check max uses
    if (promoCode.maxUses && promoCode.currentUses >= promoCode.maxUses) {
      return NextResponse.json({ ok: false, error: "This promo code has reached its usage limit" }, { status: 400 });
    }

    // Check if user already redeemed this code
    const existingRedemption = await prisma.promoCodeRedemption.findUnique({
      where: {
        promoCodeId_userId: {
          promoCodeId: promoCode.id,
          userId: user.id,
        },
      },
    });

    if (existingRedemption) {
      return NextResponse.json({ ok: false, error: "You have already redeemed this code" }, { status: 400 });
    }

    // Create redemption and update user subscription
    await prisma.$transaction(async (tx) => {
      // Create redemption
      await tx.promoCodeRedemption.create({
        data: {
          promoCodeId: promoCode.id,
          userId: user.id,
        },
      });

      // Update promo code usage count
      await tx.promoCode.update({
        where: { id: promoCode.id },
        data: { currentUses: { increment: 1 } },
      });

      // Calculate subscription end date based on validityDays
      // Each user gets validityDays from when they redeem (not from code creation)
      let subscriptionEnd: Date | null = null;
      if (promoCode.validityDays && promoCode.validityDays > 0) {
        subscriptionEnd = new Date(Date.now() + promoCode.validityDays * 24 * 60 * 60 * 1000);
      }

      // Update user subscription
      await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionLevel: promoCode.subscriptionLevel,
          promoCodeUsed: code,
          subscriptionStart: new Date(),
          subscriptionEnd: subscriptionEnd, // Per-user expiration based on validityDays
        },
      });
    });

    return NextResponse.json({
      ok: true,
      subscriptionLevel: promoCode.subscriptionLevel,
      message: `Successfully upgraded to ${promoCode.subscriptionLevel} tier!`,
    });
  } catch (err: any) {
    console.error("[promo-code/redeem] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

