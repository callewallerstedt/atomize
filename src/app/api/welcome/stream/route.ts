import { NextRequest } from "next/server";
import { modelForTask } from "@/lib/ai-models";
import { getTrackedOpenAIClient } from "@/lib/openai-tracking";

export const dynamic = "force-dynamic";

type WelcomeEvent =
  | { type: "name"; content: string }
  | { type: "text"; content: string }
  | { type: "done" }
  | { type: "error"; error: string };

type WelcomeRequestBody = {
  timeOfDay?: string;
  lastLoginAt?: string | null;
  preferredTitle?: string | null;
};

const FALLBACK_FOLLOWUPS = [
  "Let's get this over with.",
  "How about we get straight into it.",
  "I'm ready. Are you?",
  "Let's keep it moving.",
  "Let's make this count.",
];

function randomItem(items: string[]): string {
  return items[Math.floor(Math.random() * items.length)] || items[0];
}

function normalizeWelcomeMessage(raw: string, opener: string, fallbackMessage: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
  const withoutOpener = cleaned
    .replace(/^welcome back to synapse\.?/i, "")
    .replace(/^welcome to synapse\.?/i, "")
    .trim();
  const followup = withoutOpener
    .replace(/^[-:]\s*/, "")
    .trim()
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();

  if (!followup) {
    return fallbackMessage;
  }

  return `${opener} ${followup}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ type: "error", error: "Missing OPENAI_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as WelcomeRequestBody;
    const { timeOfDay, lastLoginAt, preferredTitle } = body;

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

    const client = await getTrackedOpenAIClient();

    // Determine if user is returning or new
    const isReturningUser = lastLoginAt && !wasNotOnlineYesterday;

    // Get user's preferred title
    const title = preferredTitle || "";

    const systemPrompt = `You are Chad, Synapse's AI assistant. You are short-spoken, direct, and slightly hard-edged without sounding rude.`;

    const opener = isReturningUser ? "Welcome back to Synapse." : "Welcome to Synapse.";
    const styleSeed = randomItem([
      "brisk and blunt",
      "focused and tactical",
      "calm and driven",
      "lean and challenging",
      "matter-of-fact and sharp",
    ]);
    const fallbackMessage = `${opener} ${randomItem(FALLBACK_FOLLOWUPS)}`;

    const userPrompt = `Greet the user. Keep it simple and concise - just a few words.

Context:
- ${isReturningUser ? "Returning user" : "New user"}
- Time of day: ${timeOfDay || "unknown"}
${title ? `- User prefers to be called: ${title}` : ""}
- Style seed: ${styleSeed}

Requirements:
- Return exactly two short sentences in plain text
- Sentence 1 must be exactly: "${opener}"
- Sentence 2 must be a short, driven follow-up line
- Keep sentence 2 under 9 words
- Not overly positive, not salesy, not cringe
- It can be lightly challenging
- Use different wording each time
- Do not mention paused features
- Do not use emojis
- Do not add labels, quotes, or markdown

Examples of acceptable sentence 2:
- Let's get this over with.
- How about we get straight into it.
- I'm ready. Are you?
- Let's make this count.`;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          // Simple name - just use "Synapse"
          const aiName = "Chad";
          const write = (obj: WelcomeEvent) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

          // Send the name first
          write({ type: "name", content: aiName });

          // Then stream the welcome message
          const completion = await client.chat.completions.create({
            model: modelForTask("welcomeMessage"),
            temperature: 1.2,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 40,
          });

          const assembled = completion.choices?.[0]?.message?.content || "";
          write({
            type: "text",
            content: normalizeWelcomeMessage(assembled, opener, fallbackMessage),
          });
          write({ type: "done" });
          controller.close();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Streaming failed";
          write({ type: "text", content: fallbackMessage });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: message })}\n\n`
            )
          );
          write({ type: "done" });
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
