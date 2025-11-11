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

    const target = lessonsMeta[lessonIndex] || { type: "Full Lesson", title: `Lesson ${lessonIndex + 1}` };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = [
      "You generate ONE lesson for a SPECIFIC topic using the provided course context and materials.",
      "Return JSON: { title: string; body: string; quiz: { question: string }[] }",
      "CRITICAL: Focus EXCLUSIVELY on the topic specified in 'Topic:'.",
      "LENGTH: Produce a comprehensive, detailed lesson (target 4000–6000 words). Include multiple sections, worked examples, and careful explanations.",
      "LENGTH POLICY (STRICT): The `body` field itself must contain AT LEAST 3000 words of explanatory prose (ideally 4000–6000). Count only the rendered text—do not count LaTeX delimiters, inline symbols, code fences, or JSON syntax.",
      "Do NOT pad with fluff—expand each concept with genuine explanations, derivations, examples, and narrative transitions.",
      "If you approach 3000 words and have not fully covered the topic, keep writing new sections until you reach the depth required.",
      "SECTION DEPTH: Use multiple H2/H3 sections. Each major section should contain multiple paragraphs (3–5 sentences each) before moving on.",
      "Rules:",
      "- The lesson must be about that topic only.",
      "- Use the course context to explain key concepts, methods, and skills tied to this topic.",
      "- Body: clear, well-structured Markdown. Headings, lists, and short paragraphs for readability.",
      "- Use KaTeX math with correct LaTeX syntax.",
      "- Inline math uses \\( ... \\). Display math uses \\[ ... \\]. Never use $...$ or $$...$$.",
      languageName ? `- All text (title, body, quiz) must be in ${languageName}.` : '',
      "",
      "- LaTeX rules:",
      "  * Greek letters use backslash form (\\alpha, \\beta, \\eta, \\theta, \\pi).",
      "  * Fractions: \\frac{num}{den}.",
      "  * Square roots: \\sqrt{expr}.",
      "  * Text inside math: \\text{...}.",
      "  * Escape underscores: \\_.",
      "  * Never use \\t or ext{text}.",
      "  * No raw Unicode symbols for operators or roots.",
      "  * Every \\( has a closing \\), every \\[ has a closing \\].",
      "  * No $$, no double-escaped backslashes.",
      "  * Always put a blank line before and after \\[ ... \\].",
      "",
      "- Structure:",
      "  * Start with an introduction that connects to prior knowledge.",
      "  * Build concepts logically, from basic to complex.",
      "  * Explain variables before equations.",
      "  * Use examples before generalizations.",
      "  * End with a short summary of key ideas.",
      "",
      "- Quiz field:",
      "  * Include 2–4 practical problems that test understanding or calculation.",
      "  * Each question must be self-contained, plain text, no math delimiters.",
      "  * Do not include quiz items inside the lesson body.",
      "",
      "- Output:",
      "  * Return only the JSON object. No extra text, comments, or explanations.",
      "",
      "- Avoid overlap: do not repeat content already covered by other lessons; follow the planned division and prior generated lessons.",
    ].filter(Boolean).join("\n");

    const context = [
      "=".repeat(50),
      `TOPIC TO TEACH: ${topic}`,
      "=".repeat(50),
      subject ? `Subject: ${subject}` : "",
      course_context ? `Course summary: ${course_context}` : "",
      topicSummary ? `Topic summary for "${topic}": ${topicSummary}` : "",
      courseTopics.length ? `Course topics (for context only - focus on "${topic}"): ${courseTopics.join(", ")}` : "",
      `Target lesson: ${target.type} — ${target.title}`,
      "Relevant material (truncated):",
      combinedText || "",
      previousLessons.length ? `Previous lessons recap (for continuity): ${previousLessons.map((l: any) => l.title + ": " + (l.body || "").slice(0, 300)).join(" | ")}` : "",
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
      temperature: 0.7,
      max_tokens: 12000,
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


