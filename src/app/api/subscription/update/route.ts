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
    const subscriptionLevel = String(body.subscriptionLevel || "");

    if (!["Free", "Paid", "Tester", "mylittlepwettybebe"].includes(subscriptionLevel)) {
      return NextResponse.json({ ok: false, error: "Invalid subscription level" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionLevel: subscriptionLevel as any }
    });

    return NextResponse.json({ 
      ok: true, 
      subscriptionLevel 
    });
  } catch (err: any) {
    console.error("[subscription/update] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}


