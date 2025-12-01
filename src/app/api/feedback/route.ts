import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST - Submit feedback
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();
    const page = String(body.page || "").trim();

    if (!message) {
      return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });
    }

    await prisma.feedback.create({
      data: {
        userId: user.id,
        message,
        page: page || "unknown",
      },
    });

    return NextResponse.json({ ok: true, message: "Feedback submitted successfully" });
  } catch (err: any) {
    console.error("Error submitting feedback:", err);
    const errorMessage = err?.message || "Unknown error";
    
    // Check if it's a Prisma model error
    if (errorMessage.includes("Cannot read properties of undefined") || errorMessage.includes("feedback")) {
      return NextResponse.json({ 
        ok: false, 
        error: "Database not set up. Please run: npx prisma generate && npx prisma migrate dev" 
      }, { status: 500 });
    }
    
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}

// GET - Fetch all feedback (only for testers)
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Check if user is a tester
    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser?.subscriptionLevel !== "Tester" && currentUser?.subscriptionLevel !== "mylittlepwettybebe") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const feedback = await prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, feedback });
  } catch (err: any) {
    console.error("Error fetching feedback:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

// PATCH - Update feedback (mark as done/undone)
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Check if user is a tester
    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser?.subscriptionLevel !== "Tester" && currentUser?.subscriptionLevel !== "mylittlepwettybebe") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const feedbackId = String(body.id || "");
    const done = Boolean(body.done);

    if (!feedbackId) {
      return NextResponse.json({ ok: false, error: "Feedback ID is required" }, { status: 400 });
    }

    await prisma.feedback.update({
      where: { id: feedbackId },
      data: { done },
    });

    return NextResponse.json({ ok: true, message: "Feedback updated successfully" });
  } catch (err: any) {
    console.error("Error updating feedback:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

// DELETE - Delete feedback
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Check if user is a tester
    const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (currentUser?.subscriptionLevel !== "Tester" && currentUser?.subscriptionLevel !== "mylittlepwettybebe") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const feedbackId = String(body.id || "");

    if (!feedbackId) {
      return NextResponse.json({ ok: false, error: "Feedback ID is required" }, { status: 400 });
    }

    await prisma.feedback.delete({
      where: { id: feedbackId },
    });

    return NextResponse.json({ ok: true, message: "Feedback deleted successfully" });
  } catch (err: any) {
    console.error("Error deleting feedback:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

