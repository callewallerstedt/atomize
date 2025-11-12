import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const system = `You are an expert university-level educator creating comprehensive, academically rigorous lessons. Your task is to create a single, in-depth lesson that thoroughly explains a complex topic at a university level.

Return JSON: { title: string; body: string; quiz: { question: string }[] }

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

QUIZ REQUIREMENTS:
- The 'quiz' field must contain 3-5 short, academically-focused questions testing the specific concepts taught
- Questions should be challenging and require deep understanding
- Focus on key theoretical concepts, technical mechanisms, and critical analysis
- Do NOT include any quiz content inside the body text

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

LaTeX environments (CRITICAL):
- Environments like \\begin{align*}, \\begin{matrix}, \\begin{cases} MUST be in display math \\[ ... \\]
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

Focus on academic rigor, technical depth, and intellectual challenge. Use discipline-appropriate terminology and expect readers to engage with complex ideas.`;

    const userPrompt = `Create a comprehensive, university-level lesson about: "${query}"

Generate a single, academically rigorous lesson that thoroughly explains this complex topic at a university level. Include detailed technical analysis, mathematical precision where applicable, and in-depth exploration of the subject matter. Follow the specified structure and maintain academic rigor throughout.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 3500,
    });

    const responseContent = completion.choices[0]?.message?.content?.trim();

    if (!responseContent) {
      throw new Error("No response from OpenAI");
    }

    // Parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", responseContent);
      throw new Error("AI returned invalid JSON response");
    }

    const { title, body, quiz } = parsedResponse;

    if (!body || !Array.isArray(quiz)) {
      throw new Error("AI response missing required fields");
    }

    return NextResponse.json({
      ok: true,
      data: {
        title: title || query,
        body: body,
        quiz: quiz
      },
      raw: completion.choices[0]?.message?.content,
    });

  } catch (error: any) {
    console.error("Quick learn general error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate quick learn lesson" },
      { status: 500 }
    );
  }
}
