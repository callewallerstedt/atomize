import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const canvasId = params.id;
    if (!canvasId) {
      return NextResponse.json({ error: "Missing canvas id" }, { status: 400 });
    }

    await prisma.coSolveCanvas.deleteMany({
      where: { id: canvasId, userId: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("CoSolve canvases DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete canvas" }, { status: 500 });
  }
}
