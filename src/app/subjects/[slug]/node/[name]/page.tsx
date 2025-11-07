"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import katex from "katex";
import { Highlight, themes } from "prism-react-renderer";
import { loadSubjectData, upsertNodeContent, TopicGeneratedContent, TopicGeneratedLesson, StoredSubjectData, markLessonReviewed, ReviewSchedule } from "@/utils/storage";
import { AutoFixMarkdown } from "@/components/AutoFixMarkdown";

// Regex patterns moved inside component to avoid any global scope issues

export default function NodePage() {

  const params = useParams<{ slug: string; name: string }>();
  const slug = params.slug;
  const title = decodeURIComponent(params.name || "");
  const [content, setContent] = useState<TopicGeneratedContent | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [lessonLoading, setLessonLoading] = useState<boolean>(false);
  const [shorteningLesson, setShorteningLesson] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationPosition, setExplanationPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [explanationWord, setExplanationWord] = useState<string>("");
  const [explanationContent, setExplanationContent] = useState<string>("");
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: string }>({});
  const [quizResults, setQuizResults] = useState<{ [key: number]: { correct: boolean; explanation: string; hint?: string; fullSolution?: string } } | null>(null);
  const [checkingAnswers, setCheckingAnswers] = useState(false);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [hoveredParagraph, setHoveredParagraph] = useState<string | null>(null);
  const [simplifyingParagraph, setSimplifyingParagraph] = useState<string | null>(null);
  const [showHints, setShowHints] = useState<{ [key: number]: boolean }>({});
  const [showSolutions, setShowSolutions] = useState<{ [key: number]: boolean }>({});
  const [reviewedThisSession, setReviewedThisSession] = useState<Set<number>>(new Set());
  const [paragraphGroups, setParagraphGroups] = useState<{ [key: string]: string[] }>({});
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
      const lessonBody = content?.lessons?.[currentLessonIndex]?.body || "";
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
  const courseTopics = useMemo(() => {
    const names: string[] = [];
    // Prefer new topics meta if available
    if (subjectData?.topics?.length) {
      subjectData.topics.forEach((t: any) => names.push(String(t.name)));
    } else {
      // Legacy tree fallback
      function collectNames(node: any, acc: string[]) {
        if (!node) return;
        if (Array.isArray(node)) {
          node.forEach((n) => collectNames(n, acc));
        } else {
          if (node.name) acc.push(String(node.name));
          if (node.subtopics) collectNames(node.subtopics, acc);
        }
      }
      collectNames(subjectData?.tree?.topics || [], names);
    }
    return Array.from(new Set(names)).slice(0, 200);
  }, [subjectData]);


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

  async   function onWordClick(word: string, parentText: string, e: React.MouseEvent) {
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


  // Helper to estimate line count (rough estimate based on character count)
  function estimateLineCount(text: string): number {
    // Assume ~80 chars per line on average
    return Math.max(1, Math.ceil(text.length / 80));
  }

  // Helper to get paragraph group key (for merging small paragraphs)
  function getParagraphGroupKey(paragraphText: string): string {
    const group = paragraphGroups[paragraphText];
    if (group && group.length > 0) {
      // Return the key as the first paragraph in the group
      return group[0];
    }
    return paragraphText;
  }

  async function simplifyParagraph(paragraphText: string) {
    if (simplifyingParagraph) return;
    // Mark THIS paragraph as simplifying (string id) so UI can react immediately
    setSimplifyingParagraph(paragraphText);
    try {
      const res = await fetch("/api/simplify-paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectData?.subject || slug,
          topic: title,
          paragraph: paragraphText,
          lessonContent: content?.lessons?.[currentLessonIndex]?.body || "",
          courseContext: subjectData?.course_context || "",
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
      return json.simplified || paragraphText;
    } catch (err: any) {
      console.error("Failed to simplify paragraph:", err);
      return paragraphText; // Return original if simplification fails
    } finally {
      setSimplifyingParagraph(null);
    }
  }

  useEffect(() => {
    if (!title) return;
    const saved = subjectData?.nodes?.[title] as any;
    if (saved) {
      if (typeof saved === "string") {
        setContent({ overview: saved, symbols: [], lessons: [] });
      } else {
        setContent(saved as TopicGeneratedContent);
        // Don't auto-navigate to last lesson - let user choose which lesson to view
      }
    } else {
      setContent(null);
    }
  }, [slug, title, subjectData]);

  // Build paragraph groups when lesson changes
  useEffect(() => {
    if (!content?.lessons?.[currentLessonIndex]?.body) {
      setParagraphGroups({});
      return;
    }

    const body = content.lessons[currentLessonIndex].body;
    const sections = body.split(/(?=^#+ )/m); // Split on headings but keep them
    const groups: { [key: string]: string[] } = {};
    
    console.log('📚 Building paragraph groups for lesson:', currentLessonIndex);
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      // Get the heading
      const lines = section.split('\n');
      const headingLine = lines.find(l => l.trim().startsWith('#'));
      
      // Extract all paragraphs (text between empty lines)
      const paragraphs: string[] = [];
      let currentPara = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          if (currentPara) {
            paragraphs.push(currentPara.trim());
            currentPara = '';
          }
        } else {
          // Add to current paragraph
          if (currentPara) currentPara += ' ';
          // Clean markdown list markers
          const cleaned = trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
          currentPara += cleaned;
        }
      }
      if (currentPara) {
        paragraphs.push(currentPara.trim());
      }
      
      if (paragraphs.length <= 1) continue; // No grouping needed
      
      const sectionLeader = paragraphs[0];
      console.log(`  Section "${headingLine?.trim()}" has ${paragraphs.length} paragraphs, leader: "${sectionLeader.substring(0, 50)}..."`);
      
      // Map all paragraphs in this section to the group
      paragraphs.forEach(para => {
        groups[para] = paragraphs;
      });
    }
    
    console.log('✅ Built groups:', Object.keys(groups).length, 'total items');
    setParagraphGroups(groups);
  }, [content, currentLessonIndex]);


  return (
    <>
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        {error ? (
          <div className="mb-4 rounded-xl border border-[var(--accent-pink)]/30 bg-[var(--background)]/60 p-3 text-sm text-[var(--accent-pink)]">{error}</div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-5">
              <div className="h-20 w-20 animate-pulse rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)]" />
              <div className="text-sm text-[var(--foreground)]/70">Generating content…</div>
            </div>
          </div>
        ) : (lessonLoading || shorteningLesson) ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="relative w-24 h-24">
                {/* Spinning gradient ring */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-spin" 
                     style={{ 
                       WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)',
                       mask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)'
                     }}>
                </div>
              </div>
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-[var(--foreground)]">
                  {shorteningLesson ? "Shortening lesson content…" : "Generating lesson content…"}
                </div>
              </div>
            </div>
          </div>
        ) : content && content.lessons && content.lessons.length > 0 ? (
            <div className="space-y-6">
              
              <div className="rounded-2xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-5 text-[var(--foreground)] shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
              
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={async () => {
                    if (shorteningLesson || lessonLoading) return;
                    setShorteningLesson(true);
                    try {
                      const currentLessonIndex = content.lessons.length - 1;
                      const currentLesson = content.lessons[currentLessonIndex];
                      if (!currentLesson) {
                        alert("No lesson content to shorten");
                        return;
                      }
                      const res = await fetch("/api/shorten-lesson", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          lessonTitle: currentLesson.title,
                          lessonBody: currentLesson.body,
                          subject: subjectData?.subject || slug,
                          topic: title,
                        })
                      });
                      const json = await res.json().catch(() => ({}));
                      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                      const shortenedLesson = json.data || {};
                      const next = { ...(content as TopicGeneratedContent) };
                      next.lessons[currentLessonIndex] = {
                        ...currentLesson,
                        body: String(shortenedLesson.body || currentLesson.body),
                      };
                      setContent(next);
                      upsertNodeContent(slug, title, next as any);
                    } catch (err: any) {
                      alert(err?.message || "Failed to shorten lesson");
                    } finally {
                      setShorteningLesson(false);
                    }
                  }}
                  disabled={shorteningLesson || lessonLoading}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 text-[var(--foreground)] hover:bg-[var(--background)]/80 disabled:opacity-60 transition-colors"
                  title="Shorten lesson (make it concise)"
                >
                  <span className="text-lg font-bold">-</span>
                </button>
                <button
                  onClick={async () => {
                    if (lessonLoading) return;
                    setLessonLoading(true);
                    try {
                      const currentLessonIndex = content.lessons.length - 1;
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
                          lessonIndex: currentLessonIndex,
                          previousLessons: content.lessons.slice(0, currentLessonIndex),
                          generatedLessons: content.lessons.slice(0, currentLessonIndex).filter((l): l is TopicGeneratedLesson => l !== null).map((l, i) => ({ index: i, title: l.title, body: l.body })),
                          otherLessonsMeta: (content?.lessonsMeta || []).slice(currentLessonIndex + 1).map((m, i) => ({ index: currentLessonIndex + 1 + i, type: m.type, title: m.title })),
                          courseTopics,
                          languageName: subjectData?.course_language_name || "",
                        })
                      });
                      const json = await res.json().catch(() => ({}));
                      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                      const lesson = json.data || {};
                      const next = { ...(content as TopicGeneratedContent) };
                      next.lessons[currentLessonIndex] = {
                        title: String(lesson.title || next.lessons[currentLessonIndex]?.title || content?.lessonsMeta?.[currentLessonIndex]?.title || `Lesson ${currentLessonIndex + 1}`),
                        body: String(lesson.body || ""),
                        quiz: Array.isArray(lesson.quiz) ? lesson.quiz.map((q: any) => ({ question: String(q.question || "") })) : next.lessons[currentLessonIndex]?.quiz || []
                      };
                      next.rawLessonJson = Array.isArray(next.rawLessonJson) ? [...next.rawLessonJson] : [];
                      next.rawLessonJson[currentLessonIndex] = typeof json.raw === 'string' ? json.raw : JSON.stringify(lesson);
                      setContent(next);
                      upsertNodeContent(slug, title, next as any);

                      // Reset quiz state for the regenerated lesson
                      setUserAnswers({});
                      setQuizResults(null);
                    } catch (err: any) {
                      alert(err?.message || "Failed to regenerate lesson");
                    } finally {
                      setLessonLoading(false);
                    }
                  }}
                  disabled={lessonLoading}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 text-[var(--foreground)] hover:bg-[var(--background)]/80 disabled:opacity-60 transition-colors"
                  title="Regenerate this lesson"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V9H4.58152M4.58152 9C5.47362 7.27477 7.06307 6 9 6C11.3869 6 13.6761 7.36491 14.9056 9.54555M4.58152 9H9M20 20V15H19.4185M19.4185 15C18.5264 16.7252 16.9369 18 15 18C12.6131 18 10.3239 16.6351 9.09443 14.4545M19.4185 15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Single-lesson mode: dropdown removed */}
              </div>

              <div className="lesson-content" style={{ wordSpacing: '-0.04em' }}>
                {lessonLoading && (
                  <div className="flex items-center justify-center py-8 mb-4 rounded-lg bg-[#1A1F2E] border border-[#2B3140]">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]" />
                      <div className="text-sm text-[#A7AFBE]">Generating lesson…</div>
                    </div>
                  </div>
                )}
                {content.lessons[currentLessonIndex]?.body ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-[var(--foreground)]/70">{content.lessonsMeta?.[currentLessonIndex]?.title}</div>
                      <button
                        onClick={readLesson}
                        disabled={audioLoading}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 text-[var(--foreground)] hover:bg-[var(--background)]/80 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isPlaying ? "Stop reading" : "Read lesson"}
                      >
                        {audioLoading ? (
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56"/>
                          </svg>
                        ) : isPlaying ? (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                          </svg>
                        ) : (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 3l14 9-14 9V3z"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    <AutoFixMarkdown
                      components={{
                        p: ({ children, ...props }: any) => {
                          let paragraphText = String(children);
                          // Simple HTML tag removal without regex
                          while (paragraphText.includes('<') && paragraphText.includes('>')) {
                            const start = paragraphText.indexOf('<');
                            const end = paragraphText.indexOf('>', start);
                            if (end > start) {
                              paragraphText = paragraphText.slice(0, start) + paragraphText.slice(end + 1);
                            } else {
                              break;
                            }
                          }
                          const isSimplifying = simplifyingParagraph === paragraphText;
                          const groupKey = getParagraphGroupKey(paragraphText);
                          const isGroupLeader = groupKey === paragraphText;
                          // Only show simplify button on the first paragraph/item in each section
                          const showSimplifyButton = false; // DISABLED FOR NOW

                          return (
                            <div
                              className="relative group py-1 mb-2"
                              onMouseEnter={() => setHoveredParagraph(paragraphText)}
                              onMouseLeave={() => setHoveredParagraph(null)}
                            >
                              <div className="flex transition-all duration-500">
                                <p
                                  className={
                                    isSimplifying
                                      ? 'relative flex-1 transition-all duration-500 rounded-md px-2 py-0.5 leading-normal'
                                      : 'relative flex-1 transition-all duration-500 rounded-md px-2 py-0.5 leading-normal'
                                  }
                                  style={isSimplifying ? {
                                    background: 'linear-gradient(to right, rgba(0, 229, 255, 0.3) 0%, rgba(0, 229, 255, 0.3) 100%)'
                                  } : {}}
                                >
                                  {wrapChildren(children)}
                                </p>
                              </div>
                              {/* Vertical line - DISABLED */}
                              {false && <div
                                className={
                                  hoveredParagraph === paragraphText
                                    ? 'paragraph-line absolute -right-12 top-1 bottom-1 w-0.5 transition-all duration-300 opacity-100 scale-y-100'
                                    : 'paragraph-line absolute -right-12 top-1 bottom-1 w-0.5 transition-all duration-300 opacity-0 scale-y-0'
                                }
                                style={{ transformOrigin: 'top' }}
                              />}
                              {!isSimplifying && showSimplifyButton && (
                                <div className="absolute -right-20 top-1 flex items-start">
                                  <button
                                    tabIndex={-1}
                                    onMouseEnter={(e) => { e.preventDefault(); setHoveredParagraph(paragraphText); }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onFocus={(e) => e.preventDefault()}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  const scrollY = window.scrollY;
                                    setSimplifyingParagraph(paragraphText);
                                    try {
                                      const simplified = await simplifyParagraph(paragraphText);
                                      if (simplified && simplified !== paragraphText) {
                                        // Replace the paragraph in the lesson content
                                        // Use a more robust replacement by finding similar text
                                        const currentBody = content.lessons[currentLessonIndex]?.body || '';

                                        // Simple whitespace normalization without regex
                                        const normalizeWhitespace = (text: string) => {
                                          let result = '';
                                          let wasSpace = false;
                                          for (let i = 0; i < text.length; i++) {
                                            const char = text[i];
                                            if (char === ' ' || char === '\t' || char === '\n') {
                                              if (!wasSpace) {
                                                result += ' ';
                                                wasSpace = true;
                                              }
                                            } else {
                                              result += char;
                                              wasSpace = false;
                                            }
                                          }
                                          return result.trim();
                                        };

                                        const normalizedOriginal = normalizeWhitespace(paragraphText);
                                        const normalizedSimplified = normalizeWhitespace(simplified);

                                        // Try to find and replace the paragraph in the markdown
                                        let newBody = currentBody;
                                        const paragraphs = currentBody.split('\n\n');

                                        for (let i = 0; i < paragraphs.length; i++) {
                                          const para = normalizeWhitespace(paragraphs[i]);
                                          // Check if this paragraph contains our text
                                          if (para.includes(normalizedOriginal.substring(0, 50))) {
                                            paragraphs[i] = simplified;
                                            newBody = paragraphs.join('\n\n');
                                            break;
                                          }
                                        }

                                        const next = { ...(content as TopicGeneratedContent) };
                                        next.lessons = next.lessons ? [...next.lessons] : [];
                                        const currentLesson = next.lessons[currentLessonIndex];
                                        next.lessons[currentLessonIndex] = {
                                          title: currentLesson?.title || content?.lessonsMeta?.[currentLessonIndex]?.title || `Lesson ${currentLessonIndex + 1}`,
                                          body: newBody,
                                          quiz: currentLesson?.quiz || []
                                        };
                                        setContent(next);
                                        upsertNodeContent(slug, title, next as any);
                                      }
                                    } catch (err: any) {
                                      console.error('Failed to simplify paragraph:', err);
                                      alert('Failed to simplify paragraph: ' + err.message);
                                    } finally {
                                      setSimplifyingParagraph(null);
                                    }
                                    // Restore scroll position
                                    setTimeout(() => window.scrollTo(0, scrollY), 0);
                                  }}
                                      disabled={isSimplifying}
                                      className="transition-all duration-300 inline-flex h-7 w-7 items-center justify-center rounded-full shadow-lg cursor-pointer opacity-0 group-hover:opacity-100 bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white hover:shadow-xl hover:scale-110"
                                      title="Simplify paragraph"
                                    >
                                      S
                                    </button>
                                  </div>
                                )}
                              </div>
                          );
                        },
                        li: ({ children }: any) => {
                          let itemText = String(children);
                          // Simple HTML tag removal without regex
                          while (itemText.includes('<') && itemText.includes('>')) {
                            const start = itemText.indexOf('<');
                            const end = itemText.indexOf('>', start);
                            if (end > start) {
                              itemText = itemText.slice(0, start) + itemText.slice(end + 1);
                            } else {
                              break;
                            }
                          }
                          const isSimplifying = simplifyingParagraph === itemText;
                          const groupKey = getParagraphGroupKey(itemText);
                          const isGroupLeader = groupKey === itemText;
                          // Only show simplify button on the first item in each section
                          const showSimplifyButton = false; // DISABLED FOR NOW

                          return (
                            <li
                              className="relative group mb-0.5"
                              onMouseEnter={() => setHoveredParagraph(itemText)}
                              onMouseLeave={() => setHoveredParagraph(null)}
                            >
                              <div className="flex transition-all duration-500">
                                <span
                                  className={
                                    isSimplifying
                                      ? 'relative flex-1 transition-all duration-500 rounded-md px-2 py-0.5 leading-normal'
                                      : 'relative flex-1 transition-all duration-500 rounded-md px-2 py-0.5 leading-normal'
                                  }
                                  style={isSimplifying ? {
                                    background: 'linear-gradient(to right, rgba(0, 229, 255, 0.3) 0%, rgba(0, 229, 255, 0.3) 100%)'
                                  } : {}}
                                >
                                  {wrapChildren(children)}
                                </span>
                              </div>
                              {/* Vertical line - DISABLED */}
                              {false && <div
                                className={
                                  hoveredParagraph === itemText
                                    ? 'paragraph-line absolute -right-12 top-1 bottom-1 w-0.5 transition-all duration-300 opacity-100 scale-y-100'
                                    : 'paragraph-line absolute -right-12 top-1 bottom-1 w-0.5 transition-all duration-300 opacity-0 scale-y-0'
                                }
                                style={{ transformOrigin: 'top' }}
                              />}
                              {!isSimplifying && showSimplifyButton && (
                                <div className="absolute -right-20 top-1 flex items-start">
                                  <button
                                    tabIndex={-1}
                                    onMouseEnter={(e) => { e.preventDefault(); setHoveredParagraph(itemText); }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onFocus={(e) => e.preventDefault()}
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      const scrollY = window.scrollY;
                                      setSimplifyingParagraph(itemText);
                                      try {
                                        const simplified = await simplifyParagraph(itemText);
                                        if (simplified && simplified !== itemText) {
                                          const currentBody = content.lessons[currentLessonIndex]?.body || '';
                                          const normalizeWhitespace = (text: string) => {
                                            let result = '';
                                            let wasSpace = false;
                                            for (let i = 0; i < text.length; i++) {
                                              const char = text[i];
                                              if (char === ' ' || char === '\t' || char === '\n') {
                                                if (!wasSpace) {
                                                  result += ' ';
                                                  wasSpace = true;
                                                }
                                              } else {
                                                result += char;
                                                wasSpace = false;
                                              }
                                            }
                                            return result.trim();
                                          };

                                          const normalizedOriginal = normalizeWhitespace(itemText);
                                          let newBody = currentBody;
                                          const lines = currentBody.split('\n');

                                          for (let i = 0; i < lines.length; i++) {
                                            const line = normalizeWhitespace(lines[i]);
                                            if (line.includes(normalizedOriginal.substring(0, 50))) {
                                              lines[i] = lines[i].replace(itemText, simplified);
                                              newBody = lines.join('\n');
                                              break;
                                            }
                                          }

                                          const next = { ...(content as TopicGeneratedContent) };
                                          next.lessons = next.lessons ? [...next.lessons] : [];
                                          const currentLesson = next.lessons[currentLessonIndex];
                                          next.lessons[currentLessonIndex] = {
                                            title: currentLesson?.title || content?.lessonsMeta?.[currentLessonIndex]?.title || `Lesson ${currentLessonIndex + 1}`,
                                            body: newBody,
                                            quiz: currentLesson?.quiz || []
                                          };
                                          setContent(next);
                                          upsertNodeContent(slug, title, next as any);
                                        }
                                      } catch (err: any) {
                                        console.error('Failed to simplify list item:', err);
                                        alert('Failed to simplify list item: ' + err.message);
                                      } finally {
                                        setSimplifyingParagraph(null);
                                      }
                                      setTimeout(() => window.scrollTo(0, scrollY), 0);
                                    }}
                                    disabled={isSimplifying}
                                    className="transition-all duration-300 inline-flex h-7 w-7 items-center justify-center rounded-full shadow-lg cursor-pointer opacity-0 group-hover:opacity-100 bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white hover:shadow-xl hover:scale-110"
                                    title="Simplify list item"
                                  >
                                    S
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        },
                        h1: ({ children }: any) => <h1 className="mt-4 mb-2 text-2xl font-bold">{wrapChildren(children)}</h1>,
                        h2: ({ children }: any) => <h2 className="mt-3 mb-1.5 text-xl font-semibold">{wrapChildren(children)}</h2>,
                        h3: ({ children }: any) => <h3 className="mt-2.5 mb-1 text-lg font-medium">{wrapChildren(children)}</h3>,
                        ul: ({ children }: any) => <ul className="space-y-0.5 my-2">{children}</ul>,
                        ol: ({ children }: any) => <ol className="space-y-0.5 my-2">{children}</ol>,
                        td: ({ children }: any) => <td>{wrapChildren(children)}</td>,
                        th: ({ children }: any) => <th>{wrapChildren(children)}</th>,
                        code: ({ children, ...props }: any) => {
                          // Handle inline math expressions that might be in code blocks
                          const content = String(children).trim();
                          if (content.startsWith('$') && content.endsWith('$') && content.length > 2) {
                            // This is likely an inline math expression that should be rendered as math
                            return <span dangerouslySetInnerHTML={{
                              __html: katex.renderToString(content.slice(1, -1), { displayMode: false, throwOnError: false })
                            }} />;
                          }
                          return <code>{children}</code>;
                        },
                        pre: ({ children, ...props }: any) => {
                          // Extract code content from React elements
                          const extractTextContent = (element: any): string => {
                            if (typeof element === 'string') return element;
                            if (Array.isArray(element)) return element.map(extractTextContent).join('');
                            if (element?.props?.children) return extractTextContent(element.props.children);
                            return '';
                          };

                          const codeContent = extractTextContent(children);
                          // Note: line numbers will be driven by Prism tokens to avoid off-by-one

                          // Extract language from className (e.g., "language-javascript" -> "javascript")
                          const className = (props as any).className || '';
                          let language = '';
                          if (className.startsWith('language-')) {
                            language = className.substring(9); // Remove 'language-' prefix
                          }


                          return (
                            <div className="relative bg-[#0F141D] border border-[#2B3140] rounded-lg overflow-hidden my-3">
                              <div className="overflow-x-auto">
                                <Highlight
                                  code={codeContent}
                                  language={language || 'javascript'}
                                  theme={themes.vsDark}
                                >
                                  {({ tokens, getLineProps, getTokenProps }) => (
                                    <div
                                      className="font-mono"
                                      style={{
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                        fontSize: '14px',
                                        lineHeight: 1.5,
                                        whiteSpace: 'pre',
                                      }}
                                    >
                                      {tokens.map((line, i) => (
                                        <div key={i} className="grid" style={{ gridTemplateColumns: 'auto 1fr', columnGap: '12px' }}>
                                          <div
                                            className="text-right select-none text-[#6B7280] pl-1 pr-1 pt-1"
                                            style={{ fontVariantNumeric: 'tabular-nums' as any, marginTop: '1px' }}
                                          >
                                            {i + 1}
                                          </div>
                                          <div {...getLineProps({ line })}>
                                            {line.map((token, key) => (
                                              <span key={key} {...getTokenProps({ token })} />
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </Highlight>
                              </div>
                            </div>
                          );
                        },
                      }}
                    >
                      {(() => {
                        // Convert LaTeX bracket notation to dollar signs and fix common errors
                        let processedBody = content.lessons[currentLessonIndex].body;
                        
                        // Remove metadata header if present
                        processedBody = processedBody
                          .replace(/^Lesson Title:.*\n/m, '')
                          .replace(/^Subject:.*\n/m, '')
                          .replace(/^Topic:.*\n/m, '');
                        
                        processedBody = processedBody
                          .replace(/\\\[/g, '$$')
                          .replace(/\\\]/g, '$$')
                          .replace(/\\\(/g, '$')
                          .replace(/\\\)/g, '$');
                        
                        return processedBody;
                      })()}
                    </AutoFixMarkdown>
                    <style jsx global>{`
                      .lesson-content p{ margin: 0.45rem 0 !important; }
                      .lesson-content ul, .lesson-content ol{ margin: 0.4rem 0 !important; }
                      .lesson-content h1, .lesson-content h2, .lesson-content h3{ margin-top: 0.6rem !important; margin-bottom: 0.35rem !important; }
                    `}</style>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <div className="text-center">
                      <div className="text-lg font-medium text-[#E5E7EB] mb-2">
                        {content.lessonsMeta?.[currentLessonIndex]?.type}: {content.lessonsMeta?.[currentLessonIndex]?.title}
                      </div>
                      <div className="text-sm text-[#A7AFBE] mb-6">
                        This lesson hasn't been generated yet.
                      </div>
                      <button
                        onClick={async () => {
                          if (lessonLoading) return;
                          setLessonLoading(true);
                          try {
                            const topicMeta = (subjectData?.topics || []).find((t: any) => String(t.name) === title);
                            const res = await fetch("/api/node-lesson", {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                subject: subjectData?.subject || slug,
                                topic: title,
                                course_context: subjectData?.course_context || "",
                                combinedText: subjectData?.combinedText || "",
                                topicSummary: topicMeta?.summary || "",
                                lessonsMeta: content?.lessonsMeta || [],
                                lessonIndex: currentLessonIndex,
                                previousLessons: content.lessons.filter((l): l is TopicGeneratedLesson => l !== null),
                                generatedLessons: content.lessons.filter((l): l is TopicGeneratedLesson => l !== null).map((l, i) => ({ index: i, title: l.title, body: l.body })),
                                otherLessonsMeta: (content?.lessonsMeta || []).slice(currentLessonIndex + 1).map((m, i) => ({ index: currentLessonIndex + 1 + i, type: m.type, title: m.title })),
                                courseTopics,
                                languageName: subjectData?.course_language_name || "",
                              })
                            });
                            const json = await res.json().catch(() => ({}));
                            if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                            const lesson = json.data || {};
                            const next = { ...(content as TopicGeneratedContent) };
                            next.lessons = next.lessons ? [...next.lessons] : [];
                            // Fill in any missing lessons
                            while (next.lessons.length <= currentLessonIndex) {
                              next.lessons.push(null);
                            }
                            next.lessons[currentLessonIndex] = {
                              title: String(lesson.title || (content?.lessonsMeta?.[currentLessonIndex]?.title || `Lesson ${currentLessonIndex + 1}`)),
                              body: String(lesson.body || ""),
                              quiz: Array.isArray(lesson.quiz) ? lesson.quiz.map((q: any) => ({ question: String(q.question || "") })) : []
                            };
                            next.rawLessonJson = Array.isArray(next.rawLessonJson) ? [...next.rawLessonJson] : [];
                            while (next.rawLessonJson.length <= currentLessonIndex) {
                              next.rawLessonJson.push(null);
                            }
                            next.rawLessonJson[currentLessonIndex] = typeof json.raw === 'string' ? json.raw : JSON.stringify(lesson);
                            setContent(next);
                            upsertNodeContent(slug, title, next as any);
                          } catch (err: any) {
                            console.error('Failed to generate lesson:', err);
                            setError(err?.message || 'Failed to generate lesson');
                          } finally {
                            setLessonLoading(false);
                          }
                        }}
                        disabled={lessonLoading}
                        className="inline-flex h-12 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-8 text-base font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
                      >
                        {shorteningLesson ? "Shortening..." : lessonLoading ? "Generating..." : "Generate Lesson"}
                      </button>
                    </div>
                  </div>
                )}
                {content.lessons[currentLessonIndex]?.quiz && content.lessons[currentLessonIndex].quiz.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Practice Problems</h3>
                    <div className="space-y-6">
                      {content.lessons[currentLessonIndex].quiz.map((q, qi) => (
                        <div key={qi} className="space-y-3 p-4 rounded-lg bg-[var(--background)]/60 border border-[var(--foreground)]/10">
                          <div className="text-sm font-medium text-[var(--foreground)]">
                            {qi + 1}. <AutoFixMarkdown>{q.question}</AutoFixMarkdown>
                          </div>
                          <div className="space-y-2">
                            <textarea
                              value={userAnswers[qi] || ""}
                              onChange={(e) => {
                                if (!e.target) return;
                                setUserAnswers(prev => ({ ...prev, [qi]: e.target.value }));
                              }}
                              className={
                                quizResults?.[qi]
                                  ? quizResults[qi].correct
                                    ? 'w-full rounded-lg border border-green-500 bg-green-500/10 text-green-700 dark:text-green-200 px-3 py-2 text-sm transition-colors resize-none'
                                    : 'w-full rounded-lg border border-red-500 bg-red-500/10 text-red-700 dark:text-red-200 px-3 py-2 text-sm transition-colors resize-none'
                                  : 'w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none px-3 py-2 text-sm transition-colors resize-none'
                              }
                              placeholder="Write your answer here..."
                              rows={3}
                              disabled={checkingAnswers}
                            />
                            {quizResults?.[qi] && (
                              <div className="space-y-2">
                                <div className={
                                  quizResults[qi].correct
                                    ? 'text-xs p-3 rounded bg-green-500/20 text-green-700 dark:text-green-200 border border-green-500/30'
                                    : 'text-xs p-3 rounded bg-red-500/20 text-red-700 dark:text-red-200 border border-red-500/30'
                                }>
                                  <div className="font-semibold mb-1">{quizResults[qi].correct ? '✓ Correct!' : '✗ Not quite'}</div>
                                  <AutoFixMarkdown>{quizResults[qi].explanation}</AutoFixMarkdown>
                                </div>
                                
                                {!quizResults[qi].correct && quizResults[qi].hint && (
                                  <div className="space-y-1">
                                    <button
                                      onClick={() => setShowHints(prev => ({ ...prev, [qi]: !prev[qi] }))}
                                      className="text-xs text-[#60A5FA] hover:text-[#93C5FD] hover:underline transition-colors"
                                    >
                                      {showHints[qi] ? '▼ Hide hint' : '▶ Show hint'}
                                    </button>
                                    {showHints[qi] && (
                                      <div className="text-xs p-3 rounded bg-blue-50 dark:bg-[#1E3A5F]/30 text-blue-900 dark:text-[#E0F2FE] border border-blue-200 dark:border-[#60A5FA]/20">
                                        💡 <AutoFixMarkdown>{quizResults[qi].hint}</AutoFixMarkdown>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {quizResults[qi].fullSolution && (
                                  <div className="space-y-1">
                                    <button
                                      onClick={() => setShowSolutions(prev => ({ ...prev, [qi]: !prev[qi] }))}
                                      className="text-xs text-[#C084FC] hover:text-[#D8B4FE] hover:underline transition-colors"
                                    >
                                      {showSolutions[qi] ? '▼ Hide solution' : '▶ Show step-by-step solution'}
                                    </button>
                                    {showSolutions[qi] && (
                                      <div className="text-xs p-3 rounded bg-purple-50 dark:bg-[#3B1F4F]/30 text-purple-900 dark:text-[#F3E8FF] border border-purple-200 dark:border-[#C084FC]/20">
                                        <AutoFixMarkdown>{quizResults[qi].fullSolution}</AutoFixMarkdown>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 flex justify-center">
                      <button
                        onClick={async () => {
                          if (checkingAnswers) return;
                          setCheckingAnswers(true);
                          try {
                            const currentLesson = content.lessons[currentLessonIndex];
                            if (!currentLesson) {
                              alert("No lesson content to check answers for");
                              return;
                            }
                            const answers = currentLesson.quiz.map((q, qi) => ({
                              question: q.question,
                              userAnswer: userAnswers[qi] || ""
                            }));

                            const res = await fetch("/api/check-quiz", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                subject: subjectData?.subject || slug,
                                topic: title,
                                lessonContent: currentLesson.body,
                                courseContext: subjectData?.course_context || "",
                                answers
                              })
                            });

                            const json = await res.json().catch(() => ({}));
                            if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);

                            setQuizResults(json.results || {});
                          } catch (err: any) {
                            alert(err?.message || "Failed to check answers");
                          } finally {
                            setCheckingAnswers(false);
                          }
                        }}
                        disabled={checkingAnswers || Object.keys(userAnswers).length === 0}
                        className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
                      >
                        {checkingAnswers ? "Checking..." : "Check Answers"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            
            <div className="flex items-center justify-center mb-4">
              <button
                onClick={async () => {
                  if (!content?.lessons?.[currentLessonIndex]?.body) return;

                  try {
                    const lesson = content.lessons[currentLessonIndex];
                    const res = await fetch('/api/export-pdf', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: lesson.title,
                        content: lesson.body,
                        subject: subjectData?.subject || slug,
                        topic: title,
                      })
                    });

                    if (!res.ok) throw new Error('Failed to generate PDF');

                    // Download the PDF
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    // Simple filename sanitization without regex
                    let filename = lesson.title.toLowerCase();
                    const invalidChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
                    for (const char of invalidChars) {
                      filename = filename.split(char).join('_');
                    }
                    a.download = `${filename}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  } catch (err: any) {
                    alert('Failed to export PDF: ' + err.message);
                  }
                }}
                className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 text-sm font-medium text-white hover:opacity-95 transition-opacity"
                title="Export lesson to PDF"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
                  <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Export PDF
              </button>
            </div>

            
            <div className="flex flex-col items-center gap-4 mt-8">
              {/* Review Rating */}
              {!reviewedThisSession.has(currentLessonIndex) ? (
                <div className="w-full max-w-md">
                  <div className="p-4 rounded-lg bg-[var(--background)]/60 border border-[var(--foreground)]/20 space-y-3">
                    <div className="text-sm text-[var(--foreground)] font-medium text-center">How well did you understand this lesson?</div>
                    <div className="grid grid-cols-6 gap-2">
                      {[
                        { value: 0, label: '😰', desc: 'Forgot everything' },
                        { value: 1, label: '😕', desc: 'Struggled a lot' },
                        { value: 2, label: '😐', desc: 'Struggled some' },
                        { value: 3, label: '🙂', desc: 'Got it okay' },
                        { value: 4, label: '😊', desc: 'Got it well' },
                        { value: 5, label: '🎯', desc: 'Perfect!' }
                      ].map((item) => (
                        <button
                          key={item.value}
                          onClick={() => {
                            markLessonReviewed(slug, title, currentLessonIndex, item.value);
                            setReviewedThisSession(prev => new Set([...prev, currentLessonIndex]));
                          }}
                          className="flex flex-col items-center p-2 rounded-lg bg-[var(--background)]/80 border border-[var(--foreground)]/10 hover:bg-[var(--background)]/60 hover:border-[var(--accent-cyan)]/30 transition-colors"
                          title={item.desc}
                        >
                          <span className="text-2xl">{item.label}</span>
                          <span className="text-[10px] text-[var(--foreground)]/70 mt-1">{item.value}</span>
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-[var(--foreground)]/70 text-center">Rate to schedule your next review</div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-md">
                  <div className="p-4 rounded-lg bg-green-500/20 dark:bg-green-500/10 border border-green-500/30 dark:border-green-500/30 text-center">
                    <div className="text-sm text-green-700 dark:text-green-200 font-medium">✓ Marked for review</div>
                    <div className="text-xs text-green-600 dark:text-green-300 mt-1">Next review scheduled!</div>
                  </div>
                </div>
              )}
              
              {/* Lesson Navigation removed for single-lesson mode */}
            </div>
          </div>
        ) : (
          <div className="relative mx-auto mt-24 flex max-w-md flex-col items-center justify-center">
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(0,229,255,0.25),rgba(255,45,150,0.12)_60%,transparent_70%)] blur-2xl" />
            <div className="relative">
              {/* Spinning gradient ring around button */}
              <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-spin" 
                   style={{ 
                     WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), white 0)',
                     mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), white 0)'
                   }}>
              </div>
              <button
                className="relative inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white font-semibold text-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
              onClick={async () => {
                try {
                  setLessonLoading(true);
                  setError(null);

                  // First, get the topic plan
                  const planRes = await fetch("/api/node-plan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      subject: subjectData?.subject || slug,
                      topic: title,
                      combinedText: subjectData?.combinedText || "",
                      course_context: subjectData?.course_context || "",
                      courseTopics,
                      languageName: subjectData?.course_language_name || "",
                    }),
                  });
                  const planJson = await planRes.json().catch(() => ({}));
                  if (!planRes.ok || !planJson?.ok) throw new Error(planJson?.error || `Server error (${planRes.status})`);
                  const planData = planJson.data || {};

                  // Then, generate ONE comprehensive lesson covering the entire topic
                  const topicMeta = (subjectData?.topics || []).find((t: any) => String(t.name) === title);
                  const lessonRes = await fetch("/api/node-lesson", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      subject: subjectData?.subject || slug,
                      topic: title, // Ensure we're using the correct topic from the URL
                      course_context: subjectData?.course_context || "",
                      combinedText: subjectData?.combinedText || "",
                      topicSummary: topicMeta?.summary || "",
                      // Generate ONE comprehensive "Full Lesson" covering the entire topic
                      lessonsMeta: [{ type: 'Full Lesson', title: title }],
                      lessonIndex: 0,
                      previousLessons: [],
                      generatedLessons: [],
                      otherLessonsMeta: [],
                      courseTopics,
                      languageName: subjectData?.course_language_name || "",
                    }),
                  });
                  const lessonJson = await lessonRes.json().catch(() => ({}));
                  if (!lessonRes.ok || !lessonJson?.ok) throw new Error(lessonJson?.error || `Server error (${lessonRes.status})`);
                  const lessonData = lessonJson.data || {};

                  // Combine plan and lesson - use single "Full Lesson" metadata
                  const normalized: TopicGeneratedContent = {
                    overview: String(planData.overview_child || ""),
                    symbols: Array.isArray(planData.symbols) ? planData.symbols.map((s: any) => ({ symbol: String(s.symbol||""), meaning: String(s.meaning||""), units: s.units ? String(s.units) : undefined })) : [],
                    // Use single "Full Lesson" instead of plan's multiple lessons
                    lessonsMeta: [{ type: 'Full Lesson', title: title }],
                    lessons: [{
                      title: String(lessonData.title || title),
                      body: String(lessonData.body || ""),
                      quiz: Array.isArray(lessonData.quiz) ? lessonData.quiz.map((q: any) => ({ question: String(q.question || "") })) : []
                    }],
                    rawLessonJson: [typeof lessonJson.raw === 'string' ? lessonJson.raw : JSON.stringify(lessonData)],
                  };

                  setContent(normalized);
                  upsertNodeContent(slug, title, normalized as any);
                } catch (err: any) {
                  setError(err?.message || "Failed to start topic");
                } finally {
                  setLessonLoading(false);
                }
              }}
              disabled={lessonLoading}
            >
              <span className="text-center leading-tight px-2">Start<br />Lesson</span>
            </button>
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


