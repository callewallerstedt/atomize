import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const { query, languageName } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const system = `You are an expert university-level educator creating comprehensive, academically rigorous lessons. Your task is to create a single, in-depth lesson that thoroughly explains a complex topic at a university level.

IMPORTANT REQUIREMENTS:
- Create ONE comprehensive, detailed lesson covering advanced concepts
- Assume university-level background knowledge and intellectual maturity
- Use precise, academic language appropriate for higher education
- Structure the lesson logically with clear headings and sections
- Dive deep into technical details, mechanisms, and underlying principles
- Include rigorous examples, case studies, and real-world applications
- Explain complex concepts with mathematical precision where applicable
- Provide detailed step-by-step analysis and derivations
- Compare and contrast different approaches or theories
- Discuss limitations, edge cases, and current research directions

CONTENT STRUCTURE:
1. **Introduction**: Overview of the topic's significance in its field
2. **Core Concepts**: Detailed theoretical foundations and principles
3. **Technical Details**: In-depth mechanisms, algorithms, or processes
4. **Mathematical Analysis**: Equations, derivations, and quantitative aspects
5. **Practical Applications**: Real-world implementations and case studies
6. **Advanced Examples**: Complex scenarios with thorough analysis
7. **Critical Analysis**: Strengths, limitations, and research implications
8. **Summary**: Key insights and future directions

OUTPUT:
- Output a single Markdown document only.
- Do NOT include any JSON metadata block.
- Just write the lesson content directly in Markdown.

MARKDOWN RULES:
- Use headings: #, ##, ### only.
- Use blank lines around headings, lists, tables, code fences, and display math.
- Tables must use pipe-syntax.
- Code fences must specify language and be runnable.
- Math uses inline \\( ... \\) and display \\[ ... \\]. No environments (align etc.).
- No links, images, Mermaid, or HTML.

CRITICAL MATH FORMATTING (MANDATORY):
- Inline math MUST use bracket notation: \\( ... \\)
  Example: The function \\( f(x) = x^2 \\) is quadratic.
  Use inline math for: simple formulas, variables, short expressions within text
- Display math MUST use bracket notation: \\[ ... \\]
  Example: \\[ \\int_0^1 x^2 \\, dx = \\frac{1}{3} \\]
  Use display math for: equations, multi-line expressions, align environments, matrices
- NEVER use dollar signs: Do NOT use $...$ or $$...$$
- Code blocks and inline code preserve math delimiters as literal text (do not render as math)

LaTeX syntax rules:
- Greek letters: \\alpha, \\beta, \\eta, \\theta, \\pi (always use backslash)
- Fractions: \\frac{numerator}{denominator}
- Square roots: \\sqrt{expression}
- Text inside math: \\text{your text here}
- Escape underscores in variable names: var\\_name
- NEVER use \\t (tab character) or ext{text} (missing backslash)
- No raw Unicode symbols (√, π, etc.) - use LaTeX commands
- Every \\( must have a closing \\), every \\[ must have a closing \\]
- Always put a blank line before and after display math \\[ ... \\]

LANGUAGE:
${languageName ? `- Write all content in ${languageName}.` : "- Write all content in English."}

Focus on academic rigor, technical depth, and intellectual challenge. Use discipline-appropriate terminology and expect readers to engage with complex ideas.`;

    const userPrompt = `Create a comprehensive, university-level lesson about: "${query}"

Generate a single, academically rigorous lesson that thoroughly explains this complex topic at a university level. Include detailed technical analysis, mathematical precision where applicable, and in-depth exploration of the subject matter. Follow the specified structure and maintain academic rigor throughout.`;

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 12000,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (error: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: error?.message || "Streaming error" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Quick learn streaming error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate quick learn lesson" },
      { status: 500 }
    );
  }
}

