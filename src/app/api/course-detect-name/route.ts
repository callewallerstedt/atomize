import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "edge";

async function generateNameFromText(text: string, fallbackTitle?: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const prompt = `You are naming a university/college course based on its official materials.
Rules:
- Return ONLY the course title, max 6 words.
- Prefer official course names present or clearly implied (e.g., "Linear Algebra", "Operating Systems").
- Avoid filenames, semesters, extensions, or noise (e.g., ".pdf", "final", "v2", dates).
- If multiple plausible names exist, pick the most general canonical title.
${fallbackTitle ? `- Improve this working title if needed: ${fallbackTitle}` : ""}

Context to analyze:
${trimmed.slice(0, 8000)}

Course Title:`;

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

