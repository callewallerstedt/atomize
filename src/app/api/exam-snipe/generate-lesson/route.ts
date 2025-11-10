import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type GeneratedLesson = {
  planId: string;
  title: string;
  body: string;
  createdAt: string;
};

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
      conceptName,
      subConceptName,
      planId,
      planTitle,
      planSummary,
      planObjectives,
      planEstimatedTime,
      totalExams,
      gradeInfo,
      patternAnalysis,
      description,
      example,
      components,
      learning_objectives,
      common_pitfalls,
      existingLessons = [],
    } = body || {};

    if (!historySlug || !subConceptName || !conceptName || !planId || !planTitle) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const history = await prisma.examSnipeHistory.findUnique({
      where: { userId_slug: { userId: user.id, slug: historySlug } },
    });
    if (!history) {
      return NextResponse.json({ ok: false, error: "History not found" }, { status: 404 });
    }

    const examContext = [
      `Course Name: ${courseName || history.courseName || "Exam Snipe Course"}`,
      `Broader Concept: ${conceptName}`,
      `Focused Sub-Concept: ${subConceptName}`,
      planSummary ? `Plan Summary: ${planSummary}` : "",
      planEstimatedTime ? `Estimated Study Time: ${planEstimatedTime}` : "",
      Array.isArray(planObjectives) && planObjectives.length
        ? `Lesson Objectives:\n- ${planObjectives.join("\n- ")}`
        : "",
      `Exams analyzed: ${Number(totalExams) || 0}`,
      gradeInfo ? `Grade requirements: ${gradeInfo}` : "",
      patternAnalysis ? `Pattern analysis: ${patternAnalysis}` : "",
      description ? `Key focus from analysis: ${description}` : "",
      example ? `Representative exam example: ${example}` : "",
      components ? `Technical components to cover: ${components}` : "",
      learning_objectives ? `Learning objectives from analysis: ${learning_objectives}` : "",
      common_pitfalls ? `Common pitfalls to address: ${common_pitfalls}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const prompt = `
You are creating a full lesson for exam preparation.

Use the context below to write a thorough, exam-focused lesson that follows the planned objectives.

${examContext}

Existing lessons for this concept (avoid duplication): ${
      Array.isArray(existingLessons) && existingLessons.length
        ? existingLessons.map((l: any) => l.title).join(", ")
        : "None"
    }

Return JSON:
{
  "title": "Lesson title (use the plan title or improved version)",
  "body": "Markdown lesson content with headings, explanations, worked examples, and practice.",
  "quiz": [{ "question": "Practice question" }]
}

Rules:
- Lesson must stay laser-focused on "${subConceptName}".
- Follow the objectives and address pitfalls explicitly.
- Include worked examples tied to exam scenarios.
- End with a short recap paragraph before the quiz.
- Quiz must include 2-3 realistic practice problems.
`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You generate comprehensive lessons for exam preparation." },
        { role: "user", content: prompt },
      ],
      temperature: 0.75,
      max_tokens: 6000,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let data: any = {};
    try {
      data = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          data = JSON.parse(match[0]);
        } catch {
          data = {};
        }
      }
    }

    if (!data?.body) {
      return NextResponse.json({ ok: false, error: "Lesson generation failed" }, { status: 500 });
    }

    const lesson: GeneratedLesson = {
      planId,
      title: data?.title || planTitle,
      body: data?.body || "",
      createdAt: new Date().toISOString(),
    };

    const results = (history.results as any) || {};
    if (!results.generatedLessons) results.generatedLessons = {};
    if (!results.generatedLessons[subConceptName]) results.generatedLessons[subConceptName] = {};
    results.generatedLessons[subConceptName][planId] = lesson;

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

    return NextResponse.json({ ok: true, lesson, record: responseRecord });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

