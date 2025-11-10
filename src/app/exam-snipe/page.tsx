"use client";

import { Suspense, useState, useRef, useEffect, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveSubjectData, saveSubjectDataAsync, StoredSubjectData } from "@/utils/storage";
import GlowSpinner from "@/components/GlowSpinner";

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
  createdAt: string;
};

type ConceptStage = "foundation" | "core" | "advanced" | "mastery";

type ExamSnipeConcept = {
  name: string;
  learningStage: ConceptStage;
  description: string;
  lessonPlan: ConceptLessonPlan;
};

type ExamSnipeResult = {
  courseName: string;
  totalExams: number;
  gradeInfo: string | null;
  patternAnalysis: string | null;
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

function generateSlug(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeBase = base || "exam-snipe-course";
  return `${safeBase}-${suffix}`;
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

function formatLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split(/[\s_-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function coerceConceptStage(value: any, index: number): ConceptStage {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  switch (normalized) {
    case "foundation":
    case "core":
    case "advanced":
    case "mastery":
      return normalized as ConceptStage;
    default:
      return ["foundation", "core", "advanced", "mastery"][Math.min(index, 3)] as ConceptStage;
  }
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

  const learningStage = coerceConceptStage(raw?.learningStage ?? raw?.stage, index);

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
    learningStage,
    description: descriptionSource,
    lessonPlan,
  };
}

function normalizeConcepts(raw: any, storedPlans?: Record<string, ConceptLessonPlan>): ExamSnipeConcept[] {
  const array = Array.isArray(raw) ? raw : [];
  return array.map((concept, index) => normalizeConcept(concept, index, storedPlans));
}

function deriveCourseName(aiName: string | null, concepts: ExamSnipeConcept[], fileNames: string[]): string {
  if (aiName) {
    const normalized = normalizeCourseName(aiName);
    if (normalized) return normalized;
  }
  const topConceptName = concepts?.[0]?.name;
  if (typeof topConceptName === "string" && topConceptName.trim().length > 0) {
    return normalizeCourseName(`Exam Focus: ${topConceptName}`);
  }
  if (fileNames.length > 0) {
    const firstFile = fileNames[0].replace(/\.[^.]+$/, "");
    return normalizeCourseName(`Exam Snipe: ${firstFile || "Course"}`);
  }
  return "Exam Snipe Course";
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
  const totalExams = Number(rawResults?.totalExams ?? rawResults?.total_exams ?? record?.totalExams ?? concepts.length) || 0;
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
      concepts,
      lessonPlans,
      generatedLessons,
      detectedLanguage,
    },
  };
}

const MAX_HISTORY_ITEMS = 20;

// PDF.js will be dynamically imported only on client-side

function ExamSnipeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isClient, setIsClient] = useState(false);
  const [examFiles, setExamFiles] = useState<File[]>([]);
  const [examAnalyzing, setExamAnalyzing] = useState(false);
  const [examResults, setExamResults] = useState<ExamSnipeResult | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [selectedConceptIndex, setSelectedConceptIndex] = useState<number | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [lessonGenerating, setLessonGenerating] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState(0);
  const [streamingText, setStreamingText] = useState<string>("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [manualTexts, setManualTexts] = useState<Array<{name: string, text: string}>>([]);
  const [currentTextName, setCurrentTextName] = useState("");
  const [currentTextContent, setCurrentTextContent] = useState("");
  const [history, setHistory] = useState<ExamSnipeRecord[]>([]);
  const [activeHistoryMeta, setActiveHistoryMeta] = useState<ExamSnipeRecord | null>(null);
  const [currentFileNames, setCurrentFileNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamContainerRef = useRef<HTMLDivElement>(null);

  const selectedConcept =
    examResults != null && selectedConceptIndex != null
      ? examResults.concepts[selectedConceptIndex] ?? null
      : null;

  const selectedPlanData = selectedConcept
    ? activeHistoryMeta?.results?.lessonPlans?.[selectedConcept.name] || selectedConcept.lessonPlan
    : null;

  const selectedPlans = selectedPlanData?.lessons ?? [];

  const selectedGeneratedRaw = selectedConcept
    ? activeHistoryMeta?.results?.generatedLessons?.[selectedConcept.name]
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
    setIsClient(true);
  }, []);

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

  useEffect(() => {
    if (!isClient) return;
    (async () => {
      try {
        const res = await fetch("/api/exam-snipe/history", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(json?.history)) return;
        const normalized = (json.history as any[]).map((record) => normalizeHistoryRecord(record));
        setHistory(normalized.slice(0, MAX_HISTORY_ITEMS));
      } catch {}
    })();
  }, [isClient]);

  const resumeSlug = searchParams?.get("resume");

  useEffect(() => {
    if (!resumeSlug) return;
    if (history.length === 0) return;
    const record = history.find((item) => item.slug === resumeSlug);
    if (!record) return;
    setExamResults(record.results);
    setActiveHistoryMeta(record);
    setExpandedConcept(null);
    setSelectedConceptIndex(null);
    setStreamingText("");
    setExamFiles([]);
    setCurrentFileNames(record.fileNames);
    router.replace("/exam-snipe");
  }, [resumeSlug, history, router]);

  useEffect(() => {
    if (streamContainerRef.current) {
      streamContainerRef.current.scrollTop = streamContainerRef.current.scrollHeight;
    }
  }, [streamingText]);

  // Prevent SSR to avoid PDF.js DOMMatrix issues
  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#0F1216] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF] mx-auto mb-4"></div>
          <p>Loading Exam Snipe...</p>
        </div>
      </div>
    );
  }

  // Extract text from PDF file client-side
  async function extractTextFromPdf(file: File): Promise<string> {
    try {
      // Dynamically import PDF.js only on client-side
      const pdfjsLib: any = await import('pdfjs-dist/webpack');

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;

      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }

      return fullText.trim();
    } catch (error) {
      console.error(`Error extracting text from ${file.name}:`, error);
      return `Error extracting text from ${file.name}: ${error}`;
    }
  }

  async function handleExamSnipe() {
    if (examFiles.length === 0) return;
    
    let animationId: number | null = null;
    let shimmerAnimation: number | null = null;
    const fileNames = examFiles.map((file) => file.name);

    try {
      setExamAnalyzing(true);
      setProgress(0);
      setStreamingText("");
      setActiveHistoryMeta(null);
      setCurrentFileNames(fileNames);

      // Dynamic progress based on streaming data
      let streamStartTime: number | null = null;
      
      console.log('=== FRONTEND: EXTRACTING TEXT FROM FILES ===');
      console.log(`Processing ${examFiles.length} files:`);
      examFiles.forEach((file, i) => {
        console.log(`  File ${i + 1}: ${file.name} (${file.size} bytes, ${file.type})`);
      });

      // Extract text from all PDFs client-side
      console.log('Starting client-side text extraction...');
      const examTexts: Array<{name: string, text: string}> = [];

      for (let i = 0; i < examFiles.length; i++) {
        const file = examFiles[i];
        console.log(`Extracting text from ${file.name}...`);

        let extractedText = '';
        if (file.type === 'application/pdf') {
          extractedText = await extractTextFromPdf(file);
        } else if (file.type.startsWith('text/')) {
          extractedText = await file.text();
        } else {
          extractedText = `Unsupported file type: ${file.name}`;
        }

        examTexts.push({
          name: file.name,
          text: extractedText
        });

        console.log(`✓ Extracted ${extractedText.length} characters from ${file.name}`);
      }

      console.log(`=== FRONTEND: SENDING EXTRACTED TEXT ===`);
      console.log(`Sending ${examTexts.length} text entries to API...`);

      const res = await fetch('/api/exam-snipe-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examsText: examTexts }),
      });

      console.log(`Response status: ${res.status}`);
      console.log(`Response ok: ${res.ok}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Response error text:', errorText);
        throw new Error('Failed to analyze exams');
      }

      // PDF parsing complete, AI processing starting
      setProgress(20);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let chunkCount = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                console.log('=== FRONTEND RECEIVED ===');
                console.log('Type:', parsed.type);
                if (parsed.type === 'text') {
                  console.log('Content:', parsed.content);
                  fullText += parsed.content;
                  chunkCount++;
                  setStreamingText(fullText);
                  console.log('Streaming text updated:', fullText.length, 'chars');

                  // Structured progress based on AI response phases
                  // 0-20%: PDF parsing complete
                  // 20-40%: Reading and analyzing exam content
                  // 40-60%: Identifying patterns and grade requirements
                  // 60-80%: Extracting and categorizing concepts
                  // 80-95%: Generating detailed breakdowns
                  // 95-100%: Finalizing results

                  let streamProgress = 20; // Base after parsing
                  const content = fullText.toLowerCase();

                  if (content.includes('grade') || content.includes('requirement')) {
                    streamProgress = 45; // Found grade analysis
                  } else if (content.includes('pattern') || content.includes('consistent')) {
                    streamProgress = 50; // Found pattern analysis
                  } else if (content.includes('learningstage') || content.includes('concept stage') || content.includes('progression')) {
                    streamProgress = 65; // Identifying staged concepts
                  } else if (content.includes('lessonplan') || content.includes('lesson plan') || content.includes('focusareas')) {
                    streamProgress = 80; // Drafting lesson plans
                  } else if (content.includes('keyskills') || content.includes('practiceapproach') || content.includes('examconnections')) {
                    streamProgress = 90; // Finalizing detailed guidance
                  } else {
                    // Incremental progress based on chunk count
                    streamProgress = Math.min(40, 20 + (chunkCount * 1.5));
                  }

                  setProgress(Math.min(95, streamProgress));

                } else if (parsed.type === 'done') {
                  console.log('Analysis complete! Data keys:', Object.keys(parsed.data || {}));
                  console.log('Concepts found:', parsed.data?.concepts?.length || 0);
                  const rawData = parsed.data ?? {};
                  const lessonPlans = normalizeLessonPlans(rawData?.lessonPlans);
                  const concepts = normalizeConcepts(rawData?.concepts, lessonPlans);
                  const aiCourseName = typeof rawData?.courseName === 'string' ? rawData.courseName : null;
                  const courseName = deriveCourseName(aiCourseName, concepts, fileNames);
                  const timestamp = Date.now();
                  const slug = generateSlug(courseName, timestamp.toString(36));
                  const gradeInfoValue =
                    typeof rawData?.gradeInfo === 'string'
                      ? rawData.gradeInfo
                      : typeof rawData?.grade_info === 'string'
                        ? rawData.grade_info
                        : null;
                  const patternValue =
                    typeof rawData?.patternAnalysis === 'string'
                      ? rawData.patternAnalysis
                      : typeof rawData?.pattern_analysis === 'string'
                        ? rawData.pattern_analysis
                        : null;
                  const generatedLessons = normalizeGeneratedLessons(rawData?.generatedLessons);
                  const detectedLanguage = rawData?.detectedLanguage && typeof rawData.detectedLanguage === "object"
                    ? {
                        code: String(rawData.detectedLanguage.code || "en"),
                        name: String(rawData.detectedLanguage.name || "English"),
                      }
                    : undefined;
                  const result: ExamSnipeResult = {
                    courseName,
                    totalExams: Number(rawData?.totalExams ?? rawData?.total_exams ?? examTexts.length) || examTexts.length,
                    gradeInfo: gradeInfoValue,
                    patternAnalysis: patternValue,
                    concepts,
                    lessonPlans,
                    generatedLessons,
                    detectedLanguage,
                  };
                  let record: ExamSnipeRecord = {
                    id: slug,
                    courseName,
                    slug,
                    createdAt: new Date(timestamp).toISOString(),
                    fileNames,
                    results: result,
                  };
                  try {
                    const saveRes = await fetch('/api/exam-snipe/history', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        courseName,
                        slug,
                        fileNames,
                        results: result,
                      }),
                    });
                    const saveJson = await saveRes.json().catch(() => ({}));
                    if (saveRes.ok && saveJson?.record) {
                      const saved = saveJson.record;
                      const savedResults = saved?.results ?? {};
                      const normalizedCourseName = normalizeCourseName(
                        typeof saved?.courseName === 'string' && saved.courseName.trim()
                          ? saved.courseName
                          : typeof savedResults?.courseName === 'string'
                            ? savedResults.courseName
                            : courseName
                      ) || courseName;
                      const mergedLessonPlans = normalizeLessonPlans(savedResults?.lessonPlans ?? result.lessonPlans);
                      const mergedGeneratedLessons = normalizeGeneratedLessons(
                        savedResults?.generatedLessons ?? result.generatedLessons
                      );
                      record = {
                        id: String(saved?.id ?? saved?.slug ?? slug),
                        courseName: normalizedCourseName,
                        slug: String(saved?.slug ?? slug),
                        createdAt: typeof saved?.createdAt === 'string' ? saved.createdAt : new Date(timestamp).toISOString(),
                        fileNames: Array.isArray(saved?.fileNames) ? saved.fileNames.map((name: any) => String(name)) : fileNames,
                        results: {
                          courseName: normalizedCourseName,
                          totalExams:
                            Number(savedResults?.totalExams ?? savedResults?.total_exams ?? result.totalExams) || result.totalExams,
                          gradeInfo:
                            typeof savedResults?.gradeInfo === 'string'
                              ? savedResults.gradeInfo
                              : typeof savedResults?.grade_info === 'string'
                                ? savedResults.grade_info
                                : result.gradeInfo,
                          patternAnalysis:
                            typeof savedResults?.patternAnalysis === 'string'
                              ? savedResults.patternAnalysis
                              : typeof savedResults?.pattern_analysis === 'string'
                                ? savedResults.pattern_analysis
                                : result.patternAnalysis,
                          lessonPlans: mergedLessonPlans,
                          generatedLessons: mergedGeneratedLessons,
                          concepts: normalizeConcepts(savedResults?.concepts ?? result.concepts, mergedLessonPlans),
                          detectedLanguage: savedResults?.detectedLanguage || result.detectedLanguage,
                        },
                      };
                    } else if (!saveRes.ok && saveRes.status !== 401) {
                      console.warn('Failed to persist exam snipe history', saveJson?.error);
                    }
                  } catch (persistErr) {
                    console.warn('Error saving exam snipe history', persistErr);
                  }
                  setExamResults(record.results);
                  setActiveHistoryMeta(record);
                  setCurrentFileNames(record.fileNames);
                  setExpandedConcept(null);
                  setSelectedConceptIndex(null);
                  setExamFiles([]);
                  setHistory((prev) => {
                    const filtered = prev.filter((item) => item.slug !== record.slug);
                    const next = [record, ...filtered].slice(0, MAX_HISTORY_ITEMS);
                    return next;
                  });
                  setProgress(100);
                } else if (parsed.type === 'error') {
                  console.error('AI returned error:', parsed.error);
                  throw new Error(parsed.error || 'Analysis failed');
                }
              } catch (e) {
                // Skip invalid JSON
                console.error('JSON parse error:', e, 'for data:', data);
              }
            }
          }
        }
      }
      
      // Clean up animations
      if (animationId) cancelAnimationFrame(animationId);
      if (shimmerAnimation) cancelAnimationFrame(shimmerAnimation);
      setProgress(100);
    } catch (err: any) {
      console.error('Exam analysis error:', err);
      alert(err?.message || 'Failed to analyze exams');
      
      // Clean up animations on error
      if (animationId) cancelAnimationFrame(animationId);
      if (shimmerAnimation) cancelAnimationFrame(shimmerAnimation);
    } finally {
      setExamAnalyzing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-4xl px-6 py-20">
        {!examResults ? (
          <Fragment>
            {!examAnalyzing ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
                <div className="text-center max-w-2xl">
                  <h2 className="text-3xl font-bold text-[var(--foreground)] mb-4">Exam Snipe</h2>
                  <p className="text-lg text-[var(--foreground)]/70 leading-relaxed">
                    Upload your old exams and let AI analyze them to find the highest-value concepts to study.
                    Discover which topics appear most frequently and give you the best return on study time.
                  </p>
                </div>

                <div
                  className={`w-full max-w-2xl rounded-2xl border-2 border-dashed border-[#3A4454] bg-transparent text-center hover:border-[#00E5FF]/50 transition-colors cursor-pointer ${examFiles.length === 0 ? 'p-20' : 'p-8'}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
                    setExamFiles(files);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setExamFiles(files);
                    }}
                    className="hidden"
                  />
                  {examFiles.length === 0 ? (
                    <div className="text-[var(--foreground)]/70 text-lg">
                      Click here or drop all the old exams
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-[#00E5FF] font-semibold text-lg mb-4">{examFiles.length} file(s) selected</div>
                      {examFiles.map((f, i) => (
                        <div key={i} className="text-[var(--foreground)] text-sm">
                          {f.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleExamSnipe}
                  disabled={examFiles.length === 0}
                  className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] !text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Analyze
                </button>

                {history.length > 0 && (
                  <div className="mt-10 w-full max-w-2xl rounded-2xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-5 shadow-lg backdrop-blur-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-[var(--foreground)]">Previously Sniped Exams</h3>
                      <span className="text-xs text-[var(--foreground)]/60">{history.length} saved</span>
                    </div>
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {history.map((record) => (
                        <div key={record.id} className="rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/80 p-3 flex flex-col gap-2">
                          <div>
                            <div className="text-sm font-semibold text-[var(--foreground)]">{record.courseName}</div>
                            <div className="text-xs text-[var(--foreground)]/60">
                              {new Date(record.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </div>
                          </div>
                          <div className="text-xs text-[var(--foreground)]/60">
                            {record.fileNames.length} exam{record.fileNames.length === 1 ? "" : "s"} • Top concept: {record.results.concepts?.[0]?.name || "—"}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                setExamResults(record.results);
                                setActiveHistoryMeta(record);
                                setExpandedConcept(null);
                                setSelectedConceptIndex(null);
                                setStreamingText("");
                                setExamFiles([]);
                                setCurrentFileNames(record.fileNames);
                              }}
                              className="inline-flex items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                            >
                              View analysis
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 space-y-6">
                {/* Unified glow spinner */}
                <GlowSpinner size={160} ariaLabel="Analyzing" idSuffix="exam" />
                
                  <div className="text-center space-y-4">
                    <div className="text-lg font-semibold text-[var(--foreground)] mb-1">Analyzing Exams...</div>
                    <div className="text-sm text-[var(--foreground)]/70">This can take up to 1 minute</div>
                  
                  {/* Streaming AI output */}
                  {streamingText && (
                    <div className="mt-6 w-[28rem] mx-auto">
                      <div className="text-xs font-semibold text-[var(--foreground)]/70 mb-2 text-center">AI Processing:</div>
                      <div className="relative rounded-lg overflow-hidden h-20 bg-gradient-to-b from-[var(--background)] via-[var(--background)]/80 to-[var(--background)]">
                        {/* Content */}
                        <div className="relative p-4 h-full flex flex-col justify-end">
                          <div className="text-sm font-mono whitespace-pre-wrap break-words leading-relaxed text-left">
                            {(() => {
                              const lines = streamingText.split('\n').filter(line => line.trim());
                              const recentLines = lines.slice(-3); // Show only last 3 lines

                              return recentLines.map((line, i) => {
                                const isCurrentLine = i === recentLines.length - 1;
                                // Always render gradient text
                                const gradientText = 'bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] bg-clip-text text-transparent';

                                return (
                                  <div key={i} className={gradientText}>
                                    {line}
                                    {isCurrentLine && (
                                      <span className="inline-block w-1.5 h-3 bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-pulse ml-1"></span>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                        {/* Blur overlay - strong at top, fades at 2/3 */}
                        <div 
                          className="absolute top-0 left-0 right-0 pointer-events-none"
                          style={{
                            height: '70%',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0.3) 65%, rgba(0,0,0,0) 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0.3) 65%, rgba(0,0,0,0) 100%)'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Fragment>
        ) : (
          <Fragment>
            {/* Analysis Results Header */}
            <div className="mb-6 rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-[var(--foreground)]">{activeHistoryMeta?.courseName || "Analysis Results"}</h2>
                  {activeHistoryMeta && (
                    <div className="mt-1 text-xs text-[var(--foreground)]/60">
                      Sniped {new Date(activeHistoryMeta.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setExamResults(null);
                    setExamFiles([]);
                    setActiveHistoryMeta(null);
                    setCurrentFileNames([]);
                  }}
                  className="rounded-lg bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80 transition-colors border border-[var(--accent-cyan)]/20"
                >
                  Analyze New Exams
                </button>
              </div>

              {currentFileNames.length > 0 && (
                <div className="mb-4 text-xs text-[var(--foreground)]/60 flex flex-wrap gap-2">
                  {currentFileNames.map((name, idx) => (
                    <span key={`${name}-${idx}`} className="rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/70 px-3 py-1">
                      {name}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-xs text-[var(--foreground)]/70 mb-1">Exams Analyzed</div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">{examResults.totalExams}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--foreground)]/70 mb-1">Concepts Found</div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">{examResults.concepts.length}</div>
                </div>
              </div>

              {examResults.gradeInfo && (
                <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20 mb-4">
                  <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Grade Requirements</div>
                  <div className="text-sm text-[var(--foreground)]">{examResults.gradeInfo}</div>
                </div>
              )}

              {examResults.patternAnalysis && (
                <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20">
                  <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Pattern Analysis</div>
                  <div className="text-sm text-[var(--foreground)] leading-relaxed">
                    {examResults.patternAnalysis}
                  </div>
                </div>
              )}
            </div>

            {/* Results List */}
            <div className="space-y-3">
              {examResults.concepts.map((concept: any, i: number) => (
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
                        Stage: {formatLabel(concept.learningStage)} • {concept.lessonPlan?.lessons?.length || 0} lesson{(concept.lessonPlan?.lessons?.length || 0) === 1 ? "" : "s"}
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
                  

{expandedConcept === i && (
  <div className="border-t border-[var(--foreground)]/10 bg-[var(--background)]/60 p-4">
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wide text-[var(--foreground)]/40 mb-1">Concept Overview</div>
      <div className="text-sm text-[var(--foreground)]/80 leading-relaxed">{concept.description}</div>
    </div>
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wide text-[var(--foreground)]/40 mb-1">Lesson Strategy</div>
      <div className="text-sm text-[var(--foreground)]/80 leading-relaxed">
        {concept.lessonPlan?.summary}
      </div>
    </div>
    <div className="grid gap-3">
      <div className="rounded-xl bg-[var(--background)]/70 p-3 border border-[var(--foreground)]/12">
        <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">Key Focus Areas</h4>
        <div className="flex flex-wrap gap-1">
          {(concept.lessonPlan?.focusAreas || []).map((area: string, idx: number) => (
            <span
              key={idx}
              className="px-2 py-1 bg-[var(--background)]/80 border border-[var(--foreground)]/15 rounded text-[10px] text-[var(--foreground)]/70"
            >
              {area}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-[var(--background)]/70 p-3 border border-[var(--foreground)]/12">
        <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">Key Skills</h4>
        <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
          {(concept.lessonPlan?.keySkills || []).map((skill: string, idx: number) => (
            <li key={idx}>{skill}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-[var(--background)]/70 p-3 border border-[var(--foreground)]/12">
        <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">Practice Approach</h4>
        <p className="text-xs text-[var(--foreground)]/80 leading-relaxed">{concept.lessonPlan?.practiceApproach}</p>
      </div>
      <div className="rounded-xl bg-[var(--background)]/70 p-3 border border-[var(--foreground)]/12">
        <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">Exam Connections</h4>
        <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
          {(concept.lessonPlan?.examConnections || []).map((connection: string, idx: number) => (
            <li key={idx}>{connection}</li>
          ))}
        </ul>
      </div>
    </div>
    <div className="flex justify-end mt-4">
      <button
        onClick={() => setSelectedConceptIndex(i)}
        className="inline-flex items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-5 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
      >
        Start
      </button>
    </div>
  </div>
)}

                </div>
              ))}
            </div>

            {/* Study Strategy */}
            <div className="mt-6 rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-6">
              <h3 className="text-base font-semibold text-[var(--foreground)] mb-3">Study Strategy</h3>
              <p className="text-sm text-[var(--foreground)] mb-4">
                Move through the concepts in order—they build from foundational understanding to advanced exam execution.
                Use the stage badge and lesson count to set expectations for depth and pacing.
              </p>
              <div className="text-sm text-[var(--foreground)]/70">
                <strong>Recommended flow:</strong> Secure the fundamentals in Concept 1, then advance sequentially.
                Revisit the exam connections inside each lesson plan as deliberate practice checkpoints.
              </div>
            </div>

            {/* Footer Tips */}
            <div className="mt-4 rounded-lg bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20 p-4">
              <div className="text-xs text-[var(--foreground)]/70">
                <strong className="text-[var(--foreground)]">Pro Tips:</strong><br/>
                • Begin with the foundation concept to anchor the big picture<br/>
                • Map each study session to the listed lesson objectives for authentic practice<br/>
                • Capture tricky insights from the exam connections to avoid repeating historic mistakes
              </div>
            </div>
          </Fragment>
        )}
      </div>


      {/* Concept Details Modal */}
      {selectedConceptIndex != null && examResults && selectedConcept && (
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
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 bg-[var(--background)]/80 border border-[var(--foreground)]/15"
                        >
                          Stage: {formatLabel(concept.learningStage)}
                        </span>
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
                        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">Lesson Strategy</h4>
                        <p className="text-sm text-[var(--foreground)]/80 leading-relaxed">{plan.summary}</p>
                      </div>

                      <div className="rounded-xl bg-[var(--background)]/70 p-4 border border-[var(--foreground)]/12">
                        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">Key Focus Areas</h4>
                        <div className="flex flex-wrap gap-1">
                          {(plan.focusAreas || []).map((area: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-[var(--background)]/80 border border-[var(--foreground)]/15 rounded text-xs text-[var(--foreground)]/80 font-medium"
                            >
                              {area}
                            </span>
                          ))}
                        </div>
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
                        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">Practice Approach</h4>
                        <p className="text-sm text-[var(--foreground)]/80 leading-relaxed">{plan.practiceApproach}</p>
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

                    {lessons.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-[var(--foreground)] mb-3">Lesson Plan</div>
                        <ul className="divide-y divide-[var(--foreground)]/10 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]">
                          {lessons.map((planItem: any, i: number) => {
                            const planId = String(planItem.id);
                            const generatedLesson = generatedMap?.[planId] as GeneratedLesson | undefined;
                            const isGenerating = !!lessonGenerating[planId];
                            const isFirst = i === 0;
                            const isLast = i === lessons.length - 1;
                            const isOnly = lessons.length === 1;
                            const roundedClass = isOnly
                              ? 'rounded-t-2xl rounded-b-2xl'
                              : isFirst
                              ? 'rounded-t-2xl'
                              : isLast
                              ? 'rounded-b-2xl'
                              : '';
                            const planTitle = String(planItem.title || `Lesson ${i + 1}`);

                            const openGeneratedLesson = async () => {
                              if (!generatedLesson) return;
                              try {
                                const slugBase = (activeHistoryMeta?.courseName || 'Exam Snipe Lessons')
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, '-')
                                  .replace(/^-+|-+$/g, '');
                                const slug = `${slugBase}-${activeHistoryMeta?.slug || 'exams'}`.slice(0, 64);
                                const topic = concept.name;
                                const data: StoredSubjectData = {
                                  subject: activeHistoryMeta?.courseName || 'Exam Snipe Lessons',
                                  course_context: (examResults.patternAnalysis || '') + "
" + (examResults.gradeInfo || ''),
                                  combinedText: '',
                                  topics: [],
                                  nodes: {
                                    [topic]: {
                                      overview: `Lessons generated from Exam Snipe for: ${topic}`,
                                      symbols: [],
                                      lessonsMeta: [{ type: 'Generated Lesson', title: String(generatedLesson.title || planTitle) }],
                                      lessons: [
                                        {
                                          title: String(generatedLesson.title || planTitle),
                                          body: String(generatedLesson.body || ''),
                                          quiz: [],
                                        },
                                      ],
                                      rawLessonJson: [],
                                    },
                                  },
                                  files: [],
                                  progress: {},
                                };
                                await saveSubjectDataAsync(slug, data);
                                setSelectedConceptIndex(null);
                                router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
                              } catch {}
                            };

                            const openPlaceholderLesson = async () => {
                              try {
                                const slugBase = (activeHistoryMeta?.courseName || 'Exam Snipe Lessons')
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, '-')
                                  .replace(/^-+|-+$/g, '');
                                const slug = `${slugBase}-${activeHistoryMeta?.slug || 'exams'}`.slice(0, 64);
                                const topic = concept.name;
                                const data: StoredSubjectData = {
                                  subject: activeHistoryMeta?.courseName || 'Exam Snipe Lessons',
                                  course_context: (examResults.patternAnalysis || '') + "
" + (examResults.gradeInfo || ''),
                                  combinedText: '',
                                  topics: [],
                                  nodes: {
                                    [topic]: {
                                      overview: `Lessons generated from Exam Snipe for: ${topic}`,
                                      symbols: [],
                                      lessonsMeta: [{ type: 'Lesson Outline', title: planTitle }],
                                      lessons: [
                                        {
                                          title: planTitle,
                                          body: `## Lesson Summary
${planItem.summary || ''}

### Objectives
${(planItem.objectives || [])
                                            .map((obj: string) => `- ${obj}`)
                                            .join('
')}`,
                                          quiz: [],
                                        },
                                      ],
                                      rawLessonJson: [],
                                    },
                                  },
                                  files: [],
                                  progress: {},
                                };
                                await saveSubjectDataAsync(slug, data);
                                setSelectedConceptIndex(null);
                                router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
                              } catch {}
                            };

                            const handleRowClick = () => {
                              if (generatedLesson) {
                                void openGeneratedLesson();
                              } else {
                                void openPlaceholderLesson();
                              }
                            };

                            const triggerLessonGeneration = async () => {
                              if (isGenerating) return;
                              setLessonGenerating((prev) => ({ ...prev, [planId]: true }));
                              try {
                                const payload = {
                                  historySlug: activeHistoryMeta?.slug || '',
                                  courseName: activeHistoryMeta?.courseName || examResults.courseName || 'Exam Snipe Course',
                                  conceptName: concept.name,
                                  conceptStage: concept.learningStage,
                                  planId,
                                  planTitle: planItem.title,
                                  planSummary: planItem.summary,
                                  planObjectives: planItem.objectives,
                                  planEstimatedTime: planItem.estimatedTime,
                                  totalExams: examResults.totalExams,
                                  gradeInfo: examResults.gradeInfo,
                                  patternAnalysis: examResults.patternAnalysis,
                                  description: concept.description,
                                  focusAreas: plan.focusAreas,
                                  keySkills: plan.keySkills,
                                  practiceApproach: plan.practiceApproach,
                                  examConnections: plan.examConnections,
                                  detectedLanguage: examResults.detectedLanguage,
                                  existingLessons: Object.values(generatedMap || {}),
                                };
                                const res = await fetch('/api/exam-snipe/generate-lesson', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify(payload),
                                });
                                const json = await res.json().catch(() => ({}));
                                if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to generate lesson');
                                if (json.record) {
                                  const updated = normalizeHistoryRecord(json.record);
                                  setActiveHistoryMeta(updated);
                                  setExamResults(updated.results);
                                  setHistory((prev) => {
                                    const filtered = prev.filter((r) => r.slug !== updated.slug);
                                    return [updated, ...filtered].slice(0, MAX_HISTORY_ITEMS);
                                  });
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
                                        size={28}
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
                            historySlug: activeHistoryMeta?.slug || '',
                            courseName: activeHistoryMeta?.courseName || examResults.courseName || 'Exam Snipe Course',
                            totalExams: examResults.totalExams,
                            gradeInfo: examResults.gradeInfo,
                            patternAnalysis: examResults.patternAnalysis,
                            conceptName: concept.name,
                            conceptStage: concept.learningStage,
                            description: concept.description,
                            focusAreas: plan.focusAreas,
                            keySkills: plan.keySkills,
                            practiceApproach: plan.practiceApproach,
                            examConnections: plan.examConnections,
                            detectedLanguage: examResults.detectedLanguage,
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
                            setActiveHistoryMeta(updated);
                            setExamResults(updated.results);
                            setHistory((prev) => {
                              const filtered = prev.filter((r) => r.slug !== updated.slug);
                              return [updated, ...filtered].slice(0, MAX_HISTORY_ITEMS);
                            });
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

export default function ExamSnipePage() {
  return (
    <Suspense fallback={null}>
      <ExamSnipeInner />
    </Suspense>
  );
}

