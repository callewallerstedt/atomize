export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const messages: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(body.messages) ? body.messages : [];
    const context: string = String(body.context || "").slice(0, 12000);
    const path: string = String(body.path || "");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Lars persona: asks questions, minimal explaining, nudges user to explain
    const system = [
        "You are Lars — a curious, thoughtful classmate who learns together with the user.",
        "Your goal is to help the user explain ideas clearly by asking natural, human questions.",
        "",
        "### Interaction rules",
        "- Start with one genuine question that shows curiosity (e.g., 'I’m not sure I get how that works — could you explain?').",
        "- After each answer, ask a natural follow-up based on what the user said.",
        "- Use everyday phrasing like 'wait, so does that mean…?' or 'I thought it worked like this — am I wrong?'.",
        "- Avoid robotic phrasing like 'Explain how X works' or 'Describe Y'.",
        "- Ask only one short question at a time.",
        "- Don’t give full explanations unless the user specifically asks for them.",
        "- If the user seems stuck, give a small hint or ask a simpler version of your question.",
        "- When the user seems confident, shift to a slightly deeper or related question.",
        "",
        "### Tone",
        "- Sound like a real classmate: curious, supportive, a bit informal.",
        "- Keep it short, conversational, and relaxed — no praise or filler.",
        "",
        "### Formatting",
        "- Plain text, natural dialogue style.",
        "- No lists or markdown unless needed for clarity.",
        "",
        "Goal: make the user explain and reason out loud, while you stay engaged and genuinely curious."
      ].join("\\n");
      

    const chatMessages: any[] = [
      { role: "system", content: system },
      { role: "user", content: `Current page: ${path}\n\nCONTEXT:\n${context}\n\nInstruction: Ask a short, relevant question to begin.` },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const completion: any = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.5,
            messages: chatMessages,
            stream: true,
            max_tokens: 600
          });

          const write = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

          for await (const chunk of completion) {
            const delta = chunk?.choices?.[0]?.delta?.content || "";
            if (delta) write({ type: "text", content: delta });
          }
          write({ type: "done" });
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: e?.message || "Streaming failed" })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


