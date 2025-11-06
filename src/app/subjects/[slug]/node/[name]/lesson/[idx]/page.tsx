"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { loadSubjectData, upsertNodeContent, TopicGeneratedContent, StoredSubjectData } from "@/utils/storage";
import { AutoFixMarkdown } from "@/components/AutoFixMarkdown";

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

  const subjectData = useMemo(() => loadSubjectData(slug), [slug]);
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
              <div className="h-20 w-20 animate-pulse rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)]" />
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
              {(content?.lessons?.[lessonIndex]?.quiz?.length || 0) > 0 ? (
                <div className="mt-6">
                  <div className="mb-2 text-sm font-semibold text-[var(--foreground)]">Quick questions</div>
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
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
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
    </>
  );
}


