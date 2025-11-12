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

    // Handle special hardcoded "betatest" code
    if (code === "BETATEST") {
      // Check if user already has Tester subscription
      const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (currentUser?.subscriptionLevel === "Tester") {
        return NextResponse.json({ ok: false, error: "You already have Tester subscription" }, { status: 400 });
      }

      // Update user to Tester
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionLevel: "Tester",
          promoCodeUsed: "BETATEST",
          subscriptionStart: new Date(),
          subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      return NextResponse.json({
        ok: true,
        subscriptionLevel: "Tester",
        message: "Successfully upgraded to Tester tier!",
      });
    }

    // Handle special hardcoded "mlpb" code
    if (code === "MLPB") {
      // Check if user already has mylittlepwettybebe subscription
      const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (currentUser?.subscriptionLevel === "mylittlepwettybebe") {
        return NextResponse.json({ ok: false, error: "You already have mylittlepwettybebe subscription" }, { status: 400 });
      }

      // Update user to mylittlepwettybebe
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionLevel: "mylittlepwettybebe",
          promoCodeUsed: "MLPB",
          subscriptionStart: new Date(),
          subscriptionEnd: null, // No expiration
        },
      });

      return NextResponse.json({
        ok: true,
        subscriptionLevel: "mylittlepwettybebe",
        message: "Successfully upgraded to mylittlepwettybebe tier!",
      });
    }

    // Find promo code in database
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

      // Update user subscription
      await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionLevel: promoCode.subscriptionLevel,
          promoCodeUsed: code,
          subscriptionStart: new Date(),
          // Set subscription end based on level (Tester might be temporary)
          subscriptionEnd: promoCode.subscriptionLevel === "Tester" 
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days for tester
            : null,
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

