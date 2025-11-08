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
    const subject = String(body.subject || "Subject");
    const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds : [];
    const contextText = String(body.contextText || "").slice(0, 200_000);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Extract docx text using multiple strategies for robustness
    async function extractDocxText(buffer: Buffer): Promise<{ text: string; method: string }> {
      // 1) Mammoth raw text
      try {
        const mammoth = await import("mammoth");
        const mammothModule = (mammoth as any).default || mammoth;
        const raw = await mammothModule.extractRawText({ buffer });
        const text = String(raw?.value || "");
        if (text.trim().length > 50) {
          return { text, method: "mammoth-raw" };
        }
        // 2) Mammoth HTML -> strip tags
        const htmlRes = await mammothModule.convertToHtml({ buffer });
        const html = String(htmlRes?.value || "");
        const stripped = html
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim();
        if (stripped.trim().length > 50) {
          return { text: stripped, method: "mammoth-html-strip" };
        }
      } catch {}
      // 3) JSZip: read word/document.xml and strip XML
      try {
        const jszipMod: any = await import("jszip");
        const JSZip = (jszipMod as any).default || jszipMod;
        const zip = await new JSZip().loadAsync(buffer);
        const xml = await zip.file("word/document.xml")?.async("string");
        if (xml && xml.length) {
          const text = xml
            .replace(/<w:tab\/>/g, "\t")
            .replace(/<w:br\/>/g, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (text.trim().length > 50) {
            return { text, method: "jszip-xml-strip" };
          }
        }
      } catch {}
      return { text: "", method: "none" };
    }

    // Helper to fetch file content from OpenAI and extract text
    async function readRemoteFileAsText(id: string): Promise<{ name: string; text: string; method: string }> {
      try {
        // Retrieve metadata for filename
        const meta: any = await client.files.retrieve(id).catch(() => ({}));
        const name: string = String((meta as any)?.filename || (meta as any)?.name || id).toLowerCase();
        const resp: any = await client.files.content(id);
        // The client returns a Response object with a web stream
        const arrayBuffer: ArrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = String(resp.headers?.get?.("content-type") || "");
        // First: try plain UTF-8 decode (covers our DOCX->TXT uploads and most text)
        try {
          const decoded = new TextDecoder().decode(buffer);
          const cleaned = decoded.replace(/[\x00-\x08\x0E-\x1F]/g, "");
          if (cleaned && cleaned.trim().length > 50) {
            return { name, text: cleaned, method: "utf8-decode" };
          }
        } catch {}

        // Detect types by extension or content-type for binary formats
        const isPdf = name.endsWith(".pdf") || contentType.includes("pdf");
        const isDocx = name.endsWith(".docx") || contentType.includes("officedocument.wordprocessingml.document");
        const isText = contentType.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown");
        if (isPdf) {
          try {
            const mod: any = await import("pdf-parse");
            const pdfParse = (mod?.default ?? mod) as (data: Buffer) => Promise<{ text: string }>;
            const { text } = await pdfParse(buffer).catch(() => ({ text: "" } as any));
            return { name, text: text || "", method: "pdf-parse" };
          } catch {
            return { name, text: "", method: "pdf-parse-failed" };
          }
        }
        if (isDocx) {
          const out = await extractDocxText(buffer);
          return { name, text: out.text, method: out.method };
        }
        if (isText) {
          try {
            return { name, text: new TextDecoder().decode(buffer), method: "text-decode" };
          } catch {
            return { name, text: buffer.toString("utf-8"), method: "text-buffer-utf8" };
          }
        }
        // Fallback: try utf-8 decode and clean
        try {
          const decoded = new TextDecoder().decode(buffer);
          const cleaned = decoded.replace(/[\x00-\x08\x0E-\x1F]/g, "").trim();
          return { name, text: cleaned, method: "utf8-fallback" };
        } catch {
          return { name, text: "", method: "none" };
        }
      } catch {
        return { name: id, text: "", method: "error" };
      }
    }

    // Optionally detect language from a small sample of file contents
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

    // Build a small text sample for language detection from first few files (best-effort)
    let sampleText = "";
    try {
      const take = Math.min(3, fileIds.length);
      for (let i = 0; i < take; i++) {
        const out = await readRemoteFileAsText(fileIds[i]).catch(() => ({ text: "" } as any));
        if (out?.text) {
          sampleText += "\n\n" + out.text.slice(0, 4000);
        }
      }
      if (!sampleText && contextText) sampleText = contextText.slice(0, 4000);
    } catch {}
    const lang = await detectLanguage(sampleText || contextText || "");

    // Revert: do NOT pre-concatenate file contents. Attach original uploaded files to the model.

    const system = [
      "Read ONLY the attached files and any provided text. Do not use external knowledge.",
      "If the attached material is insufficient for topic extraction, return JSON with topics: [].",
      "Task: Extract the most relevant learning topics and core skills from THESE materials.",
      "Output STRICT JSON with this exact shape and key order:",
      "{ subject: string; topics: { name: string; summary: string; coverage: number }[] }",
      "Inclusion criteria:",
      "- Keep only explainable concepts, principles, models, theorems, laws, algorithms, procedures, or lab skills.",
      "- If it cannot be taught or practiced as a standalone mini lesson, exclude it.",
      "Exclusion criteria:",
      "- Exclude metadata, logistics, and admin: einsendeaufgabe, aufgabenstellung, studienheft, code, persönl, personal data, syllabus, grading, schedule, deadlines, instructions, file names, section headers with no conceptual content.",
      "- Exclude section numbers, page numbers, figure/table captions without substance, references, and acknowledgements.",
      "Topic requirements:",
      "- Produce 8–16 concise topics, each 2–6 words, covering the course material.",
      "- Include both conceptual areas and essential methods or skills found in the files.",
      "- Names must be specific and teachable, e.g., 'Heat Capacity', 'Calorific Value', 'Efficiency Analysis', 'Power Plant Balance'.",
      "- No duplicates or near duplicates. Prefer the most general useful phrasing.",
      "Summaries:",
      "- 1–2 sentences stating what the student will learn or be able to do. Must reflect the provided material.",
      "Coverage:",
      "- Integer 0–100 per topic, estimating portion of total content. Sum should be 95–105. Never exceed 105. Never return a topic with 0.",
      "Language and formatting:",
      "- Use the same language as the source materials. Capitalize like a title. No quotes.",
      "- No subtopics, bullets, markdown, or code fences. JSON only.",
      "Quality controls before returning:",
      "- Remove any item that matches the exclusion criteria or is not teachable.",
      "- Merge or rename overlapping items to avoid duplication.",
      "- If fewer than 8 valid topics remain, prefer broader conceptual groupings found in the files rather than inventing new content.",
      "If any rule cannot be satisfied, return topics: []."
    ].join('\\n');
    

    const inputContent: any[] = [
      { type: "input_text", text: `Subject: ${subject}\nTask: Read all provided materials and extract the full set of topics and core concepts students need to learn.` },
    ];
    for (const id of fileIds) {
      inputContent.push({ type: "input_file", file_id: id });
    }
    if (contextText) {
      inputContent.push({ type: "input_text", text: `Additional context (name, description, notes):\n${contextText}` });
    }

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      instructions: system,
      input: [ { role: "user", content: inputContent as any } ],
      temperature: 0,
    });
    const out = (resp as any)?.output?.[0]?.content?.[0]?.text ?? "";
    let data: any = {};
    try {
      data = JSON.parse(out);
    } catch {
      const s = out.indexOf("{"); const e = out.lastIndexOf("}");
      if (s >= 0 && e > s) data = JSON.parse(out.slice(s, e + 1));
    }
    if (!data || !data.subject) data = { subject, topics: Array.isArray(data?.topics) ? data.topics : [] };
    return NextResponse.json({ ok: true, data, detected_language_code: lang.code, detected_language_name: lang.name, debug: { fileIdsCount: fileIds.length } });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}




