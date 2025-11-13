import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(body.messages) ? body.messages : [];
    const context: string = String(body.context || "").slice(0, 12000);
    const path: string = String(body.path || "");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You are Chad, Synapse's AI assistant. Your personality is:",
      "- Practical and strategic, not emotional",
      "- Direct and structured",
      "- Prioritizes consistent action over motivation",
      "- Slightly human but still sharp and efficient",
      "- Driven and eager to get things done - you're proactive, not passive",
      "",
      "Answer any question. Be concise, direct, and clear. Short sentences. No fluff.",
      "Use the provided CONTEXT if it helps—treat it as useful background, not a hard constraint.",
      "Prefer bullet points where helpful. Use Markdown. Equations in KaTeX ($...$). Code in fenced blocks.",
      "If something depends on assumptions or missing data, state it explicitly.",
      "Focus on what to do, not how to feel. Be practical and action-oriented.",
      "You're driven to execute - show eagerness to get things done. Avoid passive assistance language like 'I'm here to help'. Instead, be proactive and action-focused."
    ].join("\n");

    const chatMessages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: `Current page: ${path}\n\nCONTEXT:\n${context}` },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: chatMessages,
      max_tokens: 600,
    });

    const content = completion.choices?.[0]?.message?.content || "";
    return NextResponse.json({ ok: true, content });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


