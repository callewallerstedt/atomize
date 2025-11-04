import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  console.log('=== EXAM SNIPE API CALLED ===');
  console.log('Headers:', Object.fromEntries(req.headers.entries()));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Accept either JSON with pre-extracted text, or FormData with files
        const contentType = req.headers.get('content-type') || '';
        let examTexts: { name: string; text: string }[] = [];

        if (contentType.includes('application/json')) {
          const json = await req.json().catch(() => ({}));
          const arr = Array.isArray(json?.examsText) ? json.examsText : [];
          examTexts = arr.map((x: any) => ({ name: String(x?.name || 'exam'), text: String(x?.text || '') }));
          console.log(`Received JSON examsText entries: ${examTexts.length}`);
        } else {
          console.log('Processing FormData...');
          const formData = await req.formData();
          console.log('FormData keys:', Array.from(formData.keys()));

          const examFiles = formData.getAll('exams') as File[];
          console.log(`Received ${examFiles.length} files:`);
          examFiles.forEach((file, i) => {
            console.log(`  File ${i + 1}: ${file.name} (${file.size} bytes, ${file.type})`);
          });

          if (examFiles.length === 0) {
            console.log('ERROR: No files provided');
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'No files provided' })}\n\n`)
            );
            controller.close();
            return;
          }

          // Extract on server only if files were sent (fallback path)
          console.log(`Processing ${examFiles.length} PDF files...`);

          for (const file of examFiles) {
            console.log(`Starting to process ${file.name}...`);
            try {
              const bytes = await file.arrayBuffer();
              const uint8 = new Uint8Array(bytes);
              console.log(`Converted ${file.name} to Uint8Array, size: ${uint8.length} bytes`);

              // Use pdfjs-dist only (multiple import fallbacks) with disableWorker
              const tryPdfJsExtract = async (): Promise<string> => {
                const tryImports = [
                  () => import('pdfjs-dist' as any),
                  () => import('pdfjs-dist/build/pdf.mjs' as any),
                  () => import('pdfjs-dist/legacy/build/pdf.mjs' as any),
                ];
                let lastErr: any = null;
                for (const loader of tryImports) {
                  try {
                    const lib: any = await loader();
                    const getDocument = lib.getDocument || lib?.default?.getDocument;
                    if (!getDocument) throw new Error('getDocument not available');
                    const loadingTask = getDocument({ data: uint8, disableWorker: true });
                    const pdf = await loadingTask.promise;
                    let fullText = '';
                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                      const page = await pdf.getPage(pageNum);
                      const textContent = await page.getTextContent();
                      const pageText = (textContent.items || [])
                        .map((item: any) => (item && typeof item.str === 'string' ? item.str : ''))
                        .join(' ');
                      fullText += pageText + '\n';
                    }
                    return fullText;
                  } catch (err) {
                    lastErr = err;
                    continue;
                  }
                }
                throw lastErr || new Error('Failed to import/use pdfjs-dist');
              };

              console.log(`Attempting pdfjs-dist text extraction on ${file.name}...`);
              const text = await tryPdfJsExtract();
              console.log(`pdfjs-dist extracted ${text.length} chars from ${file.name}`);
              examTexts.push({ name: file.name, text: text && text.trim().length ? text : `PDF: ${file.name} - Text extraction failed (no readable text).` });
            } catch (err: any) {
              console.error(`Server extraction failed for ${file.name}:`, err?.message);
              examTexts.push({ name: file.name, text: `PDF: ${file.name} - Text extraction failed: ${err?.message || 'unknown error'}` });
            }
          }
        }

    // if examTexts came from JSON, we skip server extraction above

    console.log(`Finished processing ${examTexts.length} files (text entries), got ${examTexts.length} results`);

    console.log(`Proceeding with ${examTexts.length} processed files`);

        const numExams = examTexts.length;
        // Combine all exam texts with labels
        const combinedText = examTexts.map((exam, index) =>
          `=== EXAM ${index + 1}: ${exam.name} ===\n${exam.text}\n\n`
        ).join('');

        console.log(`Total combined text length: ${combinedText.length} characters`);
        console.log('=== COMBINED TEXT BEING SENT TO AI ===');
        console.log(combinedText.substring(0, 1000)); // First 1000 chars
        console.log('=== END COMBINED TEXT ===');

        // Create streaming chat completion
        console.log('Creating OpenAI streaming completion...');
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
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
              content: `Analyze these ${numExams} exam PDF(s) and return a JSON list of concepts ranked by Points/Hour.\n\n${combinedText}`
            }
          ],
          stream: true,
          max_tokens: 4000,
          temperature: 0.3
        });

        // Stream the response
        console.log('Starting to stream chat completion...');
        let fullResponse = '';
        let chunkCount = 0;

        for await (const chunk of completion) {
          chunkCount++;
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            console.log(`Chunk ${chunkCount}: "${content}"`);
            fullResponse += content;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', content })}\n\n`)
            );
          } else {
            console.log(`Chunk ${chunkCount}: (no content)`);
          }
        }

        console.log(`Streaming completed. Total chunks: ${chunkCount}`);
        console.log(`Full AI response length: ${fullResponse.length}`);
        console.log('=== FULL AI RESPONSE ===');
        console.log(fullResponse);
        console.log('=== END AI RESPONSE ===');

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
              totalExams: numExams,
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

