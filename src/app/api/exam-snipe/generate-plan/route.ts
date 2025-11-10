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
      subConceptName,
      description,
      example,
      components,
      learning_objectives,
      common_pitfalls,
    } = body || {};
    const requestedCount =
      typeof body?.count === "number" && Number.isFinite(body.count) && body.count > 0 ? Math.min(Math.floor(body.count), 10) : 3;

    if (!historySlug || !subConceptName || !conceptName) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const examContext = [
      `Course Name: ${courseName || "Exam Snipe Course"}`,
      `Exams analyzed: ${Number(totalExams) || 0}`,
      gradeInfo ? `Grade requirements: ${gradeInfo}` : "",
      patternAnalysis ? `Pattern analysis: ${patternAnalysis}` : "",
      description ? `Key focus: ${description}` : "",
      example ? `Example from exams: ${example}` : "",
      components ? `Technical components: ${components}` : "",
      learning_objectives ? `Learning objectives from analysis: ${learning_objectives}` : "",
      common_pitfalls ? `Common pitfalls to address: ${common_pitfalls}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `
You are an elite exam coach. Create a ${requestedCount}-lesson study plan that teaches the sub-concept "${subConceptName}" inside the broader concept "${conceptName}".

Exam context:
${examContext}

Return JSON in this exact format:
{
  "plans": [
    {
      "title": "Short actionable lesson title",
      "summary": "2-3 sentences describing what this lesson covers",
      "objectives": ["List of concrete learning objectives"],
      "estimatedTime": "e.g. 45m"
    }
  ]
}

Rules:
- Titles must be 4-8 words, no punctuation at the end.
- Objectives must be action-oriented (start with verbs like "Apply", "Explain", "Solve").
- Ensure the sequence builds from fundamentals to exam-level mastery.
- Align coverage with the exam patterns and pitfalls above.
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
          where: { id: { in: pruning.map((r) => r.id) } },
        });
      }
    }

    return NextResponse.json({ ok: true, record: responseRecord });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

