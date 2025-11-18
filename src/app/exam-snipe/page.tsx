"use client";

import { Suspense, useState, useRef, useEffect, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveSubjectData, saveSubjectDataAsync, loadSubjectData, StoredSubjectData } from "@/utils/storage";
import GlowSpinner from "@/components/GlowSpinner";

// Generate stable dots that don't change on re-render
function generateDots(count: number) {
  return Array.from({ length: count }).map((_, i) => {
    const size = Math.random() * 2 + 1;
    const isCyan = Math.random() > 0.5;
    const color = isCyan ? '#00E5FF' : '#FF2D96';
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const glowSize = Math.random() * 4 + 2;
    const duration = Math.random() * 20 + 15;
    const delay = Math.random() * 5;
    return {
      key: `loading-dot-${i}`,
      size,
      color,
      left,
      top,
      glowSize,
      duration,
      delay,
      animation: `float-${i % 3}`,
    };
  });
}

// Loading Screen Component (matches welcome screen style without text)
function LoadingScreen() {
  const [loadingDots, setLoadingDots] = useState<ReturnType<typeof generateDots>>([]);
  
  // Generate dots only on client side to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLoadingDots(generateDots(80));
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)]">
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {loadingDots.map((dot) => (
          <div
            key={dot.key}
            className="absolute rounded-full opacity-40"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              left: `${dot.left}%`,
              top: `${dot.top}%`,
              background: dot.color,
              boxShadow: `0 0 ${dot.glowSize}px ${dot.color}`,
              animation: `${dot.animation} ${dot.duration}s linear infinite`,
              animationDelay: `${dot.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Spinning gradient ring - centered */}
      <div className="logo-wrap" style={{ width: 240, aspectRatio: "1 / 1", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "-15vh" }}>
        <div style={{ transform: "scale(1.3)", transformOrigin: "center" }}>
          <img
            src="/spinner.png"
            alt=""
            width={320}
            height={320}
            style={{ width: 320, height: 320, objectFit: "contain", transformOrigin: "center" }}
            className="animate-spin"
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
}

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
  const [loadingExamHistory, setLoadingExamHistory] = useState(false);
  const [examMenuOpenFor, setExamMenuOpenFor] = useState<string | null>(null);
  const [loadingResume, setLoadingResume] = useState(false);
  const [selectedSubjectSlug, setSelectedSubjectSlug] = useState<string>("");
  const [subjects, setSubjects] = useState<Array<{ name: string; slug: string }>>([]);
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

  const [autoStartPending, setAutoStartPending] = useState(false);
  const handleExamSnipeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIsClient(true);
    
    // Load subjects from localStorage
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("atomicSubjects");
        const loadedSubjects = raw ? (JSON.parse(raw) as Array<{ name: string; slug: string }>) : [];
        // Filter out quicklearn
        const filtered = loadedSubjects.filter((s) => s.slug !== "quicklearn");
        setSubjects(filtered);
      } catch {
        setSubjects([]);
      }
    }
    
    // Check for pending exam files from chat
    const pendingFiles = (window as any).__pendingExamFiles;
    if (pendingFiles && Array.isArray(pendingFiles) && pendingFiles.length > 0) {
      // Clear any existing files first
      setExamFiles([]);
      // Then set new files after a brief delay to ensure state is reset
      setTimeout(() => {
        setExamFiles(pendingFiles);
        // Clear the pending files
        delete (window as any).__pendingExamFiles;
        // Set flag to auto-start exam snipe
        setAutoStartPending(true);
      }, 50);
    }
  }, []);

  // Store function reference after it's defined
  useEffect(() => {
    handleExamSnipeRef.current = handleExamSnipe;
  });

  // Auto-start exam snipe when files are loaded from chat
  useEffect(() => {
    if (autoStartPending && examFiles.length > 0 && !examAnalyzing && handleExamSnipeRef.current) {
      setAutoStartPending(false);
      // Auto-start exam snipe after a short delay to ensure state is set
      setTimeout(() => {
        if (handleExamSnipeRef.current) {
          handleExamSnipeRef.current();
        }
      }, 100);
    }
  }, [autoStartPending, examFiles.length, examAnalyzing]);

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

  const resumeSlug = searchParams?.get("resume");

  useEffect(() => {
    if (!isClient) return;
    if (resumeSlug) return; // Skip if we're resuming (handled by resume effect)
    let cancelled = false;
    setLoadingExamHistory(true);
    (async () => {
      try {
        const res = await fetch("/api/exam-snipe/history", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !Array.isArray(json?.history)) {
          setHistory([]);
          return;
        }
        const normalized = (json.history as any[]).map((record) => normalizeHistoryRecord(record));
        setHistory(normalized.slice(0, MAX_HISTORY_ITEMS));
      } catch {
        if (!cancelled) {
          setHistory([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingExamHistory(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClient, resumeSlug]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!examMenuOpenFor) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-menu-dropdown]') && !target.closest('[data-menu-button]')) {
        setExamMenuOpenFor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [examMenuOpenFor]);

  // Load resume record immediately if resumeSlug exists
  useEffect(() => {
    if (!isClient) return;
    if (!resumeSlug) return;
    
    let cancelled = false;
    setLoadingResume(true);
    
    (async () => {
      try {
        console.log("Loading exam snipe for resume:", resumeSlug);
        // Fetch the specific record by slug (more efficient than fetching all)
        const res = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(resumeSlug)}`, { 
          credentials: "include" 
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        
        if (res.ok && json?.record) {
          const record = normalizeHistoryRecord(json.record);
          console.log("Loaded exam snipe record:", record.slug, "Course:", record.courseName);
          console.log("Record has results:", !!record.results, "Concepts:", record.results?.concepts?.length || 0);
          
          if (!cancelled) {
            // Set all the state FIRST before any navigation
            setExamResults(record.results);
            setActiveHistoryMeta(record);
            setExpandedConcept(null);
            setSelectedConceptIndex(null);
            setStreamingText("");
            setExamFiles([]);
            setCurrentFileNames(record.fileNames);
            
            // Also load full history for the history sidebar
            try {
              const historyRes = await fetch("/api/exam-snipe/history", { credentials: "include" });
              const historyJson = await historyRes.json().catch(() => ({}));
              if (historyRes.ok && Array.isArray(historyJson?.history)) {
                const normalized = (historyJson.history as any[]).map((r) => normalizeHistoryRecord(r));
                setHistory(normalized.slice(0, MAX_HISTORY_ITEMS));
                console.log(`Loaded ${normalized.length} exam snipes in history sidebar`);
              }
            } catch (historyErr) {
              console.warn("Failed to load full history, continuing with single record:", historyErr);
            }
            
            // Use setTimeout to ensure state is set before URL change
            setTimeout(() => {
              if (!cancelled) {
                // Remove the resume query param to clean up URL, but keep the state
                router.replace("/exam-snipe", { scroll: false });
                console.log("Navigation complete, analysis should be visible");
              }
            }, 100);
          }
        } else {
          console.error("Failed to load resume record:", json?.error || "Record not found");
          // If record not found, redirect back to exam snipe page
          if (!cancelled) {
            router.replace("/exam-snipe");
          }
        }
      } catch (err) {
        console.error("Failed to load resume record:", err);
        router.replace("/exam-snipe");
      } finally {
        if (!cancelled) {
          setLoadingResume(false);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [isClient, resumeSlug, router]);

  useEffect(() => {
    if (streamContainerRef.current) {
      streamContainerRef.current.scrollTop = streamContainerRef.current.scrollHeight;
    }
  }, [streamingText]);

  // Debug: Log current state to verify analysis is loaded
  // NOTE: This must be before any early returns to maintain hook order
  useEffect(() => {
    if (examResults && activeHistoryMeta) {
      console.log("✅ Analysis loaded and ready to display:", {
        courseName: activeHistoryMeta.courseName,
        slug: activeHistoryMeta.slug,
        conceptsCount: examResults.concepts?.length || 0,
        hasResults: !!examResults
      });
    } else if (resumeSlug && !loadingResume) {
      console.warn("⚠️ Resume slug exists but analysis not loaded:", {
        resumeSlug,
        hasExamResults: !!examResults,
        hasActiveHistoryMeta: !!activeHistoryMeta
      });
    }
  }, [examResults, activeHistoryMeta, resumeSlug, loadingResume]);

  // Prevent SSR to avoid PDF.js DOMMatrix issues
  if (!isClient) {
    return <LoadingScreen />;
  }

  // Show loading state while resuming
  if (loadingResume) {
    return <LoadingScreen />;
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
    
    // CRITICAL: Capture the selectedSubjectSlug at the START of the function
    // This ensures we have the correct value even after async operations
    const capturedSubjectSlug = selectedSubjectSlug || null;
    
    // Log the selected course before starting analysis
    console.log('=== STARTING EXAM SNIPE ANALYSIS ===');
    console.log('Selected course (subjectSlug):', capturedSubjectSlug || 'none');
    console.log('Available subjects:', subjects.length);
    
    let animationId: number | null = null;
    let shimmerAnimation: number | null = null;
    // Capture files and names before clearing
    const filesToProcess = [...examFiles];
    const fileNames = filesToProcess.map((file) => file.name);

    try {
      setExamAnalyzing(true);
      setProgress(0);
      setStreamingText("");
      setActiveHistoryMeta(null);
      setCurrentFileNames(fileNames);
      // Clear files immediately when starting new analysis
      setExamFiles([]);

      // Dynamic progress based on streaming data
      let streamStartTime: number | null = null;
      
      console.log('=== FRONTEND: EXTRACTING TEXT FROM FILES ===');
      console.log(`Processing ${filesToProcess.length} files:`);
      filesToProcess.forEach((file, i) => {
        console.log(`  File ${i + 1}: ${file.name} (${file.size} bytes, ${file.type})`);
      });

      // Extract text from all PDFs client-side
      console.log('Starting client-side text extraction...');
      const examTexts: Array<{name: string, text: string}> = [];

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
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
                  const commonQuestionsValue = Array.isArray(rawData?.commonQuestions)
                    ? rawData.commonQuestions.map((q: any) => ({
                        question: String(q?.question || ""),
                        examCount: Number(q?.examCount || 0),
                        averagePoints: Number(q?.averagePoints || 0),
                      }))
                    : [];
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
                    commonQuestions: commonQuestionsValue,
                    concepts,
                    lessonPlans,
                    generatedLessons,
                    detectedLanguage,
                  };
                  // Save exam snipe with selected course
                  // Use the capturedSubjectSlug from the start of handleExamSnipe
                  let record: ExamSnipeRecord | null = null;
                  try {
                    // Use the captured value from the start of the function
                    // This ensures we have the correct value even after async streaming
                    const subjectSlugToSave = capturedSubjectSlug;
                    console.log('=== SAVING EXAM SNIPE ===');
                    console.log('Captured subject slug (from start):', subjectSlugToSave);
                    console.log('Current state value:', selectedSubjectSlug);
                    console.log('Will save with:', subjectSlugToSave);
                    const savePayload = {
                      courseName,
                      slug,
                      subjectSlug: subjectSlugToSave,
                      fileNames,
                      results: result,
                    };
                    console.log('Save payload:', JSON.stringify(savePayload, null, 2));
                    const saveRes = await fetch('/api/exam-snipe/history', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify(savePayload),
                    });
                    const saveJson = await saveRes.json().catch(() => ({}));
                    console.log('Save response:', { ok: saveRes.ok, status: saveRes.status, json: saveJson });
                    
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
                          commonQuestions: Array.isArray(savedResults?.commonQuestions) && savedResults.commonQuestions.length > 0
                            ? savedResults.commonQuestions.map((q: any) => ({
                                question: String(q?.question || ""),
                                examCount: Number(q?.examCount || 0),
                                averagePoints: Number(q?.averagePoints || 0),
                              }))
                            : result.commonQuestions,
                          lessonPlans: mergedLessonPlans,
                          generatedLessons: mergedGeneratedLessons,
                          concepts: normalizeConcepts(savedResults?.concepts ?? result.concepts, mergedLessonPlans),
                          detectedLanguage: savedResults?.detectedLanguage || result.detectedLanguage,
                        },
                      };
                      console.log('Exam snipe saved successfully to database');
                    } else {
                      const errorMsg = saveJson?.error || `HTTP ${saveRes.status}`;
                      console.error('Failed to persist exam snipe history:', errorMsg, saveJson);
                      throw new Error(errorMsg);
                    }
                  } catch (persistErr: any) {
                    console.error('Error saving exam snipe history:', persistErr);
                    const errorMessage = persistErr?.message || 'Unknown error';
                    alert(`Failed to save exam snipe to database: ${errorMessage}\n\nThe analysis completed, but it was not saved. Please try again.`);
                    // Create a local record anyway so user can see the results, but it won't be persisted
                    record = {
                      id: slug,
                      courseName,
                      slug,
                      createdAt: new Date(timestamp).toISOString(),
                      fileNames,
                      results: result,
                    };
                  }
                  
                  if (record) {
                    setExamResults(record.results);
                    setActiveHistoryMeta(record);
                    setCurrentFileNames(record.fileNames);
                    setExpandedConcept(null);
                    setSelectedConceptIndex(null);
                    setExamFiles([]);
                    setHistory((prev) => {
                      const filtered = prev.filter((item) => item.slug !== record!.slug);
                      const next = [record!, ...filtered].slice(0, MAX_HISTORY_ITEMS);
                      return next;
                    });
                  }
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

  const renameSnipedExam = async (slug: string, currentName: string) => {
    const next = window.prompt("Rename exam", currentName)?.trim();
    if (!next || next === currentName) return;
    try {
      const res = await fetch("/api/exam-snipe/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug, courseName: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to rename exam (${res.status})`);
      setHistory((prev) =>
        prev.map((item) =>
          item.slug === slug
            ? {
                ...item,
                courseName: next,
                results:
                  item.results && typeof item.results === "object"
                    ? { ...item.results, courseName: next }
                    : item.results,
              }
            : item
        )
      );
      // Update activeHistoryMeta if it's the current one
      if (activeHistoryMeta?.slug === slug) {
        setActiveHistoryMeta((prev) =>
          prev?.slug === slug
            ? {
                ...prev,
                courseName: next,
                results:
                  prev.results && typeof prev.results === "object"
                    ? { ...prev.results, courseName: next }
                    : prev.results,
              }
            : prev
        );
      }
    } catch (err: any) {
      alert(err?.message || "Failed to rename exam");
    } finally {
      setExamMenuOpenFor(null);
    }
  };

  const deleteSnipedExam = async (slug: string) => {
    const ok = window.confirm("Delete this exam analysis?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to delete exam (${res.status})`);
      setHistory((prev) => prev.filter((item) => item.slug !== slug));
      // Clear activeHistoryMeta if it's the deleted one
      if (activeHistoryMeta?.slug === slug) {
        setExamResults(null);
        setActiveHistoryMeta(null);
        setCurrentFileNames([]);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to delete exam");
    } finally {
      setExamMenuOpenFor(null);
    }
  };

  const exportSnipedExam = (record: ExamSnipeRecord) => {
    try {
      const payload = {
        courseName: record.courseName,
        slug: record.slug,
        createdAt: record.createdAt,
        fileNames: record.fileNames,
        results: record.results,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName =
        record.slug ||
        record.courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
        "exam-snipe";
      a.href = url;
      a.download = `${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export exam data");
    } finally {
      setExamMenuOpenFor(null);
    }
  };

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

                {/* Course Selection Dropdown */}
                {subjects.length > 0 && (
                  <div className="w-full max-w-2xl">
                    <label className="block text-sm font-medium text-[var(--foreground)]/70 mb-2">
                      Link to course (optional)
                    </label>
                    <select
                      value={selectedSubjectSlug}
                      onChange={(e) => {
                        const value = e.target.value;
                        console.log('Course selected:', value);
                        setSelectedSubjectSlug(value);
                      }}
                      className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
                    >
                      <option value="">No course selected</option>
                      {subjects.map((subject) => (
                        <option key={subject.slug} value={subject.slug}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={handleExamSnipe}
                  disabled={examFiles.length === 0}
                  className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] !text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Analyze
                </button>

                {history.length > 0 && (
                  <div className="mt-10 w-full">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-[var(--foreground)]">Sniped exams</h2>
                      <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/55">
                        {loadingExamHistory && <GlowSpinner size={18} padding={0} inline ariaLabel="Loading sniped exams" idSuffix="sniped-exam" />}
                        <span>{history.length} saved</span>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {history.map((record) => {
                        const topConcept =
                          record.results?.concepts?.[0]?.name && typeof record.results.concepts[0].name === "string"
                            ? String(record.results.concepts[0].name)
                            : null;
                        const fileCount = record.fileNames.length;
                        return (
                          <div
                            key={record.id}
                            className="relative rounded-2xl bg-[var(--background)] p-5 text-[var(--foreground)] transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.7)] cursor-pointer hover:bg-gradient-to-r hover:from-[var(--accent-cyan)]/5 hover:to-[var(--accent-pink)]/5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                            role="link"
                            tabIndex={0}
                            onClick={() => {
                              setExamResults(record.results);
                              setActiveHistoryMeta(record);
                              setExpandedConcept(null);
                              setSelectedConceptIndex(null);
                              setStreamingText("");
                              setExamFiles([]);
                              setCurrentFileNames(record.fileNames);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setExamResults(record.results);
                                setActiveHistoryMeta(record);
                                setExpandedConcept(null);
                                setSelectedConceptIndex(null);
                                setStreamingText("");
                                setExamFiles([]);
                                setCurrentFileNames(record.fileNames);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold leading-snug truncate">{record.courseName}</div>
                                <div className="mt-1 text-xs text-[var(--foreground)]/55">
                                  {new Date(record.createdAt).toLocaleString(undefined, { dateStyle: "medium" })}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-[10px] uppercase tracking-wide text-[var(--foreground)]/45">
                                  Exam Snipe
                                </div>
                                <button
                                  data-menu-button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExamMenuOpenFor((cur) => (cur === record.slug ? null : record.slug));
                                  }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors !shadow-none"
                                  aria-label="More actions"
                                  title="More actions"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="5" cy="12" r="2" fill="currentColor" />
                                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                                    <circle cx="19" cy="12" r="2" fill="currentColor" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 text-xs text-[var(--foreground)]/60">
                              {fileCount} exam{fileCount === 1 ? "" : "s"}
                              {topConcept ? ` • Top concept: ${topConcept}` : ""}
                            </div>
                            <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[var(--accent-cyan)]/80">
                              <span>Open analysis</span>
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </div>
                            {examMenuOpenFor === record.slug && (
                              <div
                                data-menu-dropdown
                                className="absolute right-4 top-14 z-50 w-40 rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/95 backdrop-blur-md shadow-lg p-2 space-y-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => renameSnipedExam(record.slug, record.courseName)}
                                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                                >
                                  Rename
                                </button>
                                <button
                                  onClick={() => deleteSnipedExam(record.slug)}
                                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[#FFC0DA] hover:bg-[#FF2D96]/20 transition-colors"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => exportSnipedExam(record)}
                                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                                >
                                  Export JSON
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 space-y-6">
                {/* Unified glow spinner */}
                <GlowSpinner size={160} ariaLabel="Analyzing" idSuffix="exam" />
                
                  <div className="text-center space-y-4">
                    {progress >= 100 ? (
                      <>
                        <div className="text-lg font-semibold text-[var(--foreground)] mb-1">Finished!</div>
                        <div className="text-sm text-[var(--foreground)]/70">Analysis complete</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-semibold text-[var(--foreground)] mb-1">Analyzing Exams...</div>
                        <div className="text-sm text-[var(--foreground)]/70">This can take up to 1 minute</div>
                      </>
                    )}
                  
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
                  <div className="text-sm text-[var(--foreground)]">
                    {examResults.gradeInfo.split(',').map((grade: string, idx: number) => (
                      <div key={idx} className={idx > 0 ? 'mt-1' : ''}>
                        {grade.trim()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {examResults.patternAnalysis && (
                <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20">
                  <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Pattern Analysis</div>
                  <div className="text-sm text-[var(--foreground)] leading-relaxed mb-4">
                    {examResults.patternAnalysis}
                  </div>
                  
                  {examResults.commonQuestions && examResults.commonQuestions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[var(--foreground)]/10">
                      <div className="text-xs font-semibold text-[var(--foreground)]/80 mb-2 uppercase tracking-wide">
                        Most Common Exam Questions
                      </div>
                      <ol className="space-y-2 text-sm text-[var(--foreground)]/90">
                        {examResults.commonQuestions.map((q: CommonQuestion, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[var(--foreground)]/50 font-mono text-xs mt-0.5">{idx + 1}.</span>
                            <div className="flex-1">
                              <span>{q.question}</span>
                              <span className="ml-2 text-xs text-[var(--foreground)]/60">
                                ({q.examCount} of {examResults.totalExams} exam{q.examCount !== 1 ? 's' : ''}) ~ {q.averagePoints || 0}p
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
  const generatedMap = (activeHistoryMeta?.results as any)?.generatedLessons?.[concept.name] || {};
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
                  const slugBase = (activeHistoryMeta?.courseName || 'Exam Snipe Lessons')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                  const slug = `${slugBase}-${activeHistoryMeta?.slug || 'exams'}`.slice(0, 64);
                  const topic = concept.name;
                  
                  // Load existing subject data if it exists
                  const existingData = loadSubjectData(slug) || null;
                  
                  // Build lessonsMeta and lessons arrays from all lesson plans
                  const lessonsMeta: Array<{ type: string; title: string; planId?: string }> = [];
                  const lessonsArray: Array<any> = [];
                  const planIdMapping: Record<number, string> = {}; // Map lesson index to planId
                  let clickedLessonIndex = -1;
                  
                  // Get existing lessons to preserve user data (flashcards, quiz answers, etc.)
                  const existingLessons = (existingData?.nodes?.[topic] && typeof existingData.nodes[topic] === 'object' && !Array.isArray(existingData.nodes[topic])) 
                    ? (existingData.nodes[topic] as any).lessons || []
                    : [];
                  
                  (lessons || []).forEach((lessonPlanItem: any, idx: number) => {
                    const lessonPlanId = String(lessonPlanItem.id);
                    const lessonGenerated = generatedMap?.[lessonPlanId] as GeneratedLesson | undefined;
                    const lessonTitle = String(lessonPlanItem.title || `Lesson ${idx + 1}`);
                    
                    // Track which lesson was clicked
                    if (lessonPlanId === planId) {
                      clickedLessonIndex = idx;
                    }
                    
                    // Store mapping of lesson index to planId
                    planIdMapping[idx] = lessonPlanId;
                    
                    // Get existing lesson data to preserve user progress
                    const existingLesson = existingLessons[idx] || {};
                    
                    if (lessonGenerated) {
                      lessonsMeta.push({ type: 'Generated Lesson', title: String(lessonGenerated.title || lessonTitle), planId: lessonPlanId });
                      // MERGE with existing lesson data to preserve flashcards, quiz answers, etc.
                      lessonsArray.push({
                        ...existingLesson, // Keep all existing data (flashcards, quiz progress, etc.)
                        title: String(lessonGenerated.title || lessonTitle),
                        body: String(lessonGenerated.body || ''),
                        // Only update quiz if there's no existing quiz (to preserve user answers/results)
                        quiz: (existingLesson as any)?.quiz?.length 
                          ? (existingLesson as any).quiz 
                          : (Array.isArray(lessonGenerated.quiz) 
                              ? lessonGenerated.quiz.map((q: any) => ({ question: String(q?.question || q || "") }))
                              : []),
                      });
                    } else {
                      lessonsMeta.push({ type: 'Lesson Outline', title: lessonTitle, planId: lessonPlanId });
                      // MERGE with existing lesson data, but keep empty body for Start button
                      lessonsArray.push({
                        ...existingLesson, // Keep all existing data
                        title: lessonTitle,
                        body: '', // Empty body to trigger Start button
                        // Only clear quiz if there's no existing quiz (preserve user data)
                        quiz: (existingLesson as any)?.quiz?.length ? (existingLesson as any).quiz : [],
                      });
                    }
                  });
                  
                  // Merge with existing data
                  const data: StoredSubjectData = {
                    subject: activeHistoryMeta?.courseName || existingData?.subject || 'Exam Snipe Lessons',
                    course_context: (examResults.patternAnalysis || '') + "\n" + (examResults.gradeInfo || '') || existingData?.course_context || '',
                    combinedText: existingData?.combinedText || '',
                    topics: existingData?.topics || [],
                    nodes: {
                      ...(existingData?.nodes || {}),
                      [topic]: {
                        overview: `Lessons generated from Exam Snipe for: ${topic}`,
                        symbols: (existingData?.nodes?.[topic] && typeof existingData.nodes[topic] === 'object' && !Array.isArray(existingData.nodes[topic])) ? (existingData.nodes[topic] as any).symbols || [] : [],
                        lessonsMeta,
                        lessons: lessonsArray,
                        rawLessonJson: (existingData?.nodes?.[topic] && typeof existingData.nodes[topic] === 'object' && !Array.isArray(existingData.nodes[topic])) ? (existingData.nodes[topic] as any).rawLessonJson || [] : [],
                        // Store exam snipe metadata for saving back to history
                        examSnipeMeta: {
                          historySlug: activeHistoryMeta?.slug || '',
                          conceptName: concept.name,
                          planIdMapping,
                        },
                      } as any,
                    },
                    files: existingData?.files || [],
                    progress: existingData?.progress || {},
                  };
                  
                  await saveSubjectDataAsync(slug, data);
                  
                  // Always navigate to the lesson page - if generated, show lesson; if not, show Start button
                  if (clickedLessonIndex >= 0) {
                    router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${clickedLessonIndex}`);
                  } else {
                    router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
                  }
                } catch {}
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
                  const allGeneratedLessons = examResults.generatedLessons || {};
                  const generatedLessonsInConcept = Object.values(allGeneratedLessons[concept.name] || {})
                    .map((l: any, idx: number) => ({
                      index: idx,
                      title: l.title,
                      body: l.body || "",
                    }));

                  // Build exam-snipe specific course context
                  const examContext = [
                    `Course: ${activeHistoryMeta?.courseName || examResults.courseName || 'Exam Snipe Course'}`,
                    examResults.patternAnalysis ? `Exam Pattern: ${examResults.patternAnalysis}` : "",
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
                  const otherConcepts = (examResults.concepts || []).filter((c: any) => c.name !== concept.name);
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

                  // Generate lesson using /api/node-lesson (same as courses)
                  const lessonRes = await fetch('/api/node-lesson', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      subject: activeHistoryMeta?.courseName || examResults.courseName || 'Exam Snipe Course',
                      topic: planItem.title,
                      course_context: examContext + (otherConcepts.length > 0 ? `\n\nOther Main Concepts in this Course (avoid overlap):\n${otherConceptsList}` : "") + (otherLessonsInConceptTitles.length > 0 ? `\n\nOther Lessons Already Generated for "${concept.name}" (avoid duplication):\n${otherLessonsList}` : ""),
                      combinedText: "",
                      topicSummary: topicSummary,
                      lessonsMeta: [{ type: "Concept", title: planItem.title }],
                      lessonIndex: 0,
                      previousLessons: generatedLessonsInConcept.slice(0, currentLessonIdx),
                      generatedLessons: generatedLessonsInConcept.slice(0, currentLessonIdx),
                      otherLessonsMeta: otherLessonsMetaInConcept,
                      courseTopics: (examResults.concepts || []).map((c: any) => c.name),
                      languageName: examResults.detectedLanguage?.name || "English",
                    }),
                  });
                  const lessonJson = await lessonRes.json().catch(() => ({}));
                  if (!lessonRes.ok || !lessonJson?.ok) throw new Error(lessonJson?.error || 'Failed to generate lesson');

                  // Save the lesson to exam-snipe history (pass the generated lesson data)
                  const saveRes = await fetch('/api/exam-snipe/generate-lesson', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      historySlug: activeHistoryMeta?.slug || '',
                      courseName: activeHistoryMeta?.courseName || examResults.courseName || 'Exam Snipe Course',
                      patternAnalysis: examResults.patternAnalysis,
                      conceptName: concept.name,
                      conceptDescription: concept.description,
                      keySkills: plan?.keySkills || [],
                      examConnections: plan?.examConnections || [],
                      planId,
                      planTitle: planItem.title,
                      planSummary: planItem.summary,
                      planObjectives: planItem.objectives || [],
                      detectedLanguage: examResults.detectedLanguage,
                      lessonData: lessonJson.data, // Pass the generated lesson data
                    }),
                  });
                  const saveJson = await saveRes.json().catch(() => ({}));
                  
                  if (saveJson.record) {
                    const updated = normalizeHistoryRecord(saveJson.record);
                    setActiveHistoryMeta(updated);
                    setExamResults(updated.results);
                    setHistory((prev) => {
                      const filtered = prev.filter((r) => r.slug !== updated.slug);
                      return [updated, ...filtered].slice(0, MAX_HISTORY_ITEMS);
                    });
                    
                    // Navigate to the lesson page after generation (like courses do)
                    const slugBase = (updated.courseName || 'Exam Snipe Lessons')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '');
                    const slug = `${slugBase}-${updated.slug || 'exams'}`.slice(0, 64);
                    const topic = concept.name;
                    
                    // Find the lesson index
                    const lessonIdx = (lessons || []).findIndex((l: any) => String(l.id) === planId);
                    if (lessonIdx >= 0) {
                      router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lessonIdx}`);
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
            <div className="mt-6 rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-6">
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
                            historySlug: activeHistoryMeta?.slug || '',
                            courseName: activeHistoryMeta?.courseName || examResults.courseName || 'Exam Snipe Course',
                            totalExams: examResults.totalExams,
                            gradeInfo: examResults.gradeInfo,
                            patternAnalysis: examResults.patternAnalysis,
                            conceptName: concept.name,
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

