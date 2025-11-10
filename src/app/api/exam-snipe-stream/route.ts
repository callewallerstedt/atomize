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
              content: `You are an expert exam analyst. Study the historic exams and convert them into a structured study blueprint.

IMPORTANT: Generate ALL content (courseName, patternAnalysis, concept names, descriptions, lesson plans, lesson titles, and objectives) in ${detectedLanguage.name}. Only use ${detectedLanguage.name} for the AI-generated material.

ALWAYS FOLLOW THESE STEPS:
1. Extract the grade requirements from the exams (e.g., "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p") and place them in "gradeInfo".
2. Craft a short, broad, and generic course title (1-4 words, no punctuation or course codes) for "courseName".
3. Write a "patternAnalysis" section (3-4 sentences) that maps the recurring exam blueprint: describe the usual order of question themes, the formats used (e.g., proofs, numerical problems, multiple-choice), note repeat topic clusters per position, and explain how difficulty escalates across the paper.
4. Review EVERY single question across ALL exams. Group them into AT LEAST FOUR broad "concepts" that together cover the most important knowledge. Concepts must be ordered in the recommended teaching sequence from foundational material through advanced mastery.

FOR EACH MAIN CONCEPT:
- Provide:
  - "name": Broad theme that bundles several related exam topics.
  - "learningStage": one of "foundation", "core", "advanced", or "mastery".
  - "description": 2-3 sentences explaining what the concept covers and why it matters on the exam (concise but detailed).
  - "lessonPlan": object containing the teaching plan for the entire concept:
    - "summary": 2-3 sentences describing how to learn the concept and how the lessons progress.
    - "focusAreas": array of 4-6 short phrases capturing the major pillars/exam themes that the concept must cover.
    - "keySkills": array of 4-6 action-oriented skills (start items with verbs like "Analyze", "Construct", "Explain").
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
  "patternAnalysis": "3-4 sentence breakdown detailing recurring question order, formats, and topic patterns",
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

