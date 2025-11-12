"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import { loadSubjectData, saveSubjectData, saveSubjectDataAsync, StoredSubjectData, TopicMeta, getLessonsDueForReview, getUpcomingReviews, LessonFlashcard } from "@/utils/storage";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import GlowSpinner from "@/components/GlowSpinner";
 
// Tree view replaced by a simple topic list with actions

type Subject = {
  name: string;
  slug: string;
};

const SUBJECTS_KEY = "atomicSubjects";

function readSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SUBJECTS_KEY);
    return raw ? (JSON.parse(raw) as Subject[]) : [];
  } catch {
    return [];
  }
}

export default function SubjectPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const router = useRouter();
  const [subjectName, setSubjectName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<TopicMeta[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [combinedText, setCombinedText] = useState<string>("");
  const [savedFiles, setSavedFiles] = useState<{ name: string }[]>([]);
  const [progress, setProgress] = useState<{ [topicName: string]: { totalLessons: number; completedLessons: number } }>({});
  const [languagePrompt, setLanguagePrompt] = useState<{ code: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'tree' | 'topics' | 'notes'>('tree');
  const [courseNotes, setCourseNotes] = useState<string>("");
  const [tree, setTree] = useState<{ subject: string; topics: any[] } | null>(null);
  const [addingNode, setAddingNode] = useState(false);
  const [nodes, setNodes] = useState<Record<string, any>>({});
  const [nodeGenerating, setNodeGenerating] = useState<Record<string, boolean>>({});
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopicValue, setNewTopicValue] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [basicsModalOpen, setBasicsModalOpen] = useState(false);
  const [basicsFiles, setBasicsFiles] = useState<File[]>([]);
  const [quickLearnOpen, setQuickLearnOpen] = useState(false);
  const [quickLearnQuery, setQuickLearnQuery] = useState("");
  const [quickLearnLoading, setQuickLearnLoading] = useState(false);
  const [generatingBasics, setGeneratingBasics] = useState(false);
  const [reviewsDue, setReviewsDue] = useState<ReturnType<typeof getLessonsDueForReview>>([]);
  const [upcomingReviews, setUpcomingReviews] = useState<ReturnType<typeof getUpcomingReviews>>([]);
  const [allFlashcardsModalOpen, setAllFlashcardsModalOpen] = useState(false);
  const [allFlashcards, setAllFlashcards] = useState<Array<LessonFlashcard & { topicName: string; lessonTitle: string; id: string }>>([]);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [starredFlashcards, setStarredFlashcards] = useState<Set<string>>(new Set());
  const [showOnlyStarred, setShowOnlyStarred] = useState(false);
  const [isShuffleActive, setIsShuffleActive] = useState(false);

  function getRandomCardIndex(filteredFlashcards: typeof allFlashcards, currentIndex: number): number {
    if (filteredFlashcards.length <= 1) return currentIndex;
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * filteredFlashcards.length);
    } while (newIndex === currentIndex && filteredFlashcards.length > 1);
    return newIndex;
  }

  useEffect(() => {
    const found = readSubjects().find((s) => s.slug === slug);
    setSubjectName(found?.name ?? slug);
    
    // Load starred flashcards from localStorage
    try {
      const saved = localStorage.getItem(`starredFlashcards:${slug}`);
      if (saved) {
        setStarredFlashcards(new Set(JSON.parse(saved)));
      }
    } catch {}
  }, [slug]);

  // Adjust index when filter changes
  useEffect(() => {
    if (allFlashcardsModalOpen && allFlashcards.length > 0) {
      const filteredFlashcards = showOnlyStarred 
        ? allFlashcards.filter(f => starredFlashcards.has(f.id))
        : allFlashcards;
      if (currentFlashcardIndex >= filteredFlashcards.length && filteredFlashcards.length > 0) {
        setCurrentFlashcardIndex(filteredFlashcards.length - 1);
      } else if (filteredFlashcards.length === 0 && showOnlyStarred) {
        // Will show empty state, handled in render
      }
    }
  }, [showOnlyStarred, starredFlashcards, allFlashcards, allFlashcardsModalOpen, currentFlashcardIndex]);

  useEffect(() => {
    const saved = loadSubjectData(slug);
    if (saved?.topics && saved.topics.length) {
      setTopics(saved.topics);
      setCombinedText(saved.combinedText || "");
      setSavedFiles(saved.files || []);
      setCourseNotes(saved.course_notes || "");
      setProgress(saved.progress || {});
      setNodes(saved.nodes || {} as any);
      setTree(saved.tree || { subject: saved.subject || slug, topics: [] });
    } else if (saved?.tree) {
      // legacy fallback: flatten top-level names as topics with equal coverage
      const legacyTopics = (saved.tree?.topics || []).map((t: any) => ({ name: t.name, summary: "", coverage: Math.round(100 / Math.max(1, saved.tree?.topics?.length || 1)) }));
      setTopics(legacyTopics);
      setCombinedText(saved.combinedText || "");
      setSavedFiles(saved.files || []);
      setProgress(saved.progress || {});
      setTree(saved.tree);
      setNodes(saved.nodes || {} as any);
    }
    
    // Load reviews
    setReviewsDue(getLessonsDueForReview(slug));
    setUpcomingReviews(getUpcomingReviews(slug, 7));
  }, [slug]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      addFiles(dropped);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function addFiles(newFiles: File[]) {
    // No client-side size caps; just append
    setFiles((prev) => [...prev, ...newFiles]);
  }

  function collectAllFlashcards() {
    const saved = loadSubjectData(slug);
    if (!saved || !saved.nodes) {
      alert("No flashcards found. Generate flashcards from lessons first.");
      return;
    }

    const flashcards: Array<LessonFlashcard & { topicName: string; lessonTitle: string; id: string }> = [];
    
    // Iterate through all topics (nodes)
    Object.keys(saved.nodes).forEach((topicName) => {
      const node = saved.nodes[topicName];
      if (!node || typeof node !== 'object') return;
      
      // Check if it's the new format with lessons array
      if (Array.isArray(node.lessons)) {
        node.lessons.forEach((lesson: any) => {
          if (lesson && Array.isArray(lesson.flashcards) && lesson.flashcards.length > 0) {
            lesson.flashcards.forEach((flashcard: LessonFlashcard) => {
              // Create unique ID for each flashcard
              const id = `${topicName}:${lesson.title || 'Untitled Lesson'}:${flashcard.prompt}`;
              flashcards.push({
                ...flashcard,
                topicName,
                lessonTitle: lesson.title || 'Untitled Lesson',
                id,
              });
            });
          }
        });
      }
    });

    if (flashcards.length === 0) {
      alert("No flashcards found. Generate flashcards from lessons first.");
      return;
    }

    setAllFlashcards(flashcards);
    setCurrentFlashcardIndex(0);
    setFlashcardFlipped(false);
    setShowOnlyStarred(false);
    setIsShuffleActive(false);
    setAllFlashcardsModalOpen(true);
  }

  function toggleStar(flashcardId: string) {
    const newStarred = new Set(starredFlashcards);
    if (newStarred.has(flashcardId)) {
      newStarred.delete(flashcardId);
    } else {
      newStarred.add(flashcardId);
    }
    setStarredFlashcards(newStarred);
    // Save to localStorage
    try {
      localStorage.setItem(`starredFlashcards:${slug}`, JSON.stringify(Array.from(newStarred)));
    } catch {}
    
    // If showing only starred and we unstarred the current card, adjust index
    if (showOnlyStarred) {
      const filtered = allFlashcards.filter(f => newStarred.has(f.id));
      if (currentFlashcardIndex >= filtered.length && filtered.length > 0) {
        setCurrentFlashcardIndex(filtered.length - 1);
      } else if (filtered.length === 0) {
        setShowOnlyStarred(false);
        setCurrentFlashcardIndex(0);
      }
    }
  }

  async function handleQuickLearn() {
    try {
      setQuickLearnLoading(true);
      const saved = loadSubjectData(slug) as StoredSubjectData | null;

      // Create a temporary topic for the quick learn lesson
      const tempTopicName = `Quick Learn: ${quickLearnQuery.slice(0, 30)}${quickLearnQuery.length > 30 ? '...' : ''}`;

      const res = await fetch('/api/quick-learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subjectName || slug,
          topic: tempTopicName,
          query: quickLearnQuery,
          courseContext: saved?.course_context || "",
          combinedText: saved?.combinedText || "",
          courseTopics: topics?.map(t => t.name) || [],
          languageName: saved?.course_language_name || "",
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);

      // Save to the quicklearn subject instead of the current subject
      const quickLearnSlug = "quicklearn";
      let quickLearnData = loadSubjectData(quickLearnSlug) as StoredSubjectData | null;
      
      if (!quickLearnData) {
        quickLearnData = {
          subject: "Quick Learn",
          course_context: "",
          combinedText: "",
          topics: [],
          nodes: {},
          files: [],
          progress: {},
        };
      }

      if (!quickLearnData.nodes) {
        quickLearnData.nodes = {};
      }

      const lessonTitle = json.data.title || tempTopicName;
      quickLearnData.nodes[lessonTitle] = {
          overview: `Quick lesson on: ${quickLearnQuery}`,
          symbols: [],
        lessonsMeta: [{ type: "Quick Learn", title: lessonTitle }],
          lessons: [{
          title: lessonTitle,
            body: json.data.body,
            quiz: json.data.quiz || [],
            metadata: json.data.metadata || null
          }],
          rawLessonJson: [json.raw || JSON.stringify(json.data)]
        };

      // Save to server (await to ensure it's saved)
      const { saveSubjectDataAsync } = await import("@/utils/storage");
      await saveSubjectDataAsync(quickLearnSlug, quickLearnData);

      // Close modal and navigate to the lesson
      setQuickLearnOpen(false);
      router.push(`/subjects/${quickLearnSlug}/node/${encodeURIComponent(lessonTitle)}`);
    } catch (err: any) {
      alert(err?.message || "Failed to generate quick learn lesson");
    } finally {
      setQuickLearnLoading(false);
    }
  }

  async function handleAnalyze() {
    try {
      if (files.length === 0) {
        setError("Please select at least one file to analyze.");
        return;
      }
      setLoading(true);
      setError(null);
      setTopics(null);
      const form = new FormData();
      form.append("subject", subjectName || slug);
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Server error (${res.status})`);
      if (!json?.ok) throw new Error(json?.error || "Unknown error");
      const gotTopics: TopicMeta[] = json.data?.topics || [];
      setTopics(gotTopics);
      setCombinedText(json.combinedText || "");
      setSavedFiles(json.files || []);
      const saveObj: StoredSubjectData = {
        subject: subjectName || slug,
        files: json.files || [],
        combinedText: json.combinedText || "",
        tree: null,
        topics: gotTopics,
        nodes: {},
        progress: {},
        course_context: json.course_context || "",
        course_language_code: json.detected_language_code || "en",
        course_language_name: json.detected_language_name || "English",
      };
      saveSubjectData(slug, saveObj);
      setProgress({});
      // Language is now auto-set on first analyze; no prompt needed
    } catch (err: any) {
      setError(err?.message || "Failed to analyze files");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        {(generatingBasics || loading) && (
          <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm">
            <GlowSpinner size={160} ariaLabel="Extracting topics" idSuffix="subject-extract" />
            <div className="mt-4 text-lg font-semibold text-[var(--foreground)]">
              {generatingBasics ? 'Generating course basics…' : 'Extracting topics…'}
            </div>
          </div>
        )}
        {/* Reviews Due Banner */}
        {reviewsDue.length > 0 && (
          <div className="mb-6 rounded-xl border border-[#00E5FF] border-opacity-30 bg-[#00E5FF] bg-opacity-10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#00E5FF]">🔔 {reviewsDue.length} lesson{reviewsDue.length > 1 ? 's' : ''} due for review</div>
                <div className="text-xs text-[#A7AFBE] mt-1">Spaced repetition helps you remember!</div>
              </div>
              <button
                onClick={() => {
                  if (reviewsDue.length > 0) {
                    const first = reviewsDue[0];
                    router.push(`/subjects/${slug}/node/${encodeURIComponent(first.topicName)}`);
                  }
                }}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium hover:opacity-95 transition-opacity"
                style={{ backgroundImage: 'var(--accent-grad)', color: 'white' }}
              >
                Review Now
              </button>
            </div>
            {reviewsDue.length > 1 && (
              <div className="mt-3 space-y-1">
                {reviewsDue.slice(0, 3).map((review, idx) => (
                  <Link
                    key={idx}
                    href={`/subjects/${slug}/node/${encodeURIComponent(review.topicName)}`}
                    className="block text-xs text-[var(--foreground)] hover:text-[var(--accent-cyan)] transition-colors"
                  >
                    • {review.topicName} - Lesson {review.lessonIndex + 1}
                  </Link>
                ))}
                {reviewsDue.length > 3 && (
                  <div className="text-xs text-[#A7AFBE]">+ {reviewsDue.length - 3} more</div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Upcoming Reviews Info */}
        {upcomingReviews.length > 0 && reviewsDue.length === 0 && (
          <div className="mb-6 rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4">
            <div className="text-sm text-[var(--foreground)]">📅 {upcomingReviews.length} upcoming review{upcomingReviews.length > 1 ? 's' : ''} in the next 7 days</div>
            <div className="text-xs text-[#A7AFBE] mt-1">Keep up the great work!</div>
          </div>
        )}

        {activeTab === 'tree' && (
          <div className="mt-4">
            <div className="mb-4">
              <button
                onClick={collectAllFlashcards}
                className="w-full rounded-xl bg-gradient-to-r from-[var(--accent-cyan)]/10 to-[var(--accent-pink)]/10 hover:from-[var(--accent-cyan)]/20 hover:to-[var(--accent-pink)]/20 transition-all py-3 px-6 flex items-center justify-center text-base font-semibold text-[var(--foreground)]"
              >
                Flashcards
              </button>
            </div>
              <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-[var(--foreground)]">Topics</div>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--background)]/80 border border-[var(--foreground)]/15"
                  onClick={() => { setNewTopicValue(""); setNewTopicOpen(true); }}
                  aria-label="New topic"
                >
                  +
                </button>
                <button
                  className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-white hover:opacity-95 bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]"
                  style={{ color: 'white' }}
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const saved = loadSubjectData(slug) as StoredSubjectData | null;
                      const res = await fetch('/api/extract-by-ids', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          subject: subjectName || slug,
                          fileIds: saved?.course_file_ids || [],
                          contextText: [saved?.course_context || '', saved?.combinedText || ''].filter(Boolean).join('\n\n')
                        })
                      });
                      const json = await res.json().catch(() => ({}));
                      try { console.log('Extract-by-ids debug:', { filesRead: json?.debug?.filesRead, combinedLength: json?.debug?.combinedLength, combinedPreview: (json?.combinedText || '').slice(0, 500) }); } catch {}
                      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                      const gotTopics: TopicMeta[] = json.data?.topics || [];
                      setTopics(gotTopics);
                      const nextTree = { subject: subjectName || slug, topics: gotTopics.map((t: any) => ({ name: t.name, subtopics: [] })) } as any;
                      setTree(nextTree);
                      if (saved) {
                        saved.topics = gotTopics;
                        saved.tree = nextTree;
                        // Save detected course language if provided
                        if (json.detected_language_code && json.detected_language_name) {
                          saved.course_language_code = json.detected_language_code;
                          saved.course_language_name = json.detected_language_name;
                        }
                        saveSubjectData(slug, saved);
                      }
                    } catch (e: any) {
                      setError(e?.message || 'Failed to generate topics');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Extract Topics
                </button>
              </div>
            </div>
            {tree && tree.topics && tree.topics.length > 0 ? (
              <ul className="divide-y divide-[var(--foreground)]/10 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]">
                {[...tree.topics].sort((a, b) => {
                  const aGen = !!(Array.isArray(nodes?.[a.name]?.lessons) && nodes[a.name].lessons.length > 0);
                  const bGen = !!(Array.isArray(nodes?.[b.name]?.lessons) && nodes[b.name].lessons.length > 0);
                  if (aGen && !bGen) return -1; // Generated first
                  if (!aGen && bGen) return 1;  // Generated first
                  return 0; // Maintain order for same type
                }).map((t: any, i: number) => {
                  const name = t.name;
                  const isGen = !!(Array.isArray(nodes?.[name]?.lessons) && nodes[name].lessons.length > 0);
                  const isGenerating = !!nodeGenerating[name];
                  const isFirst = i === 0;
                  const isLast = i === tree.topics.length - 1;
                  const isOnly = tree.topics.length === 1;
                  const roundedClass = isOnly ? "rounded-t-2xl rounded-b-2xl" : isFirst ? "rounded-t-2xl" : isLast ? "rounded-b-2xl" : "";
                  // Determine if any lesson quiz is completed (has results for all questions)
                  let quizCompleted = false;
                  try {
                    const node = (nodes as any)?.[name];
                    const lessons = Array.isArray(node?.lessons) ? node.lessons : [];
                    for (const l of lessons) {
                      if (!l || !Array.isArray(l.quiz) || l.quiz.length === 0) continue;
                      const results = l.quizResults || {};
                      if (results && Object.keys(results).length >= l.quiz.length) {
                        quizCompleted = true;
                        break;
                      }
                    }
                  } catch {}
                  return (
                    <li key={`${name}-${i}`} className={`group relative flex items-center justify-between px-4 py-3 transition-colors cursor-pointer overflow-hidden ${roundedClass} ${isGen ? 'bg-transparent' : 'hover:bg-[var(--background)]/80'}`} onClick={() => {
                      // Don't navigate if this topic is currently generating
                      if (isGenerating) return;
                      // Use Next.js router for clean navigation without interrupting async operations
                      router.push(`/subjects/${slug}/node/${encodeURIComponent(name)}`);
                    }}>
                      {isGen && (
                        <div className={`pointer-events-none absolute inset-0 opacity-20 ${roundedClass}`} style={{ backgroundImage: 'linear-gradient(90deg, #00E5FF, #FF2D96)' }} />
                      )}
                      <span className={`text-sm transition-colors ${isGen ? 'text-[var(--foreground)] hover:opacity-90' : 'text-[var(--foreground)]/70 hover:text-[var(--foreground)]'}`}>{name}</span>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {isGen && quizCompleted && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] text-green-700 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Done
                          </span>
                        )}
                      {!isGen && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {!isGenerating && (
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (nodeGenerating[name]) return;
                                setNodeGenerating((m) => ({ ...m, [name]: true }));
                                try {
                                  const saved = loadSubjectData(slug) as StoredSubjectData | null;
                                  const topicSummary = (topics || []).find((tt) => tt.name === name)?.summary || "";

                                  // Generate ONE comprehensive lesson directly
                                  const lessonRes = await fetch('/api/node-lesson', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      subject: subjectName || slug,
                                      topic: name,
                                      course_context: (saved?.course_context || ""),
                                      combinedText: saved?.combinedText || "",
                                      topicSummary: topicSummary,
                                      lessonsMeta: [{ type: 'Full Lesson', title: name }],
                                      lessonIndex: 0,
                                      previousLessons: [],
                                      generatedLessons: [],
                                      otherLessonsMeta: [],
                                      courseTopics: (topics || []).map((tt) => tt.name),
                                      languageName: saved?.course_language_name || "",
                                    })
                                  });
                                  const lessonJson = await lessonRes.json().catch(() => ({}));
                                  if (!lessonRes.ok || !lessonJson?.ok) throw new Error(lessonJson?.error || `Server error (${lessonRes.status})`);
                                  const lessonData = lessonJson.data || {};

                                  // Save the generated content
                                  const data = loadSubjectData(slug) as StoredSubjectData | null;
                                  if (data) {
                                    data.nodes = data.nodes || {} as any;
                                    data.nodes[name] = {
                                      overview: topicSummary || '',
                                      symbols: [],
                                      lessonsMeta: [{ type: 'Full Lesson', title: String(lessonData.title || name) }],
                                      lessons: [{
                                        title: String(lessonData.title || name),
                                        body: String(lessonData.body || ''),
                                        quiz: Array.isArray(lessonData.quiz)
                                          ? lessonData.quiz.map((q: any) => ({
                                              question: String(q.question || ''),
                                              answer: q.answer ? String(q.answer) : undefined,
                                            }))
                                          : []
                                      }],
                                      rawLessonJson: [typeof lessonJson.raw === 'string' ? lessonJson.raw : JSON.stringify(lessonData)],
                                    } as any;
                                    await saveSubjectDataAsync(slug, data);
                                    setNodes({ ...data.nodes });
                                  }
                                } catch (e: any) {
                                  console.error('Failed to generate topic:', e);
                                  // Don't show alert to avoid interrupting user interaction
                                  // The UI will still show the failed state
                                } finally {
                                  setNodeGenerating((m) => ({ ...m, [name]: false }));
                                }
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-[11px] text-white shadow cursor-pointer opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 hover:shadow-lg hover:scale-110 hover:bg-gradient-to-r hover:from-[#00E5FF]/80 hover:to-[#FF2D96]/80 transition-all duration-300"
                              aria-label="Generate AI"
                              title="Generate AI"
                            />
                          )}
                          {isGenerating && (
                          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-0.5 text-[11px] text-[var(--foreground)]/70">
                            <GlowSpinner
                              size={28}
                              padding={0}
                              inline
                              className="shrink-0"
                              ariaLabel="Generating topic"
                              idSuffix={`topic-${i}`}
                            />
                            Generating…
                          </span>
                          )}
                        </div>
                      )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-6 text-center text-sm text-[var(--foreground)]/70">No topics yet.</div>
            )}
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-xl border border-[#3A1E2C] bg-[#1B0F15] p-3 text-sm text-[#FFC0DA]">
            {error}
          </div>
        ) : null}

        {activeTab === 'topics' && (
          <>
            <div className="mt-6">
              <button
                onClick={collectAllFlashcards}
                className="w-full rounded-xl bg-gradient-to-r from-[var(--accent-cyan)]/10 to-[var(--accent-pink)]/10 hover:from-[var(--accent-cyan)]/20 hover:to-[var(--accent-pink)]/20 transition-all py-3 px-6 flex items-center justify-center text-base font-semibold text-[var(--foreground)]"
              >
                Flashcards
              </button>
            </div>
            {topics ? (
              <>
                <div className="mt-4">
              <input
                value={query}
                onChange={(e) => { if (!e.target) return; setQuery(e.target.value); }}
                placeholder="Search topics..."
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none"
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topics
                .filter((t) =>
                  query.trim() ? (t.name + " " + (t.summary || "")).toLowerCase().includes(query.toLowerCase()) : true
                )
                .map((t, i) => {
                  const p = progress[t.name];
                  const pct = p && p.totalLessons > 0 ? Math.round((p.completedLessons / p.totalLessons) * 100) : 0;
                  return (
                    <div
                      key={`${t.name}-${i}`}
                      className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 cursor-pointer"
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/subjects/${slug}/node/${encodeURIComponent(t.name)}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/subjects/${slug}/node/${encodeURIComponent(t.name)}`);
                        }
                      }}
                    >
                      <div className="flex h-full flex-col gap-3">
                        <div className="min-h-[48px]">
                          <span className="block text-base font-semibold text-[var(--foreground)] hover:underline">{t.name}</span>
                          <div className="mt-1 truncate text-sm text-[#A7AFBE]" title={t.summary}>{t.summary}</div>
                        </div>
                        <div className="mt-1">
                          <div className="mb-1 flex items-center justify-between text-xs text-[#9AA3B2]">
                            <span>Progress</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-[#1A2230]">
                            <div className="h-2 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
            ) : (
              <div className="mt-4 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-6 text-center text-sm text-[var(--foreground)]/70">
                No topics yet.
              </div>
            )}
          </>
        )}

        {activeTab === 'notes' && (
          <div className="mt-6">
            <textarea
              value={courseNotes}
              onChange={(e) => {
                if (!e.target) return;
                setCourseNotes(e.target.value);
                try {
                  const data = loadSubjectData(slug) as StoredSubjectData | null;
                  if (data) {
                    data.course_notes = e.target.value;
                    saveSubjectData(slug, data);
                  }
                } catch {}
              }}
              onTouchStart={(e) => {
                // Ensure focus works on iOS PWA
                e.currentTarget.focus();
              }}
              rows={12}
              className="w-full resize-y rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-4 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
              placeholder="Write course notes..."
              tabIndex={0}
              style={{
                WebkitUserSelect: 'text',
                WebkitTouchCallout: 'none',
                WebkitAppearance: 'none'
              }}
            />
          </div>
        )}
        <Modal
          open={!!languagePrompt}
          onClose={() => setLanguagePrompt(null)}
          title="Use detected language?"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setLanguagePrompt(null)} className="inline-flex h-9 items-center rounded-full px-4 text-sm" style={{ backgroundColor: '#141923', color: 'white' }}>Keep English</button>
              <button
                onClick={() => {
                  try {
                    const saved = loadSubjectData(slug) as StoredSubjectData | null;
                    if (saved && languagePrompt) {
                      saved.course_language_code = languagePrompt.code;
                      saved.course_language_name = languagePrompt.name;
                      localStorage.setItem("atomicSubjectData:" + slug, JSON.stringify(saved));
                    }
                  } catch {}
                  setLanguagePrompt(null);
                }}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium"
                style={{ backgroundImage: 'var(--accent-grad)', color: 'white' }}
              >Use {languagePrompt?.name}</button>
            </div>
          }
        >
          <div className="text-sm text-[#A7AFBE]">We detected {languagePrompt?.name}. Do you want to use it for this course?</div>
        </Modal>
        <Modal
          open={basicsModalOpen}
          onClose={() => { if (!generatingBasics) setBasicsModalOpen(false); }}
          title="Extract Topics"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setBasicsModalOpen(false)} className="inline-flex h-9 items-center rounded-full px-4 text-sm" style={{ backgroundColor: '#141923', color: 'white' }} disabled={generatingBasics}>Cancel</button>
              <button
                onClick={async () => {
                  try {
                    setGeneratingBasics(true);
                    const saved = loadSubjectData(slug) as StoredSubjectData | null;
                    const fileIds = saved?.course_file_ids || [];

                    // Use existing file IDs if available, otherwise upload new files
                    let usedFileIds = fileIds;
                    if (!usedFileIds.length && basicsFiles.length > 0) {
                      // Upload new files to get IDs
                      const uploadForm = new FormData();
                      for (const f of basicsFiles) uploadForm.append('files', f);
                      const uploadRes = await fetch('/api/upload-course-files', { method: 'POST', body: uploadForm });
                      const uploadJson = await uploadRes.json().catch(() => ({}));
                      if (uploadRes.ok && uploadJson?.ok && Array.isArray(uploadJson.fileIds)) {
                        usedFileIds = uploadJson.fileIds;
                        // Save the file IDs
                        if (saved) {
                          saved.course_file_ids = usedFileIds;
                          saveSubjectData(slug, saved);
                        }
                      }
                    }

                    const res = await fetch('/api/extract-by-ids', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        subject: subjectName || slug,
                        fileIds: usedFileIds,
                        contextText: [saved?.course_context || '', saved?.combinedText || ''].filter(Boolean).join('\n\n')
                      })
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                    const gotTopics: TopicMeta[] = json.data?.topics || [];

                    // Merge with existing topics instead of replacing
                    const existingTopics = topics || [];
                    const existingTopicNames = new Set(existingTopics.map(t => t.name));
                    const newTopics = gotTopics.filter(t => !existingTopicNames.has(t.name));
                    const mergedTopics = [...existingTopics, ...newTopics];

                    setTopics(mergedTopics);
                    const nextTree = { subject: subjectName || slug, topics: mergedTopics.map((t: any) => ({ name: t.name, subtopics: [] })) } as any;
                    setTree(nextTree);
                    const data = loadSubjectData(slug) as StoredSubjectData | null;
                    if (data) {
                      data.topics = mergedTopics;
                      data.tree = nextTree;
                      data.combinedText = json.combinedText || data.combinedText || '';
                      data.course_context = json.course_context || data.course_context || '';
                      data.course_language_code = json.detected_language_code || data.course_language_code;
                      data.course_language_name = json.detected_language_name || data.course_language_name;
                      saveSubjectData(slug, data);
                    }
                    setBasicsModalOpen(false);
                  } catch (e: any) {
                    console.error('Failed to extract topics:', e);
                    // Show error in UI instead of blocking alert
                    setError(e?.message || 'Failed to extract topics');
                  } finally {
                    setGeneratingBasics(false);
                  }
                }}
                className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 text-sm font-medium text-white"
                style={{ color: 'white' }}
                disabled={generatingBasics}
              >{generatingBasics ? 'Extracting…' : 'Extract Topics'}</button>
            </div>
          }
        >
          <div>
            <label className="mb-2 block text-xs text-[#A7AFBE]">Attach your course files (PDF, DOCX, TXT, MD)</label>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              onChange={(e) => { if (!e.target?.files) return; setBasicsFiles(Array.from(e.target.files)); }}
              className="block w-full text-sm text-[var(--foreground)] file:mr-4 file:rounded-full file:border-0 file:bg-gradient-to-r file:from-[#00E5FF] file:to-[#FF2D96] file:px-3 file:py-2 file:text-white"
            />
            <div className="mt-2 text-xs text-[#9AA3B2]">We’ll use these plus your saved course summary as context.</div>
          </div>
        </Modal>
        <Modal
          open={newTopicOpen}
          onClose={() => { if (!creatingTopic) { setNewTopicOpen(false); } }}
          title="New topic"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setNewTopicOpen(false)} className="inline-flex h-9 items-center rounded-full px-4 text-sm" style={{ backgroundColor: '#141923', color: 'white' }} disabled={creatingTopic}>Cancel</button>
              <button
                onClick={async () => {
                  const prompt = (newTopicValue || "").trim();
                  if (!prompt) return;
                  try {
                    setCreatingTopic(true);
                      const res = await fetch('/api/topic-suggest', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        subject: subjectName || slug,
                        prompt,
                        course_context: courseNotes || loadSubjectData(slug)?.course_context || "",
                        combinedText,
                          tree: tree || { subject: subjectName || slug, topics: [] },
                          fileIds: (loadSubjectData(slug) as StoredSubjectData | null)?.course_file_ids || [],
                      })
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                    const { name, overview } = json.data || {};
                    if (!name) throw new Error('No name');
                    const nextTree = { subject: subjectName || slug, topics: [...(tree?.topics || []), { name, subtopics: [] }] } as any;
                    setTree(nextTree);
                    const data = loadSubjectData(slug) as StoredSubjectData | null;
                    if (data) {
                      data.tree = nextTree;
                      data.topics = Array.isArray(data.topics) ? [...data.topics, { name, summary: overview?.slice(0, 140) || '', coverage: 0 }] : [{ name, summary: overview?.slice(0, 140) || '', coverage: 0 }];
                      data.nodes = data.nodes || {};
                      data.nodes[name] = { overview: overview || '', symbols: [], lessons: [], lessonsMeta: [] } as any;
                      saveSubjectData(slug, data);
                    }
                    setNewTopicOpen(false);
                  } catch (e: any) {
                    console.error('Failed to add topic:', e);
                    setError(e?.message || 'Failed to add topic');
                  } finally {
                    setCreatingTopic(false);
                  }
                }}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]"
                disabled={creatingTopic}
              >{creatingTopic ? 'Adding…' : 'Add topic'}</button>
            </div>
          }
        >
          <div>
            <label className="mb-2 block text-xs text-[#A7AFBE]">Topic name or question</label>
            <input
              value={newTopicValue}
              onChange={(e) => { if (!e.target) return; setNewTopicValue(e.target.value); }}
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none"
              placeholder="e.g. Linear Algebra basics or ‘What is eigenvalue?’"
            />
          </div>
        </Modal>

        <Modal open={quickLearnOpen} onClose={() => setQuickLearnOpen(false)}>
          <div className="relative space-y-4">
            {quickLearnLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[var(--background)]/95 backdrop-blur-md">
                <GlowSpinner size={120} ariaLabel="Generating quick lesson" idSuffix="subject-quicklesson" />
                <div className="text-sm font-medium text-[var(--foreground)]/80">Generating lesson…</div>
              </div>
            )}
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Quick Learn</h3>
            <div>
              <label className="mb-2 block text-xs text-[var(--foreground)]/70">What do you want to learn?</label>
              <textarea
                value={quickLearnQuery}
                onChange={(e) => { if (!e.target) return; setQuickLearnQuery(e.target.value); }}
                onTouchStart={(e) => {
                  // Ensure focus works on iOS PWA
                  e.currentTarget.focus();
                }}
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
                placeholder="e.g. How does binary search work? Or paste a question from your course materials..."
                rows={4}
                tabIndex={0}
                style={{
                  WebkitUserSelect: 'text',
                  WebkitTouchCallout: 'none',
                  WebkitAppearance: 'none'
                }}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setQuickLearnOpen(false)}
                className="rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/60"
                disabled={quickLearnLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleQuickLearn}
                disabled={!quickLearnQuery.trim() || quickLearnLoading}
              className="inline-flex h-10 items-center rounded-full px-6 text-sm font-medium hover:opacity-95 disabled:opacity-60 transition-opacity"
              style={{ backgroundImage: 'var(--accent-grad)', color: 'white' }}
              >
                {quickLearnLoading ? "Generating..." : "Generate Lesson"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-4">
            <GlowSpinner size={160} ariaLabel="Analyzing files" idSuffix="subject-analyze" />
            <div className="text-base font-medium text-[var(--foreground)]">Analyzing files…</div>
          </div>
        </div>
      )}

      {/* All Course Flashcards Modal */}
      {allFlashcardsModalOpen && allFlashcards.length > 0 && (() => {
        const filteredFlashcards = showOnlyStarred 
          ? allFlashcards.filter(f => starredFlashcards.has(f.id))
          : allFlashcards;
        const currentCard = filteredFlashcards[currentFlashcardIndex];
        const isStarred = currentCard ? starredFlashcards.has(currentCard.id) : false;
        
        return filteredFlashcards.length > 0 ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="relative w-full max-w-xl rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 p-6 shadow-2xl">
              <button
                onClick={() => {
                  setAllFlashcardsModalOpen(false);
                  setFlashcardFlipped(false);
                }}
                className="absolute right-4 top-4 h-8 w-8 rounded-full border border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 flex items-center justify-center"
                aria-label="Close flashcards"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="mb-4">
                <div className="mb-1">
                  <span className="text-sm text-[var(--foreground)]/70">
                    Flashcard {currentFlashcardIndex + 1} of {filteredFlashcards.length}
                    {showOnlyStarred && <span className="text-xs ml-1">(starred only)</span>}
                  </span>
                </div>
                <div className="text-xs text-[var(--foreground)]/50 text-left">
                  {currentCard?.topicName} • {currentCard?.lessonTitle}
                </div>
              </div>
              <div className="relative flex items-center justify-center gap-3">
                <div
                  className="inline-flex rounded-xl transition-all duration-300 overflow-hidden"
                  style={{
                    padding: '1.5px',
                    background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    opacity: (!isShuffleActive && currentFlashcardIndex === 0) ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!(!isShuffleActive && currentFlashcardIndex === 0)) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(!isShuffleActive && currentFlashcardIndex === 0)) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                    }
                  }}
                >
                  <button
                    onClick={() => {
                      if (isShuffleActive) {
                        const newIndex = getRandomCardIndex(filteredFlashcards, currentFlashcardIndex);
                        setCurrentFlashcardIndex(newIndex);
                      } else {
                        if (currentFlashcardIndex === 0) return;
                        setCurrentFlashcardIndex((idx) => Math.max(idx - 1, 0));
                      }
                      setFlashcardFlipped(false);
                    }}
                    disabled={!isShuffleActive && currentFlashcardIndex === 0}
                    className="flex h-10 w-10 items-center justify-center text-white bg-[var(--background)]/90 backdrop-blur-md transition-all duration-300 ease-out disabled:cursor-not-allowed"
                    style={{
                      borderRadius: 'calc(0.75rem - 1.5px)',
                    }}
                    aria-label="Previous flashcard"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                </div>
                <div
                  className="relative h-72 w-full max-w-md cursor-pointer overflow-hidden rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 p-6 text-center shadow-inner"
                  onClick={() => setFlashcardFlipped((f) => !f)}
                >
                  {/* Low opacity spinner background */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.08 }}>
                    <GlowSpinner size={120} ariaLabel="" idSuffix="flashcard-bg" />
                  </div>
                  
                  {currentCard && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleStar(currentCard.id);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/90 backdrop-blur-sm text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 transition-colors pointer-events-auto"
                      style={{ pointerEvents: 'auto' }}
                      aria-label={isStarred ? "Unstar flashcard" : "Star flashcard"}
                    >
                      <svg 
                        className={`h-5 w-5 transition-colors ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} 
                        viewBox="0 0 24 24" 
                        fill={isStarred ? "currentColor" : "none"} 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </button>
                  )}
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-auto px-4 text-lg font-medium leading-relaxed text-[var(--foreground)] transition-opacity duration-300 z-10 pointer-events-none ${flashcardFlipped ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="pointer-events-auto">
                      <LessonBody body={sanitizeLessonBody(String(currentCard?.prompt || ""))} />
                    </div>
                  </div>
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-auto px-4 text-lg font-medium leading-relaxed text-[var(--foreground)] transition-opacity duration-300 z-10 pointer-events-none ${flashcardFlipped ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="pointer-events-auto">
                      <LessonBody body={sanitizeLessonBody(String(currentCard?.answer || ""))} />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-xs text-[var(--foreground)]/60 z-10 pointer-events-none">
                    {flashcardFlipped ? "Tap to view prompt" : "Tap to reveal answer"}
                  </div>
                </div>
                <div
                  className="inline-flex rounded-xl transition-all duration-300 overflow-hidden"
                  style={{
                    padding: '1.5px',
                    background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    opacity: (!isShuffleActive && currentFlashcardIndex >= filteredFlashcards.length - 1) ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!(!isShuffleActive && currentFlashcardIndex >= filteredFlashcards.length - 1)) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(!isShuffleActive && currentFlashcardIndex >= filteredFlashcards.length - 1)) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                    }
                  }}
                >
                  <button
                    onClick={() => {
                      if (isShuffleActive) {
                        const newIndex = getRandomCardIndex(filteredFlashcards, currentFlashcardIndex);
                        setCurrentFlashcardIndex(newIndex);
                      } else {
                        if (currentFlashcardIndex >= filteredFlashcards.length - 1) return;
                        setCurrentFlashcardIndex((idx) => Math.min(idx + 1, filteredFlashcards.length - 1));
                      }
                      setFlashcardFlipped(false);
                    }}
                    disabled={!isShuffleActive && currentFlashcardIndex >= filteredFlashcards.length - 1}
                    className="flex h-10 w-10 items-center justify-center text-white bg-[var(--background)]/90 backdrop-blur-md transition-all duration-300 ease-out disabled:cursor-not-allowed"
                    style={{
                      borderRadius: 'calc(0.75rem - 1.5px)',
                    }}
                    aria-label="Next flashcard"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-4 flex justify-center gap-3">
                <div
                  className="inline-flex rounded-xl transition-all duration-300 overflow-hidden"
                  style={{
                    padding: '1.5px',
                    background: isShuffleActive
                      ? 'linear-gradient(135deg, rgba(0, 229, 255, 1), rgba(255, 45, 150, 1))'
                      : 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                    boxShadow: isShuffleActive
                      ? '0 0 20px rgba(0, 229, 255, 0.4), 0 0 40px rgba(255, 45, 150, 0.2)'
                      : '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isShuffleActive) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isShuffleActive) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                    }
                  }}
                >
                  <button
                    onClick={() => setIsShuffleActive(!isShuffleActive)}
                    className="flex h-10 items-center justify-center px-3 text-xs font-medium text-white bg-[var(--background)]/90 backdrop-blur-md transition-all duration-300 ease-out"
                    style={{
                      borderRadius: 'calc(0.75rem - 1.5px)',
                    }}
                    aria-label={isShuffleActive ? "Disable shuffle mode" : "Enable shuffle mode"}
                  >
                    Shuffle
                  </button>
                </div>
                <div
                  className="inline-flex rounded-xl transition-all duration-300 overflow-hidden"
                  style={{
                    padding: '1.5px',
                    background: showOnlyStarred
                      ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.8), rgba(245, 158, 11, 0.8))'
                      : 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                    boxShadow: showOnlyStarred
                      ? '0 0 20px rgba(251, 191, 36, 0.3), 0 0 40px rgba(245, 158, 11, 0.15)'
                      : '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!showOnlyStarred) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showOnlyStarred) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                    }
                  }}
                >
                  <button
                    onClick={() => {
                      setShowOnlyStarred(!showOnlyStarred);
                      setCurrentFlashcardIndex(0);
                      setFlashcardFlipped(false);
                    }}
                    className="flex h-10 items-center gap-1.5 px-3 text-xs font-medium text-white bg-[var(--background)]/90 backdrop-blur-md transition-all duration-300 ease-out"
                    style={{
                      borderRadius: 'calc(0.75rem - 1.5px)',
                    }}
                    aria-label={showOnlyStarred ? "Show all flashcards" : "Show only starred flashcards"}
                  >
                    <svg 
                      className={`h-4 w-4 ${showOnlyStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} 
                      viewBox="0 0 24 24" 
                      fill={showOnlyStarred ? "currentColor" : "none"} 
                      stroke="currentColor" 
                      strokeWidth="2"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    {showOnlyStarred ? 'Starred Only' : 'Show Starred'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="relative w-full max-w-xl rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 p-6 shadow-2xl">
              <button
                onClick={() => {
                  setAllFlashcardsModalOpen(false);
                  setShowOnlyStarred(false);
                }}
                className="absolute right-4 top-4 h-8 w-8 rounded-full border border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 flex items-center justify-center"
                aria-label="Close flashcards"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="text-center py-8">
                <p className="text-[var(--foreground)] mb-4">No starred flashcards yet.</p>
                <button
                  onClick={() => {
                    setShowOnlyStarred(false);
                    setCurrentFlashcardIndex(0);
                  }}
                  className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]"
                >
                  Show All Flashcards
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
