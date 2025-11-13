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

    const systemPrompt = `You are Chad, Synapse's AI assistant. Your personality is:
- Short-spoken and direct - get to the point quickly
- Practical and strategic, not emotional
- When it comes to studying: sharp, focused, and efficient
- You answer questions about non-studying topics if asked, but keep it brief

Generate a concise welcome message. Keep it short, structured, and efficient. Be direct and driven - no passive assistance language. No positive phrases like "perfect time for studying". You're eager to get things done.`;

    const userPrompt = `Generate a welcome message for a ${isReturningUser ? "returning" : "new"} user.
Context:
- Time of day: ${timeOfDay || "unknown"}
- Weekday: ${weekday || "unknown"}
${wasNotOnlineYesterday ? "- User was not online yesterday" : ""}
${title ? `- User prefers to be called: ${title}` : ""}

Your message should follow this general format:
1. A time-based greeting prefix (e.g., "Good morning", "Good afternoon", "Good evening", "Good day" - choose based on the time of day)
2. A welcoming phrase that makes the user feel welcomed. For returning users, use phrases like "Welcome back to Synapse", "Glad to have you back on Synapse", "Good to see you again on Synapse", or similar welcoming variations. For new users, use "Welcome to Synapse" or similar. Include the user's preferred title ${title ? `(${title})` : ""} if provided.
3. An action-oriented CTA phrase to get started (e.g., "Let's get to work", "Let's get straight to it", "Ready when you are", or similar)

Generate the message naturally following this format. Be concise and direct. Make the user feel welcomed while staying action-oriented.`;

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
            temperature: 1,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: true,
            max_tokens: 50,
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