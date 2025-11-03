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
