import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SubscriptionLevel } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Simple admin check - in production, use proper admin authentication
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret-change-me";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminSecret = String(body.adminSecret || "");
    const code = String(body.code || "").trim().toUpperCase();
    const subscriptionLevel = String(body.subscriptionLevel || "Tester");
    const description = String(body.description || "").trim() || null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const maxUses = body.maxUses ? Number(body.maxUses) : null;

    // Check admin secret
    if (adminSecret !== ADMIN_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Code is required" }, { status: 400 });
    }

    if (!["Free", "Paid", "Tester"].includes(subscriptionLevel)) {
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


