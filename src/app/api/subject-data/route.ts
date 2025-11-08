import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  const row = await prisma.subjectData.findUnique({ where: { userId_slug: { userId: user.id, slug } } });
  return NextResponse.json({ ok: true, data: row?.data || null });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || "");
    const data = body.data;
    if (!slug || typeof data === "undefined") return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    const row = await prisma.subjectData.upsert({
      where: { userId_slug: { userId: user.id, slug } },
      update: { data },
      create: { userId: user.id, slug, data },
    });
    return NextResponse.json({ ok: true, data: row.data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save data" }, { status: 500 });
  }
}


