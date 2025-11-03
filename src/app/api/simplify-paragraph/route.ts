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
      "- Make abstract concepts concrete with examples when helpful",
      "- Keep the same key facts, relationships, and conclusions - just express them simply",
      "- Use conversational, student-friendly language like you're explaining to a friend",
      "- Maintain the logical flow and structure of the original",
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
      temperature: 0.4,
      max_tokens: 1000,
    });

    const simplified = completion.choices[0]?.message?.content?.trim() || paragraph;

    return NextResponse.json({ ok: true, simplified });
  } catch (err: any) {
    console.error("Paragraph simplification error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
