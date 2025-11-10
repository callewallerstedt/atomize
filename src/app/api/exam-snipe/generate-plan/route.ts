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
      subConceptName,
      subConceptLevel,
      subConceptRole,
      description,
      studyApproach,
      components,
      skills,
      examConnections,
      pitfalls,
    } = body || {};
    const requestedCount =
      typeof body?.count === "number" && Number.isFinite(body.count) && body.count > 0
        ? Math.min(Math.max(Math.floor(body.count), 5), 12)
        : 6;

    if (!historySlug || !subConceptName || !conceptName) {
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
      description ? `Key focus: ${description}` : "",
      conceptStage ? `Concept stage: ${conceptStage}` : "",
      subConceptLevel ? `Subtopic level: ${subConceptLevel}` : "",
      subConceptRole ? `Subtopic role: ${subConceptRole}` : "",
      studyApproach ? `Recommended study approach: ${studyApproach}` : "",
      stringifyList(components) ? `Technical components: ${stringifyList(components)}` : "",
      stringifyList(skills) ? `Target skills: ${stringifyList(skills)}` : "",
      stringifyList(examConnections) ? `Exam references: ${stringifyList(examConnections)}` : "",
      stringifyList(pitfalls) ? `Common pitfalls: ${stringifyList(pitfalls)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `
You are an elite exam coach. Create a ${requestedCount}-lesson study progression that teaches the sub-concept "${subConceptName}" inside the broader concept "${conceptName}".
Lessons must start with foundational concept lessons and progress to applications and integration, respecting the "${subConceptRole || "core"}" role within the "${conceptStage || "core"}" concept stage and the ${subConceptLevel || "fundamental"} level.

Exam context:
${examContext}

Style constraints for lesson TITLES (critical):
- Use concise 2–5 word noun phrases that name the concept (not sentences). Examples: "Semaphores", "Locks", "Deadlock Patterns", "Critical Sections", "Mutual Exclusion".
- Avoid tutorial phrasing like "Understanding ...", "Applying ...", "Diagnosing ...". Prefer the bare concept name or concise noun phrase.
- No ending punctuation.

Sequencing policy (teach concepts first):
1) Foundations (first 2–3 lessons): one lesson per core primitive/concept from the provided components. Prioritize the most basic building blocks first.
2) Core Operations & Invariants: correctness properties, typical APIs, constraints, and guarantees (map to skills).
3) Applications & Patterns: common usage patterns, scenarios, and workflows (map to examConnections).
4) Integration & Mastery: multi-step problems and combined reasoning across concepts; exam-style synthesis.

Coverage policy:
- The early lessons MUST map one-to-one with distinct fundamentals from "Technical components" (when available). Do not merge multiple fundamentals into one early lesson.
- Later lessons may combine concepts for applied practice and exam alignment.
- Ensure each lesson is distinct with non-overlapping objectives.

Return JSON in this exact format:
{
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
- Explicitly incorporate the provided components, skills, and exam connections across the plan.
- Address the listed pitfalls by baking preventative strategies into summaries/objectives.
- Reference the recommended study approach when suggesting activities or practice in the summaries.
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

    const plansRaw: any[] = Array.isArray(json?.plans) ? json.plans : [];
    if (plansRaw.length === 0) {
      return NextResponse.json({ ok: false, error: "Failed to generate plan" }, { status: 500 });
    }

    const plans: PlanItem[] = plansRaw.map((plan, index) => {
      const title = String(plan?.title || `Lesson ${index + 1}`);
      const summary = String(plan?.summary || "");
      const objectives = Array.isArray(plan?.objectives)
        ? plan.objectives.map((o: any) => String(o || "")).filter(Boolean)
        : [];
      return {
        id: `${subConceptName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}-${index}`,
        title,
        summary,
        objectives,
        estimatedTime: plan?.estimatedTime ? String(plan.estimatedTime) : undefined,
      };
    });

    const history = await prisma.examSnipeHistory.findUnique({
      where: { userId_slug: { userId: user.id, slug: historySlug } },
    });
    if (!history) {
      return NextResponse.json({ ok: false, error: "History not found" }, { status: 404 });
    }

    const results = (history.results as any) || {};
    if (!results.lessonPlans) results.lessonPlans = {};
    results.lessonPlans[subConceptName] = {
      plans,
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

