import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { context?: string; preferredLanguage?: string } | null;
    const context = body?.context?.trim();
    const preferredLanguage = body?.preferredLanguage?.trim();

    if (!context) {
      return new Response(JSON.stringify({ ok: false, error: "Missing context" }), { status: 400 });
    }

    const prompt = `You are an AI that reads a course context and produces a fast study synopsis.
Return 2-3 short bullet insights (max 180 characters total) highlighting the core focus, difficulty, and standout themes.

CRITICAL REQUIREMENTS:
- Use PLAIN TEXT ONLY with simple bullet points (use "-" or "•")
- DO NOT return JSON, code blocks, or any structured data
- DO NOT include topics, areas, or any JSON-like structures
- Just return plain text bullet points, nothing else
- Example format:
  - Core focus: [description]
  - Difficulty: [description]
  - Key themes: [description]

${preferredLanguage ? `Write in ${preferredLanguage}.` : `Write in the SAME LANGUAGE as the Course Context.`}

Course Context:
${context.slice(0, 8000)}

Insights:`;

    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      max_output_tokens: 96,
      temperature: 0.3,
    });

    let summary = (completion as any)?.output?.[0]?.content?.[0]?.text?.trim?.();

    if (!summary) {
      return new Response(JSON.stringify({ ok: false, error: "Failed to generate summary" }), { status: 500 });
    }

    // Clean any JSON structures that might have been returned
    // Remove markdown code blocks
    summary = summary.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // If it looks like JSON (starts with {), try to extract plain text
    const trimmedSummary = summary.trim();
    if (trimmedSummary.startsWith('{') && trimmedSummary.endsWith('}')) {
      try {
        const parsed = JSON.parse(summary);
        // Try to extract a meaningful summary from JSON
        if (parsed.summary && typeof parsed.summary === 'string') {
          summary = parsed.summary;
        } else if (parsed.insights && typeof parsed.insights === 'string') {
          summary = parsed.insights;
        } else if (Array.isArray(parsed.topics) || Array.isArray(parsed.areas)) {
          // If it's topics/areas array, ignore it and use a fallback
          summary = 'Course summary unavailable';
        } else {
          // Try to extract any string values
          const stringValues = Object.values(parsed).filter(v => typeof v === 'string');
          summary = stringValues.length > 0 ? String(stringValues[0]) : 'Course summary unavailable';
        }
      } catch {
        // If parsing fails, remove JSON structure
        summary = summary
          .replace(/\{[^}]*\}/g, '') // Remove JSON objects
          .replace(/\[[^\]]*\]/g, '') // Remove arrays
          .trim() || 'Course summary unavailable';
      }
    }
    
    // Final cleanup: remove any remaining JSON-like structures
    summary = summary
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/\{[^}]*\}/g, '') // Remove any remaining JSON objects
      .replace(/\[[^\]]*\]/g, '') // Remove arrays
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("course-quick-summary error", error);
    return new Response(JSON.stringify({ ok: false, error: error?.message || "Something went wrong" }), { status: 500 });
  }
}

