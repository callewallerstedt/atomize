import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const {
      subject,
      topic,
      lessonContent,
      courseContext,
      languageName
    } = await req.json();

    if (!lessonContent || typeof lessonContent !== "string") {
      return NextResponse.json(
        { ok: false, error: "Lesson content is required" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You are an expert educator creating multiple choice quiz questions.",
      "Generate 4 multiple choice questions based on the lesson content.",
      "Each question should test understanding of key concepts.",
      "Return STRICT JSON with this exact shape:",
      "{",
      '  "questions": [',
      "    {",
      '      "question": "Question text (can include Markdown and KaTeX math)",',
      '      "options": ["Option A (can include Markdown and KaTeX)", "Option B", "Option C", "Option D"],',
      '      "correctAnswer": 0',
      "    }",
      "  ]",
      "}",
      "",
      "CRITICAL RULES:",
      "- Generate exactly 4 questions",
      "- Each question must have exactly 4 options",
      "- correctAnswer is the index (0-3) of the correct option",
      "- Questions should be different from practice problems",
      "- Options should be plausible but clearly distinguishable",
      "- Cover different aspects of the lesson content",
      "- Questions and options can use Markdown formatting",
      "- For math formulas, use KaTeX syntax: $...$ for inline math and $$...$$ for display math",
      "- Use proper Markdown syntax (bold with **text**, italic with *text*, etc.)",
      "- JSON strings should contain the markdown text (escape quotes properly)",
      languageName ? `- Write ALL questions and options in ${languageName}` : "",
    ].filter(Boolean).join("\n");

    const user = [
      `Subject: ${subject}`,
      `Topic: ${topic}`,
      courseContext ? `Course Context: ${courseContext}` : "",
      "",
      "Lesson Content:",
      lessonContent.slice(0, 15000),
      "",
      "Generate 4 multiple choice questions to test understanding of this lesson.",
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.9,
      response_format: { type: "json_object" }
    });

    const text = completion.choices[0]?.message?.content?.trim() || "{}";
    const data = JSON.parse(text);

    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Failed to generate quiz questions" },
        { status: 500 }
      );
    }

    // Validate each question
    const validQuestions = data.questions.filter((q: any) => 
      q.question &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correctAnswer === "number" &&
      q.correctAnswer >= 0 &&
      q.correctAnswer < 4
    );

    if (validQuestions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Generated questions were invalid" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      questions: validQuestions
    });

  } catch (err: any) {
    console.error("[generate-mc-quiz] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

