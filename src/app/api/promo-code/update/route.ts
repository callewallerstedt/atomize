import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SubscriptionLevel } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: Request) {
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
    const id = String(body.id || "");
    const code = body.code ? String(body.code).trim().toUpperCase() : undefined;
    const subscriptionLevel = body.subscriptionLevel ? String(body.subscriptionLevel) : undefined;
    const description = body.description !== undefined ? (body.description ? String(body.description).trim() : null) : undefined;
    const expiresAt = body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : undefined; // When code itself expires
    // Handle validityDays: if empty string, null, undefined, or 0, set to null (unlimited)
    const validityDays = body.validityDays !== undefined 
      ? (body.validityDays && body.validityDays !== "" && Number(body.validityDays) > 0 ? Number(body.validityDays) : null)
      : undefined; // Days each user gets
    const maxUses = body.maxUses !== undefined ? (body.maxUses && body.maxUses !== "" ? Number(body.maxUses) : null) : undefined;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID is required" }, { status: 400 });
    }

    // Check if code exists
    const existing = await prisma.promoCode.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Promo code not found" }, { status: 404 });
    }

    // If code is being changed, check if new code already exists
    if (code && code !== existing.code) {
      const codeExists = await prisma.promoCode.findUnique({ where: { code } });
      if (codeExists) {
        return NextResponse.json({ ok: false, error: "Code already exists" }, { status: 400 });
      }
    }

    // Validate subscription level if provided
    if (subscriptionLevel && !["Free", "Paid", "Tester", "mylittlepwettybebe"].includes(subscriptionLevel)) {
      return NextResponse.json({ ok: false, error: "Invalid subscription level" }, { status: 400 });
    }

    const updateData: any = {};
    if (code !== undefined) updateData.code = code;
    if (subscriptionLevel !== undefined) updateData.subscriptionLevel = subscriptionLevel as SubscriptionLevel;
    if (description !== undefined) updateData.description = description;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt;
    if (validityDays !== undefined) updateData.validityDays = validityDays;
    if (maxUses !== undefined) updateData.maxUses = maxUses;

    const updated = await prisma.promoCode.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      ok: true,
      promoCode: {
        id: updated.id,
        code: updated.code,
        description: updated.description,
        subscriptionLevel: updated.subscriptionLevel,
        expiresAt: updated.expiresAt,
        validityDays: updated.validityDays,
        maxUses: updated.maxUses,
        currentUses: updated.currentUses,
      },
    });
  } catch (err: any) {
    console.error("[promo-code/update] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

