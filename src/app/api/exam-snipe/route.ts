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

    // Extract text from all PDFs and DOCX files
    const examTexts: { name: string; text: string }[] = [];

    console.log(`Processing ${examFiles.length} files...`);

    for (const file of examFiles) {
      console.log(`Starting to process ${file.name}...`);

      try {
        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const uint8 = new Uint8Array(bytes);
        const buffer = Buffer.from(bytes);
        const fileName = file.name.toLowerCase();
        console.log(`Converted ${file.name} to buffer, size: ${uint8.length} bytes`);

        let extractedText = '';

        // Handle DOCX files
        if (fileName.endsWith('.docx')) {
          try {
            console.log(`Attempting DOCX text extraction on ${file.name}...`);
            const mammoth = await import('mammoth');
            const mammothModule = mammoth.default || mammoth;
            const result = await mammothModule.extractRawText({ buffer });
            extractedText = result.value || '';
            console.log(`Mammoth extracted ${extractedText.length} chars from ${file.name}`);
          } catch (e: any) {
            console.warn(`DOCX extraction failed for ${file.name}:`, e?.message);
          }
        }
        // Handle PDF files
        else if (fileName.endsWith('.pdf')) {
          // Extract text using pdfjs-dist (multiple import fallbacks for Turbopack/ESM)
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

          try {
            console.log(`Attempting pdfjs-dist text extraction on ${file.name}...`);
            extractedText = await tryPdfJsExtract();
            console.log(`pdfjs-dist extracted ${extractedText.length} chars from ${file.name}`);
          } catch (e) {
            console.warn(`All pdfjs-dist variants failed for ${file.name}:`, (e as any)?.message);
          }
        }
        // Handle text files
        else if (file.type?.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
          extractedText = new TextDecoder().decode(buffer);
        }

        // Finalize
        if (!extractedText || extractedText.trim().length === 0) {
          examTexts.push({
            name: file.name,
            text: `${file.name.endsWith('.docx') ? 'DOCX' : 'PDF'}: ${file.name} - Text extraction failed (no readable text).`
          });
        } else {
          console.log(`Extracted ${extractedText.length} characters total from ${file.name}`);
          console.log(`First 200 chars:`, extractedText.substring(0, 200));
          examTexts.push({ name: file.name, text: extractedText });
        }
      } catch (err: any) {
        console.error(`Failed to process ${file.name}:`, err);
        console.error(`Error details:`, err.message, err.stack);
        // Still add the file with error info
        examTexts.push({
          name: file.name,
          text: `Error processing ${file.name}: ${err.message || 'Unknown error'}`
        });
      }
    }

    console.log(`Finished processing ${examFiles.length} files, got ${examTexts.length} results`);

    console.log(`Proceeding with ${examTexts.length} processed files`);

    const numExams = examTexts.length;
    // Combine all exam texts with labels
    const combinedText = examTexts.map((exam, index) =>
      `=== EXAM ${index + 1}: ${exam.name} ===\n${exam.text}\n\n`
    ).join('');

    console.log(`Total combined text length: ${combinedText.length} characters`);

    // Create chat completion
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
        totalExams: numExams,
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
