import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "edge";

async function generateNameFromText(text: string, fallbackTitle?: string, preferredLanguage?: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const prompt = `Generate a concise, good course name from the materials.

Rules:
- Keep it short and concise: 1-5 words
- Format: "name coursecode" or "name coursecode / coursecode2" ONLY if course codes are actually present in the materials
- ONLY include course code(s) if they are explicitly found in the materials (format: 3 letters + 3 numbers, e.g., EEN117, TMA123, FMA240)
- If no course codes are found in the materials, return just the course name without any course codes
- Examples: "Calculus TMA123" (if TMA123 is in materials), "Linear Algebra" (if no course code found), "Signals and Systems EEN117" (if EEN117 is in materials)
- Use a specific, descriptive name that reflects the actual course content
- Remove qualifiers like "exam", "practice", "notes", "2024", etc.
- Prefer the actual course name over generic terms
- Return ONLY plain text - no formatting characters like **, _, quotes, brackets, or any other markdown/formatting
${preferredLanguage ? `- Write in ${preferredLanguage}` : `- Write in the same language as the materials`}
${fallbackTitle ? `- User suggested: "${fallbackTitle}" - use this if it's good, otherwise improve it` : ""}

Materials:
${trimmed.slice(0, 8000)}

Course name:`;

  const completion = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    max_output_tokens: 32,
    temperature: 0.4,
  });

  const rawName = completion.output_text?.trim() || "";
  const cleanName = rawName.split("\n")[0].replace(/^"|"$/g, "").trim();

  return cleanName || null;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let combinedText = "";
    let fallbackTitle: string | undefined;
    let preferredLanguage: string | undefined;

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null) as { context?: string; fallbackTitle?: string; preferredLanguage?: string } | null;
      const context = body?.context;
      fallbackTitle = body?.fallbackTitle;
      preferredLanguage = body?.preferredLanguage;
      if (!context) {
        return new Response(JSON.stringify({ ok: false, error: "Missing context" }), { status: 400 });
      }
      combinedText = context;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const files = formData.getAll("files");

      if (files.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: "No files provided" }), { status: 400 });
      }

      for (const file of files) {
        if (file instanceof File) {
          const text = await file.text();
          if (text.trim()) {
            combinedText += `--- ${file.name} ---\n${text}\n\n`;
          }
        }
      }

      if (!combinedText.trim()) {
        combinedText = files
          .filter((f): f is File => f instanceof File)
          .map((f) => f.name)
          .join("\n");
      }
    } else {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content type" }), { status: 400 });
    }

    const cleanName = await generateNameFromText(combinedText, fallbackTitle, preferredLanguage);

    if (!cleanName) {
      return new Response(JSON.stringify({ ok: false, error: "Failed to generate course name" }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, name: cleanName }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("course-detect-name error", error);
    return new Response(JSON.stringify({ ok: false, error: error?.message || "Something went wrong" }), { status: 500 });
  }
}

