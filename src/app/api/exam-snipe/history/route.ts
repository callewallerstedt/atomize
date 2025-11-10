import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MAX_HISTORY_ITEMS = 20;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.examSnipeHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_ITEMS,
  });

  const history = rows.map((row: any) => ({
    id: row.id,
    courseName: row.courseName,
    slug: row.slug,
    createdAt: row.createdAt.toISOString(),
    fileNames: Array.isArray(row.fileNames) ? (row.fileNames as string[]) : [],
    results: row.results,
  }));

  return NextResponse.json({ ok: true, history });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const courseNameInput = typeof payload?.courseName === "string" ? payload.courseName.trim() : "";
  const slugInput = typeof payload?.slug === "string" ? payload.slug.trim() : "";
  if (!courseNameInput || !slugInput) {
    return NextResponse.json({ ok: false, error: "Missing courseName or slug" }, { status: 400 });
  }

  const fileNames = Array.isArray(payload?.fileNames) ? payload.fileNames.map((name: any) => String(name)) : [];
  const results = payload?.results && typeof payload.results === "object" ? payload.results : {};

  const record = await prisma.examSnipeHistory.upsert({
    where: { userId_slug: { userId: user.id, slug: slugInput } },
    update: {
      courseName: courseNameInput,
      fileNames,
      results,
    },
    create: {
      userId: user.id,
      courseName: courseNameInput,
      slug: slugInput,
      fileNames,
      results,
    },
  });

  // Ensure we only keep the most recent MAX_HISTORY_ITEMS entries
  const count = await prisma.examSnipeHistory.count({ where: { userId: user.id } });
  if (count > MAX_HISTORY_ITEMS) {
    const toDelete = await prisma.examSnipeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: count - MAX_HISTORY_ITEMS,
      select: { id: true },
    });
    if (toDelete.length > 0) {
      await prisma.examSnipeHistory.deleteMany({
        where: { id: { in: toDelete.map((row: { id: string }) => row.id) } },
      });
    }
  }

  const responseRecord = {
    id: record.id,
    courseName: record.courseName,
    slug: record.slug,
    createdAt: record.createdAt.toISOString(),
    fileNames: Array.isArray(record.fileNames) ? (record.fileNames as string[]) : [],
    results: record.results,
  };

  return NextResponse.json({ ok: true, record: responseRecord });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const slugInput = typeof payload?.slug === "string" ? payload.slug.trim() : "";
  const courseNameInput = typeof payload?.courseName === "string" ? payload.courseName.trim() : "";
  if (!slugInput || !courseNameInput) {
    return NextResponse.json({ ok: false, error: "Missing slug or courseName" }, { status: 400 });
  }

  const existing = await prisma.examSnipeHistory.findUnique({
    where: { userId_slug: { userId: user.id, slug: slugInput } },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Record not found" }, { status: 404 });
  }

  let updatedResults = existing.results;
  try {
    if (updatedResults && typeof updatedResults === "object" && updatedResults !== null) {
      updatedResults = { ...updatedResults, courseName: courseNameInput };
    }
  } catch {
    // ignore serialization issues, keep original
  }

  const record = await prisma.examSnipeHistory.update({
    where: { userId_slug: { userId: user.id, slug: slugInput } },
    data: {
      courseName: courseNameInput,
      results: updatedResults as any,
    },
  });

  return NextResponse.json({
    ok: true,
    record: {
      id: record.id,
      courseName: record.courseName,
      slug: record.slug,
      createdAt: record.createdAt.toISOString(),
      fileNames: Array.isArray(record.fileNames) ? (record.fileNames as string[]) : [],
      results: record.results,
    },
  });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug parameter" }, { status: 400 });
  }

  try {
    await prisma.examSnipeHistory.delete({
      where: { userId_slug: { userId: user.id, slug } },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Record not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

