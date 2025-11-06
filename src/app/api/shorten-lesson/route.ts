import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { lessonTitle, lessonBody, subject, topic } = await request.json();

    if (!lessonBody || !lessonTitle) {
      return NextResponse.json({ error: "Missing lesson content" }, { status: 400 });
    }

    const system = `You are an expert educator creating concise lesson summaries. Your task is to shorten a lesson while preserving all critical information and key concepts.

IMPORTANT RULES:
- Keep ALL important technical details, code examples, definitions, and key concepts
- Maintain the lesson structure (headings, sections, lists)
- Remove redundant explanations and verbose language
- Keep examples and code blocks intact
- Preserve quiz questions at the end
- Make paragraphs more direct and concise
- Remove unnecessary transitions and filler text
- Keep the same markdown formatting

The shortened version should be 40-60% of the original length while maintaining educational value.`;

    const userPrompt = `Shorten this lesson significantly while keeping all important information:

**Lesson Title:** ${lessonTitle}
**Subject:** ${subject}
**Topic:** ${topic}

**Original Lesson Content:**
${lessonBody}

Return the shortened lesson in the same markdown format, but much more concise. Keep all code blocks, important examples, key definitions, and quiz questions. Remove verbose explanations and redundant text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const shortenedBody = completion.choices[0]?.message?.content?.trim();

    if (!shortenedBody) {
      throw new Error("No response from OpenAI");
    }

    return NextResponse.json({
      ok: true,
      data: {
        title: lessonTitle,
        body: shortenedBody,
      },
      raw: completion.choices[0]?.message?.content,
    });

  } catch (error: any) {
    console.error("Shorten lesson error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to shorten lesson" },
      { status: 500 }
    );
  }
}

