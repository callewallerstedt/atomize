import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type PlanItem = {
  id: string;
  title: string;
  summary: string;
  objectives: string[];
  estimatedTime?: string;
};

const MAX_HISTORY_ITEMS = 20;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      historySlug,
      courseName,
      totalExams,
      gradeInfo,
      patternAnalysis,
      conceptName,
      conceptStage,
      description,
      focusAreas,
      keySkills,
      practiceApproach,
      examConnections,
      detectedLanguage,
    } = body || {};
    const requestedCount =
      typeof body?.count === "number" && Number.isFinite(body.count) && body.count > 0
        ? Math.min(Math.max(Math.floor(body.count), 5), 12)
        : 6;

    if (!historySlug || !conceptName) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const stringifyList = (value: any) =>
      Array.isArray(value)
        ? value
            .map((item) => (typeof item === "string" ? item.trim() : item != null ? String(item) : ""))
            .filter((item) => item.length > 0)
            .join(", ")
        : typeof value === "string"
          ? value
          : "";

    const examContext = [
      `Course Name: ${courseName || "Exam Snipe Course"}`,
      `Exams analyzed: ${Number(totalExams) || 0}`,
      gradeInfo ? `Grade requirements: ${gradeInfo}` : "",
      patternAnalysis ? `Pattern analysis: ${patternAnalysis}` : "",
      description ? `Concept description: ${description}` : "",
      conceptStage ? `Concept stage: ${conceptStage}` : "",
      stringifyList(focusAreas) ? `Focus areas: ${stringifyList(focusAreas)}` : "",
      stringifyList(keySkills) ? `Key skills: ${stringifyList(keySkills)}` : "",
      practiceApproach ? `Recommended practice approach: ${practiceApproach}` : "",
      stringifyList(examConnections) ? `Exam references: ${stringifyList(examConnections)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const languageName = detectedLanguage?.name || "English";
    const prompt = `
You are an elite exam coach. Create a ${requestedCount}-lesson study progression that fully teaches the concept "${conceptName}".
Lessons must start with foundational work and progress toward integrated mastery, respecting the "${conceptStage || "core"}" stage described in the exam analysis.

IMPORTANT: Generate ALL content (lesson titles, summaries, objectives) in ${languageName}. Only use ${languageName} for the AI-generated material.

Exam context:
${examContext}

Style constraints for lesson TITLES (critical):
- Use concise 2–5 word noun phrases that name the concept (not sentences). Examples: "Semaphores", "Locks", "Deadlock Patterns", "Critical Sections", "Mutual Exclusion".
- Avoid tutorial phrasing like "Understanding ...", "Applying ...", "Diagnosing ...". Prefer the bare concept name or concise noun phrase.
- No ending punctuation.

Sequencing policy (teach concepts first):
1) Foundations (first 2–3 lessons): anchor the essential theory and core focus areas.
2) Core Operations & Invariants: correctness properties, typical APIs, constraints, and guarantees (map to the key skills).
3) Applications & Patterns: common usage patterns, scenarios, and workflows (map to examConnections).
4) Integration & Mastery: multi-step problems and combined reasoning across concepts; exam-style synthesis.

Coverage policy:
- Early lessons must map one-to-one with the most fundamental focus areas.
- Later lessons may combine focus areas for applied practice and exam alignment.
- Ensure each lesson is distinct with non-overlapping objectives.

Return JSON in this exact format:
{
  "summary": "2-3 sentences describing how the plan progresses and what outcomes it delivers",
  "focusAreas": ["Focus Area A", "Focus Area B"],
  "keySkills": ["Analyze ...", "Construct ..."],
  "practiceApproach": "1-2 sentences describing practice expectations",
  "examConnections": ["Exam 2022 Q3 - ...", "Exam 2021 Q1 - ..."],
  "plans": [
    {
      "title": "Concise concept title (2–5 words)",
      "summary": "2–3 sentences describing what this lesson covers and why it matters on the exam",
      "objectives": ["3–5 concrete, action-oriented objectives"],
      "estimatedTime": "e.g. 45m"
    }
  ]
}

