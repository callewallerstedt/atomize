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
          content: `You are an expert exam analyst. Study the historic exams and convert them into a structured study blueprint.

ALWAYS FOLLOW THESE STEPS:
1. Extract the grade requirements from the exams (e.g., "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p") and place them in "gradeInfo".
2. Craft a short, broad, and generic course title (1-4 words, no punctuation or course codes) for "courseName".
3. Write a "patternAnalysis" paragraph (2-3 sentences) summarizing which topic families dominate the exams, how question formats evolve, and how difficulty escalates.
4. Review EVERY single question across ALL exams. Group them into AT LEAST FOUR broad "concepts" that together cover the most important knowledge. Concepts must be ordered in the recommended teaching sequence from foundational material through advanced mastery.

FOR EACH MAIN CONCEPT:
- Provide:
  - "name": Broad theme that bundles several related exam topics.
  - "learningStage": one of "foundation", "core", "advanced", or "mastery".
  - "description": 2-3 sentences explaining what the concept covers and why it matters on the exam (concise but detailed).
  - "lessonPlan": object containing the teaching plan for the concept:
    - "summary": 2-3 sentences describing how the lessons progress and why the concept is exam-critical.
    - "focusAreas": array of 4-6 short phrases capturing the major pillars/exam themes for this concept.
    - "keySkills": array of 4-6 action-oriented skills (start with verbs like "Analyze", "Construct", "Explain").
    - "practiceApproach": 1-2 sentences describing the recommended practice method.
    - "examConnections": array referencing the exact exams/questions or recurring patterns that justify this concept (e.g., "Exam 2022 Q4 - long proof on ...").
    - "lessons": ordered array of lessons that teach the full concept (minimum 5 lessons). Lessons must progress from fundamentals to mastery and together cover the entire concept. Each lesson must include:
      - "title": Concise 2-5 word noun phrase (no sentences or punctuation).
      - "summary": 2-3 sentences describing the lesson scope and why it matters for the exam.
      - "objectives": array of 3-5 concrete, action-oriented objectives.
      - "estimatedTime": optional string with an indicative study duration (e.g., "45m").

REQUIREMENTS:
- Concepts and lesson plans must cover every exam question—no omissions.
- Lessons must maintain a logical sequence: fundamentals → operations/proofs → applications → integration/mastery.
- Focus areas and exam connections must explicitly reflect repeated exam themes.
- Do not include points, time estimates for entire exams, efficiency math, or common pitfalls.
- Keep all arrays populated with meaningful content (no placeholders).

Return JSON in this exact format:
{
  "courseName": "Short broad title",
  "gradeInfo": "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p",
  "patternAnalysis": "2-3 sentence summary highlighting trend and focus",
  "concepts": [
    {
      "name": "Broad Concept Name",
      "learningStage": "foundation",
      "description": "2-3 sentence explanation of scope and exam importance.",
      "lessonPlan": {
        "summary": "2-3 sentence description of how the lessons build mastery.",
        "focusAreas": ["Focus Area A", "Focus Area B", "Focus Area C"],
        "keySkills": ["Analyze ...", "Construct ...", "Explain ..."],
        "practiceApproach": "Guidance on how to practice this concept.",
        "examConnections": ["Exam 2022 Q3 - ...", "Exam 2021 Q1 - ..."],
        "lessons": [
          {
            "title": "Concise Lesson Title",
            "summary": "2-3 sentence lesson summary.",
            "objectives": ["Objective 1", "Objective 2", "Objective 3"],
            "estimatedTime": "45m"
          }
        ]
      }
    }
  ]
}

Ensure arrays contain meaningful content (no placeholders).`
        },
        {
          role: 'user',
          content: `Analyze these ${numExams} exam PDF(s) and return the structured JSON study blueprint described above.\n\n${combinedText}`
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
        courseName: analysisData.courseName || null,
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
