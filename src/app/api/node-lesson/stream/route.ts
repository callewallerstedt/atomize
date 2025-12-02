import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requirePremiumAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // Check premium access
    const premiumCheck = await requirePremiumAccess();
    if (!premiumCheck.ok) {
      return NextResponse.json({ ok: false, error: premiumCheck.error }, { status: 403 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));

    const subject = String(body.subject || "");
    const topic = String(body.topic || "");
    const course_context = String(body.course_context || "");
    const combinedText = String(body.combinedText || "");
    const topicSummary = String(body.topicSummary || "");
    const lessonsMeta = Array.isArray(body.lessonsMeta) ? body.lessonsMeta : [];
    const lessonIndex = Number(body.lessonIndex ?? 0);
    const previousLessons = Array.isArray(body.previousLessons) ? body.previousLessons : [];
    const generatedLessons = Array.isArray(body.generatedLessons) ? body.generatedLessons : [];
    const otherLessonsMeta = Array.isArray(body.otherLessonsMeta) ? body.otherLessonsMeta : [];
    const courseTopics: string[] = Array.isArray(body.courseTopics) ? body.courseTopics.slice(0, 200) : [];
    const languageName = String(body.languageName || "");
    const mode = String(body.mode || "");

    // For Quick Learn, only topic is required
    const isQuickLearn = subject === "Quick Learn" || subject === "quicklearn";
    
    if (!topic) {
      return NextResponse.json({ ok: false, error: "Missing topic" }, { status: 400 });
    }
    
    // For non-Quick Learn lessons, require lessonsMeta
    if (!isQuickLearn && lessonsMeta.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing lessonsMeta" }, { status: 400 });
    }
    
    // For Quick Learn, create a default lessonsMeta if not provided
    const effectiveLessonsMeta = isQuickLearn && lessonsMeta.length === 0 
      ? [{ type: "Quick Learn", title: topic }]
      : lessonsMeta;

    const target = effectiveLessonsMeta[lessonIndex] || { type: "Full Lesson", title: `Lesson ${lessonIndex + 1}` };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Same system prompt as non-streaming version
    const system = [
      "You produce ONE comprehensive GitHub Flavored Markdown lesson that teaches the assigned topic from zero knowledge to problem-solving ability.",
      "",
      "LENGTH:",
      "- Minimum 3000 words of prose (explanations only). Target 4000–6000 if needed for full understanding.",
      "- Do not count code blocks, LaTeX delimiters, JSON, or formatting.",
      "- No filler. Use real explanatory depth.",
      "",
      "OUTPUT:",
      "- Output a single Markdown document only.",
      "- Do NOT include any JSON metadata block.",
      "- Just write the lesson content directly in Markdown.",
      "",
      "MARKDOWN RULES:",
      "- Use headings: #, ##, ### only.",
      "- Use blank lines around headings, lists, tables, code fences, and display math.",
      "- Tables must use pipe-syntax.",
      "- Code fences must specify language and be runnable.",
      "- Math uses inline $...$ and display \\[ ... \\]. No environments (align etc.).",
      "- No links, images, Mermaid, or HTML.",
      "",
      "PEDAGOGY:",
      "- Assume zero prior knowledge. Define all symbols and notation when first used.",
      "- Structure adaptively depending on the topic. No rigid template.",
      "- Build from intuition → formal definitions → deeper understanding → applications.",
      "- Include multiple worked examples if they genuinely help the topic. Each example must be complete and step-by-step.",
      "",
      "SYMBOL TABLE:",
      "- At the very bottom, create a small Markdown table listing symbols, notations, or short concepts ONLY if the lesson introduced non-obvious symbols that students must keep track of.",
      "",
      "SUMMARY (MANDATORY):",
      "- End the lesson with a clear summary section under a top-level or second-level heading such as '# Summary' or '## Summary'.",
      "- In the summary, concisely restate the core concepts, formulas, and procedures introduced in the lesson so they are easy to grasp at a glance.",
      "- Use either a short list of bullet points or a few short subheadings with 1–2 sentences each, focusing on \"what to remember\" and \"why it matters\".",
      "- Do NOT introduce any new concepts in the summary; it is only for reinforcing and organizing what was already taught.",
      "",
      "SCOPE:",
      "- CRITICAL: Focus EXCLUSIVELY on the assigned topic. Do NOT teach other topics, even if they are related.",
      "- Do NOT introduce concepts from other topics in the course unless they are absolutely prerequisite and already covered.",
      "- If the topic is part of a larger subject, teach ONLY this specific topic in depth. Reference other topics only if necessary for context, but do not teach them.",
      "- If course_context mentions a specific practice question, emphasize the method relevant to that question while still covering the full topic.",
      "- Every example, explanation, and concept must directly relate to the assigned topic.",
      "",
      "LANGUAGE:",
      languageName ? `- Write all metadata and prose in ${languageName}.` : "- Write all metadata and prose in English.",
      "",
      "FINAL RULE:",
      "- If the prose is under 3000 words when finished, extend explanations or add more depth until requirements are satisfied.",
      "",
      // Additional context for mode
      mode === "simplify" ? "If mode is simplify, keep scope identical but rewrite explanations to be easier, without changing the quiz meaning." : ""
    ].filter(Boolean).join("\n");

    // For Quick Learn, use simpler context without course materials
    const context = isQuickLearn ? [
      "=".repeat(50),
      `TOPIC TO TEACH: ${topic}`,
      "=".repeat(50),
      `This is a standalone Quick Learn lesson. Teach this topic comprehensively without requiring course context.`,
      `Target lesson: ${target.type} — ${target.title}`,
      languageName ? `Write the entire lesson in ${languageName}.` : ""
    ].filter(Boolean).join("\n\n") : [
      "=".repeat(50),
      `TOPIC TO TEACH: ${topic}`,
      "=".repeat(50),
      subject ? `Subject: ${subject}` : "",
      course_context ? `Course summary: ${course_context}` : "",
      topicSummary ? `Topic summary for "${topic}": ${topicSummary}` : "",
      courseTopics.length ? `Course topics (for context only; focus on "${topic}"): ${courseTopics.join(", ")}` : "",
      `Target lesson: ${target.type} — ${target.title}`,
      "Relevant material (truncated):",
      combinedText || "",
      previousLessons.length ? `Previous lessons recap (for continuity; avoid repeats): ${previousLessons.map((l: any) => l.title + ": " + (l.body || "").slice(0, 300)).join(" | ")}` : "",
      otherLessonsMeta.length ? `Planned other lessons (avoid overlap): ${otherLessonsMeta.map((m: any, i: number) => `L${i + 1} ${m.type} — ${m.title}`).join("; ")}` : "",
      generatedLessons.length ? `Already generated lessons (avoid repeating): ${generatedLessons.map((l: any) => l.title + ": " + (l.body || "").slice(0, 200)).join(" | ")}` : "",
      mode === "simplify"
        ? "Instruction: Rewrite the CURRENT section at an easier level. Keep the SAME scope, do not add new concepts. You may rewrite questions to match simpler wording but keep the same meaning and answer mapping."
        : ""
    ].filter(Boolean).join("\n\n");

    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: context }
      ],
      temperature: 0.5,
      max_tokens: 12000,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (error: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: error?.message || "Streaming error" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


