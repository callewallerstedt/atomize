import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "");
    const topic = String(body.topic || "");
    const combinedText = String(body.combinedText || "");
    const course_context = String(body.course_context || "");
    const courseTopics: string[] = Array.isArray(body.courseTopics) ? body.courseTopics.slice(0, 200) : [];
    const languageName = String(body.languageName || "");
    if (!topic) return NextResponse.json({ ok: false, error: "Missing topic" }, { status: 400 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = [
      "You design an optimal lesson sequence for teaching ONE topic that builds deep, lasting understanding.",
      "Return STRICT JSON (no markdown, no code fences) with:",
      "{ overview_child: string; lessonsMeta: { type: string; title: string }[] }",
      "Rules:",
      `- Analyze the course context and materials to identify the most important concepts, methods, and skills for deep understanding.`,
      `- Design a lesson sequence that builds progressively from foundational knowledge to mastery.`,
      `- Let the content determine the optimal structure - don't force artificial categories.`,
      `- Each lesson should build upon previous ones, creating a coherent learning pathway.`,
      `- overview_child is brief, child-level, KaTeX-ready Markdown ($...$, $$...$$ allowed).`,
      languageName ? `- CRITICAL LANGUAGE RULE: You MUST write the overview_child and ALL lesson titles in ${languageName}. Even if the source material is in a different language (Spanish, German, etc.), you MUST translate and write everything in ${languageName}. This is non-negotiable.` : '',
      "- Choose lesson types that best fit the content (examples: 'Foundations', 'Core Concepts', 'Problem Solving', 'Advanced Applications', 'Mastery & Review', etc.)",
      "- Lesson titles should be descriptive and reflect the specific learning goals",
      "- Aim for 4-8 lessons that comprehensively cover the topic without overwhelming",
      "- Focus on lessons that develop both conceptual understanding and practical skills",
      "- Ensure the sequence creates meaningful connections between ideas",
    ].join("\n");

    const user = [
      `Subject: ${subject || "(unspecified)"}`,
      `Topic: ${topic}`,
      course_context ? `Course summary: ${course_context}` : "",
      courseTopics.length ? `Course topics: ${courseTopics.join(", ")}` : "",
      "Relevant material (truncated):",
      combinedText || "",
    ].filter(Boolean).join("\n\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "TopicPlan",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              overview_child: { type: "string" },
              lessonsMeta: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: { type: "string", description: "Descriptive lesson type that fits the content (e.g., 'Foundations', 'Core Concepts', 'Problem Solving', etc.)" },
                    title: { type: "string" },
                  },
                  required: ["type", "title"],
                },
              },
            },
            required: ["overview_child", "lessonsMeta"],
          },
          strict: true,
        },
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 900,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let data: any = {};
    try {
      data = JSON.parse(content);
    } catch {
      data = {};
    }
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


