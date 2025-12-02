import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET - List all users (admin only)
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser?.username !== "cwallerstedt") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        subscriptionLevel: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        promoCodeUsed: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, users });
  } catch (err: any) {
    console.error("[admin/users] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update user subscription (admin only)
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser?.username !== "cwallerstedt") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || "");
    const subscriptionLevel = body.subscriptionLevel ? String(body.subscriptionLevel) : undefined;
    const subscriptionStart = body.subscriptionStart ? new Date(body.subscriptionStart) : undefined;
    const subscriptionEnd = body.subscriptionEnd !== undefined ? (body.subscriptionEnd ? new Date(body.subscriptionEnd) : null) : undefined;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "User ID is required" }, { status: 400 });
    }

    if (subscriptionLevel && !["Free", "Paid", "Tester", "mylittlepwettybebe"].includes(subscriptionLevel)) {
      return NextResponse.json({ ok: false, error: "Invalid subscription level" }, { status: 400 });
    }

    const updateData: any = {};
    if (subscriptionLevel !== undefined) updateData.subscriptionLevel = subscriptionLevel;
    if (subscriptionStart !== undefined) updateData.subscriptionStart = subscriptionStart;
    if (subscriptionEnd !== undefined) updateData.subscriptionEnd = subscriptionEnd;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        subscriptionLevel: updated.subscriptionLevel,
        subscriptionStart: updated.subscriptionStart,
        subscriptionEnd: updated.subscriptionEnd,
      },
    });
  } catch (err: any) {
    console.error("[admin/users] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Redeem code for a user (admin only)
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser?.username !== "cwallerstedt") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.userId || "");
    const code = String(body.code || "").trim().toUpperCase();

    if (!targetUserId || !code) {
      return NextResponse.json({ ok: false, error: "User ID and code are required" }, { status: 400 });
    }

    // Find promo code
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
          userId: targetUserId,
        },
      },
    });

    if (existingRedemption) {
      return NextResponse.json({ ok: false, error: "User has already redeemed this code" }, { status: 400 });
    }

    // Calculate subscription end date based on validityDays
    let subscriptionEnd: Date | null = null;
    if (promoCode.validityDays && promoCode.validityDays > 0) {
      subscriptionEnd = new Date(Date.now() + promoCode.validityDays * 24 * 60 * 60 * 1000);
    }

    // Create redemption and update user subscription
    await prisma.$transaction(async (tx) => {
      // Create redemption
      await tx.promoCodeRedemption.create({
        data: {
          promoCodeId: promoCode.id,
          userId: targetUserId,
        },
      });

      // Update promo code usage count
      await tx.promoCode.update({
        where: { id: promoCode.id },
        data: { currentUses: { increment: 1 } },
      });

      // Update user subscription
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          subscriptionLevel: promoCode.subscriptionLevel,
          promoCodeUsed: code,
          subscriptionStart: new Date(),
          subscriptionEnd: subscriptionEnd,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully applied code ${code} to user`,
    });
  } catch (err: any) {
    console.error("[admin/users] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}


