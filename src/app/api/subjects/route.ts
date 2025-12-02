import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: true, subjects: [] });
  const subjects = await prisma.subject.findMany({ 
    where: { userId: user.id }, 
    orderBy: { createdAt: "desc" },
  });
  
  // Get sharedByUsername from SubjectData for each subject
  const subjectsWithSharedBy = await Promise.all(
    subjects.map(async (s) => {
      const subjectData = await prisma.subjectData.findUnique({
        where: { userId_slug: { userId: user.id, slug: s.slug } },
        select: { sharedByUsername: true },
      });
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        sharedByUsername: subjectData?.sharedByUsername || null,
      };
    })
  );
  
  return NextResponse.json({ ok: true, subjects: subjectsWithSharedBy });
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

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "");
    const slug = String(body.slug || "");
    if (!name || !slug) return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    const updated = await prisma.subject.updateMany({
      where: { userId: user.id, slug },
      data: { name },
    });
    if (updated.count === 0) {
      return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to update subject" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
    
    // Delete all related data first (in correct order to avoid foreign key issues)
    
    // 1. Delete ExamSnipeHistory records linked to this course
    await prisma.examSnipeHistory.deleteMany({
      where: { 
        userId: user.id, 
        subjectSlug: slug 
      },
    });
    
    // 2. Delete subject data (lessons, topics, generated content, etc.)
    await prisma.subjectData.deleteMany({
      where: { userId: user.id, slug },
    });
    
    // 3. Finally delete the subject itself
    const deleted = await prisma.subject.deleteMany({
      where: { userId: user.id, slug },
    });
    
    if (deleted.count === 0) {
      return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to delete subject" }, { status: 500 });
  }
}


