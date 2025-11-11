import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type GeneratedLesson = {
  planId: string;
  title: string;
  body: string;
  quiz: Array<{ question: string }>;
  createdAt: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      historySlug,
      courseName,
      patternAnalysis,
      conceptName,
      conceptDescription,
      keySkills = [],
      examConnections = [],
      planId,
      planTitle,
      planSummary,
      planObjectives = [],
      detectedLanguage,
      lessonData, // Optional: pre-generated lesson data from node-lesson
    } = body || {};

    if (!historySlug || !conceptName || !planId || !planTitle) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const history = await prisma.examSnipeHistory.findUnique({
      where: { userId_slug: { userId: user.id, slug: historySlug } },
    });
    if (!history) {
      return NextResponse.json({ ok: false, error: "History not found" }, { status: 404 });
    }

    // Get all concepts and lessons from history to avoid overlap
    const historyResults = (history.results as any) || {};
    const allConcepts = historyResults.concepts || [];
    const allGeneratedLessons = historyResults.generatedLessons || {};
    
    // Get other concepts (excluding current one) and their lessons
    const otherConcepts = allConcepts
      .filter((c: any) => c.name !== conceptName)
      .map((c: any) => ({
        name: c.name,
        description: c.description,
        lessons: (c.lessonPlan?.lessons || []).map((l: any) => l.title),
      }));
    
    // Get other lessons from the same concept
    const otherLessonsInConcept = Object.values(allGeneratedLessons[conceptName] || {})
      .map((l: any) => l.title)
      .filter((title: string) => title && title !== planTitle);

    const stringifyList = (value: any, divider = ", ") =>
      Array.isArray(value)
        ? value
            .map((item) => (typeof item === "string" ? item.trim() : item != null ? String(item) : ""))
            .filter((item) => item.length > 0)
            .join(divider)
        : typeof value === "string"
          ? value
          : "";

    // Build exam-snipe specific course context - PRIORITIZE THE LESSON, not the concept
    const examContext = [
      `Course: ${courseName || history.courseName || "Exam Snipe Course"}`,
      patternAnalysis ? `Exam Pattern: ${patternAnalysis}` : "",
      "",
      `=== LESSON TO TEACH: ${planTitle} ===`,
      planSummary ? `Lesson Summary: ${planSummary}` : "",
      Array.isArray(planObjectives) && planObjectives.length
        ? `Lesson Objectives:\n${planObjectives.map((o: string) => `- ${o}`).join("\n")}`
        : "",
      "",
      `Context: This lesson is part of the broader concept "${conceptName}"`,
      conceptDescription ? `Concept Overview (for context only): ${conceptDescription}` : "",
      "",
      stringifyList(keySkills) ? `Key Skills to Master (from exam analysis):\n${keySkills.map((s: string) => `- ${s}`).join("\n")}` : "",
      stringifyList(examConnections, "\n") ? `Exam References:\n${examConnections.map((e: string) => `- ${e}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const languageName = detectedLanguage?.name || "English";
    
    // Build other concepts and lessons for overlap prevention
    const otherConceptsList = otherConcepts.map((c: any) => `- ${c.name}: ${c.description || ""} (lessons: ${c.lessons.join(", ") || "none"})`).join("\n");
    const otherLessonsList = otherLessonsInConcept.map((t: string) => `- ${t}`).join("\n");
    
    const topicSummary = [
      `=== PRIMARY FOCUS: Teach the lesson "${planTitle}" ===`,
      planSummary ? `Lesson Summary: ${planSummary}` : "",
      Array.isArray(planObjectives) && planObjectives.length
        ? `Lesson Objectives:\n${planObjectives.map((o: string) => `- ${o}`).join("\n")}`
        : "",
      "",
      `Context: This lesson is part of the broader concept "${conceptName}"`,
      conceptDescription ? `Concept Overview (for context only): ${conceptDescription}` : "",
      "",
      examContext,
      otherConcepts.length > 0 ? `\n\nOther Main Concepts in this Course (avoid overlap):\n${otherConceptsList}` : "",
      otherLessonsInConcept.length > 0 ? `\n\nOther Lessons Already Generated for "${conceptName}" (avoid duplication):\n${otherLessonsList}` : "",
    ].filter(Boolean).join("\n");

    // Get previous lessons and other lessons meta for context
    const conceptPlan = (historyResults.lessonPlans || {})[conceptName] || allConcepts.find((c: any) => c.name === conceptName)?.lessonPlan;
    const allLessonsInConcept = conceptPlan?.lessons || [];
    const currentLessonIndex = allLessonsInConcept.findIndex((l: any) => String(l.id) === planId);
    const previousLessonsInConcept = allLessonsInConcept.slice(0, currentLessonIndex);
    const otherLessonsMetaInConcept = allLessonsInConcept.slice(currentLessonIndex + 1).map((l: any, idx: number) => ({
      type: "Lesson Outline",
      title: l.title,
    }));
    
    // Get generated lessons from the same concept
    const generatedLessonsInConcept = Object.values(allGeneratedLessons[conceptName] || {})
      .map((l: any, idx: number) => ({
        index: idx,
        title: l.title,
        body: l.body || "",
      }));

    // Use pre-generated lesson data if provided, otherwise generate via node-lesson
    let data: any = {};
    if (lessonData && lessonData.body) {
      // Use provided lesson data (from node-lesson)
      data = lessonData;
    } else {
      // Generate lesson via node-lesson endpoint internally
      const nodeLessonModule = await import("../../node-lesson/route");
      const nodeLessonRequest = new Request(new URL("/api/node-lesson", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: courseName || history.courseName || "Exam Snipe Course",
          topic: planTitle,
          course_context: examContext + (otherConcepts.length > 0 ? `\n\nOther Main Concepts in this Course (avoid overlap):\n${otherConceptsList}` : "") + (otherLessonsInConcept.length > 0 ? `\n\nOther Lessons Already Generated for "${conceptName}" (avoid duplication):\n${otherLessonsList}` : ""),
          combinedText: "", // Exam snipe doesn't use combinedText
          topicSummary: topicSummary,
          lessonsMeta: [{ type: "Full Lesson", title: planTitle }],
          lessonIndex: 0,
          previousLessons: generatedLessonsInConcept.slice(0, currentLessonIndex),
          generatedLessons: generatedLessonsInConcept.slice(0, currentLessonIndex),
          otherLessonsMeta: otherLessonsMetaInConcept,
          courseTopics: allConcepts.map((c: any) => c.name),
          languageName: languageName,
        }),
      });
      
      const nodeLessonResponse = await nodeLessonModule.POST(nodeLessonRequest);
      const nodeLessonJson = await nodeLessonResponse.json().catch(() => ({}));
      
      if (!nodeLessonResponse.ok || !nodeLessonJson?.ok) {
        return NextResponse.json({ ok: false, error: nodeLessonJson?.error || "Lesson generation failed" }, { status: 500 });
      }

      data = nodeLessonJson.data || {};
    }
    
    if (!data?.body) {
      return NextResponse.json({ ok: false, error: "Lesson generation failed" }, { status: 500 });
    }

    // Sanitize helper: remove null bytes and control characters from strings
    const sanitizeString = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    const sanitizeDeep = (value: any): any => {
      if (typeof value === "string") return sanitizeString(value);
      if (Array.isArray(value)) return value.map(sanitizeDeep);
      if (value && typeof value === "object") {
        const out: any = Array.isArray(value) ? [] : {};
        for (const k of Object.keys(value)) out[k] = sanitizeDeep(value[k]);
        return out;
      }
      return value;
    };

    const lesson: GeneratedLesson = {
      planId,
      title: sanitizeString(data?.title || planTitle),
      body: sanitizeString(data?.body || ""),
      quiz: Array.isArray(data?.quiz) 
        ? data.quiz.map((q: any) => ({ question: sanitizeString(String(q?.question || q || "")) }))
        : [],
      createdAt: new Date().toISOString(),
    };

    // Merge lesson into results, then sanitize the whole structure before persisting
    const results = historyResults;
    if (!results.generatedLessons) results.generatedLessons = {};
    if (!results.generatedLessons[conceptName]) results.generatedLessons[conceptName] = {};
    results.generatedLessons[conceptName][planId] = lesson;
    const sanitizedResults = sanitizeDeep(results);

    const updated = await prisma.examSnipeHistory.update({
      where: { userId_slug: { userId: user.id, slug: historySlug } },
      data: {
        courseName: courseName || history.courseName,
        results: sanitizedResults,
      },
    });

    const responseRecord = {
      id: updated.id,
      courseName: updated.courseName,
      slug: updated.slug,
      createdAt: updated.createdAt.toISOString(),
      fileNames: Array.isArray(updated.fileNames) ? (updated.fileNames as string[]) : [],
      results: updated.results,
    };

    return NextResponse.json({ ok: true, lesson, record: responseRecord });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

