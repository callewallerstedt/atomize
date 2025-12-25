import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    
    const body = await req.json().catch(() => ({}));
    const selectedText = String(body.selectedText || "");
    const lessonBody = String(body.lessonBody || "");
    const subject = String(body.subject || "");
    const topic = String(body.topic || "");
    const languageName = String(body.languageName || "");

    if (!selectedText) {
      return NextResponse.json({ ok: false, error: "Missing selectedText" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You are an expert educator helping students understand concepts more deeply.",
      "You will be given a highlighted piece of text from a lesson, along with the full lesson context.",
      "",
      "Your task is to ELABORATE on the highlighted text, providing:",
      "- A deeper explanation of the concept",
      "- Why it matters in the context of the lesson",
      "- Examples or analogies to make it clearer",
      "- Any important connections to other concepts",
      "",
      "Constraints:",
      "- Keep the elaboration focused and concise (3-6 paragraphs max)",
      "- Use clear, student-friendly language",
      languageName ? `- CRITICAL LANGUAGE RULE: You MUST write the elaboration in ${languageName}. This is non-negotiable.` : "",
      "- If math or formulas are relevant, use KaTeX-compatible LaTeX:",
      "  - Inline math: \\\\( expression \\\\)",
      "  - Display math: \\\\[ expression \\\\]",
      "- You can use markdown formatting (bold, lists, headers)",
      "- Don't repeat the highlighted text verbatim at the start",
      "- Make connections to the broader lesson context where relevant",
    ].filter(Boolean).join("\n");

    // Truncate lesson body to fit in context
    const maxLessonLength = 8000;
    const truncatedLesson = lessonBody.length > maxLessonLength 
      ? lessonBody.slice(0, maxLessonLength) + "\n\n[... lesson truncated for context ...]"
      : lessonBody;

    const user = [
      "## LESSON CONTEXT",
      subject ? `Subject: ${subject}` : "",
      topic ? `Topic: ${topic}` : "",
      "",
      "### Full Lesson Content:",
      truncatedLesson,
      "",
      "---",
      "",
      "## HIGHLIGHTED TEXT TO ELABORATE ON:",
      `"${selectedText}"`,
      "",
      "Please provide a detailed elaboration of this highlighted text, using the lesson context to give a comprehensive explanation.",
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = completion.choices[0]?.message?.content || "";
    return NextResponse.json({ ok: true, elaboration: content });
  } catch (err: any) {
    console.error("Elaborate highlight error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}



