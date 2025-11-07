import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TreeNode = { name: string; subtopics?: TreeNode[] };

export async function POST(req: Request) {
  try {
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
      "- name: concise (2–5 words).",
      "- overview: 2–4 sentences describing the topic in context; KaTeX math allowed ($...$, $$...$$).",
      "- insertPath: array of ancestor topic names from root to the parent where this topic should be placed. Use existing names from the provided tree. Return [] to place at top-level.",
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
      instructions: system + "\nReturn STRICT JSON only: { name: string; overview: string; insertPath: string[] }.",
      input: [ { role: "user", content: blocks } ],
      temperature: 0.3,
      max_output_tokens: 700,
    });

    const content = resp.output_text || "{}";
    let data: any = {};
    try { data = JSON.parse(content); } catch { data = {}; }
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

