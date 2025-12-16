import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { StoredSubjectData } from "@/utils/storage";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSafeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function rewriteExamSnipeHistorySlugs(courseData: StoredSubjectData, slugMap: Map<string, string>): StoredSubjectData {
  if (!courseData?.nodes || typeof courseData.nodes !== "object") return courseData;

  const nodes = courseData.nodes as any;
  const nextNodes: any = { ...nodes };
  let changed = false;

  for (const key of Object.keys(nextNodes)) {
    const node = nextNodes[key];
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const meta = (node as any).examSnipeMeta;
    const historySlug = typeof meta?.historySlug === "string" ? meta.historySlug : "";
    if (!historySlug) continue;
    const mapped = slugMap.get(historySlug);
    if (!mapped || mapped === historySlug) continue;
    nextNodes[key] = { ...(node as any), examSnipeMeta: { ...(meta as any), historySlug: mapped } };
    changed = true;
  }

  if (!changed) return courseData;
  return { ...(courseData as any), nodes: nextNodes } as StoredSubjectData;
}

// POST - Save a shared course to the current user's account
export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { shareId } = await params;
    
    if (!shareId) {
      return NextResponse.json({ ok: false, error: "Missing shareId" }, { status: 400 });
    }

    // Get shared course with user info
    const sharedCourse = await prisma.sharedCourse.findUnique({
      where: { shareId },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!sharedCourse) {
      return NextResponse.json({ ok: false, error: "Shared course not found" }, { status: 404 });
    }

    const courseData = sharedCourse.courseData as any as StoredSubjectData;
    const originalSlug = sharedCourse.courseSlug;

    // Generate a unique slug for the new course (add timestamp to avoid conflicts)
    const timestamp = Date.now();
    const rand = randomBytes(3).toString("hex");
    const base = toSafeSlug(originalSlug || "course") || "course";
    const newSlug = `${base}-shared-${timestamp}-${rand}`.slice(0, 64);
    // Keep the original course name (don't include "Shared by" in the name)
    const newName = sharedCourse.courseName;

    // Extract exam snipes from course data if they exist
    const examSnipes = (courseData as any).examSnipes || [];
    
    // Remove examSnipes from course data (they'll be saved separately)
    const { examSnipes: _, ...courseDataWithoutExamSnipes } = courseData as any;

    // Keep the original subject name in course data (don't modify it)
    const updatedCourseData: StoredSubjectData = {
      ...courseDataWithoutExamSnipes,
      subject: newName,
    };

    // Create subject entry
    await prisma.subject.upsert({
      where: { userId_slug: { userId: user.id, slug: newSlug } },
      update: {
        name: newName,
      },
      create: {
        userId: user.id,
        slug: newSlug,
        name: newName,
      },
    });

    // Create exam snipes for the new user
    const examSnipeSlugMap = new Map<string, string>();
    for (const examSnipe of examSnipes) {
      try {
        // Generate a unique slug for the exam snipe
        const examSnipeSlug = `${toSafeSlug(String(examSnipe.slug || "exam")) || "exam"}-shared-${timestamp}-${rand}`.slice(0, 64);
        
        await prisma.examSnipeHistory.upsert({
          where: { userId_slug: { userId: user.id, slug: examSnipeSlug } },
          update: {
            courseName: examSnipe.courseName,
            fileNames: examSnipe.fileNames,
            results: examSnipe.results,
            subjectSlug: newSlug,
          },
          create: {
            userId: user.id,
            slug: examSnipeSlug,
            courseName: examSnipe.courseName,
            fileNames: examSnipe.fileNames,
            results: examSnipe.results,
            subjectSlug: newSlug,
          },
        });

        examSnipeSlugMap.set(String(examSnipe.slug || ""), examSnipeSlug);
      } catch (err) {
        console.error("Error creating exam snipe:", err);
        // Continue with other exam snipes even if one fails
      }
    }

    const rewrittenCourseData = rewriteExamSnipeHistorySlugs(updatedCourseData, examSnipeSlugMap);

    // Save course data (ensure topics and all other data is preserved)
    // Store the latest sharer username separately
    await prisma.subjectData.upsert({
      where: { userId_slug: { userId: user.id, slug: newSlug } },
      update: {
        data: rewrittenCourseData as any,
        sharedByUsername: sharedCourse.user.username, // Update to latest sharer
      },
      create: {
        userId: user.id,
        slug: newSlug,
        data: rewrittenCourseData as any,
        sharedByUsername: sharedCourse.user.username, // Store latest sharer
      },
    });

    return NextResponse.json({
      ok: true,
      slug: newSlug,
      name: newName,
    });
  } catch (err: any) {
    console.error("Error saving shared course:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to save shared course" },
      { status: 500 }
    );
  }
}
