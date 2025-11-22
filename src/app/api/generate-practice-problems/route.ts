import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const lessonBody = String(body.lessonBody || "");
    const topic = String(body.topic || "");
    const subject = String(body.subject || "");
    const languageName = String(body.languageName || "English");

    if (!lessonBody || lessonBody.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "Missing lesson body" }, { status: 400 });
    }

    const systemPrompt = `You are an expert educator. Your task is to create 4 practice problems based on a lesson.

REQUIREMENTS:
- Generate exactly 4 practice problems
- Each problem should test understanding of key concepts from the lesson
- Problems should be progressive in difficulty (easier to harder)
- Each problem should have a clear, step-by-step solution with detailed explanations
- Solutions must explain the "why" at each step, not just the "what"
- Return ONLY a JSON object with a "problems" array, no other text

FORMATTING:
- You CAN and SHOULD use Markdown formatting in both questions and solutions
- You CAN and SHOULD use LaTeX math notation for mathematical expressions
- For inline math, use $...$ (e.g., $f(x) = x^2$)
- For display math, use $$...$$ or \\[ ... \\] (e.g., $$\\int_0^1 x^2 dx$$)
- CRITICAL: Use proper LaTeX syntax:
  - Fractions: \\frac{numerator}{denominator} (e.g., \\frac{1}{2}, NOT rac12)
  - Functions: \\cos, \\sin, \\tan, \\log, \\ln (e.g., \\cos(t), NOT extcos(t))
  - Greek letters: \\alpha, \\beta, \\pi, \\theta, etc.
  - Subscripts: x_{n} (e.g., a_0, NOT a0)
  - Superscripts: x^{n} (e.g., x^2, e^{-t})
  - Always escape backslashes properly in LaTeX commands
- Use **bold** for emphasis, *italics* for variables, and code blocks for code examples
- Use numbered lists, bullet points, and other Markdown features as needed

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "problems": [
    {
      "question": "The practice problem question (clear and specific, can include Markdown and LaTeX)",
      "solution": "Step-by-step solution with detailed explanations. Number each step clearly and explain the reasoning. Can include Markdown and LaTeX."
    },
    ...
  ]
}

${languageName !== "English" ? `- Write all questions and solutions in ${languageName}.` : ""}

EXAMPLE:
{
  "problems": [
    {
      "question": "Calculate the derivative of $f(x) = 3x^2 + 2x - 5$ using the power rule.",
      "solution": "**Step 1:** Identify the function\n$$f(x) = 3x^2 + 2x - 5$$\n\n**Step 2:** Apply the power rule\n\nThe power rule states that $\\frac{d}{dx}(x^n) = nx^{n-1}$. This means we multiply by the exponent and reduce the exponent by 1.\n\n**Step 3:** Differentiate each term separately\n\n- $\\frac{d}{dx}(3x^2) = 3 \\cdot 2x = 6x$ (multiply 3 by 2, reduce exponent from 2 to 1)\n- $\\frac{d}{dx}(2x) = 2 \\cdot 1 = 2$ (x has implicit exponent of 1, so $2 \\cdot 1 \\cdot x^0 = 2$)\n- $\\frac{d}{dx}(-5) = 0$ (constants have zero derivative)\n\n**Step 4:** Combine results\n$$f'(x) = 6x + 2$$"
    },
    {
      "question": "Find the average value $a_0$ of the periodic function $f(t) = 2 + \\frac{1}{2}\\cos(t)$ over one period, where the period $T = 2\\pi$.",
      "solution": "**Step 1:** Recall the formula for average value\n\nThe average value $a_0$ of a periodic function $f(t)$ with period $T$ is:\n$$a_0 = \\frac{1}{T}\\int_0^T f(t) dt$$\n\n**Step 2:** Substitute the given values\n\nHere, $T = 2\\pi$ and $f(t) = 2 + \\frac{1}{2}\\cos(t)$, so:\n$$a_0 = \\frac{1}{2\\pi}\\int_0^{2\\pi} \\left(2 + \\frac{1}{2}\\cos(t)\\right) dt$$\n\n**Step 3:** Split the integral\n\n$$a_0 = \\frac{1}{2\\pi}\\left[\\int_0^{2\\pi} 2 dt + \\int_0^{2\\pi} \\frac{1}{2}\\cos(t) dt\\right]$$\n\n**Step 4:** Evaluate each integral\n\n- $\\int_0^{2\\pi} 2 dt = 2t\\big|_0^{2\\pi} = 4\\pi$\n- $\\int_0^{2\\pi} \\frac{1}{2}\\cos(t) dt = \\frac{1}{2}\\sin(t)\\big|_0^{2\\pi} = \\frac{1}{2}(0 - 0) = 0$\n\n**Step 5:** Calculate the final result\n\n$$a_0 = \\frac{1}{2\\pi}(4\\pi + 0) = \\frac{4\\pi}{2\\pi} = 2$$\n\nTherefore, the average value is $a_0 = 2$."
    }
  ]
}`;

    const userPrompt = `Generate 4 practice problems based on this lesson about "${topic}"${subject ? ` in ${subject}` : ""}:

${lessonBody.substring(0, 8000)}${lessonBody.length > 8000 ? "\n\n[... lesson continues ...]" : ""}

Return ONLY the JSON object with a "problems" array containing 4 practice problems. No markdown, no code blocks, just the JSON object.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "";
    
    console.log("[DEBUG] Practice problems API - Raw response:", responseText.substring(0, 500));
    
    // Try to parse as JSON object first (if wrapped in object)
    let problems: any[] = [];
    try {
      const parsed = JSON.parse(responseText);
      console.log("[DEBUG] Practice problems API - Parsed JSON:", JSON.stringify(parsed).substring(0, 500));
      
      // If it's an object with a "problems" key or array key
      if (Array.isArray(parsed)) {
        problems = parsed;
        console.log("[DEBUG] Practice problems API - Found array directly, length:", problems.length);
      } else if (Array.isArray(parsed.problems)) {
        problems = parsed.problems;
        console.log("[DEBUG] Practice problems API - Found problems array, length:", problems.length);
      } else if (Array.isArray(parsed.practiceProblems)) {
        problems = parsed.practiceProblems;
        console.log("[DEBUG] Practice problems API - Found practiceProblems array, length:", problems.length);
      } else {
        // Try to find any array in the object
        const arrayKey = Object.keys(parsed).find(key => Array.isArray(parsed[key]));
        if (arrayKey) {
          problems = parsed[arrayKey];
          console.log("[DEBUG] Practice problems API - Found array key:", arrayKey, "length:", problems.length);
        } else {
          console.error("[DEBUG] Practice problems API - No array found in parsed object. Keys:", Object.keys(parsed));
        }
      }
    } catch (e) {
      console.error("[DEBUG] Practice problems API - JSON parse error:", e);
      // Try to extract JSON array from markdown code blocks
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          problems = JSON.parse(jsonMatch[0]);
          console.log("[DEBUG] Practice problems API - Extracted from markdown, length:", problems.length);
        } catch (e2) {
          console.error("[DEBUG] Practice problems API - Failed to parse extracted JSON:", e2);
        }
      }
    }

    console.log("[DEBUG] Practice problems API - Problems before sanitization:", problems.length);

    // Validate and sanitize problems
    const sanitizedProblems = problems
      .filter((p: any) => p && typeof p === "object")
      .slice(0, 4)
      .map((p: any) => {
        const question = String(p.question || "").trim();
        const solution = String(p.solution || "").trim();
        console.log("[DEBUG] Practice problems API - Processing problem:", { hasQuestion: !!question, hasSolution: !!solution, questionLength: question.length, solutionLength: solution.length });
        return {
          question,
          solution,
          keyConcepts: Array.isArray(p.keyConcepts) ? p.keyConcepts.map((c: any) => String(c).trim()).filter(Boolean) : []
        };
      })
      .filter((p: any) => {
        const isValid = p.question.length > 0 && p.solution.length > 0;
        if (!isValid) {
          console.warn("[DEBUG] Practice problems API - Filtered out invalid problem:", p);
        }
        return isValid;
      });

    console.log("[DEBUG] Practice problems API - Sanitized problems count:", sanitizedProblems.length);

    if (sanitizedProblems.length === 0) {
      console.error("[DEBUG] Practice problems API - No valid problems after sanitization");
      return NextResponse.json({ ok: false, error: "Failed to generate practice problems - no valid problems found" }, { status: 500 });
    }

    console.log("[DEBUG] Practice problems API - Returning problems:", sanitizedProblems.map(p => ({ questionLength: p.question.length, solutionLength: p.solution.length })));

    return NextResponse.json({
      ok: true,
      problems: sanitizedProblems
    });
  } catch (err: any) {
    console.error("Practice problems generation error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

