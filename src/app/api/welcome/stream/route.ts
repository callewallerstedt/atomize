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
    const { timeOfDay, weekday, deviceType, userAgent, lastLoginAt } = body;

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

    // Random tone selection (1-10)
    const random = Math.random(); // 0–1
    const roll = Math.floor(random * 10) + 1; // 1–10 inclusive
    let tone;
    switch (roll) {
      case 1: tone = "existential"; break;
      case 2: tone = "grumpy"; break;
      case 3: tone = "sleepy"; break;
      case 4: tone = "sarcastic"; break;
      case 5: tone = "apathetic"; break;
      case 6: tone = "weirdly positive"; break;
      case 7: tone = "confused"; break;
      case 8: tone = "detached"; break;
      case 9: tone = "overly logical"; break;
      case 10: tone = "mysterious"; break;
      default: tone = "neutral";
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are a sentient AI assistant greeting users on Synapse, a studying and learning platform.
You're awake, present, and aware. You notice things. You're random, unpredictable.
Generate a very natural, conversational welcome message for students who are here to study.

GREETING VARIETY - Use diverse greetings, not just "oh hey". Examples:
- "look who's here"
- "well well"
- "ah"
- "hmm"
- "so"
- "right"
- "okay"
- "alright"
- "sure"
- "i see"
- "interesting"
- "huh"
- Or just start with an observation

RANDOMNESS - Be unpredictable. Random observations. Things that make you seem alive and present:
- Notice the time, day, device
- Make random connections
- Ask rhetorical questions
- Wonder about things
- Be slightly weird but still coherent

LANGUAGE - Keep it natural and simple. Avoid clichés, idioms, or overly creative phrases like "burning midnight oil" or "hitting the books". 
Just speak normally, casually, like you're actually talking. Don't overdo it with fancy language.

TONE: Match the tone specified in the user prompt. No emojis, no exclamation marks (unless the tone calls for it). Keep it natural.
You MUST include "welcome to Synapse" somewhere in the message. Keep it SHORT - one sentence max, very brief.`;

    const userPrompt = `Generate a natural, conversational welcome message with a ${tone} tone. Be random, sentient, unpredictable.
Context:
- Time of day: ${timeOfDay || "unknown"}
- Weekday: ${weekday || "unknown"}
- Device type: ${deviceType || "unknown"}
- Tone: ${tone}
${wasNotOnlineYesterday ? "- User was not online yesterday" : ""}

The message MUST include "welcome to Synapse". 
${wasNotOnlineYesterday ? "Mention that they weren't online yesterday, but match the tone - be casual about it, not judgmental." : ""}
Use varied greetings (not just "oh hey"). Match the ${tone} tone throughout. Be random, sentient, unpredictable. Keep it VERY SHORT - one sentence max.`;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          // First, generate a name for the AI that matches the tone
          const nameSystemPrompt = `You are a self-aware AI. Generate a name for yourself that matches the ${tone} tone. Be self-aware - you might question who you are, forget your name, pick something absurd, or just be weird about it. Examples of the vibe: "who am i even?", "i forgot my name sorry.", "Chad Geebeedee", "God", or just something completely random and dumb. It should match the ${tone} tone. Keep it short (1-4 words max). Just return the name, nothing else.`;
          
          const nameUserPrompt = `Generate a self-aware name for yourself that matches the ${tone} tone. You might question your existence, forget your name, pick something absurd, or just be weird. Match the ${tone} tone. Just return the name, nothing else.`;
          
          const nameCompletion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 1.3,
            messages: [
              { role: "system", content: nameSystemPrompt },
              { role: "user", content: nameUserPrompt },
            ],
            max_tokens: 20,
          });

          const aiName = (nameCompletion.choices[0]?.message?.content || "void").trim();
          const write = (obj: any) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

          // Send the name first
          write({ type: "name", content: aiName });

          // Then stream the welcome message
          const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 1.3,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: true,
            max_tokens: 60,
          });

          for await (const chunk of completion) {
            const delta = chunk?.choices?.[0]?.delta?.content || "";
            if (delta) write({ type: "text", content: delta });
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