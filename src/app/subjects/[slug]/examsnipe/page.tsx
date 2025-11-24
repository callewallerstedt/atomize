"use client";

import { Suspense, useState, useRef, useEffect, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import { saveSubjectDataAsync, loadSubjectData, StoredSubjectData } from "@/utils/storage";
import GlowSpinner from "@/components/GlowSpinner";
import Link from "next/link";

type LessonPlan = {
  id: string;
  title: string;
  summary: string;
  objectives: string[];
  estimatedTime?: string;
};

type ConceptLessonPlan = {
  summary: string;
  focusAreas: string[];
  keySkills: string[];
  practiceApproach: string;
  examConnections: string[];
  lessons: LessonPlan[];
};

type GeneratedLesson = {
  planId: string;
  title: string;
  body: string;
  quiz?: Array<{ question: string }>;
  createdAt: string;
};

type ExamSnipeConcept = {
  name: string;
  description: string;
  lessonPlan: ConceptLessonPlan;
};

type CommonQuestion = {
  question: string;
  examCount: number;
  averagePoints: number;
};

type ExamSnipeResult = {
  courseName: string;
  totalExams: number;
  gradeInfo: string | null;
  patternAnalysis: string | null;
  commonQuestions: CommonQuestion[];
  concepts: ExamSnipeConcept[];
  lessonPlans?: Record<string, ConceptLessonPlan>;
  generatedLessons?: Record<string, Record<string, GeneratedLesson>>;
  detectedLanguage?: { code: string; name: string };
};

type ExamSnipeRecord = {
  id: string;
  courseName: string;
  slug: string;
  createdAt: string;
  fileNames: string[];
  results: ExamSnipeResult;
};

function normalizeCourseName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function normalizeStringArray(source: any, { allowSentence = false }: { allowSentence?: boolean } = {}): string[] {
  if (Array.isArray(source)) {
    return source
      .map((item) => (typeof item === "string" ? item : item != null ? String(item) : ""))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof source === "string") {
    if (allowSentence) {
      const trimmed = source.trim();
      return trimmed ? [trimmed] : [];
    }
    return source
      .split(/[\n;,]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  return [];
}

function normalizeLesson(plan: any, index: number, conceptName: string): LessonPlan {
  const title =
    typeof plan?.title === "string" && plan.title.trim()
      ? plan.title.trim()
      : `Lesson ${index + 1}`;
  const summary =
    typeof plan?.summary === "string" && plan.summary.trim()
      ? plan.summary.trim()
      : `Learn the essential material for ${conceptName}.`;
  const objectivesSource = Array.isArray(plan?.objectives) ? plan.objectives : [];
  const objectives = objectivesSource
    .map((item: any) => (typeof item === "string" ? item.trim() : item != null ? String(item) : ""))
    .filter((item: string) => item.length > 0);
  const estimatedTime =
    typeof plan?.estimatedTime === "string" && plan.estimatedTime.trim()
      ? plan.estimatedTime.trim()
      : undefined;

  return {
    id:
      typeof plan?.id === "string" && plan.id.trim()
        ? plan.id.trim()
        : `${conceptName.replace(/\s+/g, "-").toLowerCase()}-${index}`,
    title,
    summary,
    objectives,
    estimatedTime,
  };
}

function normalizeConceptLessonPlan(raw: any, conceptName: string): ConceptLessonPlan {
  const summary =
    typeof raw?.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : `Master the full scope of ${conceptName} as it appears on historic exams.`;
  const focusAreas = normalizeStringArray(raw?.focusAreas ?? raw?.focus ?? raw?.components);
  const keySkills = normalizeStringArray(raw?.keySkills ?? raw?.skills);
  const practiceApproach =
    typeof raw?.practiceApproach === "string" && raw.practiceApproach.trim()
      ? raw.practiceApproach.trim()
      : typeof raw?.studyApproach === "string" && raw.studyApproach.trim()
        ? raw.studyApproach.trim()
        : "Blend worked examples with timed exam-style drills to build fluency.";
  const examConnections = normalizeStringArray(raw?.examConnections ?? raw?.exam ?? raw?.references, {
    allowSentence: true,
  });
  const lessonsRaw = Array.isArray(raw?.lessons)
    ? raw.lessons
    : Array.isArray(raw?.plans)
      ? raw.plans
      : [];
  const lessons = lessonsRaw.length
    ? lessonsRaw.map((lesson: any, idx: number) => normalizeLesson(lesson, idx, conceptName))
    : [normalizeLesson({}, 0, conceptName)];

  return {
    summary,
    focusAreas: focusAreas.length ? focusAreas : ["Foundational theory", "Core methods", "Exam applications"],
    keySkills: keySkills.length ? keySkills : ["Explain concepts", "Solve exam-style problems", "Check solutions"],
    practiceApproach,
    examConnections: examConnections.length
      ? examConnections
      : ["Synthesized from recurring exam questions"],
    lessons,
  };
}

function normalizeConcept(
  raw: any,
  index: number,
  storedPlans?: Record<string, ConceptLessonPlan>
): ExamSnipeConcept {
  const name =
    typeof raw?.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : `Concept ${index + 1}`;

  const descriptionSource =
    typeof raw?.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : typeof raw?.overview === "string" && raw.overview.trim()
        ? raw.overview.trim()
        : typeof raw?.summary === "string" && raw.summary.trim()
          ? raw.summary.trim()
          : "Break down the clustered exam questions and extract the repeated knowledge themes.";

  const rawLessonPlan = raw?.lessonPlan ?? raw?.lesson_plan ?? {
    lessons: Array.isArray(raw?.lessons) ? raw.lessons : undefined,
    summary: raw?.planSummary,
    focusAreas: raw?.focusAreas,
    keySkills: raw?.keySkills,
    practiceApproach: raw?.practiceApproach,
    examConnections: raw?.examConnections,
  };

  const normalizedPlan = normalizeConceptLessonPlan(rawLessonPlan, name);
  const storedOverride = storedPlans?.[name];
  const lessonPlan = storedOverride
    ? {
        ...normalizedPlan,
        ...storedOverride,
        lessons: storedOverride.lessons?.length ? storedOverride.lessons : normalizedPlan.lessons,
        focusAreas: storedOverride.focusAreas?.length ? storedOverride.focusAreas : normalizedPlan.focusAreas,
        keySkills: storedOverride.keySkills?.length ? storedOverride.keySkills : normalizedPlan.keySkills,
        examConnections: storedOverride.examConnections?.length
          ? storedOverride.examConnections
          : normalizedPlan.examConnections,
        practiceApproach: storedOverride.practiceApproach || normalizedPlan.practiceApproach,
        summary: storedOverride.summary || normalizedPlan.summary,
      }
    : normalizedPlan;

  return {
    name,
    description: descriptionSource,
    lessonPlan,
  };
}

function normalizeConcepts(raw: any, storedPlans?: Record<string, ConceptLessonPlan>): ExamSnipeConcept[] {
  const array = Array.isArray(raw) ? raw : [];
  return array.map((concept, index) => normalizeConcept(concept, index, storedPlans));
}

function normalizeLessonPlans(raw: any): Record<string, ConceptLessonPlan> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, ConceptLessonPlan> = {};
  for (const key of Object.keys(raw)) {
    const source = raw[key];
    const plan = normalizeConceptLessonPlan(source, key);
    out[key] = plan;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeGeneratedLessons(raw: any): Record<string, Record<string, GeneratedLesson>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, Record<string, GeneratedLesson>> = {};
  for (const concept of Object.keys(raw)) {
    const map = raw[concept];
    if (!map || typeof map !== "object") continue;
    out[concept] = {};
    for (const planId of Object.keys(map)) {
      const item = map[planId];
      if (!item) continue;
      out[concept][planId] = {
        planId: String(item?.planId || planId),
        title: String(item?.title || "Generated Lesson"),
        body: String(item?.body || ""),
        createdAt: item?.createdAt ? String(item.createdAt) : new Date().toISOString(),
      };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeHistoryRecord(record: any): ExamSnipeRecord {
  const rawResults = record?.results ?? {};
  const courseName = normalizeCourseName(
    typeof record?.courseName === "string" && record.courseName.trim()
      ? record.courseName
      : typeof rawResults?.courseName === "string"
        ? rawResults.courseName
        : ""
  ) || "Exam Snipe Course";
  const lessonPlans = normalizeLessonPlans(rawResults?.lessonPlans);
  const concepts = normalizeConcepts(rawResults?.concepts, lessonPlans);
  const totalExams = Number(rawResults?.totalExams ?? rawResults?.total_exams ?? concepts.length) || 0;
  const gradeInfo =
    typeof rawResults?.gradeInfo === "string"
      ? rawResults.gradeInfo
      : typeof rawResults?.grade_info === "string"
        ? rawResults.grade_info
        : null;
  const patternAnalysis =
    typeof rawResults?.patternAnalysis === "string"
      ? rawResults.patternAnalysis
      : typeof rawResults?.pattern_analysis === "string"
        ? rawResults.pattern_analysis
        : null;
  const commonQuestions = Array.isArray(rawResults?.commonQuestions)
    ? rawResults.commonQuestions.map((q: any) => ({
        question: String(q?.question || ""),
        examCount: Number(q?.examCount || 0),
        averagePoints: Number(q?.averagePoints || 0),
      }))
    : [];
  const generatedLessons = normalizeGeneratedLessons(rawResults?.generatedLessons);
  const detectedLanguage = rawResults?.detectedLanguage && typeof rawResults.detectedLanguage === "object"
    ? {
        code: String(rawResults.detectedLanguage.code || "en"),
        name: String(rawResults.detectedLanguage.name || "English"),
      }
    : undefined;
  return {
    id: String(record?.id ?? record?.slug ?? crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)),
    courseName,
    slug: String(record?.slug ?? ""),
    createdAt: typeof record?.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    fileNames: Array.isArray(record?.fileNames) ? record.fileNames.map((name: any) => String(name)) : [],
    results: {
      courseName,
      totalExams,
      gradeInfo,
      patternAnalysis,
      commonQuestions,
      concepts,
      lessonPlans,
      generatedLessons,
      detectedLanguage,
    },
  };
}

function CourseExamSnipeInner() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examSnipe, setExamSnipe] = useState<ExamSnipeRecord | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [selectedConceptIndex, setSelectedConceptIndex] = useState<number | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [lessonGenerating, setLessonGenerating] = useState<Record<string, boolean>>({});

  const syncExamSnipeCourseData = async (
    record: ExamSnipeRecord,
    conceptName: string,
    focusPlanId?: string
  ): Promise<{ lessonSlug: string; topic: string; clickedLessonIndex: number }> => {
    const results = record.results || {};
    const concepts = results.concepts || [];
    const lessonPlans = results.lessonPlans || {};
    const concept = concepts.find((c: any) => c.name === conceptName);
    const conceptPlan = lessonPlans[conceptName] || concept?.lessonPlan;
    const lessons = conceptPlan?.lessons || [];

    if (!lessons.length) {
      throw new Error("Lesson plan missing for this concept");
    }

    const generatedLessonsByConcept = results.generatedLessons?.[conceptName] || {};
    const slugBase = (record.courseName || "Exam Snipe Lessons")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const lessonSlug = `${slugBase}-${record.slug || "exams"}`.slice(0, 64);
    const topic = conceptName;

    const planLessons = lessons;
    const planIdMapping: Record<number, string> = {};
    let clickedLessonIndex = -1;
    planLessons.forEach((lessonPlanItem: any, idx: number) => {
      const lessonPlanId = String(lessonPlanItem.id);
      planIdMapping[idx] = lessonPlanId;
      if (focusPlanId && lessonPlanId === focusPlanId) {
        clickedLessonIndex = idx;
      }
    });

    const buildLessonsForExisting = (existingLessons: any[] = []) => {
      const lessonsMeta: Array<{ type: string; title: string; planId?: string; tag?: string }> = [];
      const lessonsArray: Array<any> = [];

      planLessons.forEach((lessonPlanItem: any, idx: number) => {
        const lessonPlanId = planIdMapping[idx];
        const lessonTitle = String(lessonPlanItem.title || `Lesson ${idx + 1}`);
        const lessonGenerated = generatedLessonsByConcept?.[lessonPlanId] as GeneratedLesson | undefined;
        const existingLesson = existingLessons[idx] || {};

        if (lessonGenerated) {
          lessonsMeta.push({
            type: "Exam Snipe",
            title: String(lessonGenerated.title || lessonTitle),
            planId: lessonPlanId,
            tag: "Exam Snipe",
          });
          lessonsArray.push({
            ...existingLesson,
            title: String(lessonGenerated.title || lessonTitle),
            body: String(lessonGenerated.body || ""),
            origin: "exam-snipe",
            quiz: (existingLesson as any)?.quiz?.length
              ? (existingLesson as any).quiz
              : Array.isArray(lessonGenerated.quiz)
              ? lessonGenerated.quiz.map((q: any) => ({ question: String(q?.question || q || "") }))
              : [],
          });
        } else {
          lessonsMeta.push({
            type: "Exam Snipe Outline",
            title: lessonTitle,
            planId: lessonPlanId,
            tag: "Exam Snipe",
          });
          lessonsArray.push({
            ...existingLesson,
            title: lessonTitle,
            body: typeof existingLesson.body === "string" ? existingLesson.body : "",
            quiz: (existingLesson as any)?.quiz?.length ? (existingLesson as any).quiz : [],
          });
        }
      });

      return { lessonsMeta, lessonsArray };
    };

    const buildCourseData = (existingData: StoredSubjectData | null, subjectFallback: string) => {
      const existingNode =
        existingData?.nodes?.[topic] && typeof existingData.nodes[topic] === "object" && !Array.isArray(existingData.nodes[topic])
          ? (existingData.nodes[topic] as any)
          : null;
      const existingLessons = existingNode?.lessons || [];
      const existingRawLessonJson = existingNode?.rawLessonJson || [];
      const existingSymbols = existingNode?.symbols || [];

      const { lessonsMeta, lessonsArray } = buildLessonsForExisting(existingLessons);

      const topicsList = Array.isArray(existingData?.topics) ? [...existingData.topics] : [];
      if (!topicsList.some((t: any) => t?.name === topic)) {
        topicsList.push({
          name: topic,
          summary: concept?.description || `Exam Snipe concept: ${topic}`,
        });
      }

      const examSummary = [results.patternAnalysis, results.gradeInfo].filter(Boolean).join("\n").trim();
      const combinedContext = (() => {
        const base = existingData?.course_context?.trim();
        if (examSummary) {
          return base ? `${base}\n${examSummary}` : examSummary;
        }
        return base || "";
      })();

      return {
        subject: existingData?.subject || subjectFallback,
        course_context: combinedContext,
        combinedText: existingData?.combinedText || "",
        topics: topicsList,
        nodes: {
          ...(existingData?.nodes || {}),
          [topic]: {
            overview: existingNode?.overview || `Lessons generated from Exam Snipe for: ${topic}`,
            symbols: existingSymbols,
            lessonsMeta,
            lessons: lessonsArray,
            rawLessonJson: existingRawLessonJson,
            examSnipeMeta: {
              historySlug: record.slug,
              conceptName,
              conceptDescription: concept?.description || "",
              keySkills: conceptPlan?.keySkills || [],
              examConnections: conceptPlan?.examConnections || [],
              planIdMapping,
              planLessons: lessons.map((lessonPlanItem: any) => ({
                id: String(lessonPlanItem.id),
                title: String(lessonPlanItem.title || ""),
                summary: lessonPlanItem.summary || "",
                objectives: Array.isArray(lessonPlanItem.objectives) ? lessonPlanItem.objectives : [],
              })),
              courseName: record.courseName || "",
              patternAnalysis: results.patternAnalysis || "",
              detectedLanguage: results.detectedLanguage || null,
            },
          } as any,
        },
        files: existingData?.files || [],
        progress: existingData?.progress || {},
        reviewedTopics: existingData?.reviewedTopics || {},
      };
    };

    const examData = buildCourseData(loadSubjectData(lessonSlug) || null, record.courseName || lessonSlug);
    await saveSubjectDataAsync(lessonSlug, examData);

    try {
      const primaryExisting = loadSubjectData(slug) || null;
      const primaryData = buildCourseData(primaryExisting, primaryExisting?.subject || slug || record.courseName || "Course");
      await saveSubjectDataAsync(slug, primaryData);
    } catch (err) {
      console.error("Failed to sync exam snipe lessons to course:", err);
    }
    return { lessonSlug, topic, clickedLessonIndex };
  };


  const selectedConcept =
    examSnipe?.results != null && selectedConceptIndex != null
      ? examSnipe.results.concepts[selectedConceptIndex] ?? null
      : null;

  const selectedPlanData = selectedConcept
    ? examSnipe?.results?.lessonPlans?.[selectedConcept.name] || selectedConcept.lessonPlan
    : null;

  const selectedPlans = selectedPlanData?.lessons ?? [];

  const selectedGeneratedRaw = selectedConcept
    ? examSnipe?.results?.generatedLessons?.[selectedConcept.name]
    : undefined;

  const selectedGeneratedMap: Record<string, GeneratedLesson> =
    selectedGeneratedRaw && Array.isArray(selectedGeneratedRaw)
      ? (selectedGeneratedRaw as any[]).reduce<Record<string, GeneratedLesson>>((acc, lesson, legacyIdx) => {
          const planId = String((lesson as any)?.planId || `legacy-${legacyIdx}`);
          acc[planId] = {
            planId,
            title: String((lesson as any)?.title || `Lesson ${legacyIdx + 1}`),
            body: String((lesson as any)?.body || ""),
            createdAt: (lesson as any)?.createdAt ? String((lesson as any).createdAt) : new Date().toISOString(),
          };
          return acc;
        }, {})
      : (selectedGeneratedRaw as Record<string, GeneratedLesson>) || {};

  useEffect(() => {
    if (!slug) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch exam snipe for this course using subjectSlug filter
        const res = await fetch(`/api/exam-snipe/history?subjectSlug=${encodeURIComponent(slug)}`, {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        
        if (res.ok && Array.isArray(json?.history) && json.history.length > 0) {
          // Get the most recent exam snipe for this course
          const record = normalizeHistoryRecord(json.history[0]);
          setExamSnipe(record);
        } else {
          setError("No exam snipe analysis found for this course. You can create one by going to the Exam Snipe page.");
        }
      } catch (err: any) {
        console.error("Failed to load exam snipe:", err);
        setError(err?.message || "Failed to load exam snipe analysis");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    setLessonGenerating({});
  }, [selectedConceptIndex]);

  useEffect(() => {
    if (selectedConceptIndex != null) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [selectedConceptIndex]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        <GlowSpinner size={160} ariaLabel="Loading exam analysis" idSuffix="exam-snipe" />
      </div>
    );
  }

  if (error || !examSnipe) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="rounded-xl border border-[#3A1E2C] bg-[#1B0F15] p-6 text-center">
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-4">No Exam Analysis Found</h2>
            <p className="text-sm text-[var(--foreground)]/70 mb-6">{error || "No exam snipe analysis found for this course."}</p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/exam-snipe"
                className="rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Create Exam Analysis
              </Link>
              <button
                onClick={() => router.push(`/subjects/${slug}`)}
                className="rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-6 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors"
              >
                Back to Course
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { results } = examSnipe;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-4xl px-6 py-20">
        {/* Analysis Results Header */}
        <div className="mb-6 rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 backdrop-blur-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)]">{examSnipe.courseName}</h2>
              <div className="mt-1 text-xs text-[var(--foreground)]/60">
                Sniped {new Date(examSnipe.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
            <button
              onClick={() => router.push(`/subjects/${slug}`)}
              className="rounded-lg bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80 transition-colors border border-[var(--foreground)]/20"
            >
              Back to Course
            </button>
          </div>

          {examSnipe.fileNames.length > 0 && (
            <div className="mb-4 text-xs text-[var(--foreground)]/60 flex flex-wrap gap-2">
              {examSnipe.fileNames.map((name, idx) => (
                <span key={`${name}-${idx}`} className="rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-3 py-1">
                  {name}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-xs text-[var(--foreground)]/70 mb-1">Exams Analyzed</div>
              <div className="text-2xl font-bold text-[var(--foreground)]">{results.totalExams}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--foreground)]/70 mb-1">Concepts Found</div>
              <div className="text-2xl font-bold text-[var(--foreground)]">{results.concepts.length}</div>
            </div>
          </div>

          {results.gradeInfo && (
            <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--foreground)]/20 mb-4">
              <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Grade Requirements</div>
              <div className="text-sm text-[var(--foreground)]">
                {results.gradeInfo.split(',').map((grade: string, idx: number) => (
                  <div key={idx} className={idx > 0 ? 'mt-1' : ''}>
                    {grade.trim()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.patternAnalysis && (
            <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--foreground)]/20">
              <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Pattern Analysis</div>
              <div className="text-sm text-[var(--foreground)] leading-relaxed mb-4">
                {results.patternAnalysis}
              </div>
              
              {results.commonQuestions && results.commonQuestions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--foreground)]/10">
                  <div className="text-xs font-semibold text-[var(--foreground)]/80 mb-2 uppercase tracking-wide">
                    Most Common Exam Questions
                  </div>
                  <ol className="space-y-2 text-sm text-[var(--foreground)]/90">
                    {results.commonQuestions.map((q: CommonQuestion, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[var(--foreground)]/50 font-mono text-xs mt-0.5">{idx + 1}.</span>
                        <div className="flex-1">
                          <span>{q.question}</span>
                          <span className="ml-2 text-xs text-[var(--foreground)]/60">
                            ({q.examCount} of {results.totalExams} exam{q.examCount !== 1 ? 's' : ''}) ~ {q.averagePoints || 0}p
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="space-y-3">
          {results.concepts.map((concept: any, i: number) => (
            <div key={i} className="rounded-2xl border border-[var(--foreground)]/12 bg-[var(--background)]/70 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[var(--background)]/80 transition-colors"
                onClick={() => setExpandedConcept(expandedConcept === i ? null : i)}
              >
                <span
                  className="relative flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full text-xs font-bold text-white"
                  style={{
                    padding: '1.5px',
                    background: 'linear-gradient(135deg, rgba(0,229,255,0.85), rgba(255,45,150,0.85))',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  }}
                  aria-label={`Rank ${i + 1}`}
                >
                  <span
                    className="flex h-full w-full items-center justify-center rounded-full bg-[var(--background)]/90 backdrop-blur-sm"
                    style={{ borderRadius: 'calc(9999px - 1.5px)' }}
                  >
                    <span className="text-[var(--foreground)]/90 text-[11px] font-bold">{i + 1}</span>
                  </span>
                </span>
                
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[var(--foreground)] text-sm">{concept.name}</div>
                  <div className="text-xs text-[var(--foreground)]/60 mt-1">
                    {concept.lessonPlan?.lessons?.length || 0} lesson{(concept.lessonPlan?.lessons?.length || 0) === 1 ? "" : "s"}
                  </div>
                  {concept.description && (
                    <div className="text-xs text-[var(--foreground)]/55 mt-2 leading-relaxed line-clamp-2">
                      {concept.description}
                    </div>
                  )}
                </div>
                
                <div className="flex-shrink-0 text-[var(--foreground)]/50">
                  {expandedConcept === i ? '▲' : '▼'}
                </div>
              </div>
              
              {expandedConcept === i && (() => {
                const plan = concept.lessonPlan;
                const lessons = plan?.lessons || [];
                const generatedMap = examSnipe?.results?.generatedLessons?.[concept.name] || {};
                const lessonGeneratingState = lessonGenerating;
                
                return (
                  <div className="border-t border-[var(--foreground)]/10 bg-[var(--background)]/60 p-4">
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-wide text-[var(--foreground)]/40 mb-1">Concept Overview</div>
                      <div className="text-sm text-[var(--foreground)]/80 leading-relaxed">{concept.description}</div>
                    </div>
                    <div className="rounded-xl bg-[var(--background)]/70 p-3 border border-[var(--foreground)]/12 mb-4">
                      <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">Key Skills</h4>
                      <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
                        {(plan?.keySkills || []).map((skill: string, idx: number) => (
                          <li key={idx}>{skill}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-[var(--background)]/70 p-3 border border-[var(--foreground)]/12 mb-4">
                      <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">Exam Connections</h4>
                      <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
                        {(plan?.examConnections || []).map((connection: string, idx: number) => (
                          <li key={idx}>{connection}</li>
                        ))}
                      </ul>
                    </div>
                    
                    {lessons.length > 0 && (
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-[var(--foreground)] mb-3">Lesson Plan</div>
                        <ul className="divide-y divide-[var(--foreground)]/10 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]">
                          {lessons.map((planItem: any, lessonIdx: number) => {
                            const planId = String(planItem.id);
                            const generatedLesson = generatedMap?.[planId] as GeneratedLesson | undefined;
                            const isGenerating = !!lessonGeneratingState[planId];
                            const isFirst = lessonIdx === 0;
                            const isLast = lessonIdx === lessons.length - 1;
                            const isOnly = lessons.length === 1;
                            const roundedClass = isOnly
                              ? 'rounded-t-2xl rounded-b-2xl'
                              : isFirst
                              ? 'rounded-t-2xl'
                              : isLast
                              ? 'rounded-b-2xl'
                              : '';
                            const planTitle = String(planItem.title || `Lesson ${lessonIdx + 1}`);

                            const handleRowClick = async () => {
                              try {
                                if (!examSnipe) {
                                  throw new Error("Exam snipe history not loaded yet");
                                }
                                const { lessonSlug, topic, clickedLessonIndex } = await syncExamSnipeCourseData(
                                  examSnipe,
                                  concept.name,
                                  planId
                                );
                                if (clickedLessonIndex >= 0) {
                                  router.push(`/subjects/${lessonSlug}/node/${encodeURIComponent(topic)}/lesson/${clickedLessonIndex}`);
                                } else {
                                  router.push(`/subjects/${lessonSlug}/node/${encodeURIComponent(topic)}`);
                                }
                              } catch (err: any) {
                                console.error("Failed to open lesson:", err);
                                alert(err?.message || "Failed to open lesson");
                              }
                            };

                            const triggerLessonGeneration = async () => {
                              if (isGenerating) return;
                              setLessonGenerating((prev) => ({ ...prev, [planId]: true }));
                              try {
                                // Build exam-snipe specific context
                                const allLessonsInConcept = plan?.lessons || [];
                                const currentLessonIdx = allLessonsInConcept.findIndex((l: any) => String(l.id) === planId);
                                const otherLessonsMetaInConcept = allLessonsInConcept.slice(currentLessonIdx + 1).map((l: any) => ({
                                  type: "Lesson Outline",
                                  title: l.title,
                                }));
                                
                                // Get generated lessons from the same concept
                                const allGeneratedLessons = results.generatedLessons || {};
                                const generatedLessonsInConcept = Object.values(allGeneratedLessons[concept.name] || {})
                                  .map((l: any, idx: number) => ({
                                    index: idx,
                                    title: l.title,
                                    body: l.body || "",
                                  }));

                                // Build exam-snipe specific course context
                                const examContext = [
                                  `Course: ${examSnipe?.courseName || results.courseName || 'Exam Snipe Course'}`,
                                  results.patternAnalysis ? `Exam Pattern: ${results.patternAnalysis}` : "",
                                  "",
                                  `Main Concept: ${concept.name}`,
                                  concept.description ? `Concept Overview: ${concept.description}` : "",
                                  "",
                                  (plan?.keySkills || []).length > 0 ? `Key Skills to Master (from exam analysis):\n${(plan?.keySkills || []).map((s: string) => `- ${s}`).join("\n")}` : "",
                                  (plan?.examConnections || []).length > 0 ? `Exam References:\n${(plan?.examConnections || []).map((e: string) => `- ${e}`).join("\n")}` : "",
                                  "",
                                  `This Lesson: ${planItem.title}`,
                                  planItem.summary ? `Lesson Summary: ${planItem.summary}` : "",
                                  Array.isArray(planItem.objectives) && planItem.objectives.length > 0
                                    ? `Lesson Objectives:\n${planItem.objectives.map((o: string) => `- ${o}`).join("\n")}`
                                    : "",
                                ].filter(Boolean).join("\n\n");

                                // Build other concepts and lessons for overlap prevention
                                const otherConcepts = (results.concepts || []).filter((c: any) => c.name !== concept.name);
                                const otherConceptsList = otherConcepts.map((c: any) => `- ${c.name}: ${c.description || ""} (lessons: ${(c.lessonPlan?.lessons || []).map((l: any) => l.title).join(", ") || "none"})`).join("\n");
                                const otherLessonsInConceptTitles = Object.values(allGeneratedLessons[concept.name] || {})
                                  .map((l: any) => l.title)
                                  .filter((t: string) => t && t !== planItem.title);
                                const otherLessonsList = otherLessonsInConceptTitles.map((t: string) => `- ${t}`).join("\n");
                                
                                const topicSummary = [
                                  examContext,
                                  otherConcepts.length > 0 ? `\n\nOther Main Concepts in this Course (avoid overlap):\n${otherConceptsList}` : "",
                                  otherLessonsInConceptTitles.length > 0 ? `\n\nOther Lessons Already Generated for "${concept.name}" (avoid duplication):\n${otherLessonsList}` : "",
                                ].filter(Boolean).join("");

                                // Generate lesson using streaming endpoint for parity with Surge/regular lessons
                                const streamingRes = await fetch('/api/node-lesson/stream', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    subject: examSnipe?.courseName || results.courseName || 'Exam Snipe Course',
                                    topic: planItem.title,
                                    course_context: examContext + (otherConcepts.length > 0 ? `\n\nOther Main Concepts in this Course (avoid overlap):\n${otherConceptsList}` : "") + (otherLessonsInConceptTitles.length > 0 ? `\n\nOther Lessons Already Generated for "${concept.name}" (avoid duplication):\n${otherLessonsList}` : ""),
                                    combinedText: "",
                                    topicSummary,
                                    lessonsMeta: [{ type: "Concept", title: planItem.title }],
                                    lessonIndex: 0,
                                    previousLessons: generatedLessonsInConcept.slice(0, currentLessonIdx),
                                    generatedLessons: generatedLessonsInConcept.slice(0, currentLessonIdx),
                                    otherLessonsMeta: otherLessonsMetaInConcept,
                                    courseTopics: (results.concepts || []).map((c: any) => c.name),
                                    languageName: results.detectedLanguage?.name || "English",
                                  }),
                                });

                                if (!streamingRes.ok || !streamingRes.body) {
                                  const errorJson = await streamingRes.json().catch(() => ({}));
                                  throw new Error(errorJson?.error || `Lesson generation failed (${streamingRes.status})`);
                                }

                                const reader = streamingRes.body.getReader();
                                const decoder = new TextDecoder();
                                let accumulated = "";

                                while (true) {
                                  const { value, done } = await reader.read();
                                  if (done) break;
                                  if (!value) continue;
                                  const chunk = decoder.decode(value, { stream: true });
                                  const lines = chunk.split("\n");
                                  for (const line of lines) {
                                    if (!line.startsWith("data: ")) continue;
                                    const payload = line.slice(6);
                                    if (!payload) continue;
                                    try {
                                      const parsed = JSON.parse(payload);
                                      if (parsed.type === "text") {
                                        accumulated += parsed.content;
                                      } else if (parsed.type === "error") {
                                        throw new Error(parsed.error || "Lesson streaming error");
                                      }
                                    } catch (err) {
                                      if (!(err instanceof SyntaxError)) {
                                        throw err;
                                      }
                                    }
                                  }
                                }

                                const sanitizeString = (value: string): string =>
                                  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

                                const lessonBody = sanitizeString(accumulated);

                                if (!lessonBody.trim()) {
                                  throw new Error("Lesson generation returned empty content");
                                }

                                const lessonPayload = {
                                  title: planItem.title,
                                  body: lessonBody,
                                  quiz: [],
                                  metadata: null,
                                };

                                // Save the lesson to exam-snipe history
                                const saveRes = await fetch('/api/exam-snipe/generate-lesson', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({
                                    historySlug: examSnipe?.slug || '',
                                    courseName: examSnipe?.courseName || results.courseName || 'Exam Snipe Course',
                                    patternAnalysis: results.patternAnalysis,
                                    conceptName: concept.name,
                                    conceptDescription: concept.description,
                                    keySkills: plan?.keySkills || [],
                                    examConnections: plan?.examConnections || [],
                                    planId,
                                    planTitle: planItem.title,
                                    planSummary: planItem.summary,
                                    planObjectives: planItem.objectives || [],
                                    detectedLanguage: results.detectedLanguage,
                                    lessonData: lessonPayload,
                                  }),
                                });
                                const saveJson = await saveRes.json().catch(() => ({}));
                                
                                if (saveJson.record) {
                                  const updated = normalizeHistoryRecord(saveJson.record);
                                  setExamSnipe(updated);
                                  try {
                                    await syncExamSnipeCourseData(updated, concept.name, planId);
                                  } catch (syncErr) {
                                    console.error("Failed to sync exam snipe lesson to course:", syncErr);
                                  }
                                  
                                  // Navigate to the lesson page after generation
                                  const slugBase = (updated.courseName || 'Exam Snipe Lessons')
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]+/g, '-')
                                    .replace(/^-+|-+$/g, '');
                                  const lessonSlug = `${slugBase}-${updated.slug || 'exams'}`.slice(0, 64);
                                  const topic = concept.name;
                                  
                                  // Find the lesson index
                                  const lessonIdx = (lessons || []).findIndex((l: any) => String(l.id) === planId);
                                  if (lessonIdx >= 0) {
                                    router.push(`/subjects/${lessonSlug}/node/${encodeURIComponent(topic)}/lesson/${lessonIdx}`);
                                  }
                                }
                              } catch (err: any) {
                                alert(err?.message || 'Failed to generate lesson');
                              } finally {
                                setLessonGenerating((prev) => ({ ...prev, [planId]: false }));
                              }
                            };

                            return (
                              <li
                                key={planId}
                                className={`group relative flex items-center justify-between px-4 py-3 transition-colors overflow-hidden ${roundedClass} ${
                                  generatedLesson ? 'cursor-pointer bg-transparent' : 'hover:bg-[var(--background)]/80 cursor-pointer'
                                }`}
                                role="button"
                                tabIndex={0}
                                onClick={handleRowClick}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleRowClick();
                                  }
                                }}
                              >
                                {generatedLesson && (
                                  <div
                                    className={`pointer-events-none absolute inset-0 opacity-20 ${roundedClass}`}
                                    style={{ backgroundImage: 'linear-gradient(90deg, #00E5FF, #FF2D96)' }}
                                  />
                                )}
                                <span className={`text-sm truncate ${generatedLesson ? 'text-[var(--foreground)] hover:opacity-90 transition-opacity' : 'text-[var(--foreground)]/70'}`}>
                                  {planTitle}
                                </span>
                                <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                                  {generatedLesson ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] text-green-700 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      Done
                                    </span>
                                  ) : isGenerating ? (
                                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-0.5 text-[11px] text-[var(--foreground)]/70">
                                      <GlowSpinner
                                        size={9}
                                        padding={0}
                                        inline
                                        className="shrink-0"
                                        ariaLabel="Generating lesson"
                                        idSuffix={`lesson-${planId}`}
                                      />
                                      Generating…
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        void triggerLessonGeneration();
                                      }}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-[11px] text-white shadow cursor-pointer opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 hover:shadow-lg hover:bg-gradient-to-r hover:from-[#00E5FF]/80 hover:to-[#FF2D96]/80 transition-all duration-300 focus-visible:opacity-100 focus-visible:scale-100"
                                      aria-label="Generate AI"
                                      title="Generate AI"
                                    />
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        {/* Study Strategy */}
        <div className="mt-6 rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/60 p-6">
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-3">Study Strategy</h3>
          <p className="text-sm text-[var(--foreground)] mb-4">
            Move through the concepts in order—they build from foundational understanding to advanced exam execution.
            Use the lesson count to set expectations for depth and pacing.
          </p>
          <div className="text-sm text-[var(--foreground)]/70">
            <strong>Recommended flow:</strong> Secure the fundamentals in Concept 1, then advance sequentially.
            Revisit the exam connections inside each lesson plan as deliberate practice checkpoints.
          </div>
        </div>

        {/* Footer Tips */}
        <div className="mt-4 rounded-lg bg-[var(--background)]/60 border border-[var(--foreground)]/20 p-4">
          <div className="text-xs text-[var(--foreground)]/70">
            <strong className="text-[var(--foreground)]">Pro Tips:</strong><br/>
            • Begin with the foundation concept to anchor the big picture<br/>
            • Map each study session to the listed lesson objectives for authentic practice<br/>
            • Capture tricky insights from the exam connections to avoid repeating historic mistakes
          </div>
        </div>
      </div>

      {/* Concept Details Modal */}
      {selectedConceptIndex != null && results && selectedConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3 py-12">
          <div
            className="w-full max-w-2xl rounded-2xl text-[var(--foreground)] shadow-2xl flex flex-col"
            style={{
              padding: '1.5px',
              background: 'linear-gradient(135deg, rgba(0,229,255,0.8), rgba(255,45,150,0.8))',
              maxHeight: 'min(720px, calc(100vh - 140px))',
            }}
          >
            <div className="rounded-[calc(1rem-1.5px)] border border-[var(--foreground)]/10 bg-[var(--background)]/95 backdrop-blur-md h-full overflow-hidden flex flex-col">
              {(() => {
                const concept = selectedConcept;
                const plan = selectedPlanData || concept.lessonPlan;
                const lessons = selectedPlans;
                const generatedMap = selectedGeneratedMap || {};

                if (!concept || !plan) return null;

                return (
                  <>
                    {/* Fixed Header */}
                    <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--foreground)]/10">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-[var(--foreground)]/40">Main Concept</div>
                        <h3 className="text-lg font-semibold text-[var(--foreground)] mt-0.5">{concept.name}</h3>
                        <div className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--foreground)]/60">
                          <span className="inline-flex items-center rounded-full px-3 py-1 bg-[var(--background)]/80 border border-[var(--foreground)]/15">
                            Lessons: {lessons.length}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedConceptIndex(null)}
                        className="h-8 w-8 rounded-full border border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 flex items-center justify-center flex-shrink-0"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="modal-scroll flex-1 overflow-y-auto p-6 space-y-8">
                      <div className="space-y-4">
                        <div className="rounded-xl bg-[var(--background)]/70 p-4 border border-[var(--foreground)]/12">
                          <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">Concept Summary</h4>
                          <p className="text-sm text-[var(--foreground)]/85 leading-relaxed">{concept.description}</p>
                        </div>

                        <div className="rounded-xl bg-[var(--background)]/70 p-4 border border-[var(--foreground)]/12">
                          <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">Skills to Master</h4>
                          <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
                            {(plan.keySkills || []).map((skill: string, idx: number) => (
                              <li key={idx}>{skill}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-xl bg-[var(--background)]/70 p-4 border border-[var(--foreground)]/12">
                          <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">Exam Connections</h4>
                          <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
                            {(plan.examConnections || []).map((connection: string, idx: number) => (
                              <li key={idx}>{connection}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Fixed Footer */}
                    <div className="flex justify-end gap-3 p-6 pt-4 border-t border-[var(--foreground)]/10">
                      <button
                        onClick={() => setSelectedConceptIndex(null)}
                        className="rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80"
                      >
                        Close
                      </button>
                      <button
                        disabled={generatingPlan}
                        onClick={async () => {
                          if (!concept) return;
                          try {
                            setGeneratingPlan(true);
                            const payload = {
                              historySlug: examSnipe?.slug || '',
                              courseName: examSnipe?.courseName || results.courseName || 'Exam Snipe Course',
                              totalExams: results.totalExams,
                              gradeInfo: results.gradeInfo,
                              patternAnalysis: results.patternAnalysis,
                              conceptName: concept.name,
                              description: concept.description,
                              focusAreas: plan.focusAreas,
                              keySkills: plan.keySkills,
                              practiceApproach: plan.practiceApproach,
                              examConnections: plan.examConnections,
                              detectedLanguage: results.detectedLanguage,
                            };

                            const res = await fetch('/api/exam-snipe/generate-plan', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify(payload),
                            });

                            const json = await res.json().catch(() => ({}));
                            if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to generate lesson plan');

                            if (json.record) {
                              const updated = normalizeHistoryRecord(json.record);
                              setExamSnipe(updated);
                              setLessonGenerating({});
                            }
                          } catch (e: any) {
                            alert(e?.message || 'Failed to generate lesson plan');
                          } finally {
                            setGeneratingPlan(false);
                          }
                        }}
                        className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
                      >
                        {generatingPlan ? 'Generating…' : 'Generate Lesson Plan'}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .modal-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .modal-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

export default function CourseExamSnipePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        <GlowSpinner size={160} ariaLabel="Loading exam analysis" idSuffix="exam-snipe" />
      </div>
    }>
      <CourseExamSnipeInner />
    </Suspense>
  );
}
