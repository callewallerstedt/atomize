import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: true, user: null });
  
  // Update lastLoginAt to reflect "last online" (not just login time)
  // This makes it more accurate for showing when users were last active
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  
  // Fetch full user data including subscriptionEnd
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      email: true,
      subscriptionLevel: true,
      subscriptionStart: true,
      subscriptionEnd: true,
      lastLoginAt: true,
      preferences: true,
    },
  });
  
  if (!fullUser) return NextResponse.json({ ok: true, user: null });
  
  return NextResponse.json({ ok: true, user: fullUser });
}


