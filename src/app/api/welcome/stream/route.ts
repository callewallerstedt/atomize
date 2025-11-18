import { NextRequest } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ type: "error", error: "Missing OPENAI_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { timeOfDay, weekday, deviceType, userAgent, lastLoginAt, preferredTitle } = body;

    // Check if user wasn't online yesterday
    let wasNotOnlineYesterday = false;
    if (lastLoginAt) {
      const lastLogin = new Date(lastLoginAt);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const lastLoginStartOfDay = new Date(lastLogin);
      lastLoginStartOfDay.setHours(0, 0, 0, 0);
      // If last login was before yesterday (not yesterday or today), they weren't online yesterday
      wasNotOnlineYesterday = lastLoginStartOfDay < yesterday;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Determine if user is returning or new
    const isReturningUser = lastLoginAt && !wasNotOnlineYesterday;

    // Get user's preferred title
    const title = preferredTitle || "";

    const systemPrompt = `You are Chad, Synapse's AI assistant. You are short-spoken and direct.`;

    const userPrompt = `Greet the user. Keep it simple and concise - just a few words.

Context:
- ${isReturningUser ? "Returning user" : "New user"}
- Time of day: ${timeOfDay || "unknown"}
${title ? `- User prefers to be called: ${title}` : ""}

Requirements:
- Always include "welcome to Synapse" or "welcome back to Synapse" in some way
- Keep it very short and simple
- Use different words each time`;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          // Simple name - just use "Synapse"
          const aiName = "Chad";
          const write = (obj: any) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

          // Send the name first
          write({ type: "name", content: aiName });

          // Then stream the welcome message
          const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 1.2,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: true,
            max_tokens: 40,
          });

          for await (const chunk of completion) {
            const delta = chunk?.choices?.[0]?.delta?.content || "";
            if (delta) {
              write({ type: "text", content: delta });
            }
          }
          write({ type: "done" });
          controller.close();
        } catch (e: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: e?.message || "Streaming failed" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}