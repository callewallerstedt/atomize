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
      return NextResponse.json({ ok: true, examFiles: [] });
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
          content: `You are an expert at identifying exam documents. Your task is to analyze file content previews and determine which files are exam papers, test papers, or examination documents.

An exam file typically contains:
- Questions or problems to be solved
- Instructions for an exam/test
- Point values or grading information
- Exam dates or course codes
- "Exam", "Test", "Tentamen", "Prov", "Examination" in the content
- Question numbers (Q1, Question 1, etc.)
- Answer spaces or areas for responses

NOT exam files:
- Course materials, lecture notes, textbooks
- Study guides or summaries
- Assignment instructions (unless they're exam assignments)
- General educational content

Return ONLY a JSON array of file names that are exams, like: ["exam_2023.pdf", "tentamen_1.pdf"]
If no files are exams, return an empty array: []`
        },
        {
          role: 'user',
          content: `Analyze these file previews and return a JSON array of file names that are exam documents:\n\n${snippetsText}\n\nReturn ONLY the JSON array, no other text.`
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    // Parse JSON response
    let examFiles: string[] = [];
    try {
      // Try direct parse
      examFiles = JSON.parse(responseText);
    } catch {
      // Try to find JSON array in markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (jsonMatch) {
        examFiles = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find any JSON array
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          examFiles = JSON.parse(arrayMatch[0]);
        }
      }
    }

    // Ensure it's an array of strings
    if (!Array.isArray(examFiles)) {
      examFiles = [];
    }
    examFiles = examFiles.filter(name => typeof name === 'string');

    return NextResponse.json({ ok: true, examFiles });
  } catch (error: any) {
    console.error('Exam detection error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to detect exam files' },
      { status: 500 }
    );
  }
}



