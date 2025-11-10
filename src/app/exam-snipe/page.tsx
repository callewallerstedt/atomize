"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveSubjectData, saveSubjectDataAsync, StoredSubjectData } from "@/utils/storage";
import GlowSpinner from "@/components/GlowSpinner";

type LessonPlan = {
  id: string;
  title: string;
  summary: string;
  objectives: string[];
  estimatedTime?: string;
};

type GeneratedLesson = {
  planId: string;
  title: string;
  body: string;
  createdAt: string;
};

type ExamSnipeResult = {
  courseName: string;
  totalExams: number;
  gradeInfo: string | null;
  patternAnalysis: string | null;
  concepts: any[];
  lessonPlans?: Record<string, { plans: LessonPlan[] }>;
  generatedLessons?: Record<string, Record<string, GeneratedLesson>>;
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

function deriveCourseName(aiName: string | null, concepts: any[], fileNames: string[]): string {
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

function normalizeLessonPlans(raw: any): Record<string, { plans: LessonPlan[] }> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, { plans: LessonPlan[] }> = {};
  for (const key of Object.keys(raw)) {
    const source = raw[key];
    const plansArray = Array.isArray(source?.plans) ? source.plans : [];
    const plans: LessonPlan[] = plansArray.map((plan: any, idx: number) => {
      const title = String(plan?.title || `Lesson ${idx + 1}`);
      const summary = String(plan?.summary || "");
      const objectives = Array.isArray(plan?.objectives)
        ? plan.objectives.map((o: any) => String(o || "")).filter(Boolean)
        : [];
      const estimatedTime = plan?.estimatedTime ? String(plan.estimatedTime) : undefined;
      const id = String(plan?.id || `${key.replace(/\s+/g, "-").toLowerCase()}-${idx}`);
      return { id, title, summary, objectives, estimatedTime };
    });
    out[key] = { plans };
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
  const concepts = Array.isArray(rawResults?.concepts) ? rawResults.concepts : [];
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
  const lessonPlans = normalizeLessonPlans(rawResults?.lessonPlans);
  const generatedLessons = normalizeGeneratedLessons(rawResults?.generatedLessons);
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
    },
  };
}

const MAX_HISTORY_ITEMS = 20;

// PDF.js will be dynamically imported only on client-side

