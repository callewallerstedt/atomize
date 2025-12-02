import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const examsText = Array.isArray(body?.examsText) ? body.examsText : [];
    const courseName = String(body?.courseName || '');
    const subjectSlug = String(body?.subjectSlug || '');
    const fileNames = Array.isArray(body?.fileNames) ? body.fileNames : [];

    if (examsText.length === 0) {
      return NextResponse.json({ ok: false, error: 'No exam texts provided' }, { status: 400 });
    }

    // Return immediately - processing happens in background
    // Process in background - don't wait for response
    setImmediate(async () => {
      try {
        const combinedText = examsText.map((e: any) => `--- ${e.name} ---\n${e.text || ''}`).join('\n\n');
        const numExams = examsText.length;

        // Use the same prompt as exam-snipe/route.ts
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
          analysisData = JSON.parse(responseText);
        } catch {
          const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (jsonMatch) {
            analysisData = JSON.parse(jsonMatch[1]);
          } else {
            const objectMatch = responseText.match(/\{[\s\S]*\}/);
            if (objectMatch) {
              analysisData = JSON.parse(objectMatch[0]);
            } else {
              throw new Error('No valid JSON found in response');
            }
          }
        }

        const examData = {
          totalExams: numExams,
          courseName: analysisData.courseName || courseName || null,
          gradeInfo: analysisData.gradeInfo || null,
          patternAnalysis: analysisData.patternAnalysis || null,
          commonQuestions: Array.isArray(analysisData.commonQuestions) ? analysisData.commonQuestions : [],
          concepts: analysisData.concepts || [],
        };

        // Save to history directly using prisma
        const examSlug = `exam-${subjectSlug || 'unspecified'}-${Date.now()}`;
        await prisma.examSnipeHistory.create({
          data: {
            userId: user.id,
            slug: examSlug,
            courseName: examData.courseName || courseName,
            subjectSlug: subjectSlug || null,
            fileNames: fileNames,
            results: examData,
          },
        });

        console.log(`✓ Background exam snipe created and saved: ${examSlug}`);

        // If no subjectSlug was provided, create a new course automatically
        if (!subjectSlug && examData.courseName) {
          try {
            // Generate slug from course name
            const slugBase = examData.courseName.toLowerCase().trim()
              .replace(/[^a-z0-9\s-]/g, "")
              .replace(/\s+/g, "-")
              .replace(/-+/g, "-") || "course";
            
            // Check existing subjects to ensure unique slug
            const existingSubjects = await prisma.subject.findMany({
              where: { userId: user.id },
              select: { slug: true },
            });
            const existingSlugs = new Set(existingSubjects.map(s => s.slug));
            
            let uniqueSlug = slugBase;
            let n = 1;
            while (existingSlugs.has(uniqueSlug)) {
              n++;
              uniqueSlug = `${slugBase}-${n}`;
            }
            
            // Create the subject
            const newSubject = await prisma.subject.create({
              data: {
                userId: user.id,
                name: examData.courseName,
                slug: uniqueSlug,
              },
            });
            console.log(`Created new subject for exam snipe: ${newSubject.slug}`);
            
            // Build course content from exam snipe results
            const courseContent = [
              `Course: ${examData.courseName}`,
              '',
              'Exam Analysis Summary:',
              examData.patternAnalysis || '',
              '',
              'Key Concepts:',
              ...(Array.isArray(examData.concepts) 
                ? examData.concepts.map((c: any) => `- ${c.name}: ${c.description || ''}`)
                : []),
              '',
              'Common Exam Questions:',
              ...(Array.isArray(examData.commonQuestions)
                ? examData.commonQuestions.map((q: any) => `- ${q.question || ''}`)
                : []),
            ].join('\n');
            
            // Create initial course data
            const courseData = {
              subject: examData.courseName,
              files: fileNames.map((name: string) => ({ name, type: 'application/pdf' })),
              combinedText: courseContent,
              tree: null,
              topics: [],
              nodes: {},
              progress: {},
              course_context: examData.patternAnalysis || courseContent,
              course_quick_summary: examData.patternAnalysis || '',
            };
            
            // Save course data
            await prisma.subjectData.upsert({
              where: { userId_slug: { userId: user.id, slug: uniqueSlug } },
              update: { data: courseData },
              create: { userId: user.id, slug: uniqueSlug, data: courseData },
            });
            console.log(`Saved course data for ${uniqueSlug}`);
            
            // Link exam snipe to the new course
            await prisma.examSnipeHistory.update({
              where: { userId_slug: { userId: user.id, slug: examSlug } },
              data: { subjectSlug: uniqueSlug },
            });
            console.log(`Successfully linked exam snipe ${examSlug} to new course ${uniqueSlug}`);
          } catch (createError) {
            console.error("Failed to create new course for exam snipe:", createError);
          }
        }
      } catch (err) {
        console.error('Background exam snipe processing error:', err);
      }
    });

    // Return immediately - processing happens in background
    return NextResponse.json({ ok: true, message: 'Exam snipe processing started in background' });
  } catch (error: any) {
    console.error('Background exam snipe error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to start exam snipe processing' },
      { status: 500 }
    );
  }
}

