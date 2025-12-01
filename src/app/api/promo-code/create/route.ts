import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SubscriptionLevel } from "@prisma/client";

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

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim().toUpperCase();
    const subscriptionLevel = String(body.subscriptionLevel || "Tester");
    const description = String(body.description || "").trim() || null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null; // When code itself expires
    const validityDays = body.validityDays ? Number(body.validityDays) : null; // Days each user gets from redemption
    const maxUses = body.maxUses ? Number(body.maxUses) : null;

    if (!code) {
      return NextResponse.json({ ok: false, error: "Code is required" }, { status: 400 });
    }

    if (!["Free", "Paid", "Tester", "mylittlepwettybebe"].includes(subscriptionLevel)) {
      return NextResponse.json({ ok: false, error: "Invalid subscription level" }, { status: 400 });
    }

    // Check if code already exists
    const existing = await prisma.promoCode.findUnique({
      where: { code },
    });

    if (existing) {
      return NextResponse.json({ ok: false, error: "Code already exists" }, { status: 400 });
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        code,
        subscriptionLevel: subscriptionLevel as SubscriptionLevel,
        description,
        expiresAt,
        validityDays,
        maxUses,
      },
    });

    return NextResponse.json({
      ok: true,
      promoCode: {
        id: promoCode.id,
        code: promoCode.code,
        subscriptionLevel: promoCode.subscriptionLevel,
        description: promoCode.description,
        expiresAt: promoCode.expiresAt,
        validityDays: promoCode.validityDays,
        maxUses: promoCode.maxUses,
      },
    });
  } catch (err: any) {
    console.error("[promo-code/create] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}


