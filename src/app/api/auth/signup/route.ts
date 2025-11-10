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
    const password = String(body.password || "");
    const code = String(body.code || "").trim().toUpperCase();
    if (!username || !password || password.length < 6) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ ok: false, error: "Username already exists" }, { status: 400 });
    }
    const hash = await bcrypt.hash(password, 10);
    
    // Check for betatest code
    let subscriptionLevel: "Free" | "Paid" | "Tester" = "Free";
    let promoCodeUsed: string | null = null;
    let subscriptionStart: Date | null = null;
    let subscriptionEnd: Date | null = null;
    
    if (code === "BETATEST") {
      subscriptionLevel = "Tester";
      promoCodeUsed = "BETATEST";
      subscriptionStart = new Date();
      subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    }
    
    const user = await prisma.user.create({ 
      data: { 
        username, 
        password: hash,
        subscriptionLevel,
        promoCodeUsed,
        subscriptionStart,
        subscriptionEnd,
      } 
    });
    await createSession(user.id);
    return NextResponse.json({ 
      ok: true, 
      user: { id: user.id, username: user.username },
      subscriptionLevel: user.subscriptionLevel,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Signup failed" }, { status: 500 });
  }
}


