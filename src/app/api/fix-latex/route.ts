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
    const latex = String(body.latex || "");
    const errorMessage = String(body.errorMessage || "");

    if (!latex) return NextResponse.json({ ok: false, error: "Missing latex" }, { status: 400 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You are a LaTeX expert. Fix LaTeX syntax errors to make it valid KaTeX/LaTeX.",
      "Return ONLY the fixed LaTeX code, nothing else. No explanations, no markdown, no code blocks.",
      "Preserve the mathematical meaning exactly.",
      "Common fixes:",
      "- Add missing backslashes for commands (eta -> \\eta, times -> \\times)",
      "- Fix text{} issues (ext{ -> \\text{)",
      "- Remove invalid characters like quotes in math contexts",
      "- Fix bracket issues",
      "- Fix stray underscores",
    ].join("\n");

    const user = [
      `Fix this LaTeX: ${latex}`,
      errorMessage ? `Error: ${errorMessage}` : "",
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const fixed = completion.choices[0]?.message?.content?.trim() || latex;
    // Remove any markdown code blocks if AI added them
    const cleaned = fixed.replace(/^```[a-z]*\n?/g, '').replace(/\n?```$/g, '').trim();
    
    return NextResponse.json({ ok: true, fixed: cleaned });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

