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

        // Create streaming chat completion
        console.log('Creating OpenAI streaming completion...');
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
  - "overview": 2-3 sentences explaining what the concept covers and why it matters on the exam.
- Include a "subtopics" array with 3 or more subtopics (keep them broad—each should combine multiple related exam questions, not single formulas).

FOR EACH SUBTOPIC:
- "name": Descriptive label a student would recognize.
- "level": "fundamental", "intermediate", or "advanced".
- "role": "introductory", "core", "applied", or "mastery".
- "description": 2 sentences describing what the learner must be able to do.
- "components": array of the essential elements/techniques/tools that must be mastered (list every key component).
- "skills": array of 3-6 action-oriented capabilities (start items with verbs like "Analyze", "Construct", "Explain").
- "studyApproach": 1-2 sentences describing how to practice and build fluency.
- "examConnections": array referencing the exact exams/questions or recurring patterns that justify this subtopic (e.g., "Exam 2022 Q4 - long proof on ...").
- "pitfalls": array of 2-3 mistakes or misconceptions to avoid.

REQUIREMENTS:
- Ensure the very first concept contains at least one subtopic whose "role" is "introductory" AND whose "level" is "fundamental", explicitly teaching the basics and forming the student's foundation.
- Keep the progression clear: early concepts/subtopics should build fundamentals, later ones should advance difficulty and integrate skills.
- Do not include points, time estimates, efficiency math, or recency bonuses anywhere.
- Cover every exam question somewhere in the structure—no omissions.

Return JSON in this exact format:
{
  "courseName": "Short broad title",
  "gradeInfo": "Grade 3: 28-41p, Grade 4: 42-55p, Grade 5: 56-70p",
  "patternAnalysis": "2-3 sentence summary highlighting trend and focus",
  "concepts": [
    {
      "name": "Broad Concept Name",
      "learningStage": "foundation",
      "overview": "2-3 sentence explanation of scope and exam importance.",
      "subtopics": [
        {
          "name": "Subtopic Name",
          "level": "fundamental",
          "role": "introductory",
          "description": "What this subtopic teaches and how it shows up on exams.",
          "components": ["Component A", "Component B", "Component C"],
          "skills": ["Explain ...", "Apply ...", "Diagnose ..."],
          "studyApproach": "Guidance on how to study/practice this subtopic.",
          "examConnections": ["Exam 2022 Q3 - ...", "Exam 2021 Q1 - ..."],
          "pitfalls": ["Common mistake 1", "Common mistake 2"]
        }
      ]
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

