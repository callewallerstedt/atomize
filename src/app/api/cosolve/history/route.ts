import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.coSolveHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        imageData: true,
        response: true,
      },
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error("CoSolve history GET error:", e);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}



