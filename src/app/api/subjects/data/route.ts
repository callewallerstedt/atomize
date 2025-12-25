import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
    
    // Delete subject data
    const deleted = await prisma.subjectData.deleteMany({
      where: { userId: user.id, slug },
    });
    
    if (deleted.count === 0) {
      return NextResponse.json({ ok: false, error: "Subject data not found" }, { status: 404 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to delete subject data" }, { status: 500 });
  }
}