export default function ExamSnipePage() {
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  const [examFiles, setExamFiles] = useState<File[]>([]);
  const [examAnalyzing, setExamAnalyzing] = useState(false);
  const [examResults, setExamResults] = useState<ExamSnipeResult | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [selectedSubConcept, setSelectedSubConcept] = useState<{conceptIndex: number, subConceptIndex: number} | null>(null);
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setLessonGenerating({});
  }, [selectedSubConcept?.conceptIndex, selectedSubConcept?.subConceptIndex]);

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
                  } else if (content.includes('concept') || content.includes('method')) {
                    streamProgress = 65; // Started concept extraction
                  } else if (content.includes('frequency') || content.includes('points')) {
                    streamProgress = 80; // Analyzing frequencies/points
                  } else if (content.includes('detail') || content.includes('breakdown')) {
                    streamProgress = 90; // Creating detailed breakdowns
                  } else {
                    // Incremental progress based on chunk count
                    streamProgress = Math.min(40, 20 + (chunkCount * 1.5));
                  }

                  setProgress(Math.min(95, streamProgress));

                } else if (parsed.type === 'done') {
                  console.log('Analysis complete! Data keys:', Object.keys(parsed.data || {}));
                  console.log('Concepts found:', parsed.data?.concepts?.length || 0);
                  const rawData = parsed.data ?? {};
                  const concepts = Array.isArray(rawData?.concepts) ? rawData.concepts : [];
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
                  const lessonPlans = normalizeLessonPlans(rawData?.lessonPlans);
                  const generatedLessons = normalizeGeneratedLessons(rawData?.generatedLessons);
                  const result: ExamSnipeResult = {
                    courseName,
                    totalExams: Number(rawData?.totalExams ?? rawData?.total_exams ?? examTexts.length) || examTexts.length,
                    gradeInfo: gradeInfoValue,
                    patternAnalysis: patternValue,
                    concepts,
                    lessonPlans,
                    generatedLessons,
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
                          concepts: Array.isArray(savedResults?.concepts) ? savedResults.concepts : result.concepts,
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
                  setSelectedSubConcept(null);
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
          <>
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
                                setSelectedSubConcept(null);
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
          </>
        ) : (
          <>
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
                        {concept.frequency}/{examResults.totalExams} exams • {concept.estimatedTime} study time • {concept.avgPoints}
                      </div>
                    </div>
                    
                    
                    <div className="flex-shrink-0 text-[var(--foreground)]/50">
                      {expandedConcept === i ? '▲' : '▼'}
                    </div>
                  </div>
                  
                  {expandedConcept === i && concept.details && (
                    <div className="border-t border-[var(--foreground)]/10 bg-[var(--background)]/60 p-4">
                      <div className="text-xs font-semibold text-[var(--foreground)]/70 mb-3">Key Concepts to Learn</div>
                      <div className="grid gap-3">
                        {concept.details.map((detail: any, di: number) => (
                          <div
                            key={di}
                            className="rounded-xl p-3 border border-[var(--foreground)]/12 bg-[var(--background)]/70 hover:bg-[var(--background)]/80 cursor-pointer transition-colors shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                            onClick={() => setSelectedSubConcept({ conceptIndex: i, subConceptIndex: di })}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-[var(--foreground)] text-sm mb-1">{detail.name}</div>
                                <div className="text-xs text-[var(--foreground)]/80 leading-relaxed mb-2">{detail.description}</div>
                                <div className="text-xs text-[var(--foreground)]/60 italic">
                                  Example: {detail.example}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span
                                  className="inline-flex items-center rounded-full text-[10px] font-medium px-2 py-0.5"
                                  style={{
                                    padding: '1.25px',
                                    background: 'linear-gradient(135deg, rgba(0,229,255,0.6), rgba(255,45,150,0.6))',
                                  }}
                                >
                                  <span
                                    className="rounded-full px-2 py-0.5 bg-[var(--background)]/90 text-[var(--foreground)]/80"
                                    style={{ borderRadius: 'calc(9999px - 1.25px)' }}
                                  >
                                    {detail.difficulty}
                                  </span>
                                </span>
                                <span
                                  className="inline-flex items-center rounded-full text-[10px] font-medium px-2 py-0.5"
                                  style={{
                                    padding: '1.25px',
                                    background: 'linear-gradient(135deg, rgba(0,229,255,0.6), rgba(255,45,150,0.6))',
                                  }}
                                >
                                  <span
                                    className="rounded-full px-2 py-0.5 bg-[var(--background)]/90 text-[var(--foreground)]/80"
                                    style={{ borderRadius: 'calc(9999px - 1.25px)' }}
                                  >
                                    {detail.priority} priority
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
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
                Focus on concepts that appear frequently across exams.
                These are the most important topics to master for your course.
              </p>
              <div className="text-sm text-[var(--foreground)]/70">
                <strong>Top 3 priorities:</strong> Start with concepts ranked 1-3 above.
                These appear frequently, especially in recent exams, making them the most efficient targets.
              </div>
            </div>

            {/* Footer Tips */}
            <div className="mt-4 rounded-lg bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20 p-4">
              <div className="text-xs text-[var(--foreground)]/70">
                <strong className="text-[var(--foreground)]">Pro Tips:</strong><br/>
                • Start with top-ranked concepts for maximum efficiency<br/>
                • High frequency concepts are more likely to appear again<br/>
                • Balance concept frequency with your current knowledge level
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sub-Concept Details Modal */}
      {selectedSubConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div
            className="w-full max-w-2xl rounded-2xl p-6 text-[var(--foreground)] shadow-2xl"
            style={{
              padding: '1.5px',
              background: 'linear-gradient(135deg, rgba(0,229,255,0.8), rgba(255,45,150,0.8))',
            }}
          >
            <div className="rounded-[calc(1rem-1.5px)] border border-[var(--foreground)]/10 bg-[var(--background)]/95 backdrop-blur-md p-6 max-h-[90vh] overflow-y-auto">
            {(() => {
              const concept = examResults.concepts[selectedSubConcept.conceptIndex];
              const subConcept = concept.details[selectedSubConcept.subConceptIndex];

              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-[var(--foreground)]/40">Concept Plan</div>
                      <h3 className="text-lg font-semibold text-[var(--foreground)] mt-0.5">{subConcept.name}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedSubConcept(null)}
                      className="h-8 w-8 rounded-full border border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 flex items-center justify-center"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <span
                        className="inline-flex items-center rounded-full text-xs font-medium px-3 py-1"
                        style={{ padding: '1.25px', background: 'linear-gradient(135deg, rgba(0,229,255,0.6), rgba(255,45,150,0.6))' }}
                      >
                        <span className="rounded-full px-3 py-1 bg-[var(--background)]/90 text-[var(--foreground)]/80" style={{ borderRadius: 'calc(9999px - 1.25px)' }}>
                          {subConcept.difficulty}
                        </span>
                      </span>
                      <span
                        className="inline-flex items-center rounded-full text-xs font-medium px-3 py-1"
                        style={{ padding: '1.25px', background: 'linear-gradient(135deg, rgba(0,229,255,0.6), rgba(255,45,150,0.6))' }}
                      >
                        <span className="rounded-full px-3 py-1 bg-[var(--background)]/90 text-[var(--foreground)]/80" style={{ borderRadius: 'calc(9999px - 1.25px)' }}>
                          {subConcept.priority} priority
                        </span>
                      </span>
                    </div>

                    <div className="rounded-xl bg-[var(--background)]/70 p-4 border border-[var(--foreground)]/12">
                      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">What to Learn</h4>
                      <p className="text-sm text-[var(--foreground)]/85 leading-relaxed">{subConcept.description}</p>
                    </div>

                    <div className="rounded-xl bg-[var(--background)]/70 p-4 border border-[var(--foreground)]/12">
                      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">Example</h4>
                      <p className="text-sm text-[var(--foreground)]/70 italic">{subConcept.example}</p>
                    </div>

                    <div className="rounded-xl bg-[var(--background)]/70 p-4 border border-[var(--foreground)]/12">
                      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">Technical Components</h4>
                      <div className="space-y-3">
                        <div className="text-sm text-[var(--foreground)]/85 leading-relaxed">
                          {subConcept.description}
                        </div>

                        <div>
                          <div className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Key Skills to Master:</div>
                          <div className="flex flex-wrap gap-1">
                            {(subConcept.components || 'implementation, application, problem-solving').split(', ').map((component: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-[var(--background)]/80 border border-[var(--foreground)]/15 rounded text-xs text-[var(--foreground)]/80 font-medium"
                              >
                                {component.trim()}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Difficulty/Priority already shown in header, avoid duplication */}

                        {subConcept.learning_objectives && (
                          <div>
                            <div className="text-xs font-medium text-[var(--foreground)]/80 mb-2">Learning Objectives</div>
                            <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
                              {subConcept.learning_objectives.split(', ').map((objective: string, idx: number) => (
                                <li key={idx}>{objective}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {subConcept.common_pitfalls && (
                          <div>
                            <div className="text-xs font-medium text-[var(--foreground)]/80 mb-2">Common Pitfalls</div>
                            <ul className="text-xs text-[var(--foreground)]/85 space-y-1 list-disc list-inside">
                              {subConcept.common_pitfalls.split(', ').map((pitfall: string, idx: number) => (
                                <li key={idx}>{pitfall}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="text-xs text-[var(--foreground)]/65">
                          Exam frequency: appeared in {examResults.totalExams} exam(s)
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--foreground)]/10">
                      <button
                        onClick={() => setSelectedSubConcept(null)}
                        className="rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80"
                      >
                        Close
                      </button>
                      <button
                        disabled={generatingPlan}
                        onClick={async () => {
                          if (!selectedSubConcept) return;
                          try {
                            setGeneratingPlan(true);
                            const concept = examResults.concepts[selectedSubConcept.conceptIndex];
                            const sub = concept.details[selectedSubConcept.subConceptIndex];
                            const payload = {
                              historySlug: activeHistoryMeta?.slug || "",
                              courseName: activeHistoryMeta?.courseName || examResults.courseName || "Exam Snipe Course",
                              totalExams: examResults.totalExams,
                              gradeInfo: examResults.gradeInfo,
                              patternAnalysis: examResults.patternAnalysis,
                              conceptName: concept.name,
                              subConceptName: sub.name,
                              description: sub.description,
                              example: sub.example,
                              components: sub.components,
                              learning_objectives: sub.learning_objectives,
                              common_pitfalls: sub.common_pitfalls,
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

                    {/* Concept plan and lesson generation */}
                    {(() => {
                      const concept = examResults.concepts[selectedSubConcept.conceptIndex];
                      const sub = concept.details[selectedSubConcept.subConceptIndex];
                      const plans = activeHistoryMeta?.results?.lessonPlans?.[sub.name]?.plans || [];
                      const rawGenerated = activeHistoryMeta?.results?.generatedLessons?.[sub.name];
                      const generatedMap = Array.isArray(rawGenerated)
                        ? rawGenerated.reduce<Record<string, GeneratedLesson>>((acc, lesson, legacyIdx) => {
                            const planId = String((lesson as any)?.planId || `legacy-${legacyIdx}`);
                            acc[planId] = {
                              planId,
                              title: String((lesson as any)?.title || `Lesson ${legacyIdx + 1}`),
                              body: String((lesson as any)?.body || ""),
                              createdAt: (lesson as any)?.createdAt ? String((lesson as any).createdAt) : new Date().toISOString(),
                            };
                            return acc;
                          }, {})
                        : rawGenerated || {};
                      if (plans.length === 0) return null;
                      return (
                        <div className="mt-6">
                          <div className="text-sm font-semibold text-[var(--foreground)] mb-3">Concept Plan</div>
                          <div className="space-y-3">
                            {plans.map((plan, idx) => {
                              const generated = generatedMap?.[plan.id];
                              return (
                                <div
                                  key={plan.id}
                                  className="rounded-2xl border border-[var(--foreground)]/12 bg-[var(--background)]/70 p-4 transition-colors hover:bg-[var(--background)]/80 shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-[var(--foreground)]/80"
                                          style={{
                                            padding: '1px',
                                            background: 'linear-gradient(135deg, rgba(0,229,255,0.8), rgba(255,45,150,0.8))',
                                          }}
                                        >
                                          <span
                                            className="flex h-full w-full items-center justify-center rounded-full bg-[var(--background)]/90"
                                            style={{ borderRadius: 'calc(9999px - 1px)' }}
                                          >
                                            {idx + 1}
                                          </span>
                                        </span>
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-[var(--foreground)] truncate">{plan.title}</div>
                                          {plan.summary && <div className="text-xs text-[var(--foreground)]/60 mt-1">{plan.summary}</div>}
                                        </div>
                                      </div>
                                      {plan.objectives && plan.objectives.length > 0 && (
                                        <ul className="mt-3 list-disc list-inside text-xs text-[var(--foreground)]/70 space-y-1">
                                          {plan.objectives.map((objective, objectiveIdx) => (
                                            <li key={objectiveIdx}>{objective}</li>
                                          ))}
                                        </ul>
                                      )}
                                      {plan.estimatedTime && (
                                        <div className="mt-2 text-xs text-[var(--foreground)]/60">Estimated study time: {plan.estimatedTime}</div>
                                      )}
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                      {generated ? (
                                        <>
                                          <span className="text-[10px] uppercase tracking-wide text-[var(--foreground)]/50">Ready</span>
                                          <div className="flex items-center gap-2">
                                            <button
                                              className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-3 text-xs font-medium text-white hover:opacity-95"
                                              onClick={() => {
                                                (async () => {
                                                  try {
                                                    const slugBase = (activeHistoryMeta?.courseName || 'Exam Snipe Lessons').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                                                    const slug = `${slugBase}-${activeHistoryMeta?.slug || 'exams'}`.slice(0, 64);
                                                    const topic = sub.name;
                                                    const data: StoredSubjectData = {
                                                      subject: activeHistoryMeta?.courseName || 'Exam Snipe Lessons',
                                                      course_context: (examResults.patternAnalysis || '') + '\n' + (examResults.gradeInfo || ''),
                                                      combinedText: '',
                                                      topics: [],
                                                      nodes: {
                                                        [topic]: {
                                                          overview: `Lessons generated from Exam Snipe for: ${topic}`,
                                                          symbols: [],
                                                          lessonsMeta: [{ type: 'Generated Lesson', title: String(generated.title || plan.title) }],
                                                          lessons: [{ title: String(generated.title || plan.title), body: String(generated.body || ''), quiz: [] }],
                                                          rawLessonJson: [],
                                                        }
                                                      },
                                                      files: [],
                                                      progress: {},
                                                    };
                                                    await saveSubjectDataAsync(slug, data);
                                                    setSelectedSubConcept(null);
                                                    router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
                                                  } catch {}
                                                })();
                                              }}
                                            >
                                              Open
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <button
                                          disabled={lessonGenerating[plan.id]}
                                          onClick={async () => {
                                            if (!selectedSubConcept) return;
                                            setLessonGenerating((prev) => ({ ...prev, [plan.id]: true }));
                                            try {
                                              const concept = examResults.concepts[selectedSubConcept.conceptIndex];
                                              const subConcept = concept.details[selectedSubConcept.subConceptIndex];
                                              const payload = {
                                                historySlug: activeHistoryMeta?.slug || "",
                                                courseName: activeHistoryMeta?.courseName || examResults.courseName || "Exam Snipe Course",
                                                conceptName: concept.name,
                                                subConceptName: subConcept.name,
                                                planId: plan.id,
                                                planTitle: plan.title,
                                                planSummary: plan.summary,
                                                planObjectives: plan.objectives,
                                                planEstimatedTime: plan.estimatedTime,
                                                totalExams: examResults.totalExams,
                                                gradeInfo: examResults.gradeInfo,
                                                patternAnalysis: examResults.patternAnalysis,
                                                description: subConcept.description,
                                                example: subConcept.example,
                                                components: subConcept.components,
                                                learning_objectives: subConcept.learning_objectives,
                                                common_pitfalls: subConcept.common_pitfalls,
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
                                              setLessonGenerating((prev) => ({ ...prev, [plan.id]: false }));
                                            }
                                          }}
                                          className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-3 text-xs font-medium text-white hover:opacity-95 disabled:opacity-60"
                                        >
                                          {lessonGenerating[plan.id] ? 'Generating…' : 'Generate Lesson'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              );
            })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

