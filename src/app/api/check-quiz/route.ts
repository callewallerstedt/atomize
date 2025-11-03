import { NextResponse } from "next/server";
import OpenAI from "openai";

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
    const lessonContent = String(body.lessonContent || "");
    const courseContext = String(body.courseContext || "");
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (answers.length === 0) {
      return NextResponse.json({ error: "No answers provided" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Prepare the answers for checking
    const answersText = answers.map((a: any, i: number) =>
      `Question ${i + 1}: "${a.question}"\nUser Answer: "${a.userAnswer}"`
    ).join('\n\n');

    const system = `You are a quiz answer checker. For each question, evaluate if the user's answer is correct based on the lesson content and course context.

Return JSON with this exact structure:
{
  "results": {
    "0": { "correct": boolean, "explanation": "string" },
    "1": { "correct": boolean, "explanation": "string" },
    ...
  }
}

Rules:
- correct: true if the answer is substantially correct, false otherwise
- explanation: 2-3 sentences explaining why the answer is correct/incorrect and what the right answer should be
- Be lenient but accurate - accept answers that demonstrate understanding even if not perfectly worded
- Use the lesson content and course context to determine correctness
- Number keys starting from 0 for each question index
- Return only valid JSON, no additional text`;

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
