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
          console.log(`Processing ${examFiles.length} files...`);

          for (const file of examFiles) {
            console.log(`Starting to process ${file.name}...`);
            try {
              const bytes = await file.arrayBuffer();
              const uint8 = new Uint8Array(bytes);
              const buffer = Buffer.from(uint8);
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
                  console.log(`✓ Successfully extracted ${extractedText.length} chars from ${file.name}`);
                } catch (err: any) {
                  console.error(`DOCX extraction failed for ${file.name}:`, err?.message);
                  examTexts.push({ name: file.name, text: `DOCX: ${file.name} - Text extraction failed: ${err?.message || 'unknown error'}` });
                  continue;
                }
              }
              // Handle PDF files
              else if (fileName.endsWith('.pdf')) {
                try {
                  // Use pdf-parse (simple and reliable)
                  console.log(`Attempting PDF text extraction on ${file.name}...`);
                  const pdfParse = require('pdf-parse');
                  const data = await pdfParse(buffer);
                  
                  console.log(`PDF loaded: ${data.numpages} pages, ${data.text.length} chars`);
                  extractedText = data.text || '';
                } catch (err: any) {
                  console.error(`PDF extraction failed for ${file.name}:`, err?.message);
                  examTexts.push({ name: file.name, text: `PDF: ${file.name} - Text extraction failed: ${err?.message || 'unknown error'}` });
                  continue;
                }
              }
              // Handle text files
              else if (file.type?.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
                extractedText = new TextDecoder().decode(buffer);
              }
              
              if (extractedText && extractedText.trim().length > 0) {
                examTexts.push({ name: file.name, text: extractedText.trim() });
                console.log(`✓ Successfully extracted ${extractedText.length} chars from ${file.name}`);
              } else {
                examTexts.push({ name: file.name, text: `${fileName.endsWith('.docx') ? 'DOCX' : 'PDF'}: ${file.name} - No readable text found` });
                console.log(`⚠ No text found in ${file.name}`);
              }
            } catch (err: any) {
              console.error(`Server extraction failed for ${file.name}:`, err?.message);
              examTexts.push({ name: file.name, text: `${file.name} - Text extraction failed: ${err?.message || 'unknown error'}` });
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

        // Detect language from exam materials
        let detectedLanguage = { code: 'en', name: 'English' };
        try {
          const langPrompt = [
            "Detect the primary human language of the provided text.",
            "Return STRICT JSON: { code: string; name: string } where code is ISO 639-1 if possible (e.g., 'en', 'sv', 'de').",
            "If uncertain, default to { code: 'en', name: 'English' }.",
          ].join("\n");
          const langResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: langPrompt },
              { role: 'user', content: combinedText.slice(0, 4000) || '' },
            ],
            temperature: 0,
            max_tokens: 50,
          });
          const langContent = langResponse.choices[0]?.message?.content || '{}';
          const langData = JSON.parse(langContent);
          detectedLanguage = {
            code: String(langData.code || 'en'),
            name: String(langData.name || 'English'),
          };
          console.log(`Detected language: ${detectedLanguage.name} (${detectedLanguage.code})`);
        } catch (err: any) {
          console.error('Language detection failed:', err?.message);
          // Keep default English
        }

        // Create streaming chat completion
        console.log('Creating OpenAI streaming completion...');
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are an expert exam analyst focused on efficiency. Your goal is to identify the highest-value concepts and methods that appear most frequently across exams, enabling students to maximize their points while minimizing study time.

IMPORTANT: Generate ALL content (courseName, patternAnalysis, concept names, descriptions, lesson plans, lesson titles, and objectives) in ${detectedLanguage.name}. Only use ${detectedLanguage.name} for the AI-generated material.

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
   - You MUST identify AT LEAST 5 main concepts (more if the exams cover diverse topics). This is critical for exam coverage.
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
- You MUST provide AT LEAST 5 main concepts (more if needed to cover all exam content). This is non-negotiable.
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
          stream: true,
          max_tokens: 8000,
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
              courseName: analysisData?.courseName || null,
              gradeInfo: analysisData?.gradeInfo || null,
              patternAnalysis: analysisData?.patternAnalysis || null,
              commonQuestions: Array.isArray(analysisData?.commonQuestions) ? analysisData.commonQuestions : [],
              concepts: analysisData?.concepts || [],
              detectedLanguage: detectedLanguage,
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

