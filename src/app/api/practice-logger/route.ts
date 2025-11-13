import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { question, answer, courseSlug, existingLogs } = await request.json();

    if (!question || !answer || !courseSlug) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Prepare context from existing logs
    const existingLogsContext = existingLogs && existingLogs.length > 0
      ? `\n\nEXISTING PRACTICE LOGS (use consistent topic names if similar questions exist):\n${JSON.stringify(existingLogs.slice(-20), null, 2)}`
      : '\n\nNo previous practice logs. This is the first question.';

    const systemPrompt = `You are an educational assessment AI. Analyze the student's answer to a practice question and return ONLY valid JSON with no additional text.

SCORING RUBRIC (enforce strictly):
- 0 = no answer, irrelevant text, refusal, or explicit uncertainty (e.g., "I don't know", "nope").
- 1-2 = answer attempts something but is entirely incorrect or misses every essential element.
- 3-4 = answer mentions at least one relevant idea but misses most key points.
- 5-6 = answer captures roughly half of the key ideas with notable gaps or inaccuracies.
- 7-8 = answer covers the majority of key ideas with minor omissions or small errors.
- 9 = answer is nearly perfect with only trivial omissions.
- 10 = answer is completely correct, thorough, and demonstrates clear mastery.

Never award more than 0 when the answer provides no relevant content. Always align the grade with this rubric.

Return this exact structure:
{
  "topic": "string - specific topic/concept being practiced (e.g., 'Laplace Transforms', 'Difference Equations', 'Semaphores', 'Derivatives', 'Fourier Transform')",
  "question": "string - the exact question asked",
  "answer": "string - the exact answer provided",
  "assessment": "string - 2-3 sentence evaluation of the answer quality",
  "grade": number - integer from 0 to 10 where 0 = no understanding/wrong, 10 = perfect understanding
}

CRITICAL: If similar questions on the same topic already exist in the existing logs, use the EXACT SAME topic name to group them together. Consistency is essential for tracking progress.`;

    const userPrompt = `Question: "${question}"
Answer: "${answer}"
${existingLogsContext}

Analyze this answer and return the JSON.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    const assessment = JSON.parse(responseText);

    // Validate and create log entry
    const parsedGrade = Number.parseInt(assessment.grade, 10);
    const grade = Number.isFinite(parsedGrade) ? parsedGrade : 0;

    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: Date.now(),
      topic: assessment.topic || 'General',
      question: assessment.question || question,
      answer: assessment.answer || answer,
      assessment: assessment.assessment || '',
      grade: Math.max(0, Math.min(10, grade))
    };

    return NextResponse.json({
      success: true,
      logEntry
    });

  } catch (error) {
    console.error('Practice logger error:', error);
    return NextResponse.json(
      { error: 'Failed to process practice log', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
