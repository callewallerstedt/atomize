import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET - Fetch shared course data
export async function GET(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params;
    
    if (!shareId) {
      return NextResponse.json({ ok: false, error: "Missing shareId" }, { status: 400 });
    }

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

    return NextResponse.json({
      ok: true,
      course: {
        shareId: sharedCourse.shareId,
        courseName: sharedCourse.courseName,
        courseData: sharedCourse.courseData,
        sharedBy: sharedCourse.user.username,
        createdAt: sharedCourse.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Error fetching shared course:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch shared course" },
      { status: 500 }
    );
  }
}






