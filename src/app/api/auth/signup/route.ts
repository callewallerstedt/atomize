import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password || password.length < 6) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ ok: false, error: "Username already exists" }, { status: 400 });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { username, password: hash } });
    await createSession(user.id);
    return NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Signup failed" }, { status: 500 });
  }
}


