import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let assistantId: string | null = null;
      const uploadedFileIds: string[] = [];
      
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

        // Upload PDFs to OpenAI
        for (const file of examFiles) {
          try {
            const uploadedFile = await openai.files.create({
              file: file,
              purpose: 'assistants',
            });
            uploadedFileIds.push(uploadedFile.id);
          } catch (err) {
            console.error(`Failed to upload ${file.name}:`, err);
          }
        }

        if (uploadedFileIds.length === 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Failed to upload files' })}\n\n`)
          );
          controller.close();
          return;
        }

        // Create assistant with file search
        const assistant = await openai.beta.assistants.create({
          name: "Exam Analyzer",
          instructions: `You are an expert exam analyzer. Analyze the provided old exams and identify the most valuable concepts/methods to study.

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

The concepts array MUST be sorted by pointsPerHour descending.`,
          model: "gpt-5-preview",
          tools: [{ type: "file_search" }],
        });
        
        assistantId = assistant.id;

        // Create thread with files
        const thread = await openai.beta.threads.create({
          messages: [
            {
              role: "user",
              content: `Analyze these ${examFiles.length} exam PDF(s) and return a JSON list of concepts ranked by Points/Hour.`,
              attachments: uploadedFileIds.map(id => ({
                file_id: id,
                tools: [{ type: "file_search" }],
              })),
            },
          ],
        });

        // Run the assistant with streaming
        const run = openai.beta.threads.runs.stream(thread.id, {
          assistant_id: assistant.id,
        });

        // Stream the text as it comes in
        for await (const event of run) {
          if (event.event === 'thread.message.delta') {
            const delta = event.data.delta;
            if (delta.content && delta.content[0] && delta.content[0].type === 'text') {
              const text = delta.content[0].text?.value || '';
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
              );
            }
          }
        }

        // Get final message
        const messages = await openai.beta.threads.messages.list(thread.id);
        const assistantMessage = messages.data.find(m => m.role === 'assistant');
        
        if (assistantMessage && assistantMessage.content[0]) {
          const responseText = assistantMessage.content[0].type === 'text' 
            ? assistantMessage.content[0].text.value 
            : '';

          // Parse JSON response
          let analysisData;
          try {
            analysisData = JSON.parse(responseText);
          } catch {
            const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
              analysisData = JSON.parse(jsonMatch[1]);
            } else {
              const objectMatch = responseText.match(/\{[\s\S]*\}/);
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
        }

        // Clean up
        if (assistantId) {
          try {
            await openai.beta.assistants.delete(assistantId);
          } catch (err) {
            console.error('Failed to delete assistant:', err);
          }
        }
        for (const fileId of uploadedFileIds) {
          try {
            await openai.files.delete(fileId);
          } catch (err) {
            console.error('Failed to delete file:', err);
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error: any) {
        console.error('Streaming error:', error);
        
        // Clean up on error
        if (assistantId) {
          try {
            await openai.beta.assistants.delete(assistantId);
          } catch {}
        }
        for (const fileId of uploadedFileIds) {
          try {
            await openai.files.delete(fileId);
          } catch {}
        }
        
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

