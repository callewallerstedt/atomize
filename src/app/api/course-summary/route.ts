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

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = [
      "You are an expert educational analyst. Create a comprehensive course context document that captures ALL key learning objectives, concepts, methods, and skills that students should master from the provided materials.",
      "Structure your response as a detailed educational guide including:",
      "- Core concepts and theories to understand",
      "- Key methods, techniques, and processes to learn",
      "- Important formulas, algorithms, or procedures",
      "- Practical skills and applications",
      "- Problem-solving approaches",
      "- Important terminology and definitions",
      "- Learning objectives and competencies",
      "Be comprehensive but organized. Use bullet points and clear headings. Focus on WHAT students need to LEARN and MASTER from the material, not just what the course is about.",
    ].join("\n");

    // Use Responses API: pass system prompt via `instructions`, and the rest as input blocks
    const userBlocks = [
      {
        type: "input_text",
        text: [
          subject ? `Subject: ${subject}` : "",
          syllabus ? `User syllabus: ${syllabus.slice(0, 5000)}` : "",
          text ? `Course materials (extracted text): ${text.slice(0, 8000)}` : "",
          "Create a comprehensive learning guide that captures all key concepts, methods, and skills to master from these materials.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      // Fewer files speeds up processing significantly; keep highest-signal few
      ...fileIds.slice(0, 3).map((fileId) => ({ type: "input_file", file_id: fileId })),
    ];

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      instructions: system,
      input: [
        {
          role: "user",
          content: userBlocks,
        },
      ],
      temperature: 0.2,
      max_output_tokens: 900,
    });

    const course_context = resp.output_text?.trim() || "";
    return NextResponse.json({ ok: true, course_context });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}




