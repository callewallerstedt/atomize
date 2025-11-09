import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TopicMeta = {
  name: string;
  summary: string;
  coverage: number; // 0-100
};

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const mod: any = await import("pdf-parse");
  const pdfParse = (mod?.default ?? mod) as (data: Buffer) => Promise<{ text: string }>;
  const { text } = await pdfParse(buffer).catch(() => ({ text: "" } as any));
  return text;
}

async function readFileAsText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type?.includes("pdf")) {
    try {
      return await extractTextFromPdf(buffer);
    } catch {
      return "";
    }
  }
  if (name.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const mammothModule = mammoth.default || mammoth;
      const result = await mammothModule.extractRawText({ buffer });
      return result.value || "";
    } catch (err: any) {
      console.error(`Failed to extract DOCX text from ${file.name}:`, err?.message);
      return "";
    }
  }
  if (file.type?.startsWith("text/") || name.endsWith(".md") || name.endsWith(".txt")) {
    return new TextDecoder().decode(buffer);
  }
  // Last resort: try decoding as UTF-8 text; if binary, it will be mostly empty after filtering
  try {
    const decoded = new TextDecoder().decode(buffer);
    // filter out excessive binary noise
    const cleaned = decoded.replace(/[\x00-\x08\x0E-\x1F]/g, "").trim();
    return cleaned.length > 50 ? cleaned : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const form = await req.formData();
    const subject = String(form.get("subject") || "Subject");
    const files = form.getAll("files") as unknown as File[];

    const texts: { name: string; text: string }[] = [];
    for (const file of files) {
      const txt = await readFileAsText(file);
      if (txt && txt.trim()) texts.push({ name: file.name, text: txt });
    }

    const combined = texts.map((t) => `# ${t.name}\n\n${t.text}`).join("\n\n\n").slice(0, 300_000); // modest cap for token safety

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    async function detectLanguage(sample: string): Promise<{ code: string; name: string }> {
      try {
        const sys = [
          "Detect the primary human language of the provided text.",
          "Return STRICT JSON: { code: string; name: string } where code is ISO 639-1 if possible (e.g., 'en', 'sv', 'de').",
          "If uncertain, default to { code: 'en', name: 'English' }.",
        ].join("\n");
        const resp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sys },
            { role: "user", content: sample.slice(0, 4000) || "" },
          ],
          temperature: 0,
          max_tokens: 50,
        });
        const content = resp.choices[0]?.message?.content || "{}";
        const data = JSON.parse(content);
        return { code: String(data.code || 'en'), name: String(data.name || 'English') };
      } catch {
        return { code: 'en', name: 'English' };
      }
    }

    // Detect language first (based on extracted text or filenames if needed)
    const lang = await detectLanguage(combined || texts.map(t => t.name).join("\n"));

    const system = [
      "Extract main topics from the course material. If material is minimal or only a course name is provided, generate comprehensive topics based on the subject name.",
      "Return STRICT JSON with this exact shape:",
      "{ subject: string; topics: { name: string; summary: string; coverage: number }[] }",
      "CRITICAL RULES:",
      "- ALWAYS generate AT LEAST 6 topics, ideally 8-12 topics. Never generate fewer than 6 topics.",
      "- If course material is minimal or only a course name/subject is provided, use your knowledge of that subject to generate 6-12 well-structured, comprehensive topics that would typically be covered in such a course.",
      "- Each topic name should be concise (2-5 words).",
      "- summary: 1-2 sentences describing what the topic covers. If material is minimal, write summaries based on standard coverage of this topic in the subject area.",
      "- coverage: integer 0-100 estimating how much of the total material this topic covers; topics should roughly sum to ~100 but do not exceed.",
      "- No subtopics, no markdown, no code fences, JSON only.",
      "- Structure topics logically and comprehensively to cover the subject area well.",
      `- Write summaries in ${lang.name}.`,
    ].join("\n");

    let data: { subject: string; topics: TopicMeta[] } = { subject, topics: [] };
    if (combined && combined.trim().length >= 50) {
      // Primary path: use extracted text
      const user = [
        `Subject: ${subject}`,
        "Material (truncated):",
        combined,
        "",
        "IMPORTANT: Generate 6-12 comprehensive topics. If the material above is minimal, use the subject name to generate well-structured topics that would typically be covered in this course.",
      ].join("\n\n");

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "MainTopics",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                subject: { type: "string" },
                topics: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      summary: { type: "string" },
                      coverage: { type: "number" },
                    },
                    required: ["name", "summary", "coverage"],
                  },
                },
              },
              required: ["subject", "topics"],
            },
            strict: true,
          },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      try {
        data = JSON.parse(content);
      } catch {
        data = { subject, topics: [] };
      }
    } else {
      // Handle case with minimal/no material - generate topics based on subject name
      if ((!combined || combined.trim().length < 50) && files.length === 0) {
        // No material provided, generate topics from subject name only
        const user = [
          `Subject: ${subject}`,
          "",
          "No course material was provided. Generate 6-12 comprehensive, well-structured topics that would typically be covered in a course about this subject. Use your knowledge of the subject area to create a logical and complete topic structure.",
      ].join("\n\n");

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "MainTopics",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                subject: { type: "string" },
                topics: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      summary: { type: "string" },
                      coverage: { type: "number" },
                    },
                    required: ["name", "summary", "coverage"],
                  },
                },
              },
              required: ["subject", "topics"],
            },
            strict: true,
          },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      try {
        data = JSON.parse(content);
      } catch {
        data = { subject, topics: [] };
      }
    } else {
      // Fallback path: upload raw files to OpenAI and let the model read them directly
      const uploads: string[] = [];
      for (const file of files) {
        try {
          const uploaded = await client.files.create({ file: file as any, purpose: "assistants" });
          uploads.push(uploaded.id);
        } catch {}
      }
      const inputContent: any[] = [
          { type: "input_text", text: `Subject: ${subject}\n\nIMPORTANT: Generate 6-12 comprehensive topics. If the attached files contain minimal material, use the subject name to generate well-structured topics that would typically be covered in this course. Return JSON only.` },
        ...uploads.map((id) => ({ type: "input_file", file_id: id })),
      ];
      const resp = await client.responses.create({
        model: "gpt-4o-mini",
        instructions: system,
        input: [
          { role: "user", content: inputContent as any },
        ],
      });
      const out = (resp as any).output_text || "{}";
      try {
        data = JSON.parse(out);
      } catch {
        const start = out.indexOf("{");
        const end = out.lastIndexOf("}");
        if (start >= 0 && end > start) data = JSON.parse(out.slice(start, end + 1));
        }
      }
    }

    // Normalize coverage
    if (Array.isArray(data.topics)) {
      data.topics = data.topics.map((t) => ({
        name: String(t.name || "Topic"),
        summary: String(t.summary || ""),
        coverage: Math.max(0, Math.min(100, Math.round(Number((t as any).coverage) || 0))),
      }));
    }

    // Ensure we always have at least 6 topics - regenerate if needed
    if (!Array.isArray(data.topics) || data.topics.length < 6) {
      try {
        const regenerateUser = [
          `Subject: ${subject}`,
          combined && combined.trim().length >= 50 
            ? `Material: ${combined.slice(0, 50000)}`
            : "No material provided - generate topics based on subject knowledge.",
          "",
          "CRITICAL: You must generate AT LEAST 6 topics (ideally 8-12). Previous attempt returned fewer than 6. Generate a comprehensive set of 6-12 well-structured topics for this subject.",
        ].join("\n\n");

        const regenerateCompletion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "MainTopics",
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  subject: { type: "string" },
                  topics: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string" },
                        summary: { type: "string" },
                        coverage: { type: "number" },
                      },
                      required: ["name", "summary", "coverage"],
                    },
                  },
                },
                required: ["subject", "topics"],
              },
              strict: true,
            },
          },
          messages: [
            { role: "system", content: system },
            { role: "user", content: regenerateUser },
          ],
          temperature: 0.2,
        });

        const regenerateContent = regenerateCompletion.choices[0]?.message?.content || "{}";
        try {
          const regenerated = JSON.parse(regenerateContent);
          if (Array.isArray(regenerated.topics) && regenerated.topics.length >= 6) {
            data = regenerated;
          }
        } catch {}
      } catch {}
    }

    // Build course summary/context
    let course_context = "";
    try {
      const summarySystem = [
        "You summarize a course's materials.",
        "Write a short, high-signal summary (3-6 sentences) describing:",
        "- What the course is about",
        "- Key themes and ideas",
        "- Level and style (introductory vs advanced; theoretical vs applied)",
        `Write in ${lang.name}. No lists. Plain text only.`,
      ].join("\n");
      const summaryUser = combined.slice(0, 200_000);
      const summary = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: summarySystem },
          { role: "user", content: summaryUser },
        ],
        temperature: 0.3,
        max_tokens: 220,
      });
      course_context = summary.choices[0]?.message?.content || "";
    } catch {}

    return NextResponse.json({ ok: true, data, combinedText: combined, files: texts.map(t => ({ name: t.name })), course_context, detected_language_code: lang.code, detected_language_name: lang.name });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}


