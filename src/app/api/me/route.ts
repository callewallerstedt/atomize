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
  
  // Fetch full user data including subscriptionEnd and promoCodeUsed
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      email: true,
      subscriptionLevel: true,
      subscriptionStart: true,
      subscriptionEnd: true,
      promoCodeUsed: true,
      lastLoginAt: true,
      preferences: true,
      createdAt: true,
    },
  });
  
  if (!fullUser) return NextResponse.json({ ok: true, user: null });

  let effectiveSubscriptionEnd: Date | null = fullUser.subscriptionEnd;

  // Backfill subscriptionEnd for legacy users based on their promo code + redemption date
  if (!effectiveSubscriptionEnd && fullUser.subscriptionLevel !== "Free" && fullUser.promoCodeUsed) {
    const promoCode = await prisma.promoCode.findUnique({
      where: { code: fullUser.promoCodeUsed },
    });

    if (promoCode) {
      const redemption = await prisma.promoCodeRedemption.findUnique({
        where: {
          promoCodeId_userId: {
            promoCodeId: promoCode.id,
            userId: fullUser.id,
          },
        },
      });

      const redeemedAt = redemption?.redeemedAt ?? fullUser.subscriptionStart ?? null;

      if (redeemedAt) {
        let validityEnd: Date | null = null;
        if (promoCode.validityDays !== null && promoCode.validityDays !== undefined && promoCode.validityDays > 0) {
          validityEnd = new Date(redeemedAt.getTime() + promoCode.validityDays * 24 * 60 * 60 * 1000);
        }

        if (validityEnd && promoCode.expiresAt) {
          effectiveSubscriptionEnd = validityEnd < promoCode.expiresAt ? validityEnd : promoCode.expiresAt;
        } else if (validityEnd) {
          effectiveSubscriptionEnd = validityEnd;
        } else if (promoCode.expiresAt) {
          effectiveSubscriptionEnd = promoCode.expiresAt;
        } else {
          effectiveSubscriptionEnd = null;
        }
      }
    }

    // Persist the backfilled value so future checks (premium gating, settings, etc.) stay consistent
    if (effectiveSubscriptionEnd !== fullUser.subscriptionEnd) {
      await prisma.user.update({
        where: { id: fullUser.id },
        data: { subscriptionEnd: effectiveSubscriptionEnd },
      });
    }
  }
  
  return NextResponse.json({ 
    ok: true, 
    user: { 
      ...fullUser, 
      subscriptionEnd: effectiveSubscriptionEnd,
      createdAt: fullUser.createdAt,
    }, 
  });
}


