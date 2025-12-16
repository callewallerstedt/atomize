import { NextResponse } from "next/server";
import OpenAI from "openai";
import { stripLessonMetadata } from "@/lib/lessonFormat";
import { requirePremiumAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Check premium access
    const premiumCheck = await requirePremiumAccess();
    if (!premiumCheck.ok) {
      return NextResponse.json({ ok: false, error: premiumCheck.error }, { status: 403 });
    }

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
    const normalizedLessonContent = stripLessonMetadata(String(lessonContent));

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
      '      "correctAnswer": 0,',
      '      "explanation": "Explain why the correct answer is correct and why common misconceptions are wrong (can include Markdown and KaTeX)"',
      "    }",
      "  ]",
      "}",
      "",
      "CRITICAL RULES:",
      "- Generate exactly 4 questions",
      "- Each question must have exactly 4 options",
      "- correctAnswer is the index (0-3) of the correct option",
      "- Questions should be different from practice problems",
      "- CRITICAL - DISTRACTOR QUALITY: All incorrect options (distractors) MUST be plausible and require careful reading to eliminate. Each distractor should:",
      "  * Be based on real concepts from the lesson but with a MINOR detail wrong (e.g., wrong formula constant, slightly incorrect terminology, reversed relationship, wrong order of steps)",
      "  * NOT be obviously wrong or nonsensical (avoid options that are clearly false, unrelated, or make no sense)",
      "  * Test whether the student truly understands the concept, not just recognizes obvious errors",
      "  * Use common misconceptions or easy-to-make mistakes as distractors",
      "  * Make students think critically to identify why each distractor is wrong",
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
      normalizedLessonContent.slice(0, 15000),
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
    const validQuestions = data.questions
      .filter((q: any) => 
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctAnswer === "number" &&
        q.correctAnswer >= 0 &&
        q.correctAnswer < 4
      )
      .map((q: any) => ({
        question: String(q.question || ""),
        options: Array.isArray(q.options) ? q.options.map((o: any) => String(o ?? "")) : [],
        correctAnswer: Number(q.correctAnswer),
        explanation: typeof q.explanation === "string" && q.explanation.trim().length > 0
          ? q.explanation
          : `Correct answer: ${Array.isArray(q.options) ? String(q.options?.[q.correctAnswer] ?? "") : ""}`.trim(),
      }));

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
