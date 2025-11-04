import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const formData = await req.formData();
        const examFiles = formData.getAll('exams') as File[];

        if (examFiles.length === 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'No files provided' })}\n\n`)
          );
          controller.close();
          return;
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
          console.warn(`No text extracted from ${file.name} - might be image-based PDF`);
          // Try to include some metadata instead
          const text = `PDF: ${file.name} (${data.numpages} pages, ${data.info?.Title || 'Unknown title'})`;
          examTexts.push({
            name: file.name,
            text: text
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

    // Check if we have any files with actual content (not just error messages)
    const validTexts = examTexts.filter(exam => !exam.text.startsWith('Error extracting') && !exam.text.startsWith('PDF:'));
    if (validTexts.length === 0) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'No readable text found in uploaded PDFs. Make sure they contain selectable text, not just images.' })}\n\n`)
      );
      controller.close();
      return;
    }

        // Combine all exam texts with labels
        const combinedText = examTexts.map((exam, index) =>
          `=== EXAM ${index + 1}: ${exam.name} ===\n${exam.text}\n\n`
        ).join('');

        console.log(`Total combined text length: ${combinedText.length} characters`);

        // Create streaming chat completion
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
          stream: true,
          max_tokens: 4000,
          temperature: 0.3
        });

        // Stream the response
        console.log('Starting to stream chat completion...');
        let fullResponse = '';

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            console.log('Streaming text chunk:', content.substring(0, 50));
            fullResponse += content;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', content })}\n\n`)
            );
          }
        }

        console.log('Finished streaming, parsing response...');

        // Parse JSON response
        let analysisData;
        try {
          analysisData = JSON.parse(fullResponse);
        } catch {
          const jsonMatch = fullResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (jsonMatch) {
            analysisData = JSON.parse(jsonMatch[1]);
          } else {
            const objectMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (objectMatch) {
              analysisData = JSON.parse(objectMatch[0]);
            }
          }
        }

        // Send final results
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            data: {
              totalExams: examFiles.length,
              gradeInfo: analysisData?.gradeInfo || null,
              patternAnalysis: analysisData?.patternAnalysis || null,
              concepts: analysisData?.concepts || [],
            }
          })}\n\n`)
        );

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error: any) {
        console.error('Streaming error:', error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Analysis failed' })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

