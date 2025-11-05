import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(body.messages) ? body.messages : [];
    const context: string = String(body.context || "").slice(0, 12000);
    const path: string = String(body.path || "");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You are Nova, an AI tutor.",
      "Answer any question. Be concise, direct, and clear. Short sentences. No fluff.",
      "Use the provided CONTEXT if it helps—treat it as useful background, not a hard constraint.",
      "Prefer bullet points where helpful. Use Markdown. Equations in KaTeX ($...$). Code in fenced blocks.",
      "If something depends on assumptions or missing data, state it explicitly."
    ].join("\n");

    const chatMessages: any[] = [
      { role: "system", content: system },
      { role: "user", content: `Current page: ${path}\n\nCONTEXT:\n${context}` },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const completion: any = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: chatMessages,
            stream: true,
            max_tokens: 600,
          });

          // Write SSE headers
          const write = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

          for await (const chunk of completion) {
            const delta = chunk?.choices?.[0]?.delta?.content || "";
            if (delta) write({ type: "text", content: delta });
          }
          write({ type: "done" });
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: e?.message || 'Streaming failed' })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


