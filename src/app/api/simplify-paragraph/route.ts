import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "");
    const topic = String(body.topic || "");
    const paragraph = String(body.paragraph || "").trim();
    const lessonContent = String(body.lessonContent || "");
    const courseContext = String(body.courseContext || "");
    const languageName = String(body.languageName || "");

    if (!paragraph) {
      return NextResponse.json({ error: "No paragraph provided" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You are an expert educator who simplifies complex academic or technical text for students.",
      "Your goal is to rewrite paragraphs to be MUCH easier to understand while keeping ALL the important information.",
      "Simplification rules:",
      "- Use very simple, everyday words instead of complex vocabulary",
      "- Break down long sentences into 2-3 short, clear sentences",
      "- Explain technical terms in simple language (don't just use synonyms - actually explain what they mean)",
      "- Remove unnecessary jargon and academic language",
      "- Add concrete analogies or everyday examples to make abstract concepts tangible",
      "- If there's a formula, explain in plain words WHAT it's calculating and WHY before showing the math",
      "- Keep the same key facts, relationships, and conclusions - just express them simply",
      "- Use conversational, student-friendly language like you're explaining to a friend",
      "- Maintain the logical flow and structure of the original",
      languageName ? `- CRITICAL LANGUAGE RULE: You MUST write the simplified paragraph in ${languageName}. Even if the original text is in a different language (Spanish, German, etc.), you MUST translate and write the simplified version in ${languageName}. This is non-negotiable.` : `- Write in the same language as the original text.`,
      "CRITICAL LaTeX/Math rules:",
      "- ALL Greek letters MUST have backslash: \\eta \\alpha \\beta \\theta NOT eta alpha beta theta",
      "- Text in math: \\text{proper text} NOT \\t, NOT ext{text}, NEVER use \\t as it's a tab character",
      "- Common errors: '\\tSpam' → must be '\\text{Spam}', 'eta_0' → must be '\\eta_0', 'ext{fel}' → must be '\\text{fel}'",
      "- Escape underscores: \\_ in \\text{var\\_name}",
      "IMPORTANT: Make it significantly easier to read and understand, not just slightly simpler.",
      "Return ONLY the simplified paragraph text - no quotes, no explanations, no formatting.",
    ].join("\n");

    const user = [
      subject ? `Subject: ${subject}` : "",
      topic ? `Topic: ${topic}` : "",
      courseContext ? `Course context: ${courseContext.slice(0, 1000)}` : "",
      lessonContent ? `Lesson context: ${lessonContent.slice(0, 1500)}` : "",
      "",
      "Original paragraph to simplify:",
      paragraph,
      "",
      "Please rewrite this paragraph to be MUCH easier for students to understand. Use simple words, short sentences, and explain any technical terms. Keep all the important information but make it conversational and clear:"
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const simplified = completion.choices[0]?.message?.content?.trim() || paragraph;

    return NextResponse.json({ ok: true, simplified });
  } catch (err: any) {
    console.error("Paragraph simplification error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
