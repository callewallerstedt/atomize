import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const email = body.email ? String(body.email || "").trim() : null;
    const password = String(body.password || "");
    const code = body.code ? String(body.code || "").trim().toUpperCase() : "";
    if (!username || !password || password.length < 6) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }
    
    // Validate email format if provided
    if (email && email.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ ok: false, error: "Invalid email format" }, { status: 400 });
      }
    }
    
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ ok: false, error: "Username already exists" }, { status: 400 });
    }
    
    // Check if email is already taken (if provided)
    if (email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) {
        return NextResponse.json({ ok: false, error: "Email already in use" }, { status: 400 });
      }
    }
    const hash = await bcrypt.hash(password, 10);
    
    // Check for promo code (either hardcoded legacy codes or database codes)
    let subscriptionLevel: "Free" | "Paid" | "Tester" | "mylittlepwettybebe" = "Free";
    let promoCodeUsed: string | null = null;
    let subscriptionStart: Date | null = null;
    let subscriptionEnd: Date | null = null;
    
    if (code) {
      // Check database FIRST - database codes take precedence over hardcoded legacy codes
      const promoCode = await prisma.promoCode.findUnique({
        where: { code },
      });
      
      if (promoCode) {
        // Check if expired
        if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
          return NextResponse.json({ ok: false, error: "This promo code has expired" }, { status: 400 });
        }
        
        // Check max uses
        if (promoCode.maxUses && promoCode.currentUses >= promoCode.maxUses) {
          return NextResponse.json({ ok: false, error: "This promo code has reached its usage limit" }, { status: 400 });
        }
        
        // Valid promo code - set subscription level
        subscriptionLevel = promoCode.subscriptionLevel;
        promoCodeUsed = code;
        subscriptionStart = new Date();
        
        // Calculate subscription end date
        // User's subscription expires at the earlier of:
        // 1. validityDays from redemption date (if set)
        // 2. expiresAt (code expiration date, if set)
        // If both are null, subscription is unlimited
        const now = new Date();
        
        // Calculate end date from validityDays
        let validityEnd: Date | null = null;
        if (promoCode.validityDays !== null && promoCode.validityDays !== undefined && promoCode.validityDays > 0) {
          validityEnd = new Date(now.getTime() + promoCode.validityDays * 24 * 60 * 60 * 1000);
        }
        
        // Use the earlier of validityEnd or expiresAt, or null if both are null
        if (validityEnd && promoCode.expiresAt) {
          subscriptionEnd = validityEnd < promoCode.expiresAt ? validityEnd : promoCode.expiresAt;
        } else if (validityEnd) {
          subscriptionEnd = validityEnd;
        } else if (promoCode.expiresAt) {
          subscriptionEnd = promoCode.expiresAt;
        } else {
          subscriptionEnd = null; // Unlimited if both are null
        }
        
        // Note: We'll create the redemption and update usage count after user creation
      } else {
        // Fall back to hardcoded legacy codes only if not found in database
        if (code === "BETATEST") {
          subscriptionLevel = "Tester";
          promoCodeUsed = "BETATEST";
          subscriptionStart = new Date();
          subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        } else if (code === "MLPB") {
          subscriptionLevel = "mylittlepwettybebe";
          promoCodeUsed = "MLPB";
          subscriptionStart = new Date();
          subscriptionEnd = null; // No expiration
        } else {
          // Code not found in database and not a legacy code
          return NextResponse.json({ ok: false, error: "Invalid promo code" }, { status: 400 });
        }
      }
    }
    
    // Create user and handle promo code redemption in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ 
        data: { 
          username, 
          email: email || null,
          password: hash,
          subscriptionLevel,
          promoCodeUsed,
          subscriptionStart,
          subscriptionEnd,
          lastLoginAt: new Date(),
        } 
      });
      
      // If a promo code was used from database (not a legacy hardcoded code), create redemption and update usage
      if (code && promoCodeUsed) {
        const promoCode = await tx.promoCode.findUnique({
          where: { code },
        });
        
        // Only create redemption if it's a database code (not legacy hardcoded)
        if (promoCode && code !== "BETATEST" && code !== "MLPB") {
          // Create redemption
          await tx.promoCodeRedemption.create({
            data: {
              promoCodeId: promoCode.id,
              userId: user.id,
            },
          });
          
          // Update promo code usage count
          await tx.promoCode.update({
            where: { id: promoCode.id },
            data: { currentUses: { increment: 1 } },
          });
        }
      }
      
      return user;
    });
    
    await createSession(result.id);
    return NextResponse.json({ 
      ok: true, 
      user: { id: result.id, username: result.username },
      subscriptionLevel: result.subscriptionLevel,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Signup failed" }, { status: 500 });
  }
}


