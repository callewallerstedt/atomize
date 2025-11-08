import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: true, subjects: [] });
  const subjects = await prisma.subject.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ok: true, subjects });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "");
    const slug = String(body.slug || "");
    if (!name || !slug) return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    const created = await prisma.subject.create({ data: { userId: user.id, name, slug } });
    return NextResponse.json({ ok: true, subject: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to create subject" }, { status: 500 });
  }
}


