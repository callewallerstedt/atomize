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

    const body = await req.json().catch(() => ({}));
    const userType = body.userType; // "student" | "professional" | "learner"

    if (!userType || !["student", "professional", "learner"].includes(userType)) {
      return NextResponse.json({ ok: false, error: "Invalid user type" }, { status: 400 });
    }

    // Get current preferences
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { preferences: true },
    });

    const currentPreferences = (currentUser?.preferences as any) || {};
    
    // Update preferences with onboarding completion and user type
    await prisma.user.update({
      where: { id: user.id },
      data: {
        preferences: {
          ...currentPreferences,
          onboardingCompleted: true,
          userType: userType,
          onboardingCompletedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[user/onboarding] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}













