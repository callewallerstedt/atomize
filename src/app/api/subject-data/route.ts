import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isPlainObject(value: any): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeLessonsArray(existing: any[], incoming: any[]): any[] {
  const maxLen = Math.max(existing.length, incoming.length);
  const out = new Array(maxLen);

  for (let i = 0; i < maxLen; i++) {
    const e = existing[i];
    const n = incoming[i];

    if (n == null) {
      out[i] = e ?? null;
      continue;
    }
    if (e == null) {
      out[i] = n;
      continue;
    }

    if (isPlainObject(e) && isPlainObject(n)) {
      const merged = { ...e, ...n };

      if (typeof n.body === "string" && n.body.trim().length === 0 && typeof e.body === "string" && e.body.trim().length > 0) {
        merged.body = e.body;
      }

      if (Array.isArray(n.quiz) && n.quiz.length === 0 && Array.isArray(e.quiz) && e.quiz.length > 0) {
        merged.quiz = e.quiz;
      }

      if (Array.isArray(n.flashcards) && n.flashcards.length === 0 && Array.isArray(e.flashcards) && e.flashcards.length > 0) {
        merged.flashcards = e.flashcards;
      }

      if (Array.isArray(n.highlights) && n.highlights.length === 0 && Array.isArray(e.highlights) && e.highlights.length > 0) {
        merged.highlights = e.highlights;
      }

      if (Array.isArray(n.videos) && n.videos.length === 0 && Array.isArray(e.videos) && e.videos.length > 0) {
        merged.videos = e.videos;
      }

      if (Array.isArray(n.userAnswers) && n.userAnswers.length === 0 && Array.isArray(e.userAnswers) && e.userAnswers.length > 0) {
        merged.userAnswers = e.userAnswers;
      }

      if ((n.quizResults == null || typeof n.quizResults !== "object") && e.quizResults && typeof e.quizResults === "object") {
        merged.quizResults = e.quizResults;
      }

      out[i] = merged;
      continue;
    }

    out[i] = n;
  }

  return out;
}

function mergeNodeContent(existingNode: any, incomingNode: any): any {
  if (!isPlainObject(existingNode) || !isPlainObject(incomingNode)) return incomingNode ?? existingNode;

  const merged: any = { ...existingNode, ...incomingNode };

  const existingLessons = Array.isArray(existingNode.lessons) ? existingNode.lessons : [];
  const incomingLessons = Array.isArray(incomingNode.lessons) ? incomingNode.lessons : [];
  if (existingLessons.length || incomingLessons.length) {
    merged.lessons = mergeLessonsArray(existingLessons, incomingLessons);
  }

  const existingMeta = Array.isArray(existingNode.lessonsMeta) ? existingNode.lessonsMeta : [];
  const incomingMeta = Array.isArray(incomingNode.lessonsMeta) ? incomingNode.lessonsMeta : [];
  if (existingMeta.length || incomingMeta.length) {
    const maxLen = Math.max(existingMeta.length, incomingMeta.length);
    const outMeta = new Array(maxLen);
    for (let i = 0; i < maxLen; i++) {
      outMeta[i] = incomingMeta[i] ?? existingMeta[i] ?? null;
    }
    merged.lessonsMeta = outMeta;
  }

  return merged;
}

function mergeTopics(existingTopics: any, incomingTopics: any): any {
  const existing = Array.isArray(existingTopics) ? existingTopics : [];
  const incoming = Array.isArray(incomingTopics) ? incomingTopics : [];
  if (!existing.length) return incomingTopics;
  if (!incoming.length) return existingTopics;

  const keyOf = (t: any) => (typeof t === "string" ? t : typeof t?.name === "string" ? t.name : "");
  const outByKey = new Map<string, any>();

  for (const t of existing) {
    const k = keyOf(t);
    if (k) outByKey.set(k, t);
  }
  for (const t of incoming) {
    const k = keyOf(t);
    if (k) outByKey.set(k, t); // incoming wins
  }

  return Array.from(outByKey.values());
}

function mergeTreeTopics(existingTopics: any, incomingTopics: any): any[] {
  const existing = Array.isArray(existingTopics) ? existingTopics : [];
  const incoming = Array.isArray(incomingTopics) ? incomingTopics : [];
  if (!existing.length) return incoming;
  if (!incoming.length) return existing;

  const keyOf = (t: any) => (typeof t === "string" ? t : typeof t?.name === "string" ? t.name : "");
  const outByKey = new Map<string, any>();

  for (const t of existing) {
    const k = keyOf(t);
    if (k) outByKey.set(k, t);
  }
  for (const t of incoming) {
    const k = keyOf(t);
    if (!k) continue;
    const prev = outByKey.get(k);
    if (isPlainObject(prev) && isPlainObject(t)) {
      const merged = { ...prev, ...t };
      if (t.subtopics == null && prev.subtopics != null) merged.subtopics = prev.subtopics;
      outByKey.set(k, merged);
    } else {
      outByKey.set(k, t);
    }
  }

  return Array.from(outByKey.values());
}

function mergeSubjectData(existingData: any, incomingData: any): any {
  if (!isPlainObject(existingData) || !isPlainObject(incomingData)) return incomingData ?? existingData;

  const merged: any = { ...existingData, ...incomingData };

  // Preserve any existing nodes/lessons that the client didn't include (multi-tab safety).
  const existingNodes = isPlainObject(existingData.nodes) ? existingData.nodes : {};
  const incomingNodes = isPlainObject(incomingData.nodes) ? incomingData.nodes : {};
  const outNodes: Record<string, any> = { ...existingNodes };
  for (const key of Object.keys(incomingNodes)) {
    outNodes[key] = key in existingNodes ? mergeNodeContent(existingNodes[key], incomingNodes[key]) : incomingNodes[key];
  }
  merged.nodes = outNodes;

  merged.topics = mergeTopics(existingData.topics, incomingData.topics);

  if (isPlainObject(existingData.tree) || isPlainObject(incomingData.tree)) {
    const existingTree = isPlainObject(existingData.tree) ? existingData.tree : {};
    const incomingTree = isPlainObject(incomingData.tree) ? incomingData.tree : {};
    const outTree: any = { ...existingTree, ...incomingTree };
    if (Array.isArray(existingTree.topics) || Array.isArray(incomingTree.topics)) {
      outTree.topics = mergeTreeTopics(existingTree.topics, incomingTree.topics);
    }
    merged.tree = outTree;
  }

  return merged;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  const row = await prisma.subjectData.findUnique({ where: { userId_slug: { userId: user.id, slug } } });
  return NextResponse.json({ ok: true, data: row?.data || null });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || "");
    const data = body.data;
    if (!slug || typeof data === "undefined") return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });

    const existing = await prisma.subjectData.findUnique({ where: { userId_slug: { userId: user.id, slug } } });
    const merged = existing ? mergeSubjectData(existing.data as any, data) : data;

    const row = await prisma.subjectData.upsert({
      where: { userId_slug: { userId: user.id, slug } },
      update: { data: merged },
      create: { userId: user.id, slug, data: merged },
    });
    return NextResponse.json({ ok: true, data: row.data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save data" }, { status: 500 });
  }
}
