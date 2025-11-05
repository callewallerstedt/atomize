import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      conceptName,
      subConceptName,
      description,
      example,
      components,
      learning_objectives,
      common_pitfalls,
      examContext,
    } = body || {};

    if (!subConceptName || !description) {
      return NextResponse.json({ ok: false, error: 'Missing subConceptName or description' }, { status: 400 });
    }

    const system = `You are an expert educator. Write a compact, clear lesson suitable for independent study.

STRICT FORM & CONTENT RULES:
- Output Markdown only (no frontmatter)
- Structure:
  # {Title}
  ## Intuition First
  Concise explanation in plain language.
  ## Formal Definition
  Formal explanation, definitions, notations (use KaTeX-compatible LaTeX when needed)
  ## Worked Example
  One self-contained example with step-by-step reasoning.
  ## Common Pitfalls
  Bullet list of 3-5 pitfalls based on provided pitfalls

QUIZ (Practice Problems):
- Create 3 short free-response questions at the end under a "## Practice Problems" heading.
- Questions should reference the exact components and objectives.
- Keep answers implicit; the app will check via a separate endpoint.

MATH/LaTeX RULES:
- Use \\text{} for text within math (never \\t)
- Greek letters: \\alpha, \\beta, \\eta, \\theta, \\pi
- Fractions: \\frac{a}{b}
- Square roots: \\sqrt{expr}
`;

    const user = `Create a focused lesson for the sub-concept below.

Concept: ${conceptName || ''}
Sub-Concept: ${subConceptName}
Description: ${description}
Example: ${example || ''}
Components (comma-separated): ${components || ''}
Learning Objectives: ${learning_objectives || ''}
Common Pitfalls: ${common_pitfalls || ''}
Exam Context (if any): ${examContext || ''}

Title should be: ${subConceptName}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.8,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const lessonBody = completion.choices?.[0]?.message?.content || '';

    // Simple quiz extraction: split last section to build 3 prompts if possible, else fallback
    const defaultQuiz = [
      `Explain: ${subConceptName} in one sentence`,
      `Apply: Use (${components || 'the listed components'}) to outline a tiny example`,
      `Avoid: Name one common pitfall and how to prevent it`,
    ];

    return NextResponse.json({
      ok: true,
      data: {
        body: lessonBody,
        quiz: defaultQuiz,
        title: subConceptName,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to generate lesson' }, { status: 500 });
  }
}


