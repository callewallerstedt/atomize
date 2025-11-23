import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildQuizJsonInstruction } from "@/utils/surgeQuizPrompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractOutputText(resp: any): string {
  if (!resp) return "";

  try {
    if (Array.isArray(resp.output_text) && resp.output_text.length) {
      return resp.output_text.join("").trim();
    }
  } catch {}

  try {
    if (Array.isArray(resp.output) && resp.output.length) {
      const text = resp.output
        .map((block: any) => {
          if (!block?.content) return "";
          return block.content
            .map((segment: any) => {
              if (segment?.type === "output_text" && typeof segment.text === "string") {
                return segment.text;
              }
              if (typeof segment?.text === "string") {
                return segment.text;
              }
              return "";
            })
            .join("");
        })
        .join("");
      if (text.trim()) {
        return text.trim();
      }
    }
  } catch {}

  try {
    const choiceText = resp?.choices?.[0]?.message?.content;
    if (typeof choiceText === "string" && choiceText.trim()) {
      return choiceText.trim();
    }
    if (Array.isArray(choiceText)) {
      const joined = choiceText
        .map((segment: any) => {
          if (typeof segment === "string") return segment;
          if (typeof segment?.text === "string") return segment.text;
          return "";
        })
        .join("");
      if (joined.trim()) {
        return joined.trim();
      }
    }
  } catch {}

  return "";
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const stage = body.stage === "harder" ? "harder" : "mc";
    const courseName = String(body.courseName || "").trim();
    const topicName = String(body.topicName || "").trim();
    const context = String(body.context || "").trim();
    const lessonContent = String(body.lessonContent || "").trim();
    const mcQuestions = String(body.mcQuestions || "").trim();
    const debugInstruction =
      typeof body.debugInstruction === "string" && body.debugInstruction.trim().length > 0
        ? body.debugInstruction.trim()
        : undefined;

    if (!courseName || !topicName || !context) {
      return NextResponse.json(
        { error: "Missing courseName, topicName, or context" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const instructions = buildQuizJsonInstruction(stage, courseName, topicName, mcQuestions, debugInstruction);
    let trimmedContext = context.slice(0, 50000);
    if (stage && trimmedContext.includes("COURSE CONTEXT - CRITICAL")) {
      trimmedContext = trimmedContext.slice(trimmedContext.indexOf("COURSE CONTEXT - CRITICAL"));
    }
    const trimmedLesson = lessonContent ? lessonContent.slice(0, 20000) : "";
    let contextWithLesson = trimmedLesson
      ? `${trimmedContext}\n\n====================\nCURRENT LESSON CONTENT (use for quiz questions)\n====================\n${trimmedLesson}`
      : trimmedContext;
    
    if (stage === "harder" && mcQuestions) {
      contextWithLesson = `${contextWithLesson}\n\n====================\nPREVIOUS MC QUESTIONS (DO NOT duplicate - go deeper)\n====================\n${mcQuestions}`;
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: contextWithLesson || "No additional context." }],
        },
      ],
      temperature: stage === "mc" ? 0.5 : 0.7,
      max_output_tokens: stage === "mc" ? 1000 : 1200,
    });

    const raw = extractOutputText(response);
    if (!raw) {
      console.error("surge-quiz empty output", JSON.stringify(response ?? {}));
      return NextResponse.json(
        { error: "Quiz generation returned empty content" },
        { status: 502 }
      );
    }

    // Validate that the response looks like JSON, not lesson content
    const trimmed = raw.trim();
    const looksLikeJson = trimmed.startsWith("{") && (trimmed.includes('"mc"') || trimmed.includes('"short"') || trimmed.includes('"questions"'));
    const looksLikeLesson = trimmed.startsWith("#") || trimmed.includes("##") || (trimmed.length > 500 && !trimmed.includes('"question"'));
    
    if (looksLikeLesson && !looksLikeJson) {
      console.error("surge-quiz returned lesson content instead of JSON", {
        rawLength: raw.length,
        firstChars: raw.substring(0, 200),
        hasJson: looksLikeJson,
        hasLesson: looksLikeLesson
      });
      return NextResponse.json(
        { error: "Quiz generation returned lesson content instead of quiz JSON. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, raw, stage });
  } catch (err: any) {
    console.error("surge-quiz API error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate quiz" },
      { status: 500 }
    );
  }
}

