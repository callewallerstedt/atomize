"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  loadSubjectData,
  upsertNodeContent,
  upsertNodeContentAsync,
  TopicGeneratedContent,
  TopicGeneratedLesson,
  StoredSubjectData,
  LessonFlashcard,
} from "@/utils/storage";
import { AutoFixMarkdown } from "@/components/AutoFixMarkdown";
import LarsCoach from "@/components/LarsCoach";
import GlowSpinner from "@/components/GlowSpinner";

export default function LessonPage() {
  const params = useParams<{ slug: string; name: string; idx: string }>();
  const router = useRouter();
  const slug = params.slug;
  const title = decodeURIComponent(params.name || "");
  const lessonIndex = Number(params.idx || 0);
  const [content, setContent] = useState<TopicGeneratedContent | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedMap, setCheckedMap] = useState<{ [qi: number]: boolean }>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationPosition, setExplanationPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [explanationWord, setExplanationWord] = useState<string>("");
  const [explanationContent, setExplanationContent] = useState<string>("");
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const contentRef = useState<React.RefObject<HTMLDivElement>>(() => ({ current: null } as any))[0];
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [larsOpen, setLarsOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [flashcardOptionsOpen, setFlashcardOptionsOpen] = useState(false);
  const [flashcardModalOpen, setFlashcardModalOpen] = useState(false);
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [pendingFlashcardCount, setPendingFlashcardCount] = useState<number | null>(null);
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const flashcardCounts = [3, 5, 7, 9] as const;
  const currentLesson = (content?.lessons?.[lessonIndex] ?? null) as TopicGeneratedLesson | null;
  const lessonFlashcards: LessonFlashcard[] = currentLesson?.flashcards ?? [];

  const openFlashcardsViewer = (index = 0, total = lessonFlashcards.length) => {
    if (!total) return;
    const safeIndex = Math.min(Math.max(index, 0), total - 1);
    setCurrentFlashcardIndex(safeIndex);
    setFlashcardFlipped(false);
    setFlashcardModalOpen(true);
    setFlashcardOptionsOpen(false);
  };

  useEffect(() => {
    if (!lessonFlashcards.length) {
      setFlashcardModalOpen(false);
      setFlashcardFlipped(false);
    }
  }, [lessonFlashcards.length]);

  useEffect(() => {
    setFlashcardOptionsOpen(false);
    setFlashcardError(null);
    setPendingFlashcardCount(null);
    setGeneratingFlashcards(false);
    setFlashcardModalOpen(false);
    setFlashcardFlipped(false);
    setCurrentFlashcardIndex(0);
  }, [lessonIndex]);

  const handleCloseFlashcards = () => {
    setFlashcardModalOpen(false);
    setFlashcardFlipped(false);
  };

  async function generateFlashcards(count: number) {
    if (!currentLesson?.body) {
      setFlashcardError("Lesson content is still loading. Try again in a moment.");
      return;
    }
    try {
      setGeneratingFlashcards(true);
      setPendingFlashcardCount(count);
      setFlashcardError(null);
      const res = await fetch("/api/lesson-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectData?.subject || slug,
          topic: title,
          lessonTitle: currentLesson.title,
          lessonBody: currentLesson.body,
          courseContext: subjectData?.course_context || "",
          languageName: subjectData?.course_language_name || "",
          count,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed to generate flashcards (${res.status})`);
      }
      const cards: LessonFlashcard[] = Array.isArray(json.flashcards) ? json.flashcards : [];
      if (!cards.length) {
        throw new Error("No flashcards were returned. Please try again.");
      }
      // Compute next content immediately and persist before user can refresh
      const prevContent = content;
      if (!prevContent || !Array.isArray(prevContent.lessons)) {
        throw new Error("Lesson content not available. Try again.");
      }
      const nextLessons = [...prevContent.lessons];
      const existing = nextLessons[lessonIndex];
      if (!existing) {
        throw new Error("Lesson not available. Try again.");
      }
      const updatedLesson: TopicGeneratedLesson = { ...(existing as TopicGeneratedLesson), flashcards: cards };
      nextLessons[lessonIndex] = updatedLesson;
      const updatedContent: TopicGeneratedContent = { ...prevContent, lessons: nextLessons };

      // Update UI immediately
      setContent(updatedContent);
      // Persist to local storage and server (await server sync to guarantee durability)
      await upsertNodeContentAsync(slug, title, updatedContent as TopicGeneratedContent);

      openFlashcardsViewer(0, cards.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate flashcards";
      setFlashcardError(message);
    } finally {
      setGeneratingFlashcards(false);
      setPendingFlashcardCount(null);
    }
  }

  async function readLesson() {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    try {
      setAudioLoading(true);
      const lessonBody = content?.lessons?.[lessonIndex]?.body || "";
      if (!lessonBody) return;

      // Extract plain text from lesson content
      const response = await fetch('/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lessonBody }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setAudioLoading(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
      setIsPlaying(true);
      setAudioLoading(false);
    } catch (error: any) {
      console.error('Error reading lesson:', error);
      setAudioLoading(false);
      setIsPlaying(false);
    }
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const [subjectData, setSubjectData] = useState<StoredSubjectData | null>(null);
  
  // Load subject data from localStorage and server
  useEffect(() => {
    // Load from localStorage first
    const localData = loadSubjectData(slug);
    setSubjectData(localData);
    
    // Then fetch from server if authenticated
    (async () => {
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        const meJson = await meRes.json().catch(() => ({}));
        if (meJson?.user) {
          const dataRes = await fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, { credentials: "include" });
          const dataJson = await dataRes.json().catch(() => ({}));
          if (dataRes.ok && dataJson?.data) {
            // Merge server data with any richer local data (preserve locally generated flashcards)
            const local = loadSubjectData(slug);
            let merged = dataJson.data as StoredSubjectData;
            try {
              if (local && local.nodes && merged?.nodes) {
                const localNode = local.nodes[title] as any;
                const serverNode = merged.nodes[title] as any;
                if (localNode && typeof localNode === "object") {
                  const outNode = serverNode && typeof serverNode === "object"
                    ? { ...serverNode }
                    : { overview: "", symbols: [], lessons: [] as any[] };
                  const localLessons = Array.isArray(localNode.lessons) ? localNode.lessons : [];
                  const serverLessons = Array.isArray(outNode.lessons) ? outNode.lessons : [];
                  const maxLen = Math.max(localLessons.length, serverLessons.length);
                  const combinedLessons: any[] = new Array(maxLen);
                  for (let i = 0; i < maxLen; i++) {
                    const sl = serverLessons[i];
                    const ll = localLessons[i];
                    if (sl && ll) {
                      combinedLessons[i] = {
                        ...sl,
                        flashcards: Array.isArray(sl.flashcards) && sl.flashcards.length > 0
                          ? sl.flashcards
                          : (Array.isArray(ll.flashcards) ? ll.flashcards : undefined),
                      };
                    } else if (sl) {
                      combinedLessons[i] = sl;
                    } else if (ll) {
                      combinedLessons[i] = ll;
                    } else {
                      combinedLessons[i] = null;
                    }
                  }
                  outNode.lessons = combinedLessons;
                  merged = {
                    ...merged,
                    nodes: {
                      ...merged.nodes,
                      [title]: outNode,
                    },
                  };
                }
              }
            } catch {}
            localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(merged));
            setSubjectData(merged);
          }
        }
      } catch {}
    })();
  }, [slug]);
  
  const courseTopics = useMemo(() => (subjectData?.topics || []).map((t: any) => String(t.name)), [subjectData]);

  useEffect(() => {
    if (!title) return;
    const saved = subjectData?.nodes?.[title] as any;
    if (saved) {
      if (typeof saved === "string") {
        setContent({ overview: saved, symbols: [], lessons: [] });
      } else {
        setContent(saved as TopicGeneratedContent);
      }
    }
  }, [subjectData, title]);

  useEffect(() => {
    (async () => {
      if (!content?.lessonsMeta || content.lessons?.[lessonIndex]?.body) return;
      try {
        setLoading(true);
        setError(null);
        const topicMeta = (subjectData?.topics || []).find((t: any) => String(t.name) === title);
        const res = await fetch("/api/node-lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: subjectData?.subject || slug,
            topic: title,
            course_context: subjectData?.course_context || "",
            combinedText: subjectData?.combinedText || "",
            topicSummary: topicMeta?.summary || "",
            lessonsMeta: content?.lessonsMeta || [],
            lessonIndex,
            previousLessons: (content?.lessons || []).slice(0, lessonIndex),
            courseTopics,
            languageName: subjectData?.course_language_name || "",
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
        const lesson = json.data || {};
        const newContent = { ...(content || { overview: "", symbols: [], lessons: [] }) } as TopicGeneratedContent;
        newContent.lessons = newContent.lessons ? [...newContent.lessons] : [];
        newContent.lessons[lessonIndex] = { title: String(lesson.title || content?.lessonsMeta?.[lessonIndex]?.title || `Lesson ${lessonIndex+1}`), body: String(lesson.body || ""), quiz: Array.isArray(lesson.quiz) ? lesson.quiz.map((q: any) => ({ question: String(q.question || "") })) : [] };
        newContent.rawLessonJson = Array.isArray(newContent.rawLessonJson) ? [...newContent.rawLessonJson] : [];
        newContent.rawLessonJson[lessonIndex] = typeof json.raw === 'string' ? json.raw : JSON.stringify(lesson);
        setContent(newContent);
        upsertNodeContent(slug, title, newContent as any);
        // update progress
        try {
          const savedData = loadSubjectData(slug) as StoredSubjectData | null;
          if (savedData) {
            const total = savedData.progress?.[title]?.totalLessons || (newContent.lessonsMeta?.length || 0);
            const completed = (newContent.lessons || []).filter((l) => l && l.body && l.body.length > 0).length;
            savedData.progress = savedData.progress || {};
            savedData.progress[title] = { totalLessons: total, completedLessons: completed };
            localStorage.setItem("atomicSubjectData:" + slug, JSON.stringify(savedData));
          }
        } catch {}
      } catch (err: any) {
        setError(err?.message || "Failed to generate lesson");
      } finally {
        setLoading(false);
      }
    })();
  }, [content, lessonIndex, slug, subjectData, title, courseTopics]);

  // Wrap text nodes for quick explain
  function wrapTextNode(str: string, parentFull?: string) {
    return str.split(/(\b[\p{L}\p{N}][\p{L}\p{N}\-]*\b)/u).map((token, idx) => {
      const isWord = /^(\b[\p{L}\p{N}][\p{L}\p{N}\-]*\b)$/u.test(token);
      if (!isWord) return token;
      return (
        <span
          key={idx}
          className="hoverable-word cursor-pointer hover:bg-gradient-to-r hover:from-[var(--accent-cyan)]/20 hover:to-[var(--accent-pink)]/20 rounded px-0.5 transition-colors"
          onClick={(e) => onWordClick(token, parentFull || str, e)}
        >
          {token}
        </span>
      );
    });
  }

  function wrapChildren(children: any): any {
    return (Array.isArray(children) ? children : [children]).map((child, i) => {
      if (typeof child === "string") return <span key={i}>{wrapTextNode(child)}</span>;
      if (child && typeof child === "object" && child.props && child.props.children) {
        return { ...child, props: { ...child.props, children: wrapChildren(child.props.children) } };
      }
      return child;
    });
  }

  async function onWordClick(word: string, parentText: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.target) return;

    // Position at middle bottom of screen
    const x = window.innerWidth / 2;
    const y = window.innerHeight - 20; // 20px from bottom

    setExplanationPosition({ x, y });
    setExplanationWord(word);
    setShowExplanation(true);
    setExplanationLoading(true);
    setExplanationError(null);
    setExplanationContent("");

    try {
      const idx = parentText.indexOf(word);
      const localContext = idx >= 0 ? parentText.slice(Math.max(0, idx - 120), Math.min(parentText.length, idx + word.length + 120)) : parentText.slice(0, 240);
      const res = await fetch("/api/quick-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectData?.subject || slug,
          topic: title,
          word,
          localContext,
          courseTopics,
          languageName: subjectData?.course_language_name || ""
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
      setExplanationContent(json.content || "");
    } catch (err: any) {
      setExplanationError(err?.message || "Failed to explain");
    } finally {
      setExplanationLoading(false);
    }
  }


  // Enhance KaTeX spans to be hoverable/clickable for quick explain (symbols)
  useEffect(() => {
    const root = (contentRef as any).current as HTMLElement | null;
    if (!root) return;
    const targets = root.querySelectorAll('.katex .mord, .katex .mrel, .katex .mbin, .katex .mop');
    targets.forEach((el) => {
      const span = el as HTMLElement;
      if (span.dataset.enhanced === '1') return;
      span.dataset.enhanced = '1';
      const text = span.textContent || '';
      if (!text.trim()) return;
      span.classList.add('hoverable-word');
      span.addEventListener('click', (ev) => {
        onWordClick(text.trim(), root.innerText || text, ev as any);
      });
    });
  }, [content, lessonIndex]);

  return (
    <>
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        
        {error ? <div className="mb-4 rounded-xl border border-[var(--accent-pink)]/30 bg-[var(--background)]/60 p-3 text-sm text-[var(--accent-pink)]">{error}</div> : null}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-5">
              <GlowSpinner size={140} ariaLabel="Loading lesson" idSuffix="lesson-detail" />
              <div className="text-sm text-[var(--foreground)]/70">Generating lesson…</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-[var(--foreground)]">{content?.lessons?.[lessonIndex]?.title || content?.lessonsMeta?.[lessonIndex]?.title || `Lesson ${lessonIndex+1}`}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={readLesson}
                    disabled={audioLoading}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 text-[var(--foreground)] hover:bg-[var(--background)]/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isPlaying ? "Stop reading" : "Read lesson"}
                  >
                    {audioLoading ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                      </svg>
                    ) : isPlaying ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 3l14 9-14 9V3z"/>
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const raw = content?.rawLessonJson?.[lessonIndex];
                        if (raw) {
                          await navigator.clipboard.writeText(String(raw));
                        } else {
                          const payload = {
                            title: content?.lessons?.[lessonIndex]?.title || content?.lessonsMeta?.[lessonIndex]?.title || `Lesson ${lessonIndex+1}`,
                            body: content?.lessons?.[lessonIndex]?.body || "",
                            quiz: content?.lessons?.[lessonIndex]?.quiz || [],
                          };
                          await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                        }
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1200);
                      } catch {}
                    }}
                    className="inline-flex h-8 items-center rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 px-3 text-xs text-[var(--foreground)] hover:bg-[var(--background)]/80"
                  >
                    {copied ? 'Copied' : 'Copy lesson'}
                  </button>
                </div>
              </div>
              <div className="lesson-content" ref={contentRef as any} style={{ wordSpacing: '-0.04em' }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: ({ children }) => <p>{wrapChildren(children)}</p>,
                    li: ({ children }) => <li>{wrapChildren(children)}</li>,
                    h1: ({ children }) => <h1>{wrapChildren(children)}</h1>,
                    h2: ({ children }) => <h2>{wrapChildren(children)}</h2>,
                    h3: ({ children }) => <h3>{wrapChildren(children)}</h3>,
                    td: ({ children }) => <td>{wrapChildren(children)}</td>,
                    th: ({ children }) => <th>{wrapChildren(children)}</th>,
                  }}
                >
                  {(() => {
                    // Normalize common LaTeX issues to reduce KaTeX parse errors
                    let processed = content?.lessons?.[lessonIndex]?.body || "";
                    // Convert bracket math markers
                    processed = processed
                      .replace(/\\\[/g, '$$')
                      .replace(/\\\]/g, '$$')
                      .replace(/\\\(/g, '$')
                      .replace(/\\\)/g, '$');
                    return processed;
                  })()}
                </ReactMarkdown>
                <style jsx global>{`
                  .lesson-content p{ margin: 0.45rem 0 !important; }
                  .lesson-content ul, .lesson-content ol{ margin: 0.4rem 0 !important; }
                  .lesson-content h1, .lesson-content h2, .lesson-content h3{ margin-top: 0.6rem !important; margin-bottom: 0.35rem !important; }
                `}</style>
              </div>
              {/* Testing features as dropdown list */}
              <div className="mt-6 space-y-3">
                {/* Practice Problems item */}
                <div className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                  <button
                    onClick={() => setPracticeOpen(!practiceOpen)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors ${practiceOpen ? 'rounded-t-xl border-b border-[var(--foreground)]/10 !shadow-none' : 'rounded-xl'}`}
                  >
                    <span>Practice problems</span>
                    <svg
                      className={`h-4 w-4 transition-transform ${practiceOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {practiceOpen && (content?.lessons?.[lessonIndex]?.quiz?.length || 0) > 0 && (
                    <div className="px-4 pt-4 pb-4">
                      <ol className="list-decimal space-y-2 pl-6 text-sm text-[var(--foreground)]">
                        {content!.lessons![lessonIndex]!.quiz!.map((q, qi) => (
                          <li key={qi} className="flex items-start justify-between gap-3">
                            <span className="flex-1">
                              <AutoFixMarkdown>{q.question}</AutoFixMarkdown>
                            </span>
                            <button
                              className="ml-3 inline-flex h-8 shrink-0 items-center rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 px-3 text-xs text-[var(--foreground)] hover:bg-[var(--background)]/80"
                              onClick={() => setCheckedMap((m) => ({ ...m, [qi]: !m[qi] }))}
                            >
                              {checkedMap[qi] ? 'Checked' : 'Check'}
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                {/* Flashcards item */}
                <div className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                  {flashcardOptionsOpen ? (
                    <>
                      <button
                        onClick={() => {
                          if (generatingFlashcards) return;
                          setFlashcardOptionsOpen(false);
                          setFlashcardError(null);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors rounded-t-xl border-b border-[var(--foreground)]/10 !shadow-none`}
                        title="Close flashcard options"
                      >
                        <span>Flashcards</span>
                        <svg
                          className={`h-4 w-4 transition-transform ${flashcardOptionsOpen ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>
                      <div className="px-4 pt-4 pb-4 space-y-4">
                        <div className="text-sm font-medium text-[var(--foreground)]">
                          Choose how many flashcards to generate
                        </div>
                      <div className="grid grid-cols-4 gap-2">
                        {flashcardCounts.map((count) => (
                          <button
                            key={count}
                            onClick={() => generateFlashcards(count)}
                            disabled={generatingFlashcards}
                            className={`h-9 rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/70 text-sm font-medium text-[var(--foreground)] transition-colors ${generatingFlashcards ? 'opacity-60 cursor-wait' : 'hover:bg-[var(--background)]/50'}`}
                          >
                            {generatingFlashcards && pendingFlashcardCount === count ? 'Generating…' : `${count} cards`}
                          </button>
                        ))}
                      </div>
                      {flashcardError && (
                        <div className="text-xs text-[#FFC0DA]">{flashcardError}</div>
                      )}
                      {lessonFlashcards.length > 0 && (
                        <div className="text-xs text-[var(--foreground)]/70">
                          <button
                            onClick={() => openFlashcardsViewer(0, lessonFlashcards.length)}
                            className="hover:underline !shadow-none"
                          >
                            View saved flashcards ({lessonFlashcards.length})
                          </button>
                        </div>
                      )}
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (generatingFlashcards) return;
                        setFlashcardOptionsOpen(!flashcardOptionsOpen);
                        setFlashcardError(null);
                      }}
                      disabled={!currentLesson?.body}
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors ${flashcardOptionsOpen ? 'rounded-t-xl' : 'rounded-xl'} disabled:opacity-60 disabled:cursor-not-allowed`}
                      title="Generate flashcards from this lesson"
                    >
                      <span>Flashcards</span>
                      <svg
                        className={`h-4 w-4 transition-transform ${flashcardOptionsOpen ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Lars item */}
                <div className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                  <button
                    onClick={() => setLarsOpen(true)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors rounded-xl"
                    title="Open Lars"
                  >
                    <span>Explain for Lars</span>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    {flashcardModalOpen && lessonFlashcards.length > 0 && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="relative w-full max-w-xl rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 p-6 shadow-2xl">
          <button
            onClick={handleCloseFlashcards}
            className="absolute right-4 top-4 h-8 w-8 rounded-full border border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 flex items-center justify-center"
            aria-label="Close flashcards"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="mb-4 flex items-center justify-between text-sm text-[var(--foreground)]/70">
            <span>
              Flashcard {currentFlashcardIndex + 1} of {lessonFlashcards.length}
            </span>
          </div>
          <div className="relative flex items-center justify-center gap-3">
            <button
              onClick={() => {
                if (currentFlashcardIndex === 0) return;
                setCurrentFlashcardIndex((idx) => Math.max(idx - 1, 0));
                setFlashcardFlipped(false);
              }}
              disabled={currentFlashcardIndex === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--foreground)]/20 text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous flashcard"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div
              className="relative h-72 w-full max-w-md cursor-pointer overflow-hidden rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 p-6 text-center shadow-inner"
              onClick={() => setFlashcardFlipped((f) => !f)}
            >
              <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-auto px-4 text-lg font-medium leading-relaxed text-[var(--foreground)] transition-opacity duration-300 ${flashcardFlipped ? 'opacity-0' : 'opacity-100'}`}>
                <AutoFixMarkdown>{lessonFlashcards[currentFlashcardIndex]?.prompt || ""}</AutoFixMarkdown>
              </div>
              <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-auto px-4 text-lg font-medium leading-relaxed text-[var(--foreground)] transition-opacity duration-300 ${flashcardFlipped ? 'opacity-100' : 'opacity-0'}`}>
                <AutoFixMarkdown>{lessonFlashcards[currentFlashcardIndex]?.answer || ""}</AutoFixMarkdown>
              </div>
              <div className="absolute bottom-4 left-0 right-0 text-xs text-[var(--foreground)]/60">
                {flashcardFlipped ? "Tap to view prompt" : "Tap to reveal answer"}
              </div>
            </div>
            <button
              onClick={() => {
                if (currentFlashcardIndex >= lessonFlashcards.length - 1) return;
                setCurrentFlashcardIndex((idx) => Math.min(idx + 1, lessonFlashcards.length - 1));
                setFlashcardFlipped(false);
              }}
              disabled={currentFlashcardIndex >= lessonFlashcards.length - 1}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--foreground)]/20 text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next flashcard"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Word explanation box - rendered as portal to avoid parent CSS transforms */}
    {showExplanation && createPortal(
      <div
        className="fixed inset-0 z-50 pointer-events-auto"
        onClick={() => setShowExplanation(false)}
      >
        <div
          className="fixed z-50 w-[504px] max-w-[calc(100vw-24px)] rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/95 backdrop-blur-sm p-4 text-[var(--foreground)] shadow-2xl pointer-events-auto"
          style={{
            left: `${explanationPosition.x}px`,
            top: `${explanationPosition.y}px`,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {explanationLoading ? (
            <div className="flex items-center gap-3 text-xl">
              <span className="h-4 w-4 animate-pulse rounded-full bg-accent" />
              Generating explanation for "{explanationWord}"…
            </div>
          ) : explanationError ? (
            <div className="text-xl text-[#FFC0DA]">{explanationError}</div>
          ) : (
            <div className="space-y-3">
              <div className="text-xl font-semibold text-[var(--accent-cyan)]">
                "{explanationWord}"
              </div>
              <div className="lesson-content text-xl max-h-64 overflow-y-auto leading-relaxed">
                <AutoFixMarkdown>{explanationContent}</AutoFixMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    , document.body)}
    <LarsCoach open={larsOpen} onClose={() => setLarsOpen(false)} />
    </>
  );
}


