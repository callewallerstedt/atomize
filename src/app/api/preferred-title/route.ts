import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const preferredTitle = typeof body.preferredTitle === "string" ? body.preferredTitle.trim() : null;
    const customTitle = typeof body.customTitle === "string" ? body.customTitle.trim() : null;

    // If preferredTitle is "Custom", use customTitle instead
    const finalTitle = preferredTitle === "Custom" && customTitle ? customTitle : (preferredTitle === "Custom" ? null : preferredTitle);

    // Get current preferences or create new object
    const currentUser = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
    const currentPreferences = (currentUser?.preferences as any) || {};

    // Update preferences
    const updatedPreferences = {
      ...currentPreferences,
      preferredTitle: finalTitle || null
    };

    await prisma.user.update({
      where: { id: user.id },
      data: { preferences: updatedPreferences }
    });

    return NextResponse.json({ 
      ok: true, 
      preferredTitle: finalTitle 
    });
  } catch (err: any) {
    console.error("[preferred-title] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

