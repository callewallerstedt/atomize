import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { question, answer, courseSlug, existingLogs, mc } = await request.json();

    if (!question || !answer || !courseSlug) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const parseMcChoice = (value: any) => {
      const str = String(value || "").trim().toUpperCase();
      return ["A", "B", "C", "D"].includes(str) ? (str as "A" | "B" | "C" | "D") : null;
    };

    // MC fast-path: the UI already knows correctness, so log deterministically (no classifier needed).
    if (mc && typeof mc === "object") {
      const selected = parseMcChoice((mc as any).selected);
      const correct = parseMcChoice((mc as any).correct);
      if (selected && correct) {
        const isCorrect = selected === correct;

        const existingLogsContext = existingLogs && existingLogs.length > 0
          ? `\n\nEXISTING PRACTICE LOGS (use consistent topic names if similar questions exist):\n${JSON.stringify(existingLogs.slice(-20), null, 2)}`
          : '\n\nNo previous practice logs. This is the first question.';

        let topic = "General";
        try {
          const topicPrompt = `Given the practice question, return ONLY valid JSON: {"topic":"string"}.\n\nQuestion: "${question}"\nCourse slug: "${courseSlug}"\n${existingLogsContext}\n\nCRITICAL: If similar questions on the same topic already exist in existing logs, use the EXACT SAME topic name.`;

          const topicCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You extract a concise topic label for a practice question. Return ONLY valid JSON with no additional text.' },
              { role: 'user', content: topicPrompt }
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' }
          });

          const topicText = topicCompletion.choices[0]?.message?.content;
          if (topicText) {
            const parsed = JSON.parse(topicText);
            if (typeof parsed?.topic === "string" && parsed.topic.trim()) {
              topic = parsed.topic.trim();
            }
          }
        } catch (e) {
          // If topic extraction fails, fall back to "General"
        }

        const logEntry = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: Date.now(),
          topic,
          question,
          answer: `MC selected: ${selected}`,
          assessment: isCorrect ? "Correct multiple-choice answer." : `Incorrect multiple-choice answer. Correct: ${correct}.`,
          grade: isCorrect ? 10 : 3,
          result: isCorrect ? "correct" : "incorrect",
          questions: 1
        };

        return NextResponse.json({
          success: true,
          logEntry
        });
      }
    }

    // First, check if the user's message is actually an answer attempt
    const classificationPrompt = `Determine if the user's message is an actual answer attempt to the practice question, or if it's something else (like asking a new question, requesting help, making a comment, etc.).

Question: "${question}"
User message: "${answer}"

Return ONLY valid JSON:
{
  "isAnswerAttempt": boolean - true if the user is attempting to answer the question, false otherwise
  "reason": "string - brief explanation (e.g., 'User is answering the question', 'User asked a new question', 'User requested help', 'Message is irrelevant')"
}

CRITICAL RULES:
- isAnswerAttempt = true ONLY if the user is clearly trying to answer the practice question
- isAnswerAttempt = false if:
  * User asks a new question (e.g., "What about X?", "Can you explain Y?")
  * User requests help/clarification (e.g., "I don't understand", "Can you help?", "What does this mean?")
  * User makes a comment unrelated to answering (e.g., "This is hard", "I'm confused")
  * User refuses to answer (e.g., "I don't know", "Skip this", "Not sure")
  * Message is completely irrelevant or off-topic
  * Message is too short/empty (less than 10 characters of actual content)
  * Message is just punctuation, emojis, or filler words`;

    const classificationCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a classifier that determines if a user message is an answer attempt. Return ONLY valid JSON with no additional text.' },
        { role: 'user', content: classificationPrompt }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const classificationText = classificationCompletion.choices[0]?.message?.content;
    if (!classificationText) {
      throw new Error('No classification response from OpenAI');
    }

    const classification = JSON.parse(classificationText);
    
    // If it's not an answer attempt, return early without logging
    if (!classification.isAnswerAttempt) {
      console.log('[Practice Logger] Skipping log - not an answer attempt:', classification.reason);
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: classification.reason || 'Message is not an answer attempt'
      });
    }

    // Prepare context from existing logs
    const existingLogsContext = existingLogs && existingLogs.length > 0
      ? `\n\nEXISTING PRACTICE LOGS (use consistent topic names if similar questions exist):\n${JSON.stringify(existingLogs.slice(-20), null, 2)}`
      : '\n\nNo previous practice logs. This is the first question.';

    const systemPrompt = `You are an educational assessment AI. Analyze the student's answer to a practice question and return ONLY valid JSON with no additional text.

GRADING PHILOSOPHY:
- Focus ONLY on whether the student knows what it is and demonstrates understanding of the concept
- DO NOT grade grammar, structure, writing quality, or explanation style - these are irrelevant
- The goal is to assess conceptual understanding, not writing ability
- Ignore typos, spelling mistakes, grammatical errors, poor structure, or unclear explanations - focus purely on content understanding
- Match the depth of evaluation to the complexity of the question:
  * Simple questions (e.g., "What is X?", "Define Y") only require showing basic understanding
  * Complex questions require more depth and detail
  * Don't penalize for not providing more detail than the question asks for
- Check if the student is missing important things about the concept, not whether they explained it well

ASSESSMENT GUIDANCE:
- The assessment should focus on what important concepts or knowledge the answer is missing to reach 10/10
- Be constructive and specific: mention what important information is missing or what key aspects of the concept weren't covered
- DO NOT mention grammar, structure, writing quality, or explanation style - these don't matter
- Focus on missing knowledge or understanding gaps, not presentation quality
- If the answer is already perfect (10/10), acknowledge that briefly, but the focus should be on improvement areas
- Frame feedback positively but be direct about knowledge gaps or missing important points

SCORING RUBRIC:
- 0 = no answer, irrelevant text, refusal, or explicit uncertainty (e.g., "I don't know", "nope")
- 1-2 = answer attempts something but is entirely incorrect or shows no understanding
- 3-4 = answer shows minimal understanding but misses most key points
- 5-6 = answer shows partial understanding with notable gaps
- 7 = answer shows good understanding with some minor gaps or inaccuracies
- 8 = answer shows the user understands it pretty well - demonstrates solid grasp of the concept
- 9 = answer is nearly perfect with only trivial omissions
- 10 = answer is perfect - completely correct, thorough, and demonstrates clear mastery

IMPORTANT:
- If the question is simple, the answer can also be simple - don't penalize for brevity when the question itself is brief
- Focus on conceptual understanding, not writing perfection
- Be generous with grades when the student demonstrates understanding, even if the answer isn't perfectly worded

Return this exact structure:
{
  "topic": "string - specific topic/concept being practiced (e.g., 'Laplace Transforms', 'Difference Equations', 'Semaphores', 'Derivatives', 'Fourier Transform')",
  "question": "string - the exact question asked",
  "answer": "string - the exact answer provided",
  "assessment": "string - 2-3 sentence evaluation focusing on what the answer should improve to reach 10/10. Be constructive and specific about what's missing or could be enhanced, rather than just praising what's correct.",
  "grade": number - integer from 0 to 10 where 8 = user understands it pretty well, 10 = perfect
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
      temperature: 0.4,
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
