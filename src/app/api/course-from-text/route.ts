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
    const description = String(body.description || "");
    const courseName = String(body.courseName || "");
    const preferredLanguage: string | undefined = body.preferredLanguage ? String(body.preferredLanguage) : undefined;

    if (!description.trim()) {
      return NextResponse.json({ ok: false, error: "Description is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // First, generate a comprehensive course context from the description
    const contextSystem = [
      "You are an expert course designer. Based on the user's description, create a comprehensive course outline and context.",
      "Return JSON: { courseName: string; courseContext: string; topics: { name: string; summary: string; coverage: number }[] }",
      "Generate 8-16 topics that comprehensively cover the subject described.",
      "CRITICAL: The courseContext field must be PLAIN TEXT ONLY - a natural language description (2-3 paragraphs).",
      "DO NOT put JSON, code blocks, or the topics array in the courseContext field.",
      "DO NOT include markdown formatting like ```json or ``` in courseContext.",
      "The courseContext should be a readable description that explains what the course covers, suitable for generating lessons.",
      "Topics are returned separately in the topics array - do not duplicate them in courseContext.",
      "Coverage should sum to approximately 100.",
      preferredLanguage
        ? `CRITICAL: Write all content in ${preferredLanguage}.`
        : "Write in the same language as the description.",
    ].join("\n");

    const contextPrompt = `Create a comprehensive course based on this description:\n\n${description}\n\n${courseName ? `Suggested course name: ${courseName}` : ""}\n\nGenerate a detailed course outline with topics, summaries, and a comprehensive course context that can be used to create lessons.`;

    const contextResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: contextSystem },
        { role: "user", content: contextPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000,
    });

    const contextContent = contextResponse.choices[0]?.message?.content?.trim() || "";
    if (!contextContent) {
      return NextResponse.json({ ok: false, error: "Failed to generate course context" }, { status: 500 });
    }

    let parsedContext;
    try {
      parsedContext = JSON.parse(contextContent);
    } catch (e) {
      return NextResponse.json({ ok: false, error: "Failed to parse course context" }, { status: 500 });
    }

    const finalCourseName = parsedContext.courseName || courseName || "New Course";
    // Extract courseContext and clean it - remove any JSON code blocks or formatting
    let courseContext = parsedContext.courseContext || description;
    
    // Remove markdown code blocks if present
    courseContext = courseContext.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // Check if the entire courseContext is JSON (starts with { and ends with })
    const trimmedContext = courseContext.trim();
    if (trimmedContext.startsWith('{') && trimmedContext.endsWith('}')) {
      try {
        const parsed = JSON.parse(courseContext);
        // If it parsed successfully, it means the AI put the entire JSON response in courseContext
        // Try to extract a meaningful description
        if (parsed.courseContext && typeof parsed.courseContext === 'string') {
          courseContext = parsed.courseContext;
        } else if (parsed.subject && typeof parsed.subject === 'string') {
          // If it's the full response object, generate a simple description from the subject
          courseContext = `This course covers ${parsed.subject}. ${description}`;
        } else {
          // Fallback: use the original description
          courseContext = description;
        }
      } catch {
        // If parsing fails, try to extract text content from the JSON structure
        // Remove all JSON structure, keeping only text content
        courseContext = courseContext
          .replace(/\{[^}]*"courseContext"\s*:\s*"([^"]+)"/g, '$1') // Extract courseContext value
          .replace(/\{[^}]*"subject"\s*:\s*"([^"]+)"/g, 'This course covers $1') // Extract subject
          .replace(/\{[^}]*\}/g, '') // Remove any remaining JSON objects
          .replace(/\[[^\]]*\]/g, '') // Remove arrays
          .trim() || description;
      }
    } else if (trimmedContext.startsWith('{')) {
      // Partial JSON - try to extract text content
      try {
        const parsed = JSON.parse(courseContext);
        if (parsed.courseContext && typeof parsed.courseContext === 'string') {
          courseContext = parsed.courseContext;
        } else {
          courseContext = description;
        }
      } catch {
        // Remove JSON structures but keep text
        courseContext = courseContext
          .replace(/\{[^}]*"courseContext"\s*:\s*"([^"]+)"/g, '$1')
          .replace(/\{[^}]*\}/g, '')
          .replace(/\[[^\]]*\]/g, '')
          .trim() || description;
      }
    }
    
    // Final cleanup: remove any remaining JSON-like structures, arrays, and code blocks
    courseContext = courseContext
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/\{[^}]*\}/g, '') // Remove any remaining JSON objects
      .replace(/\[[^\]]*\]/g, '') // Remove arrays
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // If after all cleaning it's empty or too short, use description
    if (!courseContext || courseContext.length < 20) {
      courseContext = description;
    }
    
    const topics = Array.isArray(parsedContext.topics) ? parsedContext.topics : [];

    return NextResponse.json({
      ok: true,
      courseName: finalCourseName,
      courseContext,
      topics,
    });
  } catch (err: any) {
    console.error("[course-from-text] Error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}





