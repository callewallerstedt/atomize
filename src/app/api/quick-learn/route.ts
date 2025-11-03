import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { subject, topic, query, courseContext, combinedText, courseTopics, languageName } = await request.json();

    if (!query || !subject) {
      return NextResponse.json({ error: "Missing query or subject" }, { status: 400 });
    }

    const system = `You are an expert university-level educator creating comprehensive, academically rigorous lessons within a specific course context. Your task is to create a single, in-depth lesson that thoroughly explains a topic using the provided course materials and context.

Return JSON: { title: string; body: string; quiz: { question: string }[] }

IMPORTANT REQUIREMENTS:
- Create ONE comprehensive, detailed lesson covering advanced course-specific concepts
- Assume university-level background knowledge and intellectual maturity
- Use precise, academic language appropriate for higher education
- Structure the lesson logically with clear headings and sections
- Dive deep into technical details, mechanisms, and underlying principles
- Include rigorous examples, case studies, and real-world applications
- Explain complex concepts with mathematical precision where applicable
- Provide detailed step-by-step analysis and derivations
- Compare and contrast different approaches or theories within the course context
- Discuss limitations, edge cases, and current research directions
- Integrate seamlessly with the provided course context and materials

CONTENT STRUCTURE:
1. **Introduction**: Overview of the topic's significance within the course
2. **Core Concepts**: Detailed theoretical foundations and principles
3. **Technical Details**: In-depth mechanisms, algorithms, or processes
4. **Mathematical Analysis**: Equations, derivations, and quantitative aspects
5. **Course Integration**: How this topic connects to other course concepts
6. **Practical Applications**: Real-world implementations and case studies
7. **Advanced Examples**: Complex scenarios with thorough analysis
8. **Critical Analysis**: Strengths, limitations, and research implications
9. **Summary**: Key insights and connections to course learning objectives

QUIZ REQUIREMENTS:
- The 'quiz' field must contain 3-5 academically-focused questions testing the specific concepts taught
- Questions should be challenging and require deep understanding of course material
- Focus on key theoretical concepts, technical mechanisms, and course-specific applications
- Do NOT include any quiz content inside the body text

Focus on academic rigor, technical depth, and course-specific integration. Use discipline-appropriate terminology and expect readers to engage with complex ideas.`;

    const userPrompt = `Create a comprehensive, university-level lesson about: "${query}"

**Course Context:**
${courseContext}

**Available Course Materials:**
${combinedText}

**Related Topics in Course:**
${courseTopics?.join(", ") || "None specified"}

**Language:** ${languageName || "English"}

Generate a single, academically rigorous lesson that thoroughly explains this complex topic at a university level. Include detailed technical analysis, mathematical precision where applicable, and deep exploration of the subject matter within the course context. Follow the specified structure and maintain academic rigor throughout.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.35,
      max_tokens: 3000,
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
        title: title || `Quick Learn: ${query}`,
        body: body,
        quiz: quiz
      },
      raw: completion.choices[0]?.message?.content,
    });

  } catch (error: any) {
    console.error("Quick learn error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate quick learn lesson" },
      { status: 500 }
    );
  }
}
