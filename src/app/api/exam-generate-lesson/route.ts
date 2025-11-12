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
- CRITICAL: Inline math MUST use bracket notation: \\( ... \\)
  Example: The function \\( f(x) = x^2 \\) is quadratic.
  Use inline math for: simple formulas, variables, short expressions within text
- CRITICAL: Display math MUST use bracket notation: \\[ ... \\]
  Example: \\[ \\int_0^1 x^2 \\, dx = \\frac{1}{3} \\]
  Use display math for: equations, multi-line expressions, align environments, matrices
- NEVER use dollar signs: Do NOT use $...$ or $$...$$
- Code blocks and inline code preserve math delimiters as literal text (do not render as math)
- Use \\text{} for text within math (never \\t)
- Greek letters: \\alpha, \\beta, \\eta, \\theta, \\pi (always use backslash)
- Fractions: \\frac{a}{b}
- Square roots: \\sqrt{expr}
- Escape underscores: var\\_name
- Every \\( must have a closing \\), every \\[ must have a closing \\]
- Always put a blank line before and after display math \\[ ... \\]
- LaTeX environments (CRITICAL): Environments like \\begin{align*}, \\begin{matrix}, \\begin{cases} MUST be in display math \\[ ... \\]
- NEVER put \\begin{align*} or similar environments in inline math \\( ... \\)
- For multi-line environments, keep everything on separate lines with actual line breaks:
  \\[
  \\begin{align*}
  x &= 1 \\\\
  y &= 2
  \\end{align*}
  \\]
- For cases environment, format with line breaks:
  \\[
  \\begin{cases}
  A, & 0 \\leq t < \\frac{1}{2} \\\\
  B, & \\text{otherwise}
  \\end{cases}
  \\]
- CRITICAL: Each line in environments must be on its own line (use actual newlines, not just \\\\)
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


