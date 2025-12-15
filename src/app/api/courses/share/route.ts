import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { StoredSubjectData } from "@/utils/storage";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SHARED_COMBINED_TEXT_CHARS = 750_000;
const MAX_SHARED_SURGE_LOG_ENTRIES = 100;
const MAX_SHARED_PRACTICE_LOG_ENTRIES = 300;

function capText(input: any, maxChars: number): { value: string; truncated: boolean } {
  const str = typeof input === "string" ? input : input == null ? "" : String(input);
  if (str.length <= maxChars) return { value: str, truncated: false };
  return { value: str.slice(0, maxChars), truncated: true };
}

function stripFileData(files: any): Array<{ name: string; type?: string }> {
  if (!Array.isArray(files)) return [];
  return files
    .map((f) => ({
      name: typeof f?.name === "string" ? f.name : String(f?.name || ""),
      type: typeof f?.type === "string" ? f.type : undefined,
    }))
    .filter((f) => f.name.trim().length > 0);
}

function stripRawLessonJson(nodes: any): any {
  if (!nodes || typeof nodes !== "object") return nodes;
  const out: Record<string, any> = Array.isArray(nodes) ? {} : { ...nodes };
  for (const key of Object.keys(out)) {
    const node = out[key];
    if (!node || typeof node !== "object") continue;
    const nextNode: any = { ...node };
    if (Array.isArray(nextNode.rawLessonJson) && nextNode.rawLessonJson.length > 0) {
      nextNode.rawLessonJson = [];
    }
    out[key] = nextNode;
  }
  return out;
}

function capArray<T>(value: any, max: number): { value: T[] | undefined; truncated: boolean } {
  if (!Array.isArray(value)) return { value: undefined, truncated: false };
  if (value.length <= max) return { value: value as T[], truncated: false };
  return { value: (value as T[]).slice(-max), truncated: true };
}

function safeJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

    // Get exam snipes linked to this course (and legacy unlinked records matching the course name).
    const examSnipes = await prisma.examSnipeHistory.findMany({
      where: {
        userId: user.id,
        OR: [
          { subjectSlug: slug },
          {
            subjectSlug: null,
            courseName: { equals: subject.name, mode: "insensitive" },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        slug: true,
        courseName: true,
        fileNames: true,
        results: true,
        createdAt: true,
      },
    });

    // Build a deploy-safe share snapshot that preserves study data but avoids massive payloads.
    const snapshotBase = safeJsonClone(courseData);

    const combined = capText(snapshotBase.combinedText, MAX_SHARED_COMBINED_TEXT_CHARS);
    snapshotBase.combinedText = combined.value;
    snapshotBase.files = stripFileData(snapshotBase.files) as any;
    snapshotBase.nodes = stripRawLessonJson(snapshotBase.nodes) as any;

    const surge = capArray(snapshotBase.surgeLog, MAX_SHARED_SURGE_LOG_ENTRIES);
    if (surge.value) snapshotBase.surgeLog = surge.value as any;

    const practice = capArray(snapshotBase.practiceLogs, MAX_SHARED_PRACTICE_LOG_ENTRIES);
    if (practice.value) snapshotBase.practiceLogs = practice.value as any;

    // Include exam snipes in the shareable data (kept for offline viewing and imported on save).
    const shareableDataWithExamSnipes = {
      ...snapshotBase,
      subject: subject.name,
      examSnipes: examSnipes.map(snipe => ({
        slug: snipe.slug,
        courseName: snipe.courseName,
        fileNames: snipe.fileNames,
        results: snipe.results,
        createdAt: snipe.createdAt.toISOString(),
      })),
      __sharedCourseMeta: {
        version: 1,
        originalSlug: slug,
        sharedBy: user.username,
        createdAt: new Date().toISOString(),
        truncated: {
          combinedText: combined.truncated,
          surgeLog: surge.truncated,
          practiceLogs: practice.truncated,
          rawLessonJson: true,
          filesData: true,
        },
      },
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
      truncated: (shareableDataWithExamSnipes as any).__sharedCourseMeta?.truncated || null,
    });
  } catch (err: any) {
    console.error("Error creating share link:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to create share link" },
      { status: 500 }
    );
  }
}
