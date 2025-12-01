import { NextResponse } from "next/server";
import OpenAI from "openai";
import { stripLessonMetadata } from "@/lib/lessonFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type FlashcardResponse = {
  flashcards?: { prompt: string; answer: string }[];
};

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "");
    const topic = String(body.topic || "");
    const content = String(body.content || "");
    const courseContext = String(body.courseContext || "");
    const languageName = String(body.languageName || "");
    const requestedCount = Number(body.count ?? 5);

    // Allow any count between 1 and 20
    const count = Math.max(1, Math.min(20, requestedCount));

    if (!content || content.trim().length < 50) {
      return NextResponse.json({ ok: false, error: "Content is required and must be at least 50 characters" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You create concise, high-quality flashcards to help a student review content.",
      "Return valid JSON that matches: { flashcards: { prompt: string; answer: string }[] }.",
      "Each flashcard must teach a distinct, high-impact takeaway from the content.",
      "Prompt should be phrased as a question or cue. Answer should be a short, direct explanation (1-3 sentences).",
      "Use Markdown only when it meaningfully improves clarity (e.g., math, code).",
      languageName ? `Write in ${languageName}.` : "",
      "Focus on the most important concepts, definitions, and key information from the provided content.",
    ].filter(Boolean).join("\n");

    const user = [
      subject ? `Subject: ${subject}` : "",
      topic ? `Topic: ${topic}` : "",
      courseContext ? `Course context: ${courseContext}` : "",
      `Create exactly ${count} flashcards from the content below.`,
      "Content:",
      stripLessonMetadata(content),
    ].filter(Boolean).join("\n\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.6,
      max_tokens: 2000,
    });

    const responseContent = completion.choices[0]?.message?.content || "{}";
    let data: FlashcardResponse = {};
    try {
      data = JSON.parse(responseContent);
    } catch {
      const start = responseContent.indexOf("{");
      const end = responseContent.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          data = JSON.parse(responseContent.slice(start, end + 1));
        } catch {
          data = {};
        }
      }
    }

    const flashcards = Array.isArray(data.flashcards) 
      ? data.flashcards.filter((card) => card && card.prompt && card.answer) 
      : [];
    
    return NextResponse.json({ ok: true, flashcards, raw: responseContent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}