Rules:
- Objectives must begin with verbs like "Explain", "Define", "Prove", "Apply", "Analyze".
- Sequence lessons strictly from fundamentals ➝ operations/invariants ➝ applications/patterns ➝ integration/mastery.
- Explicitly incorporate the provided focus areas, key skills, and exam connections across the plan.
- Reference the recommended practice approach when suggesting activities or practice in the summaries.
`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You design structured study plans for exam prep." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 1200,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let json: any = {};
    try {
      json = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          json = JSON.parse(match[0]);
        } catch {
          json = {};
        }
      }
    }

    const lessonsRaw: any[] = Array.isArray(json?.plans) ? json.plans : [];
    if (lessonsRaw.length === 0) {
      return NextResponse.json({ ok: false, error: "Failed to generate plan" }, { status: 500 });
    }

    const lessons: PlanItem[] = lessonsRaw.map((plan, index) => {
      const title = String(plan?.title || `Lesson ${index + 1}`);
      const summary = String(plan?.summary || "");
      const objectives = Array.isArray(plan?.objectives)
        ? plan.objectives.map((o: any) => String(o || "")).filter(Boolean)
        : [];
      return {
        id: `${conceptName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}-${index}`,
        title,
        summary,
        objectives,
        estimatedTime: plan?.estimatedTime ? String(plan.estimatedTime) : undefined,
      };
    });

    const summaryText = typeof json?.summary === "string" ? json.summary : "";
    const focusAreasList = Array.isArray(json?.focusAreas)
      ? json.focusAreas.map((item: any) => String(item || "")).filter(Boolean)
      : [];
    const keySkillsList = Array.isArray(json?.keySkills)
      ? json.keySkills.map((item: any) => String(item || "")).filter(Boolean)
      : [];
    const practiceApproachText = typeof json?.practiceApproach === "string" ? json.practiceApproach : "";
    const examConnectionsList = Array.isArray(json?.examConnections)
      ? json.examConnections.map((item: any) => String(item || "")).filter(Boolean)
      : [];

    const history = await prisma.examSnipeHistory.findUnique({
      where: { userId_slug: { userId: user.id, slug: historySlug } },
    });
    if (!history) {
      return NextResponse.json({ ok: false, error: "History not found" }, { status: 404 });
    }

    const results = (history.results as any) || {};
    if (!results.lessonPlans) results.lessonPlans = {};
    results.lessonPlans[conceptName] = {
      summary: summaryText,
      focusAreas: focusAreasList,
      keySkills: keySkillsList,
      practiceApproach: practiceApproachText,
      examConnections: examConnectionsList,
      lessons,
    };

    const updated = await prisma.examSnipeHistory.update({
      where: { userId_slug: { userId: user.id, slug: historySlug } },
      data: {
        courseName: courseName || history.courseName,
        results,
      },
    });

    const responseRecord = {
      id: updated.id,
      courseName: updated.courseName,
      slug: updated.slug,
      createdAt: updated.createdAt.toISOString(),
      fileNames: Array.isArray(updated.fileNames) ? (updated.fileNames as string[]) : [],
      results: updated.results,
    };

    // Cleanup older records beyond limit
    const totalRecords = await prisma.examSnipeHistory.count({ where: { userId: user.id } });
    if (totalRecords > MAX_HISTORY_ITEMS) {
      const pruning = await prisma.examSnipeHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        take: totalRecords - MAX_HISTORY_ITEMS,
        select: { id: true },
      });
      if (pruning.length) {
        await prisma.examSnipeHistory.deleteMany({
          where: { id: { in: pruning.map((r: { id: string }) => r.id) } },
        });
      }
    }

    return NextResponse.json({ ok: true, record: responseRecord });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

