import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TopicMeta = {
  name: string;
  summary: string;
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
    console.log(`[extract] Processing ${files.length} files...`);
    for (const file of files) {
      try {
        console.log(`[extract] Reading file: ${file.name} (${file.size} bytes)`);
        const txt = await readFileAsText(file);
        if (txt && txt.trim()) {
          texts.push({ name: file.name, text: txt });
          console.log(`[extract] Successfully extracted ${txt.length} characters from ${file.name}`);
        } else {
          console.warn(`[extract] No text extracted from ${file.name}`);
        }
      } catch (err: any) {
        console.error(`[extract] Error processing ${file.name}:`, err?.message);
      }
    }
    console.log(`[extract] Total files processed: ${texts.length}/${files.length}`);

    // Combine all files - NO TRUNCATION to ensure full content is used
    // We'll use OpenAI's file upload API for large content instead of truncating
    const combined = texts.map((t) => `# ${t.name}\n\n${t.text}`).join("\n\n\n");
    console.log(`[extract] Combined text length: ${combined.length} characters`);

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
      "You are a topic extraction system. Your ONLY job is to extract EVERY topic, concept, method, and technique that appears in the provided course material.",
      "Return STRICT JSON with this exact shape:",
      "{ subject: string; topics: { name: string; summary: string }[] }",
      "",
      "CRITICAL RULES - EXTRACT EVERYTHING FROM THE FILES:",
      "- Extract EVERY single topic, concept, method, technique, theory, formula, algorithm, procedure, and subject area that appears in the provided material.",
      "- You MUST extract 20-50+ topics if the material contains that many. Do NOT limit yourself to a small number.",
      "- Include BOTH major topics AND subtopics as separate entries.",
      "- Include ALL methods, techniques, formulas, theories, algorithms, procedures, and specific concepts mentioned in the files.",
      "- Include ALL chapter headings, section titles, subsection titles, and major concepts from the material.",
      "- If a topic appears multiple times or in different contexts, include it.",
      "- Extract topics at multiple levels of granularity - both broad concepts AND specific details.",
      "- Each topic name should be specific and concise (2-6 words), taken directly from the material.",
      "",
      "CRITICAL RULES - ONLY EXTRACT FROM PROVIDED MATERIAL:",
      "- ONLY extract topics that are EXPLICITLY mentioned or clearly present in the provided files.",
      "- DO NOT invent, assume, or add topics that are not in the material.",
      "- DO NOT use external knowledge to add topics not found in the files.",
      "- If a topic is not in the files, DO NOT include it.",
      "",
      "Summary format:",
      "- summary: A compact, comma-separated list of exactly what the student should learn in this topic, based ONLY on what's in the material.",
      "- Focus on learning outcomes, concepts, skills, and knowledge found in the files.",
      "- Ignore exam questions, old tests, or administrative content.",
      "- Use commas to separate different learning points.",
      "- Example: 'Understanding heat transfer mechanisms, calculating thermal efficiency, analyzing energy balance equations, applying conservation laws'.",
      "",
      "Output requirements:",
      "- No markdown, no code fences, JSON only.",
      "- Extract ALL topics from the material - be exhaustive, not selective.",
      `- Write summaries in ${lang.name}.`,
    ].join("\n");

    let data: { subject: string; topics: TopicMeta[] } = { subject, topics: [] };
    if (combined && combined.trim().length >= 50) {
      // For large content, upload files to OpenAI and use file IDs instead of truncating
      // This ensures ALL content is processed, not just the first 300k chars
      let useFileIds = false;
      const fileIds: string[] = [];
      
      // If combined text is very large (>500k chars), upload files to OpenAI
      if (combined.length > 500_000 && files.length > 0) {
        console.log(`[extract] Large content detected (${combined.length} chars), uploading files to OpenAI...`);
        try {
          for (const file of files) {
            try {
              const uploaded = await client.files.create({ 
                file: file as any, 
                purpose: "assistants" 
              });
              fileIds.push(uploaded.id);
              console.log(`[extract] Uploaded ${file.name} to OpenAI: ${uploaded.id}`);
            } catch (err: any) {
              console.error(`[extract] Failed to upload ${file.name}:`, err?.message);
            }
          }
          if (fileIds.length > 0) {
            useFileIds = true;
            console.log(`[extract] Using ${fileIds.length} uploaded files for extraction`);
          }
        } catch (err: any) {
          console.error(`[extract] File upload failed, falling back to text:`, err?.message);
        }
      }
      
      if (useFileIds && fileIds.length > 0) {
        // Use file IDs for large content
        const inputContent: any[] = [
          { type: "input_text", text: `Subject: ${subject}\n\nCRITICAL INSTRUCTIONS:\n1. Read through ALL attached files completely and thoroughly.\n2. Extract EVERY topic, concept, method, technique, theory, formula, algorithm, and procedure that appears in the files.\n3. Extract 20-50+ topics if the material contains that many. Do NOT limit yourself.\n4. Include ALL major topics, subtopics, chapter headings, section titles, and specific concepts.\n5. Extract at multiple levels - both broad concepts AND specific details.\n6. ONLY extract topics that are EXPLICITLY in the attached files. Do NOT add topics that aren't there.\n7. Do NOT use external knowledge to invent topics not found in the files.\n\nFor each topic's summary: Create a compact, comma-separated list of learning outcomes, concepts, skills, and knowledge found in the files. Focus on what the student should LEARN based on what's actually in the material.` },
          ...fileIds.map((id) => ({ type: "input_file", file_id: id })),
        ];
        
        const resp = await client.responses.create({
          model: "gpt-4o-mini",
          instructions: system,
          input: [{ role: "user", content: inputContent as any }],
          temperature: 0.2,
        });
        
        const out = (resp as any).output_text || "{}";
        try {
          data = JSON.parse(out);
        } catch {
          const start = out.indexOf("{");
          const end = out.lastIndexOf("}");
          if (start >= 0 && end > start) data = JSON.parse(out.slice(start, end + 1));
        }
      } else {
        // Primary path: use extracted text (for smaller content or if upload failed)
        const user = [
          `Subject: ${subject}`,
          "",
          "Material (ALL files combined - read EVERYTHING):",
          combined,
          "",
          "CRITICAL INSTRUCTIONS:",
          "1. Read through ALL of the material above completely and thoroughly.",
          "2. Extract EVERY topic, concept, method, technique, theory, formula, algorithm, and procedure that appears in the material.",
          "3. Extract 20-50+ topics if the material contains that many. Do NOT limit yourself.",
          "4. Include ALL major topics, subtopics, chapter headings, section titles, and specific concepts.",
          "5. Extract at multiple levels - both broad concepts AND specific details.",
          "6. ONLY extract topics that are EXPLICITLY in the material above. Do NOT add topics that aren't there.",
          "7. Do NOT use external knowledge to invent topics not found in the files.",
          "",
          "For each topic's summary: Create a compact, comma-separated list of learning outcomes, concepts, skills, and knowledge found in the material. Focus on what the student should LEARN based on what's actually in the files, not exam questions or old tests.",
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
                    },
                    required: ["name", "summary"],
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
                    },
                    required: ["name", "summary"],
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
          { type: "input_text", text: `Subject: ${subject}\n\nCRITICAL INSTRUCTIONS:\n1. Read through ALL attached files completely and thoroughly.\n2. Extract EVERY topic, concept, method, technique, theory, formula, algorithm, and procedure that appears in the files.\n3. Extract 20-50+ topics if the material contains that many. Do NOT limit yourself.\n4. Include ALL major topics, subtopics, chapter headings, section titles, and specific concepts.\n5. Extract at multiple levels - both broad concepts AND specific details.\n6. ONLY extract topics that are EXPLICITLY in the attached files. Do NOT add topics that aren't there.\n7. Do NOT use external knowledge to invent topics not found in the files.\n\nFor each topic's summary: Create a compact, comma-separated list of learning outcomes, concepts, skills, and knowledge found in the files. Focus on what the student should LEARN based on what's actually in the material.` },
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

    // Normalize topics (remove coverage)
    if (Array.isArray(data.topics)) {
      data.topics = data.topics.map((t) => ({
        name: String(t.name || "Topic"),
        summary: String(t.summary || ""),
      }));
    }

    // If we got very few topics, try to extract more comprehensively
    // Check if we got fewer than expected - if material is substantial, we should have many topics
    const expectedMinTopics = combined.length > 100000 ? 20 : combined.length > 50000 ? 15 : 10;
    if (!Array.isArray(data.topics) || data.topics.length < expectedMinTopics) {
      try {
        const regenerateUser = [
          `Subject: ${subject}`,
          combined && combined.trim().length >= 50 
            ? `Material (read ALL of it): ${combined}`
            : "No material provided - cannot extract topics without material.",
          "",
          "CRITICAL: Previous attempt returned too few topics. You MUST extract EVERY topic, concept, method, technique, theory, formula, algorithm, and procedure that appears in the material above. Extract 20-50+ topics if the material contains that many. Include ALL major topics, subtopics, chapter headings, section titles, and specific concepts. Extract at multiple levels. ONLY extract topics that are in the material - do NOT invent topics. Be exhaustive, not selective. Read through the ENTIRE material and extract everything.",
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
                      },
                      required: ["name", "summary"],
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
          // Accept regeneration if it has more topics than the original
          if (Array.isArray(regenerated.topics) && regenerated.topics.length > (data.topics?.length || 0)) {
            console.log(`[extract] Regeneration improved: ${data.topics?.length || 0} -> ${regenerated.topics.length} topics`);
            data = regenerated;
          } else if (Array.isArray(regenerated.topics) && regenerated.topics.length >= expectedMinTopics) {
            console.log(`[extract] Regeneration met minimum: ${regenerated.topics.length} topics`);
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


