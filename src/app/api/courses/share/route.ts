import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { StoredSubjectData } from "@/utils/storage";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST - Create a share link for a course
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || "").trim();
    
    if (!slug) {
      return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
    }

    // Get course data from database
    const subjectData = await prisma.subjectData.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
    });

    if (!subjectData) {
      return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });
    }

    const courseData = subjectData.data as any as StoredSubjectData;
    const subject = await prisma.subject.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
    });

    if (!subject) {
      return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });
    }

    // Get exam snipes linked to this course
    const examSnipes = await prisma.examSnipeHistory.findMany({
      where: {
        userId: user.id,
        subjectSlug: slug,
      },
      select: {
        slug: true,
        courseName: true,
        fileNames: true,
        results: true,
        createdAt: true,
      },
    });

    // Prepare course data for sharing (exclude surgeLog and practiceLogs)
    const { surgeLog, practiceLogs, ...shareableData } = courseData;

    // Include exam snipes in the shareable data
    const shareableDataWithExamSnipes = {
      ...shareableData,
      examSnipes: examSnipes.map(snipe => ({
        slug: snipe.slug,
        courseName: snipe.courseName,
        fileNames: snipe.fileNames,
        results: snipe.results,
        createdAt: snipe.createdAt.toISOString(),
      })),
    };

    // Generate unique share ID
    const shareId = randomBytes(16).toString("hex");

    // Create shared course record
    const sharedCourse = await prisma.sharedCourse.create({
      data: {
        shareId,
        userId: user.id,
        courseSlug: slug,
        courseName: subject.name,
        courseData: shareableDataWithExamSnipes as any,
      },
    });

    // Construct share URL
    const url = new URL(req.url);
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    
    if (!baseUrl) {
      // Use localhost instead of 0.0.0.0 for local development
      const host = url.host;
      if (host.includes('0.0.0.0')) {
        const port = url.port ? `:${url.port}` : '';
        baseUrl = `${url.protocol}//localhost${port}`;
      } else {
        baseUrl = `${url.protocol}//${host}`;
      }
    }
    
    const shareUrl = `${baseUrl}/share/${sharedCourse.shareId}`;

    return NextResponse.json({
      ok: true,
      shareId: sharedCourse.shareId,
      shareUrl,
    });
  } catch (err: any) {
    console.error("Error creating share link:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to create share link" },
      { status: 500 }
    );
  }
}

