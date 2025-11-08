import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "edge";

async function generateNameFromText(text: string, fallbackTitle?: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const prompt = `Name a university/college course from its materials.
Return ONLY the title.

Strict rules:
- Keep it ultra-short: 1–3 words only.
- Prefer broad, canonical field names (e.g., "Mathematics", "Linear Algebra", "Data Structures").
- Remove qualifiers like level, audience, exam/system, semester, region, or format
  (e.g., drop words such as: for, intro/introductory, basics, advanced, exam, abitur, AP, IB, final, practice, workbook, notes, v2, 2024).
- Avoid filler (“for Beginners”, “Preparation”, “Course”, “Overview”).
- If multiple plausible names exist, choose the most general canonical title.
- IMPORTANT: Write the title in the SAME LANGUAGE as the provided materials.
${fallbackTitle ? `- You may refine this working title if needed: ${fallbackTitle}` : ""}

Context:
${trimmed.slice(0, 8000)}

Title:`;

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

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null) as { context?: string; fallbackTitle?: string } | null;
      const context = body?.context;
      fallbackTitle = body?.fallbackTitle;
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

    const cleanName = await generateNameFromText(combinedText, fallbackTitle);

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

