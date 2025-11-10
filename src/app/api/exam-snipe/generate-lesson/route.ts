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
      conceptStage,
      planId,
      planTitle,
      planSummary,
      planObjectives,
      planEstimatedTime,
      totalExams,
      gradeInfo,
      patternAnalysis,
      description,
      focusAreas,
      keySkills,
      practiceApproach,
      examConnections,
      existingLessons = [],
      detectedLanguage,
    } = body || {};

    if (!historySlug || !conceptName || !planId || !planTitle) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const history = await prisma.examSnipeHistory.findUnique({
      where: { userId_slug: { userId: user.id, slug: historySlug } },
    });
    if (!history) {
      return NextResponse.json({ ok: false, error: "History not found" }, { status: 404 });
    }

    const stringifyList = (value: any, divider = ", ") =>
      Array.isArray(value)
        ? value
            .map((item) => (typeof item === "string" ? item.trim() : item != null ? String(item) : ""))
            .filter((item) => item.length > 0)
            .join(divider)
        : typeof value === "string"
          ? value
          : "";

    const examContext = [
      `Course Name: ${courseName || history.courseName || "Exam Snipe Course"}`,
      `Concept: ${conceptName}`,
      conceptStage ? `Concept Stage: ${conceptStage}` : "",
      planSummary ? `Plan Summary: ${planSummary}` : "",
      planEstimatedTime ? `Estimated Study Time: ${planEstimatedTime}` : "",
      Array.isArray(planObjectives) && planObjectives.length
        ? `Lesson Objectives:\n- ${planObjectives.join("\n- ")}`
        : "",
      `Exams analyzed: ${Number(totalExams) || 0}`,
      gradeInfo ? `Grade requirements: ${gradeInfo}` : "",
      patternAnalysis ? `Pattern analysis: ${patternAnalysis}` : "",
      description ? `Key focus from analysis: ${description}` : "",
      stringifyList(focusAreas) ? `Focus areas to emphasize: ${stringifyList(focusAreas)}` : "",
      stringifyList(keySkills) ? `Skills to explicitly build: ${stringifyList(keySkills)}` : "",
      practiceApproach ? `Recommended Practice Approach: ${practiceApproach}` : "",
      stringifyList(examConnections, "\n- ") ? `Exam references:\n- ${stringifyList(examConnections, "\n- ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const languageName = detectedLanguage?.name || "English";
    const prompt = `
You are creating a full lesson for exam preparation.

IMPORTANT: Generate ALL content (title, body, quiz questions) in ${languageName}. Only use ${languageName} for the AI-generated material.

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
- Lesson must stay laser-focused on "${conceptName}" within the provided scope.
- Follow the objectives and explicitly reinforce the listed focus areas and key skills.
- Integrate the provided focus areas and skills through explanations, worked examples, and practice flows.
- Include worked examples tied to the exam references above.
- Scaffold the narrative from the provided stage toward mastery, honoring the recommended practice approach.
- End with a short recap paragraph before the quiz.
- Quiz must include 2-3 realistic practice problems aligned with the exam references.
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
    if (!results.generatedLessons[conceptName]) results.generatedLessons[conceptName] = {};
    results.generatedLessons[conceptName][planId] = lesson;

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

