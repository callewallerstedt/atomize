import { NextResponse } from "next/server";
import OpenAI from "openai";
import { stripLessonMetadata } from "@/lib/lessonFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "");
    const topic = String(body.topic || "");
    const lessonContent = stripLessonMetadata(String(body.lessonContent || ""));
    const courseContext = String(body.courseContext || "");
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const languageName = String(body.languageName || "");

    if (answers.length === 0) {
      return NextResponse.json({ error: "No answers provided" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Prepare the answers for checking
    const answersText = answers.map((a: any, i: number) =>
      `Question ${i + 1}: "${a.question}"\nUser Answer: "${a.userAnswer}"`
    ).join('\n\n');

    const system = `You are a supportive tutor evaluating student answers and providing helpful feedback.

Return JSON with this exact structure:
{
  "results": {
    "0": { "correct": boolean, "explanation": "string", "hint": "string", "fullSolution": "string" },
    "1": { "correct": boolean, "explanation": "string", "hint": "string", "fullSolution": "string" },
    ...
  }
}

Rules:
- correct: true if the answer demonstrates substantial understanding, false otherwise
- explanation: 1-2 sentences of feedback on the user's answer - what they got right or what they missed
- hint: If incorrect, provide a helpful hint that guides them toward the solution WITHOUT giving it away
- fullSolution: A complete, step-by-step solution that shows the reasoning process clearly
- Be VERY lenient - accept answers that show understanding even if terminology isn't perfect
- Write in a friendly, encouraging tone
- For the fullSolution, use numbered steps and explain the "why" at each step
- CRITICAL: If using LaTeX math, use \\text{} for text (NOT \\t which is a tab character)
- Use the lesson content and course context to determine correctness
- Number keys starting from 0 for each question index
- Return only valid JSON, no additional text
${languageName ? `- CRITICAL LANGUAGE RULE: You MUST write all explanation, hint, and fullSolution in ${languageName}. Even if the source material or questions are in a different language (Spanish, German, etc.), you MUST translate and write everything in ${languageName}. This is non-negotiable.` : ""}`;

    const userPrompt = `Subject: ${subject}
Topic: ${topic}

Lesson Content:
${lessonContent.slice(0, 2000)}

Course Context:
${courseContext.slice(0, 1000)}

Answers to check:
${answersText}

Please evaluate each answer and return the JSON results.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let data;
    try {
      data = JSON.parse(content);
    } catch {
      // Fallback in case JSON parsing fails
      const results: { [key: string]: { correct: boolean; explanation: string } } = {};
      answers.forEach((_: any, i: number) => {
        results[i.toString()] = {
          correct: false,
          explanation: "Unable to check answer. Please try again."
        };
      });
      data = { results };
    }

    return NextResponse.json({ ok: true, results: data.results || {} });
  } catch (err: any) {
    console.error("Quiz check error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
