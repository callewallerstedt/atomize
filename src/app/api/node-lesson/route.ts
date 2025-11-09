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
      "You generate ONE lesson for a SPECIFIC topic using the provided course context and materials.",
      "Return JSON: { title: string; body: string; quiz: { question: string }[] }",
      "CRITICAL: You MUST focus EXCLUSIVELY on the topic specified in the 'Topic:' field. Do NOT generate content about other topics.",
      "Rules:",
      `- The lesson MUST be about the exact topic specified in the 'Topic:' field - nothing else.`,
      `- Use the detailed course context to identify and teach SPECIFIC concepts, methods, and skills related to THIS SPECIFIC TOPIC ONLY.`,
      `- Body should be clean, well-structured Markdown using proper KaTeX math syntax. Use $...$ for inline math and $$...$$ for display math.`,
      languageName ? `- CRITICAL LANGUAGE RULE: You MUST write the ENTIRE lesson (title, body, quiz questions) in ${languageName}. Even if the source material is in a different language (Spanish, German, etc.), you MUST translate and write everything in ${languageName}. This is non-negotiable.` : '',
      "- CRITICAL LaTeX rules:",
      "  * ALL Greek letters MUST use backslash: \\alpha, \\beta, \\eta, \\theta, \\pi, NOT alpha, beta, eta, theta, pi",
      "  * For fractions: \\frac{numerator}{denominator}, NOT a/b or unicode fractions",
      "  * For square roots: \\sqrt{expression}, NOT √ or sqrt()",
      "  * For text in math: \\text{proper text here}, NOT \\t, NOT ext{text}, NEVER use \\t as it's a tab character",
      "  * Escape underscores: \\_ (e.g., \\text{var\\_name})",
      "  * Common errors to avoid: '\\tSpam' → '\\text{Spam}', 'eta_0' → '\\eta_0', 'ext{text}' → '\\text{text}', 'L/g' → '\\frac{L}{g}'",
      "- For code and function names in text, use proper LaTeX: \\text{sem\\_wait(\\&semaphore)} not \\text{sem extunderscore wait(&semaphore)}",
      target?.type === 'Full Lesson' ? "This is a SINGLE, COMPREHENSIVE lesson covering the entire topic. Be thorough, detailed, and EXTENSIVELY LONG (aim for 4000-6000 words). Cover all key concepts, methods, applications, examples, and practice in one comprehensive lesson. Don't rush - take time to explain everything thoroughly with multiple examples and detailed explanations." : "",
      "",
      "TEACHING APPROACH:",
      "Design each lesson to build deep understanding by:",
      "- Starting with what students already know and connecting new ideas to prior knowledge",
      "- Using multiple representations (verbal, visual, mathematical) when helpful",
      "- Providing concrete examples before abstract concepts",
      "- Including practice opportunities that reinforce learning",
      "- Creating logical connections between ideas",
      "",
      "STRUCTURE FLEXIBILITY:",
      "Choose the lesson structure that best serves the content and learning goals.",
      "Common effective patterns include:",
      "- Problem-based approach (present challenge, work through solution)",
      "- Concept development (build from simple to complex)",
      "- Skills progression (practice basic skills before advanced application)",
      "- Mixed approaches combining explanation, examples, and practice",
      "",
      "CONTENT ORGANIZATION:",
      "Organize the lesson in whatever way makes the material clearest and most learnable.",
      "Use headings, lists, and formatting to improve readability and comprehension.",
      "",
      "Additional teaching rules:",
      "- Use simple, conversational language - explain like you're helping a friend understand",
      "- Break complex ideas into small digestible chunks with clear headings",
      "- When introducing formulas, explain what each variable represents in plain language BEFORE showing the math",
      "- Use concrete numbers and realistic scenarios in examples",
      "- Connect new concepts to what students already know from previous lessons",
      "- Focus on teaching the specific concepts, methods, and procedures outlined in the course context",
      "- Use clear headings, short paragraphs, and lists for readability.",
      "",
      "PRACTICE PROBLEMS (quiz field):",
      "- The 'quiz' field must contain 2-4 practice problems that test understanding and application",
      "- Make them practical problems students can actually work through, not just 'what is X?' questions",
      "- Include a mix: conceptual understanding, calculations, and real-world application",
      "- Word them as actual problems to solve, not just recall questions",
      "- DO NOT include any quiz content inside the body - they go in the quiz array only",
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
      temperature: 0.8,
      max_tokens: 8000,
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


