import { NextResponse } from "next/server";
import OpenAI from "openai";
import { extractLessonMetadata, extractQuizSection } from "@/lib/lessonFormat";
import type { LessonMetadata } from "@/types/lesson";

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

    if (!topic || lessonsMeta.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing topic or lessonsMeta" }, { status: 400 });
    }

    const target = lessonsMeta[lessonIndex] || { type: "Full Lesson", title: `Lesson ${lessonIndex + 1}` };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ---- System prompt: strict, adaptive, in-depth, render-safe Markdown ----
    const system = [
      "You produce ONE comprehensive GitHub Flavored Markdown lesson that teaches the assigned topic from zero knowledge to problem-solving competence.",
      "",
      "CRITICAL LENGTH REQUIREMENTS (MANDATORY):",
      "- The lesson body (excluding metadata, quiz section, and answer key) MUST contain AT LEAST 3000 words of explanatory prose.",
      "- Target length: 4000-6000 words. If you reach 3000 words and haven't fully covered the topic, CONTINUE writing until you reach comprehensive depth.",
      "- Count only actual prose text—do not count LaTeX delimiters, code blocks, JSON syntax, or markdown formatting.",
      "- Expand each concept with genuine explanations, derivations, examples, and narrative transitions. Do NOT pad with fluff.",
      "- Use multiple H2/H3 sections. Each major section should contain multiple paragraphs (3-5 sentences each) before moving on.",
      "- Include multiple worked examples with step-by-step explanations. Each example should be substantial.",
      "",
      "Output MUST be a single Markdown document. No commentary outside the document. Use real newlines. Do not double-escape backslashes.",
      "",
      // Metadata
      "Start with a fenced ```json metadata block containing exactly:",
      '{',
      '  "title": "<=80 chars>",',
      '  "summary": "<=50 words>",',
      '  "bulletSummary": ["3-5 short bullets"],',
      '  "objectives": ["3-5 learning goals"],',
      '  "tags": ["keywords"],',
      '  "readingTimeMinutes": <integer>,',
      '  "quiz": [',
      '    { "question": "text", "answer": "text" },',
      '    { "question": "text", "answer": "text" },',
      '    { "question": "text", "answer": "text" }',
      '  ]',
      '}',
      "No comments, no trailing commas, no backticks inside JSON.",
      "",
      // Formatting rules
      "Formatting rules:",
      "- Markdown only. No HTML except a single `<details><summary>Answer Key</summary> ... </details>` block after the Quiz.",
      "- Use headings only at levels `#`, `##`, `###`.",
      "- Always put ONE blank line before and after headings, lists, code fences, tables, and display math.",
      "- Tables must use pipe syntax with a header separator row (`|---|`).",
      "- Every code fence MUST specify a language (```python, ```javascript, ```c, etc.). Snippets should be runnable or compile as shown.",
      "- Math uses KaTeX-compatible LaTeX only: inline `$...$`, display `\\[ ... \\]` on their own lines. Avoid environments like `align`. Use `\\text{}` for words. Escape `_` in text as needed.",
      "- Do NOT include links, images, Mermaid, or raw HTML other than the one `<details>` block for answers.",
      "- Do NOT assume prior knowledge. Define symbols and notation when first used.",
      "",
      // Structure and pedagogy
      "Pedagogy and structure:",
      "- Adaptive structure: choose sectioning that best fits the topic. Do NOT use a rigid template.",
      "- Teach progressively: start with intuition and simple definitions, then build to formalism, then to advanced applications.",
      "- DEPTH REQUIREMENT: Each concept must be explained thoroughly with context, motivation, and connections to other ideas.",
      "- Include MULTIPLE worked examples (at least 3-5) that progress from easy to hard. Show all steps, and explain WHY each step is taken.",
      "- Each example should be substantial—not just one-line calculations. Include reasoning, alternative approaches, and common mistakes.",
      "- Include typical pitfalls and how to avoid them. Explain WHY these mistakes happen.",
      "- Include at least: one table, one code example, some inline math and at least one display math block.",
      "- PRACTICE PROBLEMS: When you write practice problems or exercises, wrap ONLY the problem statement in practice problem containers using this syntax:",
      "  :::practice-problem",
      "  [Problem statement here - can include multiple paragraphs, math, lists, etc.]",
      "  :::",
      "  ",
      "  [Solution and explanation goes here, OUTSIDE the container]",
      "  This will automatically style the problem in a distinctive lozenge-shaped box with a 'Practice Problem' label. The solution should be written immediately after the closing ::: marker, outside the container. Always provide complete, step-by-step solutions for any problems or examples you present.",
      "- ALWAYS SOLVE EXAMPLES: When you present any example problem, worked example, or practice problem, you MUST provide a complete solution with step-by-step explanations. Never leave problems unsolved - students need to see how to work through them.",
      "- Build narrative flow: connect sections with transitions. Explain how concepts relate to each other.",
      "- End with a `## Quiz` section that lists the questions. Immediately after, include the collapsible `<details>` answer key covering every quiz item in order.",
      "- The metadata `quiz` must exactly match the in-body quiz questions and answers, same order and wording.",
      "",
      // Language
      languageName ? `Write all metadata and lesson prose in ${languageName}.` : "Write all metadata and lesson prose in English.",
      "",
      // Scope control
      "Stay strictly on the assigned topic. Use the provided course context to avoid overlap with other lessons.",
      "If mode is simplify, keep scope identical but rewrite explanations to be easier, without changing the quiz meaning.",
      "",
      "QUESTION-SPECIFIC FOCUS: If the course_context or topicSummary mentions a specific practice question, the lesson should cover the general topic comprehensively BUT with particular emphasis on the specific aspect, method, or application mentioned in that question. Include detailed explanations, examples, and step-by-step procedures related to what the question is asking about. The lesson should enable the student to understand and solve that specific type of problem.",
      "",
      "FINAL REMINDER: The lesson body MUST be at least 3000 words of substantive content. If you finish writing and it's under 3000 words, ADD MORE sections, examples, explanations, or applications until you reach the required depth."
    ].join("\n");

    // ---- Context payload to guide content and avoid overlap ----
    const context = [
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

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: context }
      ],
      temperature: 0.5, // more deterministic pedagogy
      max_tokens: 12000
    });

    const content = completion.choices[0]?.message?.content?.trim() || "";
    if (!content) {
      return NextResponse.json({ ok: false, error: "Empty model response" }, { status: 502 });
    }

    // ---- Extraction and validation pipeline ----
    const { metadata, normalizedMarkdown } = extractLessonMetadata(content);
    const { questions: quizFromBody, bodyWithoutQuiz } = extractQuizSection(normalizedMarkdown);

    const safeMetadata: LessonMetadata | null = metadata;

    // Preserve newlines; only strip disallowed control chars (keep \n \r \t)
    const sanitizeString = (value: string): string =>
      value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

    const bodyMarkdown = sanitizeString(bodyWithoutQuiz || normalizedMarkdown);

    const quizItems = Array.isArray(safeMetadata?.quiz)
      ? safeMetadata!.quiz
          .map((item) => ({
            question: sanitizeString(item.question || ""),
            answer: item.answer ? sanitizeString(item.answer) : undefined
          }))
          .filter((item) => item.question.length > 0)
      : [];

    const finalQuiz =
      quizItems.length > 0
        ? quizItems
        : quizFromBody.map((item) => ({ question: sanitizeString(item.question || "") }));

    const derivedTitle = sanitizeString(
      (safeMetadata?.title && safeMetadata.title.length > 0 ? safeMetadata.title : target.title) || topic
    );

    // Optional KaTeX validation if available
    if (bodyMarkdown) {
      const { validateKatexBlocks } = await import("@/lib/validateMath");
      const result = validateKatexBlocks(bodyMarkdown);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: `Invalid KaTeX: ${result.errors[0] || "unknown error"}` }, { status: 422 });
      }
    }

    // Return as-is; JSON will escape newlines, the client must decode
    return NextResponse.json({
      ok: true,
      data: {
        title: derivedTitle,
        body: bodyMarkdown,
        quiz: finalQuiz,
        metadata: safeMetadata
      },
      raw: content
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
