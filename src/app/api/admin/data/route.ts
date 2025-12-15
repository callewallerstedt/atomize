import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is tester tier
    const currentUser = await prisma.user.findUnique({ 
      where: { id: user.id },
      select: { subscriptionLevel: true }
    });

    if (currentUser?.subscriptionLevel !== "Tester") {
      return NextResponse.json({ ok: false, error: "Forbidden - Tester tier required" }, { status: 403 });
    }

    // Get all courses
    const courses = await prisma.subject.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Get all exam snipes
    const examSnipes = await prisma.examSnipeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        courseName: true,
        slug: true,
        subjectSlug: true,
        fileNames: true,
        createdAt: true,
      },
    });

    // Get all subject data (lessons, topics, etc.)
    const subjectData = await prisma.subjectData.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        slug: true,
        data: true,
        updatedAt: true,
      },
    });

    // Parse subject data to extract lessons and other saved data
    const lessons: Array<{
      id: string;
      courseSlug: string;
      courseName: string;
      topicName: string;
      lessonTitle: string;
      createdAt?: string;
    }> = [];

    subjectData.forEach((sd) => {
      try {
        const data = sd.data as any;
        const course = courses.find((c) => c.slug === sd.slug);
        const courseName = course?.name || sd.slug;

        // Extract lessons from nodes
        if (data?.nodes) {
          Object.entries(data.nodes).forEach(([topicName, topicData]: [string, any]) => {
            if (topicData?.lessons && Array.isArray(topicData.lessons)) {
              topicData.lessons.forEach((lesson: any) => {
                lessons.push({
                  id: `${sd.slug}-${topicName}-${lesson.title || "unknown"}`,
                  courseSlug: sd.slug,
                  courseName,
                  topicName,
                  lessonTitle: lesson.title || "Untitled",
                  createdAt: lesson.createdAt || sd.updatedAt?.toISOString(),
                });
              });
            }
          });
        }

        // Also check for generated lessons (from exam snipes, etc.)
        if (data?.generatedLessons) {
          Object.entries(data.generatedLessons).forEach(([topicName, topicLessons]: [string, any]) => {
            if (Array.isArray(topicLessons)) {
              topicLessons.forEach((lesson: any) => {
                lessons.push({
                  id: `${sd.slug}-${topicName}-generated-${lesson.title || "unknown"}`,
                  courseSlug: sd.slug,
                  courseName,
                  topicName,
                  lessonTitle: lesson.title || "Untitled",
                  createdAt: lesson.createdAt || sd.updatedAt?.toISOString(),
                });
              });
            } else if (topicLessons && typeof topicLessons === 'object') {
              Object.values(topicLessons).forEach((lesson: any) => {
                if (lesson && typeof lesson === 'object') {
                  lessons.push({
                    id: `${sd.slug}-${topicName}-generated-${lesson.title || "unknown"}`,
                    courseSlug: sd.slug,
                    courseName,
                    topicName,
                    lessonTitle: lesson.title || "Untitled",
                    createdAt: lesson.createdAt || sd.updatedAt?.toISOString(),
                  });
                }
              });
            }
          });
        }
      } catch (err) {
        console.error(`Error parsing subject data for ${sd.slug}:`, err);
      }
    });

    return NextResponse.json({
      ok: true,
      data: {
        courses,
        examSnipes,
        lessons,
        subjectData: subjectData.map((sd) => {
          const data = sd.data as any;
          return {
            id: sd.id,
            slug: sd.slug,
            updatedAt: sd.updatedAt,
            // Include metadata about what's stored
            hasSurgeLogs: !!(data?.surgeLog && Array.isArray(data.surgeLog) && data.surgeLog.length > 0),
            surgeLogCount: Array.isArray(data?.surgeLog) ? data.surgeLog.length : 0,
            hasPracticeLogs: !!(data?.practiceLogs && Array.isArray(data.practiceLogs) && data.practiceLogs.length > 0),
            practiceLogCount: Array.isArray(data?.practiceLogs) ? data.practiceLogs.length : 0,
            hasReviewSchedules: !!(data?.reviewSchedules && Object.keys(data.reviewSchedules).length > 0),
            reviewScheduleCount: data?.reviewSchedules ? Object.keys(data.reviewSchedules).length : 0,
            hasFiles: !!(data?.files && Array.isArray(data.files) && data.files.length > 0),
            fileCount: Array.isArray(data?.files) ? data.files.length : 0,
          };
        }),
      },
    });
  } catch (err: any) {
    console.error("[admin/data] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

