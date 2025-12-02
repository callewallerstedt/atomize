import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requirePremiumAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TreeNode = { name: string; subtopics?: TreeNode[] };

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
    const subject = String(body.subject || "");
    const prompt = String(body.prompt || "");
    const course_context = String(body.course_context || "");
    const combinedText = String(body.combinedText || "");
    const tree: { subject: string; topics: TreeNode[] } = body.tree || { subject, topics: [] };
    const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds : [];

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You add a new topic node to a course topic tree.",
      "Return STRICT JSON with this shape:",
      "{ name: string; overview: string; insertPath: string[] }",
      "Rules:",
      "- name: REQUIRED. Must be a concise topic name (2–5 words). This field is MANDATORY and must never be empty or missing.",
      "- overview: REQUIRED. Must be 2–4 sentences describing the topic in context; KaTeX math allowed ($...$, $$...$$).",
      "- insertPath: REQUIRED. Must be an array of ancestor topic names from root to the parent where this topic should be placed. Use existing names from the provided tree. Return [] to place at top-level.",
      "CRITICAL: The 'name' field is REQUIRED and must always be present in your response. Never return a response without a name field.",
    ].join("\n");

    // Build Responses API input with files + text
    const blocks = [
      {
        type: "input_text" as const,
        text: [
          `Subject: ${subject}`,
          course_context ? `Course summary: ${course_context}` : "",
          "Existing topic tree (names only):",
          JSON.stringify(tree.topics || []),
          "Prompt for new topic (user text):",
          prompt,
          "Relevant material (truncated):",
          combinedText.slice(0, 120000),
        ].filter(Boolean).join("\n\n"),
      },
      ...fileIds.slice(0, 3).map((fileId) => ({ type: "input_file" as const, file_id: fileId })),
    ];

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      instructions: system + "\n\nCRITICAL: Return STRICT JSON only with ALL required fields: { name: string; overview: string; insertPath: string[] }. The 'name' field is MANDATORY and must never be empty.",
      input: [ { role: "user", content: blocks } ],
      temperature: 0.3,
      max_output_tokens: 700,
    });

    let content = resp.output_text || "{}";
    
    // Strip markdown code blocks if present
    content = content.trim();
    if (content.startsWith("```")) {
      // Remove opening ```json or ```
      content = content.replace(/^```(?:json)?\s*/i, "");
      // Remove closing ```
      content = content.replace(/\s*```$/g, "");
      content = content.trim();
    }
    
    let data: any = {};
    try {
      data = JSON.parse(content);
      // Validate required fields
      if (!data.name || typeof data.name !== 'string') {
        return NextResponse.json({ ok: false, error: "Invalid response format: missing or invalid 'name' field" }, { status: 500 });
      }
      if (!data.overview || typeof data.overview !== 'string') {
        return NextResponse.json({ ok: false, error: "Invalid response format: missing or invalid 'overview' field" }, { status: 500 });
      }
      if (!Array.isArray(data.insertPath)) {
        return NextResponse.json({ ok: false, error: "Invalid response format: missing or invalid 'insertPath' field" }, { status: 500 });
      }
    } catch (e: any) {
      console.error("[topic-suggest] Failed to parse response:", e, "Content:", content);
      return NextResponse.json({ ok: false, error: `Failed to parse topic suggestion: ${e?.message || "Invalid JSON"}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

