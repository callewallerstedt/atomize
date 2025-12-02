import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requirePremiumAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Check premium access
    const premiumCheck = await requirePremiumAccess();
    if (!premiumCheck.ok) {
      return NextResponse.json({ ok: false, error: premiumCheck.error }, { status: 403 });
    }

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
      "You are a topic extraction system. Your ONLY job is to extract EVERY topic, concept, method, and technique that appears in the attached files.",
      "Read ONLY the attached files and any provided text. Do NOT use external knowledge.",
      "If the attached material is insufficient for topic extraction, return JSON with topics: [].",
      "",
      "Output STRICT JSON with this exact shape and key order:",
      "{ subject: string; topics: { name: string; summary: string }[] }",
      "",
      "CRITICAL RULES - EXTRACT EVERYTHING FROM THE FILES:",
      "- Extract EVERY single topic, concept, method, technique, theory, formula, algorithm, procedure, and subject area that appears in ALL attached files.",
      "- You MUST extract 20-50+ topics if the material contains that many. Do NOT limit yourself to a small number.",
      "- Include BOTH major topics AND subtopics as separate entries.",
      "- Include ALL methods, techniques, formulas, theories, algorithms, procedures, and specific concepts mentioned in the files.",
      "- Include ALL chapter headings, section titles, subsection titles, and major concepts from the material.",
      "- If a topic appears multiple times or in different contexts, include it.",
      "- Extract topics at multiple levels of granularity - both broad concepts AND specific details.",
      "- Each topic name should be specific and concise (2-6 words), taken directly from the material.",
      "",
      "CRITICAL RULES - ONLY EXTRACT FROM PROVIDED FILES:",
      "- ONLY extract topics that are EXPLICITLY mentioned or clearly present in the attached files.",
      "- DO NOT invent, assume, or add topics that are not in the files.",
      "- DO NOT use external knowledge to add topics not found in the files.",
      "- If a topic is not in the files, DO NOT include it.",
      "",
      "Inclusion criteria:",
      "- Keep all explainable concepts, principles, models, theorems, laws, algorithms, procedures, or lab skills found in the files.",
      "- Include both conceptual areas and essential methods or skills found in the files.",
      "",
      "Exclusion criteria:",
      "- Exclude metadata, logistics, and admin: einsendeaufgabe, aufgabenstellung, studienheft, code, persönl, personal data, syllabus, grading, schedule, deadlines, instructions, file names, section headers with no conceptual content.",
      "- Exclude section numbers, page numbers, figure/table captions without substance, references, and acknowledgements.",
      "- Exclude exam questions, old tests, and administrative content from summaries.",
      "",
      "Summaries:",
      "- A compact, comma-separated list of exactly what the student should learn in this topic, based ONLY on what's in the files.",
      "- Focus on learning outcomes, concepts, skills, and knowledge found in the material.",
      "- Ignore exam questions, old tests, or administrative content.",
      "- Use commas to separate different learning points.",
      "- Example: 'Understanding heat transfer mechanisms, calculating thermal efficiency, analyzing energy balance equations, applying conservation laws'.",
      "",
      "Language and formatting:",
      "- Use the same language as the source materials. Capitalize like a title. No quotes.",
      "- No markdown, no code fences, JSON only.",
      "",
      "Quality controls:",
      "- Remove any item that matches the exclusion criteria or is not teachable.",
      "- Extract ALL topics from the material - be exhaustive, not selective.",
      "- If the material covers many topics, extract ALL of them - don't limit yourself.",
      "If any rule cannot be satisfied, return topics: []."
    ].join('\\n');
    

    console.log(`[extract-by-ids] Processing ${fileIds.length} file IDs for subject: ${subject}`);
    
    // Verify all file IDs exist and are accessible
    const validFileIds: string[] = [];
    for (const id of fileIds) {
      try {
        await client.files.retrieve(id);
        validFileIds.push(id);
        console.log(`[extract-by-ids] Verified file ID: ${id}`);
      } catch (err: any) {
        console.warn(`[extract-by-ids] Invalid or missing file ID ${id}:`, err?.message);
      }
    }
    
    console.log(`[extract-by-ids] Valid file IDs: ${validFileIds.length}/${fileIds.length}`);
    
    // If no valid file IDs but we have contextText, use that as fallback
    if (validFileIds.length === 0 && contextText && contextText.trim().length > 50) {
      console.log(`[extract-by-ids] No valid file IDs, using contextText (${contextText.length} chars) as fallback`);
      const inputContent: any[] = [
        { type: "input_text", text: `Subject: ${subject}\n\nCRITICAL INSTRUCTIONS:\n1. Read through ALL of the material below completely and thoroughly.\n2. Extract EVERY topic, concept, method, technique, theory, formula, algorithm, and procedure that appears in the material.\n3. Extract 20-50+ topics if the material contains that many. Do NOT limit yourself.\n4. Include ALL major topics, subtopics, chapter headings, section titles, and specific concepts.\n5. Extract at multiple levels - both broad concepts AND specific details.\n6. ONLY extract topics that are EXPLICITLY in the material below. Do NOT add topics that aren't there.\n7. Do NOT use external knowledge to invent topics not found in the material.\n\nFor each topic's summary: Create a compact, comma-separated list of learning outcomes, concepts, skills, and knowledge found in the material. Focus on what the student should LEARN based on what's actually in the files.\n\nMaterial:\n${contextText}` },
      ];
      
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: inputContent[0].text },
        ],
        temperature: 0,
      });
      
      const out = (resp as any).choices?.[0]?.message?.content || "{}";
      let data: any = {};
      try {
        data = JSON.parse(out);
      } catch {
        const s = out.indexOf("{"); const e = out.lastIndexOf("}");
        if (s >= 0 && e > s) data = JSON.parse(out.slice(s, e + 1));
      }
      if (!data || !data.subject) data = { subject, topics: Array.isArray(data?.topics) ? data.topics : [] };
      return NextResponse.json({ ok: true, data, detected_language_code: lang.code, detected_language_name: lang.name, debug: { fileIdsCount: 0, usedContextText: true, contextTextLength: contextText.length } });
    }
    
    if (validFileIds.length === 0) {
      console.error(`[extract-by-ids] No valid file IDs and no contextText available`);
      return NextResponse.json({ ok: false, error: "No valid files or context provided" }, { status: 400 });
    }
    
    const inputContent: any[] = [
      { type: "input_text", text: `Subject: ${subject}\n\nCRITICAL INSTRUCTIONS:\n1. Read through ALL attached files completely and thoroughly.\n2. Extract EVERY topic, concept, method, technique, theory, formula, algorithm, and procedure that appears in the files.\n3. Extract 20-50+ topics if the material contains that many. Do NOT limit yourself.\n4. Include ALL major topics, subtopics, chapter headings, section titles, and specific concepts.\n5. Extract at multiple levels - both broad concepts AND specific details.\n6. ONLY extract topics that are EXPLICITLY in the attached files. Do NOT add topics that aren't there.\n7. Do NOT use external knowledge to invent topics not found in the files.\n\nFor each topic's summary: Create a compact, comma-separated list of learning outcomes, concepts, skills, and knowledge found in the files. Focus on what the student should LEARN based on what's actually in the material.` },
    ];
    
    // Add ALL valid file IDs - ensure none are skipped
    for (const id of validFileIds) {
      inputContent.push({ type: "input_file", file_id: id });
      console.log(`[extract-by-ids] Added file ID to input: ${id}`);
    }
    
    if (contextText) {
      inputContent.push({ type: "input_text", text: `Additional context (name, description, notes):\n${contextText}` });
    }
    
    console.log(`[extract-by-ids] Sending ${validFileIds.length} files to OpenAI for extraction`);

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




