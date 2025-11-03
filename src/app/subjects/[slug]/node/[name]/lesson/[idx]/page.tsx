"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { loadSubjectData, upsertNodeContent, TopicGeneratedContent, StoredSubjectData } from "@/utils/storage";
import WordPopover from "@/components/WordPopover";

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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverXY, setPopoverXY] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [popoverLoading, setPopoverLoading] = useState(false);
  const [popoverError, setPopoverError] = useState<string | null>(null);
  const [popoverContent, setPopoverContent] = useState<string>("");
  const contentRef = useState<React.RefObject<HTMLDivElement>>(() => ({ current: null } as any))[0];
  const [copied, setCopied] = useState(false);

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
          className="hoverable-word"
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
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopoverXY({ x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 6 });
    setPopoverOpen(true);
    setPopoverLoading(true);
    setPopoverError(null);
    setPopoverContent("");
    try {
      const idx = parentText.indexOf(word);
      const localContext = idx >= 0 ? parentText.slice(Math.max(0, idx - 120), Math.min(parentText.length, idx + word.length + 120)) : parentText.slice(0, 240);
      const res = await fetch("/api/quick-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subjectData?.subject || slug, topic: title, word, localContext, courseTopics, languageName: subjectData?.course_language_name || "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
      setPopoverContent(json.content || "");
    } catch (err: any) {
      setPopoverError(err?.message || "Failed to explain");
    } finally {
      setPopoverLoading(false);
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
    <div className="flex min-h-screen flex-col bg-[#0F1216]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        
        {error ? <div className="mb-4 rounded-xl border border-[#3A1E2C] bg-[#1B0F15] p-3 text-sm text-[#FFC0DA]">{error}</div> : null}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-5">
              <div className="h-20 w-20 animate-pulse rounded-full bg-accent" />
              <div className="text-sm text-[#A7AFBE]">Generating lesson…</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#222731] bg-[#0B0E12] p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-white">{content?.lessons?.[lessonIndex]?.title || content?.lessonsMeta?.[lessonIndex]?.title || `Lesson ${lessonIndex+1}`}</div>
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
                  className="inline-flex h-8 items-center rounded-full border border-[#2B3140] px-3 text-xs text-white hover:bg-[#151922]"
                >
                  {copied ? 'Copied' : 'Copy lesson'}
                </button>
              </div>
              <div className="lesson-content" ref={contentRef as any}>
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
                  {content?.lessons?.[lessonIndex]?.body || ""}
                </ReactMarkdown>
              </div>
              {(content?.lessons?.[lessonIndex]?.quiz?.length || 0) > 0 ? (
                <div className="mt-6">
                  <div className="mb-2 text-sm font-semibold text-white">Quick questions</div>
                  <ol className="list-decimal space-y-2 pl-6 text-sm">
                    {content!.lessons![lessonIndex]!.quiz!.map((q, qi) => (
                      <li key={qi} className="flex items-start justify-between gap-3">
                        <span className="flex-1">{q.question}</span>
                        <button
                          className="ml-3 inline-flex h-8 shrink-0 items-center rounded-full bg-[#151922] px-3 text-xs text-[#E5E7EB] hover:bg-[#1B2030]"
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
    <WordPopover
      open={popoverOpen}
      x={popoverXY.x}
      y={popoverXY.y}
      loading={popoverLoading}
      error={popoverError}
      content={popoverContent}
      onClose={() => setPopoverOpen(false)}
    />
    </>
  );
}


