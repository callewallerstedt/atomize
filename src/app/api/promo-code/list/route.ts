import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
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

    const promoCodes = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        redemptions: {
          select: {
            id: true,
            userId: true,
            redeemedAt: true,
            user: {
              select: {
                username: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      promoCodes: promoCodes.map((pc) => ({
        id: pc.id,
        code: pc.code,
        description: pc.description,
        subscriptionLevel: pc.subscriptionLevel,
        expiresAt: pc.expiresAt,
        validityDays: pc.validityDays,
        maxUses: pc.maxUses,
        currentUses: pc.currentUses,
        createdAt: pc.createdAt,
        redemptions: pc.redemptions,
      })),
    });
  } catch (err: any) {
    console.error("[promo-code/list] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

