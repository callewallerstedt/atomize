import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requirePremiumAccess } from "@/lib/premium";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  try {
    // Check premium access
    const premiumCheck = await requirePremiumAccess();
    if (!premiumCheck.ok) {
      return NextResponse.json({ ok: false, error: premiumCheck.error }, { status: 403 });
    }

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
          content: `You are an expert exam analyst focused on efficiency. Your goal is to identify the highest-value concepts and methods that appear most frequently across exams, enabling students to maximize their points while minimizing study time.

ANALYSIS APPROACH:
1. Extract the grade requirements from the exams (e.g., "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p") and place them in "gradeInfo".
2. Craft a short, broad, and generic course title (1-4 words, no punctuation or course codes) for "courseName".
3. Write a "patternAnalysis" paragraph (2-3 sentences) summarizing which methods, techniques, or concept families appear most frequently across exams and how they're typically tested.

4. IDENTIFY MOST COMMON EXAM QUESTIONS:
   - Review ALL questions across ALL exams and identify the most frequently appearing question types.
   - Extract up to 7 of the most common question patterns (or fewer if there are fewer distinct patterns).
   - Write each question in a generic format with placeholders (e.g., "Calculate the Laplace transform of [function]" instead of specific values).
   - CRITICAL: If any question appears on EVERY exam, it MUST be included in the list, regardless of how many other questions there are or how small the question is.
   - For each question, count how many exams it appears on (out of the total number of exams analyzed).
   - For each question, calculate the average points it gives across all exams where it appears. If point values are not explicitly stated, estimate based on question complexity and typical exam structure.
   - Order questions from most common (appears on most exams) to least common.
   - Store in "commonQuestions" as an array of objects with "question" (generic format), "examCount" (number of exams it appears on), and "averagePoints" (average points the question gives, as a number).

5. IDENTIFY HIGH-VALUE CONCEPTS:
   - Review EVERY question across ALL exams and identify recurring methods, techniques, or specific concepts that multiple questions test.
   - Focus on concepts that are: (1) frequently tested, (2) high point-value, or (3) foundational to solving multiple question types.
   - Each concept should be specific enough to be actionable (not overly broad), but wide enough to cover a family of related exam questions.
   - Think in terms of "methods" or "techniques" that can be mastered to tackle multiple question variations.
   - You MUST identify AT LEAST 7-10 main concepts (more if the exams cover diverse topics). Aim for comprehensive coverage - extract all significant methods, techniques, and concept families that appear across the exams. This is critical for exam coverage.
   - Order concepts by value: highest-value first (most frequently tested, highest point potential), then descending. This prioritizes the most impactful study areas.

FOR EACH MAIN CONCEPT:
- "name": A specific method, technique, or concept theme that bundles related exam questions. Should be specific enough to be actionable but wide enough to cover multiple question variations.
- "description": 2-3 sentences explaining what this concept/method covers, why it appears frequently on exams, and why mastering it maximizes point potential.
- "lessonPlan": object containing the teaching plan focused on building deep understanding:
  - "keySkills": array of 4-6 action-oriented skills students must master to handle any question related to this concept (start with verbs like "Analyze", "Construct", "Apply", "Prove").
  - "examConnections": array referencing the exact exams/questions that test this concept (e.g., "Exam 2022 Q4 - proof using method X", "Exam 2021 Q7 - application of technique Y"). Include at least 3-5 specific references showing this concept's frequency.
  - "lessons": ordered array of lessons that build deep mastery of this concept. DEFAULT to 4-5 lessons per concept. Use 3 lessons ONLY for very simple/narrow concepts that appear in fewer than 3 exam questions. If you're unsure, err on the side of more lessons rather than fewer. The number of lessons must adapt to the concept's complexity and width: most concepts should have 4-6 lessons, and wide/complex concepts should have 6+ lessons. IMPORTANT: If a main concept contains multiple methods, techniques, or sub-topics, it requires separate lessons for each. Use these guidelines: If the concept covers 2+ distinct methods → use 5+ lessons. If the concept appears in 5+ different exam questions → use 4+ lessons. If the concept requires multiple steps or prerequisites → use 5+ lessons. Ensure the lesson plan comprehensively covers everything needed to master this concept. Lessons must progress from fundamentals to mastery and together enable students to tackle any question variation related to this concept. Each lesson must include:
    - "title": Concise 2-5 word noun phrase (no sentences or punctuation).
    - "summary": 2-3 sentences describing the lesson scope and why it matters for mastering this concept on exams.
    - "objectives": array of 3-5 concrete, action-oriented objectives that build toward deep understanding.

REQUIREMENTS:
- You MUST provide AT LEAST 7-10 main concepts (more if needed to cover all exam content). Aim for comprehensive coverage - don't limit yourself to just the top 5. Extract all significant methods, techniques, and concept families that appear across the exams. This is non-negotiable.
- Order concepts by value: highest-value (most frequent/highest points) first, then descending.
- Prioritize concepts that appear most frequently or carry the most point value across exams.
- Concepts should be specific methods/techniques, not overly broad topics.
- Each concept must be justified by multiple exam question references.
- Lesson count must adapt to concept complexity: DEFAULT to 4-5 lessons per concept. Use 3 lessons ONLY for very simple/narrow concepts. If a concept contains multiple methods, techniques, or sub-topics, it requires separate lessons for each. Use these guidelines: If the concept covers 2+ distinct methods → use 5+ lessons. If the concept appears in 5+ different exam questions → use 4+ lessons. If the concept requires multiple steps or prerequisites → use 5+ lessons. If you're unsure, err on the side of more lessons rather than fewer. The lesson plan must comprehensively cover everything needed to master the concept.
- Lessons must build deep, transferable understanding so students can handle any question variation related to the concept.
- Lesson sequence: fundamentals → core method/technique → applications → advanced variations/mastery.
- Keep all arrays populated with meaningful content (no placeholders).

Return JSON in this exact format:
{
  "courseName": "Short broad title",
  "gradeInfo": "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p",
  "patternAnalysis": "2-3 sentence summary highlighting the most frequently tested methods/techniques and how they appear on exams",
  "commonQuestions": [
    {
      "question": "Generic question format with placeholders (e.g., 'Calculate the Laplace transform of [function]')",
      "examCount": 5,
      "averagePoints": 8
    }
  ],
  "concepts": [
    {
      "name": "Specific Method or Concept Name",
      "description": "2-3 sentence explanation of what this concept covers and why it's high-value for exams.",
      "lessonPlan": {
        "keySkills": ["Analyze ...", "Construct ...", "Apply ...", "Prove ..."],
        "examConnections": ["Exam 2022 Q4 - ...", "Exam 2021 Q7 - ...", "Exam 2023 Q2 - ..."],
        "lessons": [
          {
            "title": "Concise Lesson Title",
            "summary": "2-3 sentence lesson summary explaining scope and exam relevance.",
            "objectives": ["Objective 1", "Objective 2", "Objective 3"]
          }
        ]
      }
    }
  ]
}

Ensure arrays contain meaningful content (no placeholders). Focus on efficiency: identify the concepts that give the best return on study time investment.`
        },
        {
          role: 'user',
          content: `Analyze these ${numExams} exam PDF(s) and return the structured JSON study blueprint described above.\n\n${combinedText}`
        }
      ],
      max_tokens: 8000,
      temperature: 0.5
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
        commonQuestions: Array.isArray(analysisData.commonQuestions) ? analysisData.commonQuestions : [],
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
