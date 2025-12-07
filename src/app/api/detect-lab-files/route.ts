import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    const body = await req.json();
    const fileSnippets = Array.isArray(body?.fileSnippets) ? body.fileSnippets : [];

    if (fileSnippets.length === 0) {
      return NextResponse.json({ ok: true, labFiles: [] });
    }

    // Build prompt with file snippets
    const snippetsText = fileSnippets
      .map((snippet: any) => `File: ${snippet.name}\nContent preview:\n${snippet.preview}`)
      .join('\n\n---\n\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at identifying lab instruction documents. Your task is to analyze file content previews and determine which files are lab instructions, laboratory manuals, or experiment procedures.

A lab file typically contains:
- Lab instructions or procedures
- Step-by-step experimental procedures
- Apparatus or equipment lists
- Safety instructions for experiments
- "Lab", "Laboration", "Laboratory", "Experiment", "Procedure", "Apparatus", "Materials" in the content
- Instructions for conducting experiments or practical work
- Measurement procedures or data collection steps

NOT lab files:
- Exam papers or test questions
- Course materials or lecture notes (unless they're specifically lab manuals)
- General educational content without experimental procedures
- Assignment instructions (unless they're lab assignments)

Return ONLY a JSON array of file names that are lab instruction documents, like: ["lab_3.pdf", "experiment_manual.docx"]
If no files are lab instructions, return an empty array: []`
        },
        {
          role: 'user',
          content: `Analyze these file previews and return a JSON array of file names that are lab instruction documents:\n\n${snippetsText}\n\nReturn ONLY the JSON array, no other text.`
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    // Parse JSON response
    let labFiles: string[] = [];
    try {
      // Try direct parse
      labFiles = JSON.parse(responseText);
    } catch {
      // Try to find JSON array in markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (jsonMatch) {
        labFiles = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find any JSON array
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          labFiles = JSON.parse(arrayMatch[0]);
        }
      }
    }

    // Ensure it's an array of strings
    if (!Array.isArray(labFiles)) {
      labFiles = [];
    }
    labFiles = labFiles.filter(name => typeof name === 'string');

    return NextResponse.json({ ok: true, labFiles });
  } catch (error: any) {
    console.error('Lab detection error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to detect lab files' },
      { status: 500 }
    );
  }
}

