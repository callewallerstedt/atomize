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
    const syllabus = String(body.syllabus || "");
    const text = String(body.text || "");
    const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds : [];
    const preferredLanguage: string | undefined = body.preferredLanguage ? String(body.preferredLanguage) : undefined;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = [
      "You are summarizing a course based on the provided materials.",
      "Write a comprehensive course summary in PLAIN TEXT ONLY (2-4 paragraphs).",
      "The summary should describe:",
      "- What the course is about",
      "- Key themes, concepts, and learning objectives",
      "- The level and style (introductory vs advanced; theoretical vs applied)",
      "- Main areas of focus",
      "",
      preferredLanguage
        ? `CRITICAL: Write all content in ${preferredLanguage}.`
        : "IMPORTANT: Use the SAME LANGUAGE as the provided text.",
    ].join("\n");

    // Build input_text blocks by inlining text from provided documents (preferred path)
    const blocks: Array<{ type: "input_text"; text: string }> = [
      { type: "input_text", text: `Subject: ${subject}` },
      { type: "input_text", text: "Read the provided text below and extract topics from it." },
    ];

    let budget = 180_000; // overall character cap per request

    // Helper to normalize text
    const normalize = (s: string) =>
      s.replace(/[\x00-\x08\x0E-\x1F]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    // If the client sent documents directly, use them; otherwise, we will try to read fileIds below.
    const docs: Array<{ name: string; text: string }> = Array.isArray((body as any).documents) ? (body as any).documents : [];

    if (docs.length > 0) {
      for (const d of docs) {
        if (budget <= 0) break;
        const header = `\n\n=== FILE: ${d.name} ===\n`;
        const headBudget = Math.min(header.length, budget);
        if (headBudget <= 0) break;
        blocks.push({ type: "input_text", text: header.slice(0, headBudget) });
        budget -= headBudget;
        const clean = (d.text || "").replace(/[\x00-\x08\x0E-\x1F]/g, "").trim();
        for (let i = 0; i < clean.length && budget > 0; i += 12_000) {
          const chunk = clean.slice(i, i + Math.min(12_000, budget));
          if (!chunk) break;
          blocks.push({ type: "input_text", text: chunk });
          budget -= chunk.length;
        }
      }
    }

    // Optional user-provided syllabus/context (counts against budget)
    const extraText = [syllabus ? `Syllabus:\n${syllabus}` : "", text ? `User text:\n${text}` : ""]
      .filter(Boolean)
      .join("\n\n");
    if (extraText) {
      const add = normalize(extraText).slice(0, Math.min(extraText.length, budget));
      if (add) {
        blocks.push({ type: "input_text", text: add });
        budget -= add.length;
      }
    }

    // Compatibility helper for reading file bytes across SDK variants
    async function fetchFileBuffer(client: OpenAI, fileId: string): Promise<Buffer> {
      const anyClient: any = client;
      if (typeof anyClient.files?.retrieve_content === "function") {
        const r = await anyClient.files.retrieve_content(fileId);
        return Buffer.from(await r.arrayBuffer());
      }
      if (typeof anyClient.files?.content === "function") {
        const r = await anyClient.files.content(fileId);
        return Buffer.from(await r.arrayBuffer());
      }
      throw new Error("No files.retrieve_content or files.content on this SDK");
    }

    // If no docs array was provided, fall back to reading fileIds and inlining their text
    if (docs.length === 0 && (fileIds || []).length > 0) {
      try { console.log("course-summary fallback fileIds:", fileIds.length); } catch {}
    }
    for (const id of docs.length === 0 ? (fileIds || []) : []) {
      if (budget <= 0) break;
      try {
        const meta: any = await client.files.retrieve(id).catch(() => null);
        const name = String(meta?.filename || meta?.name || id).toLowerCase();
        let buf: Buffer;
        try {
          buf = await fetchFileBuffer(client, id);
        } catch (e: any) {
          console.error("file read error", e?.message || e);
          continue;
        }

        let fileText = "";
        if (name.endsWith(".pdf")) {
          try {
            const mod: any = await import("pdf-parse");
            const pdfParse = (mod?.default ?? mod) as (data: Buffer) => Promise<{ text: string }>;
            const parsed = await pdfParse(buf);
            fileText = parsed?.text || "";
            try { console.log("course-summary pdf chars:", name, fileText.length); } catch {}
          } catch {}
        } else if (name.endsWith(".docx")) {
          try {
            const mammoth: any = (await import("mammoth")).default ?? (await import("mammoth"));
            const raw = await mammoth.extractRawText({ buffer: buf });
            fileText = String(raw?.value || "");
          } catch {}
          if (fileText.trim().length < 50) {
            try {
              const jszipMod: any = await import("jszip");
              const JSZip = jszipMod.default || jszipMod;
              const zip = await new JSZip().loadAsync(buf);
              const xml = await zip.file("word/document.xml")?.async("string");
              if (xml) {
                fileText = xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, " ");
              }
            } catch {}
          }
          try { console.log("course-summary docx chars:", name, fileText.length); } catch {}
        } else {
          try { fileText = new TextDecoder().decode(buf); } catch { fileText = buf.toString("utf-8"); }
        }

        fileText = normalize(fileText);
        if (!fileText) continue;

        const header = `\n\n=== FILE: ${name} ===\n`;
        const headBudget = Math.min(header.length, budget);
        if (headBudget <= 0) break;
        blocks.push({ type: "input_text", text: header.slice(0, headBudget) });
        budget -= headBudget;

        const chunkSize = 12_000;
        for (let i = 0; i < fileText.length && budget > 0; i += chunkSize) {
          const chunk = fileText.slice(i, i + Math.min(chunkSize, budget));
          if (!chunk) break;
          blocks.push({ type: "input_text", text: chunk });
          budget -= chunk.length;
        }
      } catch (e: any) {
        try { console.warn("course-summary file read error:", e?.message); } catch {}
      }
    }

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      instructions: system,
      input: [{ role: "user", content: blocks }],
      temperature: 0,
      max_output_tokens: 900,
    });

    let course_context = (resp as any)?.output?.[0]?.content?.[0]?.text?.trim?.() || "";
    
    // Clean any JSON structures that might have been returned
    // Remove markdown code blocks
    course_context = course_context.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // If it looks like JSON (starts with {), try to extract plain text
    const trimmedContext = course_context.trim();
    if (trimmedContext.startsWith('{') && trimmedContext.endsWith('}')) {
      try {
        const parsed = JSON.parse(course_context);
        // Try to extract a meaningful summary from JSON
        if (parsed.course_context && typeof parsed.course_context === 'string') {
          course_context = parsed.course_context;
        } else if (parsed.summary && typeof parsed.summary === 'string') {
          course_context = parsed.summary;
        } else if (parsed.subject && typeof parsed.subject === 'string') {
          // If it's the full response object, generate a simple description from the subject
          course_context = `This course covers ${parsed.subject}.`;
        } else if (Array.isArray(parsed.topics) || Array.isArray(parsed.areas)) {
          // If it's topics/areas array, ignore it and use a fallback
          course_context = syllabus || text || 'Course summary unavailable';
        } else {
          // Try to extract any string values
          const stringValues = Object.values(parsed).filter(v => typeof v === 'string');
          course_context = stringValues.length > 0 ? String(stringValues[0]) : (syllabus || text || 'Course summary unavailable');
        }
      } catch {
        // If parsing fails, remove JSON structure
        course_context = course_context
          .replace(/\{[^}]*\}/g, '') // Remove JSON objects
          .replace(/\[[^\]]*\]/g, '') // Remove arrays
          .trim() || (syllabus || text || 'Course summary unavailable');
      }
    } else if (trimmedContext.startsWith('{')) {
      // Partial JSON - try to extract text content
      try {
        const parsed = JSON.parse(course_context);
        if (parsed.course_context && typeof parsed.course_context === 'string') {
          course_context = parsed.course_context;
        } else if (parsed.summary && typeof parsed.summary === 'string') {
          course_context = parsed.summary;
        } else {
          course_context = syllabus || text || 'Course summary unavailable';
        }
      } catch {
        // Remove JSON structures but keep text
        course_context = course_context
          .replace(/\{[^}]*"course_context"\s*:\s*"([^"]+)"/g, '$1')
          .replace(/\{[^}]*"summary"\s*:\s*"([^"]+)"/g, '$1')
          .replace(/\{[^}]*\}/g, '')
          .replace(/\[[^\]]*\]/g, '')
          .trim() || (syllabus || text || 'Course summary unavailable');
      }
    }
    
    // Final cleanup: remove any remaining JSON-like structures, arrays, and code blocks
    course_context = course_context
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/\{[^}]*\}/g, '') // Remove any remaining JSON objects
      .replace(/\[[^\]]*\]/g, '') // Remove arrays
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // If after all cleaning it's empty or too short, use syllabus or text as fallback
    if (!course_context || course_context.length < 20) {
      course_context = syllabus || text || 'Course summary unavailable';
    }
    
    return NextResponse.json({ ok: true, course_context });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}




