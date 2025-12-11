import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OpenAI from 'openai';

const MAX_HISTORY_ITEMS = 20;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();
    const subjectSlug = url.searchParams.get("subjectSlug")?.trim();

    if (slug) {
      // Fetch single record by slug
      try {
        const row = await prisma.examSnipeHistory.findUnique({
          where: { userId_slug: { userId: user.id, slug } },
        });

        if (!row) {
          return NextResponse.json({ ok: false, error: "Record not found" }, { status: 404 });
        }

        const record = {
          id: row.id,
          courseName: row.courseName,
          slug: row.slug,
          subjectSlug: (row as any).subjectSlug || null,
          createdAt: row.createdAt.toISOString(),
          fileNames: Array.isArray(row.fileNames) ? (row.fileNames as string[]) : [],
          results: row.results,
        };

        return NextResponse.json({ ok: true, record });
      } catch (dbError: any) {
        console.error("Error fetching exam snipe by slug:", dbError);
        return NextResponse.json(
          { ok: false, error: dbError?.message || "Database error" },
          { status: 500 }
        );
      }
    }

    // Build where clause
    const where: any = { userId: user.id };
    if (subjectSlug) {
      where.subjectSlug = subjectSlug;
    }

    // Fetch all records (optionally filtered by subjectSlug)
    try {
      console.log("Fetching exam snipes with filter:", where);
      const rows = await prisma.examSnipeHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_HISTORY_ITEMS,
      });
      console.log(`Found ${rows.length} exam snipes for subjectSlug: ${subjectSlug || 'all'}`);

      const history = rows.map((row: any) => ({
        id: row.id,
        courseName: row.courseName,
        slug: row.slug,
        subjectSlug: row.subjectSlug || null,
        createdAt: row.createdAt.toISOString(),
        fileNames: Array.isArray(row.fileNames) ? (row.fileNames as string[]) : [],
        results: row.results,
      }));

      return NextResponse.json({ ok: true, history });
    } catch (dbError: any) {
      // If subjectSlug column doesn't exist, try without the filter
      if (dbError?.message?.includes('subjectSlug') || dbError?.code?.startsWith('P')) {
        console.warn("subjectSlug column may not exist, fetching all records:", dbError.message);
        try {
          const rows = await prisma.examSnipeHistory.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: MAX_HISTORY_ITEMS,
          });

          const history = rows.map((row: any) => ({
            id: row.id,
            courseName: row.courseName,
            slug: row.slug,
            subjectSlug: null, // Column doesn't exist
            createdAt: row.createdAt.toISOString(),
            fileNames: Array.isArray(row.fileNames) ? (row.fileNames as string[]) : [],
            results: row.results,
          }));

          return NextResponse.json({ ok: true, history });
        } catch (fallbackError: any) {
          console.error("Error fetching exam snipes (fallback):", fallbackError);
          return NextResponse.json(
            { ok: false, error: fallbackError?.message || "Database error" },
            { status: 500 }
          );
        }
      }
      console.error("Error fetching exam snipes:", dbError);
      return NextResponse.json(
        { ok: false, error: dbError?.message || "Database error" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in GET /api/exam-snipe/history:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch (e) {
    console.error("Error parsing JSON in exam-snipe/history POST:", e);
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const courseNameInput = typeof payload?.courseName === "string" ? payload.courseName.trim() : "";
  const slugInput = typeof payload?.slug === "string" ? payload.slug.trim() : "";
  const subjectSlugInput = typeof payload?.subjectSlug === "string" ? payload.subjectSlug.trim() : null;
  if (!courseNameInput || !slugInput) {
    return NextResponse.json({ ok: false, error: "Missing courseName or slug" }, { status: 400 });
  }

  const fileNames = Array.isArray(payload?.fileNames) ? payload.fileNames.map((name: any) => String(name)) : [];
  const results = payload?.results && typeof payload.results === "object" ? payload.results : {};

  try {
    console.log("Saving exam snipe:", { courseName: courseNameInput, slug: slugInput, subjectSlug: subjectSlugInput, userId: user.id });
    
    // Try to save with subjectSlug, but handle case where column might not exist yet
    let record;
    try {
      record = await prisma.examSnipeHistory.upsert({
        where: { userId_slug: { userId: user.id, slug: slugInput } },
        update: {
          courseName: courseNameInput,
          subjectSlug: subjectSlugInput,
          fileNames,
          results,
        },
        create: {
          userId: user.id,
          courseName: courseNameInput,
          slug: slugInput,
          subjectSlug: subjectSlugInput,
          fileNames,
          results,
        },
      });
      console.log("Exam snipe saved successfully:", record.id);
      console.log("Saved record subjectSlug:", (record as any).subjectSlug);
      console.log("Expected subjectSlug:", subjectSlugInput);
    } catch (dbError: any) {
      // If subjectSlug column doesn't exist, try without it
      if (dbError?.message?.includes('subjectSlug') || dbError?.code === 'P2002') {
        console.warn("subjectSlug column may not exist, trying without it:", dbError.message);
        record = await prisma.examSnipeHistory.upsert({
          where: { userId_slug: { userId: user.id, slug: slugInput } },
          update: {
            courseName: courseNameInput,
            fileNames,
            results,
          },
          create: {
            userId: user.id,
            courseName: courseNameInput,
            slug: slugInput,
            fileNames,
            results,
          },
        });
        console.log("Exam snipe saved (without subjectSlug):", record.id);
      } else {
        throw dbError;
      }
    }

    // Ensure we only keep the most recent MAX_HISTORY_ITEMS entries
    const count = await prisma.examSnipeHistory.count({ where: { userId: user.id } });
    if (count > MAX_HISTORY_ITEMS) {
      const toDelete = await prisma.examSnipeHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        take: count - MAX_HISTORY_ITEMS,
        select: { id: true },
      });
      if (toDelete.length > 0) {
        await prisma.examSnipeHistory.deleteMany({
          where: { id: { in: toDelete.map((row: { id: string }) => row.id) } },
        });
      }
    }

    const responseRecord = {
      id: record.id,
      courseName: record.courseName,
      slug: record.slug,
      subjectSlug: record.subjectSlug || null,
      createdAt: record.createdAt.toISOString(),
      fileNames: Array.isArray(record.fileNames) ? (record.fileNames as string[]) : [],
      results: record.results,
    };

    // If subjectSlug is not set (null, undefined, or empty string), try to automatically match it to a course
    // subjectSlugInput is already trimmed and converted to null if empty (line 139)
    // IMPORTANT: Only match if subjectSlug is explicitly not provided - if it's provided, use it directly
    if (!subjectSlugInput && results && typeof results === 'object') {
      console.log(`[EXAM SNIPE] No subjectSlug provided, triggering course matching/creation for: ${courseNameInput}`);
      // Run matching asynchronously (don't block the response)
      matchExamSnipeToCourse(user.id, slugInput, courseNameInput, results, fileNames).catch((err) => {
        console.error("[EXAM SNIPE] Error in automatic course matching:", err);
      });
    } else if (subjectSlugInput) {
      console.log(`[EXAM SNIPE] SubjectSlug explicitly provided: ${subjectSlugInput}, using it directly - NO matching`);
      // Verify the subjectSlug exists and belongs to the user
      const subjectExists = await prisma.subject.findUnique({
        where: { userId_slug: { userId: user.id, slug: subjectSlugInput } },
        select: { id: true },
      });
      if (!subjectExists) {
        console.warn(`[EXAM SNIPE] Provided subjectSlug ${subjectSlugInput} does not exist, will create new course`);
        // If the provided slug doesn't exist, treat it as if no slug was provided
        matchExamSnipeToCourse(user.id, slugInput, courseNameInput, results, fileNames).catch((err) => {
          console.error("[EXAM SNIPE] Error in automatic course matching:", err);
        });
      } else {
        // Subject exists, use it directly - no matching needed
        console.log(`[EXAM SNIPE] SubjectSlug ${subjectSlugInput} exists, linking exam snipe directly`);
      }
    } else {
      console.log(`[EXAM SNIPE] No subjectSlug and no results, skipping course matching`);
    }

    return NextResponse.json({ ok: true, record: responseRecord });
  } catch (error: any) {
    console.error("Error saving exam snipe:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to save exam snipe" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const slugInput = typeof payload?.slug === "string" ? payload.slug.trim() : "";
  const courseNameInput = typeof payload?.courseName === "string" ? payload.courseName.trim() : "";
  if (!slugInput || !courseNameInput) {
    return NextResponse.json({ ok: false, error: "Missing slug or courseName" }, { status: 400 });
  }

  const existing = await prisma.examSnipeHistory.findUnique({
    where: { userId_slug: { userId: user.id, slug: slugInput } },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Record not found" }, { status: 404 });
  }

  let updatedResults = existing.results;
  try {
    if (updatedResults && typeof updatedResults === "object" && updatedResults !== null) {
      updatedResults = { ...updatedResults, courseName: courseNameInput };
    }
  } catch {
    // ignore serialization issues, keep original
  }

  const record = await prisma.examSnipeHistory.update({
    where: { userId_slug: { userId: user.id, slug: slugInput } },
    data: {
      courseName: courseNameInput,
      results: updatedResults as any,
    },
  });

  return NextResponse.json({
    ok: true,
    record: {
      id: record.id,
      courseName: record.courseName,
      slug: record.slug,
      createdAt: record.createdAt.toISOString(),
      fileNames: Array.isArray(record.fileNames) ? (record.fileNames as string[]) : [],
      results: record.results,
    },
  });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug parameter" }, { status: 400 });
  }

  try {
    await prisma.examSnipeHistory.delete({
      where: { userId_slug: { userId: user.id, slug } },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Record not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Automatically match an exam snipe to the most relevant course using AI
 * If no match is found, creates a new course with the exam snipe name and content
 */
async function matchExamSnipeToCourse(
  userId: string,
  examSnipeSlug: string,
  examSnipeCourseName: string,
  examSnipeResults: any,
  fileNames: string[]
): Promise<void> {
  try {
    console.log("[EXAM SNIPE] Starting automatic course matching for exam snipe:", examSnipeSlug);
    console.log("[EXAM SNIPE] Course name:", examSnipeCourseName);
    
    // First, check if this exam snipe already has a subjectSlug set (shouldn't happen, but safety check)
    const existingExamSnipe = await prisma.examSnipeHistory.findUnique({
      where: { userId_slug: { userId, slug: examSnipeSlug } },
      select: { subjectSlug: true },
    });
    
    if (existingExamSnipe?.subjectSlug) {
      console.log(`[EXAM SNIPE] Exam snipe ${examSnipeSlug} already has subjectSlug ${existingExamSnipe.subjectSlug}, skipping matching`);
      return;
    }
    
    // Get all subjects for the user, excluding those that already have exam snipes linked
    const subjectsWithExamSnipes = await prisma.examSnipeHistory.findMany({
      where: { userId, subjectSlug: { not: null } },
      select: { subjectSlug: true },
      distinct: ['subjectSlug'],
    });
    const linkedSubjectSlugs = new Set(
      subjectsWithExamSnipes
        .map((e: any) => e.subjectSlug)
        .filter((slug: any): slug is string => slug !== null && slug !== undefined)
    );
    
    const allSubjects = await prisma.subject.findMany({
      where: { userId },
      select: { slug: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    
    // First, check for recently created courses (within 5 minutes) that match the exam snipe course name
    // This handles the case where auto-create just created a course and exam snipe should link to it
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentSubjects = allSubjects.filter(s => 
      s.createdAt >= fiveMinutesAgo && 
      !linkedSubjectSlugs.has(s.slug)
    );
    
    // Try to match by name similarity (case-insensitive, normalized)
    const normalizeName = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
    const examSnipeNormalizedName = normalizeName(examSnipeCourseName);
    
    for (const recentSubject of recentSubjects) {
      const subjectNormalizedName = normalizeName(recentSubject.name);
      // Check if names are very similar (exact match or one contains the other)
      if (subjectNormalizedName === examSnipeNormalizedName ||
          subjectNormalizedName.includes(examSnipeNormalizedName) ||
          examSnipeNormalizedName.includes(subjectNormalizedName)) {
        console.log(`[EXAM SNIPE] Found recently created course "${recentSubject.name}" (${recentSubject.slug}) matching exam snipe "${examSnipeCourseName}", linking directly`);
        // Link exam snipe to this recently created course
        await prisma.examSnipeHistory.update({
          where: { userId_slug: { userId, slug: examSnipeSlug } },
          data: { subjectSlug: recentSubject.slug },
        });
        return; // Exit early, no need to create new course
      }
    }
    
    // Filter out subjects that already have exam snipes linked
    const subjects = allSubjects.filter(s => !linkedSubjectSlugs.has(s.slug));

    // If no subjects exist, create a course directly without matching
    if (subjects.length === 0) {
      console.log("No subjects found for user, creating new course directly");
      // Fall through to course creation logic below
    }

    // Get course data for each subject
    const coursesWithData: Array<{ slug: string; name: string; data: any }> = [];
    for (const subject of subjects) {
      try {
        const subjectData = await prisma.subjectData.findUnique({
          where: { userId_slug: { userId, slug: subject.slug } },
          select: { data: true },
        });
        
        if (subjectData?.data) {
          coursesWithData.push({
            slug: subject.slug,
            name: subject.name,
            data: subjectData.data,
          });
        }
      } catch (err) {
        console.warn(`Failed to load data for subject ${subject.slug}:`, err);
      }
    }

    // Only try to match if we have courses to match against
    let matchResult: { matchedSlug: string | null; confidence: string; reasoning: string } | null = null;
    
    if (coursesWithData.length === 0) {
      console.log("[EXAM SNIPE] No courses with data found, will create new course directly");
      // Skip AI matching, matchResult stays null and will trigger course creation
    } else {
      // Extract exam snipe information
      const examSnipeInfo = {
        courseName: examSnipeCourseName,
        patternAnalysis: examSnipeResults.patternAnalysis || '',
        concepts: Array.isArray(examSnipeResults.concepts) 
          ? examSnipeResults.concepts.map((c: any) => ({
              name: c.name || '',
              description: c.description || '',
            }))
          : [],
        commonQuestions: Array.isArray(examSnipeResults.commonQuestions)
          ? examSnipeResults.commonQuestions.map((q: any) => q.question || '').slice(0, 5)
          : [],
      };
      // Build course summaries for AI
      const courseSummaries = coursesWithData.map((course) => {
        const data = course.data as any;
        const topics = Array.isArray(data?.topics) 
          ? data.topics.map((t: any) => typeof t === 'string' ? t : t.name || '').slice(0, 10).join(', ')
          : '';
        const subjectName = data?.subject || course.name || '';
        const summary = data?.course_quick_summary || data?.course_context || '';
        
        return {
          slug: course.slug,
          name: course.name,
          subjectName,
          topics,
          summary: summary.substring(0, 500), // Limit length
        };
      });

      try {
        // Use AI to match
        const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert at matching exam analyses to courses. Your task is to determine which course an exam snipe analysis belongs to based on content similarity.

EXAM SNIPE ANALYSIS:
- Course Name: "${examSnipeInfo.courseName}"
- Pattern Analysis: "${examSnipeInfo.patternAnalysis}"
- Main Concepts: ${examSnipeInfo.concepts.map((c: { name: string; description: string }) => `- ${c.name}: ${c.description}`).join('\n')}
- Sample Questions: ${examSnipeInfo.commonQuestions.join('\n')}

AVAILABLE COURSES:
${courseSummaries.map((c, idx) => `
${idx + 1}. Course: "${c.name}" (slug: ${c.slug})
   Subject: "${c.subjectName}"
   Topics: ${c.topics || 'N/A'}
   Summary: ${c.summary || 'N/A'}
`).join('\n')}

Analyze the exam snipe content and match it to the most relevant course based on:
1. Course name similarity (MOST IMPORTANT - must be EXACT or very clearly the same course)
2. Topic overlap (concepts, methods, techniques)
3. Subject matter similarity
4. Content alignment

CRITICAL RULES:
- ONLY match if the course name is EXACTLY the same or very clearly the same course (e.g., "Signals & Systems" matches "Signals and Systems" but NOT "Control Systems")
- DO NOT match if course names are different even if topics seem similar
- DO NOT match if the course already has an exam snipe linked to it (these courses are excluded from the list)
- Confidence must be "high" for a match - if you're unsure, return null

Return ONLY a JSON object with this exact format:
{
  "matchedSlug": "the-slug-of-the-best-matching-course",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation of why this course matches"
}

If no course is a good match (confidence would be "low" or "medium"), return matchedSlug as null. ONLY return a match if confidence is "high" and course names are clearly the same.`
        },
        {
          role: 'user',
          content: 'Match the exam snipe to the most relevant course.'
        }
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

          const responseText = completion.choices[0]?.message?.content || '';
          
          try {
            matchResult = JSON.parse(responseText);
          } catch {
            // Try to extract JSON from markdown
            const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
              matchResult = JSON.parse(jsonMatch[1]);
            } else {
              const objectMatch = responseText.match(/\{[\s\S]*\}/);
              if (objectMatch) {
                matchResult = JSON.parse(objectMatch[0]);
              } else {
                throw new Error('No valid JSON found in AI response');
              }
            }
          }
        } catch (matchError) {
          console.error("Error during AI matching, will create new course:", matchError);
          matchResult = null;
        }
      }

    // Only update if we have a high confidence match (not medium - be more strict)
    // Also check that the matched course doesn't already have a different exam snipe linked
    if (matchResult && matchResult.matchedSlug && matchResult.confidence === 'high') {
      // Check if the matched course already has an exam snipe linked to it
      const existingExamSnipe = await prisma.examSnipeHistory.findFirst({
        where: {
          userId,
          subjectSlug: matchResult.matchedSlug,
          slug: { not: examSnipeSlug }, // Exclude the current exam snipe
        },
        select: { slug: true, courseName: true },
      });
      
      if (existingExamSnipe) {
        console.log(`[EXAM SNIPE] Course ${matchResult.matchedSlug} already has exam snipe ${existingExamSnipe.slug} linked. Skipping match to avoid conflicts.`);
        // Don't match - create new course instead
        matchResult = null;
      } else {
        console.log(`Matched exam snipe ${examSnipeSlug} to course ${matchResult.matchedSlug} (confidence: ${matchResult.confidence})`);
        console.log(`Reasoning: ${matchResult.reasoning}`);
        
        // Update the exam snipe record
        try {
          await prisma.examSnipeHistory.update({
            where: { userId_slug: { userId, slug: examSnipeSlug } },
            data: { subjectSlug: matchResult.matchedSlug },
          });
          console.log(`Successfully updated exam snipe ${examSnipeSlug} with subjectSlug: ${matchResult.matchedSlug}`);
          return; // Exit early - don't create a new course
        } catch (updateError) {
          console.error("Failed to update exam snipe with matched subjectSlug:", updateError);
          // Fall through to create new course
        }
      }
    }
    
    // If no high confidence match or match failed, create a new course
    if (!matchResult || !matchResult.matchedSlug || matchResult.confidence !== 'high') {
      // No good match found - create a new course
      console.log(`No good match found for exam snipe ${examSnipeSlug} (confidence: ${matchResult?.confidence || 'unknown'})`);
      console.log(`Creating new course: ${examSnipeCourseName}`);
      
      try {
        // Generate slug from course name
        const slugBase = examSnipeCourseName.toLowerCase().trim()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-") || "course";
        
        // Check existing subjects to ensure unique slug
        const existingSubjects = await prisma.subject.findMany({
          where: { userId },
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
            userId,
            name: examSnipeCourseName,
            slug: uniqueSlug,
          },
        });
        console.log(`Created new subject: ${newSubject.slug}`);
        
        // Build course content from exam snipe results
        const courseContent = [
          `Course: ${examSnipeCourseName}`,
          '',
          'Exam Analysis Summary:',
          examSnipeResults.patternAnalysis || '',
          '',
          'Key Concepts:',
          ...(Array.isArray(examSnipeResults.concepts) 
            ? examSnipeResults.concepts.map((c: any) => `- ${c.name}: ${c.description || ''}`)
            : []),
          '',
          'Common Exam Questions:',
          ...(Array.isArray(examSnipeResults.commonQuestions)
            ? examSnipeResults.commonQuestions.map((q: any) => `- ${q.question || ''}`)
            : []),
        ].join('\n');
        
        // Create initial course data
        const courseData = {
          subject: examSnipeCourseName,
          files: fileNames.map(name => ({ name, type: 'application/pdf' })),
          combinedText: courseContent,
          tree: null,
          topics: [],
          nodes: {},
          progress: {},
          course_context: examSnipeResults.patternAnalysis || courseContent,
          course_quick_summary: examSnipeResults.patternAnalysis || '',
        };
        
        // Save course data
        await prisma.subjectData.upsert({
          where: { userId_slug: { userId, slug: uniqueSlug } },
          update: { data: courseData },
          create: { userId, slug: uniqueSlug, data: courseData },
        });
        console.log(`Saved course data for ${uniqueSlug}`);
        
        // Link exam snipe to the new course
        await prisma.examSnipeHistory.update({
          where: { userId_slug: { userId, slug: examSnipeSlug } },
          data: { subjectSlug: uniqueSlug },
        });
        console.log(`Successfully linked exam snipe ${examSnipeSlug} to new course ${uniqueSlug}`);
      } catch (createError) {
        console.error("Failed to create new course for exam snipe:", createError);
      }
    }
  } catch (error) {
    console.error("Error in matchExamSnipeToCourse:", error);
    // Don't throw - this is a background process
  }
}

