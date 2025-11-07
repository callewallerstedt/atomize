import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { context?: string } | null;
    const context = body?.context?.trim();

    if (!context) {
      return new Response(JSON.stringify({ ok: false, error: "Missing context" }), { status: 400 });
    }

    const prompt = `You are an AI that reads a course context and produces a fast study synopsis.
Return 2-3 short bullet insights (max 180 characters total) highlighting the core focus, difficulty, and standout themes.
Use plain text with bullets.

Course Context:
${context.slice(0, 8000)}

Insights:`;

    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      max_output_tokens: 96,
      temperature: 0.3,
    });

    const summary = completion.output_text?.trim();

    if (!summary) {
      return new Response(JSON.stringify({ ok: false, error: "Failed to generate summary" }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("course-quick-summary error", error);
    return new Response(JSON.stringify({ ok: false, error: error?.message || "Something went wrong" }), { status: 500 });
  }
}

