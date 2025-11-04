import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const examFiles = formData.getAll('exams') as File[];

    if (examFiles.length === 0) {
      return NextResponse.json({ ok: false, error: 'No exam files provided' }, { status: 400 });
    }

    // Extract text from all PDFs
    const examTexts: { name: string; text: string }[] = [];

    for (const file of examFiles) {
      try {
        console.log(`Extracting text from ${file.name}...`);

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Import pdf-parse dynamically
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(buffer);

        // Check if we got any text
        if (!data.text || data.text.trim().length === 0) {
          console.warn(`No text extracted from ${file.name}`);
          // Just add the file with empty text - let AI handle it
          examTexts.push({
            name: file.name,
            text: `PDF: ${file.name} - No text could be extracted from this PDF.`
          });
        } else {
          examTexts.push({
            name: file.name,
            text: data.text
          });
          console.log(`Extracted ${data.text.length} characters from ${file.name}`);
        }
      } catch (err) {
        console.error(`Failed to extract text from ${file.name}:`, err);
        // Still add the file with an error note
        examTexts.push({
          name: file.name,
          text: `Error extracting text from ${file.name}: ${err.message}`
        });
      }
    }

    if (examTexts.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'Failed to process any PDF files.'
      }, { status: 400 });
    }

    // Combine all exam texts with labels
    const combinedText = examTexts.map((exam, index) =>
      `=== EXAM ${index + 1}: ${exam.name} ===\n${exam.text}\n\n`
    ).join('');

    console.log(`Total combined text length: ${combinedText.length} characters`);

    // Create chat completion
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert exam analyzer. Analyze the provided old exams and identify the most valuable concepts/methods to study.

FIRST: Extract the grade requirements from the exams (e.g., "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p"). This should be at the top level of the JSON as "gradeInfo".

SECOND: Analyze patterns across the exams and write a "patternAnalysis" text (2-3 sentences) that identifies:
- Which topic areas appear most consistently (especially in early/multiple exams)
- Any recurring question types or concepts
- Strategic insights about what to focus on

THIRD: Go through EVERY SINGLE QUESTION in all exams and categorize them. Don't skip any questions.

For each concept/method, provide:
1. **Name** - Be slightly more GENERAL/BROAD where it makes sense. Group similar specific topics into broader concepts (e.g., instead of "Monitor-based Synchronization" and "Semaphore-based Synchronization", use "Concurrency Synchronization Primitives")
2. **Average points** - typical points awarded for this concept across all exams (e.g., "10p", "15p")
3. **Frequency** - how many exams out of the total it appeared in (just the number, not a fraction)
4. **Estimated study time** - realistic hours needed to master this broader concept (e.g., "0.5h", "1h", "2h", "3h", "5h")
5. **Points per hour** - calculate as: (avg_points_number * frequency * recency_bonus) / study_time_hours
   - recency_bonus = 1.3 if appears in FIRST exam, 1.2 if in first TWO exams, 1.1 if in first THREE exams, otherwise 1.0
   - This prioritizes concepts that appear in early exams
6. **Details** - Array of specific questions/topics found under this broader concept. For each detail include:
   - topic: The specific question or subtopic (e.g., "Implement monitor with wait/signal")
   - points: Points for this specific question (e.g., "8p")
   - exam: Which exam it appeared in (e.g., "Exam 1", "Exam 2")

IMPORTANT:
- Go through ALL questions in ALL exams - don't miss any
- Group related concepts into BROADER categories when appropriate (not too specific)
- Prioritize concepts that appear in EARLY exams (via recency bonus)
- Be realistic about study time - broader concepts take more time
- Calculate Points/Hour CORRECTLY with recency bonus
- Sort concepts by pointsPerHour in DESCENDING order (highest first)
- Provide detailed breakdown in the "details" array so users can see exactly what questions fall under each concept

Return JSON in this EXACT format:
{
  "gradeInfo": "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p",
  "patternAnalysis": "Analysis of patterns across exams (2-3 sentences explaining what appears frequently and in which exams)",
  "concepts": [
    {
      "name": "Broader Concept/Topic Area",
      "avgPoints": "10p",
      "frequency": 2,
      "estimatedTime": "2h",
      "pointsPerHour": "10.0",
      "details": [
        {
          "topic": "Specific question or subtopic found",
          "points": "8p",
          "exam": "Exam 1"
        },
        {
          "topic": "Another specific question",
          "points": "10p",
          "exam": "Exam 2"
        }
      ]
    }
  ]
}

The concepts array MUST be sorted by pointsPerHour descending.`
        },
        {
          role: 'user',
          content: `Analyze these ${examFiles.length} exam PDF(s) and return a JSON list of concepts ranked by Points/Hour.\n\n${combinedText}`
        }
      ],
      max_tokens: 4000,
      temperature: 0.3
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Parse JSON response
    let analysisData;
    try {
      // Try direct parse first
      analysisData = JSON.parse(responseText);
    } catch {
      // Try to find JSON in markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find any JSON object
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          analysisData = JSON.parse(objectMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        totalExams: examFiles.length,
        gradeInfo: analysisData.gradeInfo || null,
        patternAnalysis: analysisData.patternAnalysis || null,
        concepts: analysisData.concepts || [],
      },
    });
  } catch (error: any) {
    console.error('Exam snipe error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to analyze exams' },
      { status: 500 }
    );
  }
}
