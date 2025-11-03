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
    const mode = String(body.mode || ""); // "simplify" to rewrite easier
    if (!topic || lessonsMeta.length === 0) return NextResponse.json({ ok: false, error: "Missing topic or lessonsMeta" }, { status: 400 });

    const target = lessonsMeta[lessonIndex] || { type: "Concept", title: `Lesson ${lessonIndex + 1}` };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = [
      "You generate ONE lesson for a topic using the provided course context and materials.",
      "Return JSON: { title: string; body: string; quiz: { question: string }[] }",
      "Rules:",
      `- Use the detailed course context to identify and teach SPECIFIC concepts, methods, and skills mentioned in the learning objectives.`,
      `- Body should be clean, well-structured Markdown using proper KaTeX math syntax. Use $...$ for inline math and $$...$$ for display math. ${languageName ? `Write in ${languageName}.` : ''}`,
      "- For code and function names in text, use proper LaTeX: \\text{sem\\_wait(\\&semaphore)} not \\text{sem extunderscore wait(&semaphore)}",
      "- Use \\text{} for text in math expressions and escape underscores with \\_",
      "- Focus on teaching the specific concepts, methods, and procedures outlined in the course context",
      "- Include practical examples and applications from the course materials",
      "- Use clear headings, short paragraphs, and lists for readability.",
      "- The 'quiz' field must contain 2–5 short recall questions testing the specific concepts taught; DO NOT include any quiz content inside the body.",
      "- Avoid overlap: do not repeat content already covered by other lessons; follow the planned division and prior generated lessons.",
    ].join("\n");

    const context = [
      subject ? `Subject: ${subject}` : "",
      `Topic: ${topic}`,
      course_context ? `Course summary: ${course_context}` : "",
      topicSummary ? `Topic summary: ${topicSummary}` : "",
      courseTopics.length ? `Course topics: ${courseTopics.join(", ")}` : "",
      "Relevant material (truncated):",
      combinedText || "",
      previousLessons.length ? `Previous lessons recap (for continuity): ${previousLessons.map((l: any) => l.title + ": " + (l.body || "").slice(0, 300)).join(" | ")}` : "",
      `Target lesson: ${target.type} — ${target.title}`,
      otherLessonsMeta.length ? `Planned other lessons (avoid overlapping): ${otherLessonsMeta.map((m: any, i: number) => `L${i+1} ${m.type} — ${m.title}`).join("; ")}` : "",
      generatedLessons.length ? `Already generated lessons (avoid repeating these): ${generatedLessons.map((l: any) => l.title + ": " + (l.body || "").slice(0, 200)).join(" | ")}` : "",
      mode === 'simplify' ? "Instruction: Rewrite the CURRENT section at an easier level. Keep the SAME scope, do not add new concepts, add friendlier analogies. Do NOT change the quiz in meaning (you may rewrite questions to match simplified wording)." : "",
    ].filter(Boolean).join("\n\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: context },
      ],
      temperature: 0.35,
      max_tokens: 1600,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let data: any = {};
    try {
      data = JSON.parse(content);
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { data = JSON.parse(content.slice(start, end + 1)); } catch { data = {}; }
      } else {
        data = {};
      }
    }
    return NextResponse.json({ ok: true, data, raw: content });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


