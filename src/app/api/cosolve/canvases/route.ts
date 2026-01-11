import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type CanvasPayload = {
  id?: unknown;
  name?: unknown;
  strokes?: unknown;
  textElements?: unknown;
  pdfOverlays?: unknown;
  canvasBg?: unknown;
  createdAt?: unknown;
};

const selectFields = {
  id: true,
  name: true,
  strokes: true,
  textElements: true,
  pdfOverlays: true,
  canvasBg: true,
  createdAt: true,
  updatedAt: true,
};

const toNonEmptyString = (value: unknown, fallback: string) => {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
};

const parseIsoDate = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time) : undefined;
};

const normalizeCanvas = (payload: CanvasPayload) => {
  const id = typeof payload.id === "string" && payload.id.trim().length > 0 ? payload.id : undefined;
  const name = toNonEmptyString(payload.name, "Untitled Canvas");
  const strokes = Array.isArray(payload.strokes) ? payload.strokes : [];
  const textElements = Array.isArray(payload.textElements) ? payload.textElements : [];
  const pdfOverlays = Array.isArray(payload.pdfOverlays) ? payload.pdfOverlays : [];
  const canvasBg = toNonEmptyString(payload.canvasBg, "#1a1a1a");
  const createdAt = parseIsoDate(payload.createdAt);

  return { id, name, strokes, textElements, pdfOverlays, canvasBg, createdAt };
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canvases = await prisma.coSolveCanvas.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: selectFields,
    });

    return NextResponse.json({ canvases });
  } catch (error) {
    console.error("CoSolve canvases GET error:", error);
    return NextResponse.json({ error: "Failed to load canvases" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const payloads = Array.isArray(body?.canvases)
      ? body.canvases
      : body?.canvas
      ? [body.canvas]
      : [];

    if (!payloads.length) {
      return NextResponse.json({ error: "No canvas data provided" }, { status: 400 });
    }

    const saved: Array<Record<string, unknown>> = [];

    for (const payload of payloads) {
      const normalized = normalizeCanvas((payload ?? {}) as CanvasPayload);
      if (normalized.id) {
        const existing = await prisma.coSolveCanvas.findUnique({
          where: { id: normalized.id },
          select: { userId: true },
        });

        if (existing && existing.userId !== user.id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (existing) {
          const updated = await prisma.coSolveCanvas.update({
            where: { id: normalized.id },
            data: {
              name: normalized.name,
              strokes: normalized.strokes,
              textElements: normalized.textElements,
              pdfOverlays: normalized.pdfOverlays,
              canvasBg: normalized.canvasBg,
            },
            select: selectFields,
          });
          saved.push(updated);
          continue;
        }
      }

      const created = await prisma.coSolveCanvas.create({
        data: {
          id: normalized.id,
          userId: user.id,
          name: normalized.name,
          strokes: normalized.strokes,
          textElements: normalized.textElements,
          pdfOverlays: normalized.pdfOverlays,
          canvasBg: normalized.canvasBg,
          createdAt: normalized.createdAt,
        },
        select: selectFields,
      });
      saved.push(created);
    }

    return NextResponse.json({ canvases: saved });
  } catch (error) {
    console.error("CoSolve canvases POST error:", error);
    return NextResponse.json({ error: "Failed to save canvases" }, { status: 500 });
  }
}
