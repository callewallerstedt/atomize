import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { question, answer, modelAnswer, explanation, topic, lessonContent } = await request.json();

    if (!question || !answer || !modelAnswer) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const systemPrompt = `You are an educational assessment AI for Synapse Surge quiz questions. Analyze the student's answer to a short-answer question and return ONLY valid JSON with no additional text.

GRADING PHILOSOPHY:
- Focus on whether the student demonstrates understanding of the concept
- DO NOT grade grammar, structure, or writing quality - focus on conceptual understanding
- Match the depth of evaluation to the complexity of the question
- Check if the student is missing important aspects of the concept

ASSESSMENT GUIDANCE:
- Provide constructive feedback: mention what's good about the answer and what could be improved
- Be specific about what important information is missing or what key aspects weren't covered
- Focus on missing knowledge or understanding gaps, not presentation quality
- Frame feedback positively but be direct about knowledge gaps

SCORING RUBRIC:
- 0 = no answer, irrelevant text, or explicit uncertainty
- 1-2 = answer attempts something but is entirely incorrect or shows no understanding
- 3-4 = answer shows minimal understanding but misses most key points
- 5-6 = answer shows partial understanding with notable gaps
- 7 = answer shows good understanding with some minor gaps or inaccuracies
- 8 = answer shows solid understanding - demonstrates good grasp of the concept
- 9 = answer is nearly perfect with only trivial omissions
- 10 = answer is perfect - completely correct, thorough, and demonstrates clear mastery

Return this exact structure:
{
  "grade": number - integer from 0 to 10,
  "assessment": "string - 2-3 sentences evaluating what's good and what could be improved",
  "whatsGood": "string - specific things the answer got right or demonstrated well",
  "whatsBad": "string - specific gaps, missing information, or incorrect aspects",
  "enhancedExplanation": "string - a thorough, well-explained explanation of the correct answer that helps the student understand deeply"
}`;

    const userPrompt = `Question: "${question}"
Model Answer: "${modelAnswer}"
${explanation ? `Original Explanation: "${explanation}"` : ''}
Student Answer: "${answer}"
${lessonContent ? `\n\nLesson Context (for reference):\n${lessonContent.slice(0, 5000)}` : ''}

Analyze the student's answer. Provide a grade, assessment, what's good, what's bad, and an enhanced explanation of the correct answer.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    const assessment = JSON.parse(responseText);

    // Validate grade
    const parsedGrade = Number.parseInt(assessment.grade, 10);
    const grade = Number.isFinite(parsedGrade) ? Math.max(0, Math.min(10, parsedGrade)) : 0;

    return NextResponse.json({
      success: true,
      grade,
      assessment: assessment.assessment || '',
      whatsGood: assessment.whatsGood || '',
      whatsBad: assessment.whatsBad || '',
      enhancedExplanation: assessment.enhancedExplanation || modelAnswer
    });

  } catch (error) {
    console.error('Surge quiz check error:', error);
    return NextResponse.json(
      { error: 'Failed to check answer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


