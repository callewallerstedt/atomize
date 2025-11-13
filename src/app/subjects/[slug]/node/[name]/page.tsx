"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { LessonBody } from "@/components/LessonBody";
import { extractQuizSection } from "@/lib/lessonFormat";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import { Highlight, themes } from "prism-react-renderer";
import {
  loadSubjectData,
  upsertNodeContent,
  upsertNodeContentAsync,
  TopicGeneratedContent,
  TopicGeneratedLesson,
  StoredSubjectData,
  markLessonReviewed,
  ReviewSchedule,
  LessonFlashcard,
} from "@/utils/storage";
import LarsCoach from "@/components/LarsCoach";
import GlowSpinner from "@/components/GlowSpinner";

// Regex patterns moved inside component to avoid any global scope issues

export default function NodePage({ lessonIndexFromUrl }: { lessonIndexFromUrl?: number } = {}) {

  const params = useParams<{ slug: string; name: string }>();
  const router = useRouter();
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
  const [currentLessonIndex, setCurrentLessonIndex] = useState(lessonIndexFromUrl ?? 0);
  
  // Use lessonIndexFromUrl if provided, otherwise use state
  const activeLessonIndex = lessonIndexFromUrl !== undefined ? lessonIndexFromUrl : currentLessonIndex;
  const [hoveredParagraph, setHoveredParagraph] = useState<string | null>(null);
  const [simplifyingParagraph, setSimplifyingParagraph] = useState<string | null>(null);
  const [showHints, setShowHints] = useState<{ [key: number]: boolean }>({});
  const [showSolutions, setShowSolutions] = useState<{ [key: number]: boolean }>({});
  const [reviewedThisSession, setReviewedThisSession] = useState<Set<number>>(new Set());
  const [paragraphGroups, setParagraphGroups] = useState<{ [key: string]: string[] }>({});
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
const [flashcardFlipped, setFlashcardFlipped] = useState(false);
const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
const [starredFlashcards, setStarredFlashcards] = useState<Set<string>>(new Set());
const [showOnlyStarred, setShowOnlyStarred] = useState(false);
const [isShuffleActive, setIsShuffleActive] = useState(false);
  const flashcardCounts = [3, 5, 7, 9] as const;
  // Multiple choice quiz state
  const [mcQuizOpen, setMcQuizOpen] = useState(false);
  const [mcQuestions, setMcQuestions] = useState<Array<{question: string; options: string[]; correctAnswer: number}>>([]);
  const [mcAnswers, setMcAnswers] = useState<{ [key: number]: number }>({});
  const [mcResults, setMcResults] = useState<{ [key: number]: { correct: boolean; explanation: string } } | null>(null);
  const [generatingMcQuiz, setGeneratingMcQuiz] = useState(false);
  const [hoverWordRects, setHoverWordRects] = useState<Array<{ left: number; top: number; width: number; height: number }>>([]);
  const currentLesson = (content?.lessons?.[activeLessonIndex] ?? null) as TopicGeneratedLesson | null;
  const lessonFlashcards: LessonFlashcard[] = currentLesson?.flashcards ?? [];
  const lessonMetadata = currentLesson?.metadata || null;
  const formatMetadataEntry = (value?: string): string => {
    if (!value) return "";
    return value
      .replace(/\\n/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const lessonQuiz = useMemo(() => {
    if (currentLesson?.quiz?.length) return currentLesson.quiz;
    if (!currentLesson?.body) return [];
    const derived = extractQuizSection(currentLesson.body).questions;
    return derived;
  }, [currentLesson]);

  useEffect(() => {
    if (!content || !currentLesson || !lessonQuiz.length) return;
    if (currentLesson.quiz && currentLesson.quiz.length >= lessonQuiz.length) return;
    const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) } as any);
    next.lessons = Array.isArray(next.lessons) ? [...next.lessons] : [];
    next.lessons[activeLessonIndex] = {
      ...(next.lessons[activeLessonIndex] as TopicGeneratedLesson),
      ...(currentLesson as TopicGeneratedLesson),
      quiz: lessonQuiz,
    };
    setContent(next);
    upsertNodeContent(slug, title, next);
  }, [lessonQuiz, content, currentLesson, activeLessonIndex, slug, title]);

  function getRandomCardIndex(filtered: Array<{ id: string }>, currentIndex: number): number {
    if (filtered.length <= 1) return currentIndex;
    let newIndex = currentIndex;
    while (filtered.length > 1 && newIndex === currentIndex) {
      newIndex = Math.floor(Math.random() * filtered.length);
    }
    return newIndex;
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`starredFlashcards:${slug}`);
      if (saved) setStarredFlashcards(new Set(JSON.parse(saved)));
    } catch {}
  }, [slug]);

  async function readLesson() {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    try {
      setAudioLoading(true);
      const lessonBody = sanitizeLessonBody(content?.lessons?.[activeLessonIndex]?.body || "");
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
                        // If server lacks flashcards but local has them, keep local flashcards
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`starredFlashcards:${slug}`);
      if (saved) setStarredFlashcards(new Set(JSON.parse(saved)));
    } catch {}
  }, [slug]);

  const lessonCards = lessonFlashcards.map((card, index) => ({
    ...card,
    id: `${slug}:${title}:${currentLesson?.title || "Lesson"}:${index}:${card.prompt}`,
    topicName: title,
    lessonTitle: currentLesson?.title || "Lesson",
  }));

  const filteredLessonCards = showOnlyStarred
    ? lessonCards.filter((card) => starredFlashcards.has(card.id))
    : lessonCards;

function toggleStar(flashcardId: string) {
  const next = new Set(starredFlashcards);
  if (next.has(flashcardId)) {
    next.delete(flashcardId);
  } else {
    next.add(flashcardId);
  }
  setStarredFlashcards(next);
  try {
    localStorage.setItem(`starredFlashcards:${slug}`, JSON.stringify(Array.from(next)));
  } catch {}

  if (showOnlyStarred) {
    const remaining = lessonCards.filter((card) => next.has(card.id));
    if (remaining.length === 0) {
      setShowOnlyStarred(false);
      setCurrentFlashcardIndex(0);
      setFlashcardFlipped(false);
    } else if (currentFlashcardIndex >= remaining.length) {
      setCurrentFlashcardIndex(remaining.length - 1);
    }
  }
}

  const openFlashcardsViewer = (index = 0) => {
    if (!lessonCards.length) return;
    const safeIndex = Math.min(Math.max(index, 0), lessonCards.length - 1);
    setCurrentFlashcardIndex(safeIndex);
    setFlashcardFlipped(false);
    setShowOnlyStarred(false);
    setIsShuffleActive(false);
    setFlashcardModalOpen(true);
    setFlashcardOptionsOpen(false);
  };

  // Listen for lesson flashcard modal open event
  useEffect(() => {
    const handleOpenLessonFlashcards = (e: Event) => {
      const customEvent = e as CustomEvent;
      const eventSlug = customEvent.detail?.slug;
      const eventTopic = customEvent.detail?.topic;
      const eventLessonIndex = customEvent.detail?.lessonIndex;
      
      if (eventSlug === slug && eventTopic === title) {
        // If lesson index is specified, navigate to it first (if not already there)
        if (eventLessonIndex !== undefined) {
          const targetIndex = parseInt(String(eventLessonIndex), 10);
          if (!isNaN(targetIndex) && targetIndex >= 0 && content?.lessons && targetIndex < content.lessons.length) {
            // If we're not on the right lesson, navigate to it
            if (activeLessonIndex !== targetIndex) {
              router.push(`/subjects/${slug}/node/${encodeURIComponent(title)}/lesson/${targetIndex}`);
              // Wait for navigation, then open flashcards
              setTimeout(() => {
                if (lessonFlashcards.length > 0) {
                  openFlashcardsViewer(0);
                }
              }, 500);
            } else {
              // Already on the right lesson, just open flashcards
              setTimeout(() => {
                if (lessonFlashcards.length > 0) {
                  openFlashcardsViewer(0);
                }
              }, 300);
            }
          }
        } else if (lessonFlashcards.length > 0) {
          // No specific lesson index, just open flashcards for current lesson
          openFlashcardsViewer(0);
        }
      }
    };
    
    document.addEventListener('synapse:open-lesson-flashcards', handleOpenLessonFlashcards as EventListener);
    return () => {
      document.removeEventListener('synapse:open-lesson-flashcards', handleOpenLessonFlashcards as EventListener);
    };
  }, [slug, title, activeLessonIndex, content, lessonFlashcards.length, router]);

  const handleCloseFlashcards = () => {
    setFlashcardModalOpen(false);
    setFlashcardFlipped(false);
    setShowOnlyStarred(false);
    setIsShuffleActive(false);
  };

  useEffect(() => {
    if (!lessonFlashcards.length) {
      setFlashcardModalOpen(false);
      setFlashcardFlipped(false);
      setShowOnlyStarred(false);
      setIsShuffleActive(false);
      setCurrentFlashcardIndex(0);
    }
  }, [lessonFlashcards.length]);

  useEffect(() => {
    if (!flashcardModalOpen) return;
    if (filteredLessonCards.length === 0) {
      setCurrentFlashcardIndex(0);
      setFlashcardFlipped(false);
    } else if (currentFlashcardIndex >= filteredLessonCards.length) {
      setCurrentFlashcardIndex(filteredLessonCards.length - 1);
    }
  }, [flashcardModalOpen, filteredLessonCards.length, currentFlashcardIndex]);

  useEffect(() => {
    setFlashcardOptionsOpen(false);
    setFlashcardError(null);
    setPendingFlashcardCount(null);
    setGeneratingFlashcards(false);
    setFlashcardModalOpen(false);
    setFlashcardFlipped(false);
    setCurrentFlashcardIndex(0);
    setShowOnlyStarred(false);
    setIsShuffleActive(false);
  }, [activeLessonIndex]);

  // Helper function to preserve examSnipeMeta when updating content
  function preserveExamSnipeMeta(updatedContent: TopicGeneratedContent): TopicGeneratedContent {
    const examSnipeMeta = (content as any)?.examSnipeMeta;
    if (examSnipeMeta) {
      (updatedContent as any).examSnipeMeta = examSnipeMeta;
    }
    return updatedContent;
  }

  async function generateFlashcards(count: number) {
    if (!currentLesson?.body) {
      setFlashcardError("Generate the lesson first before creating flashcards.");
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
          lessonBody: sanitizeLessonBody(currentLesson.body),
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
      const existing = nextLessons[activeLessonIndex];
      if (!existing) {
        throw new Error("Lesson not available. Try again.");
      }
      const updatedLesson: TopicGeneratedLesson = { ...(existing as TopicGeneratedLesson), flashcards: cards };
      nextLessons[activeLessonIndex] = updatedLesson;
      const updatedContent: TopicGeneratedContent = preserveExamSnipeMeta({ ...prevContent, lessons: nextLessons });

      // Update UI immediately
      setContent(updatedContent);
      // Persist to local storage and server (await server sync to guarantee durability)
      await upsertNodeContentAsync(slug, title, updatedContent as any);

      openFlashcardsViewer(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate flashcards";
      setFlashcardError(message);
    } finally {
      setGeneratingFlashcards(false);
      setPendingFlashcardCount(null);
    }
  }

  
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
          lessonContent: sanitizeLessonBody(content?.lessons?.[activeLessonIndex]?.body || ""),
          courseContext: subjectData?.course_context || "",
          languageName: subjectData?.course_language_name || ""
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

  // Load any saved quiz state for the current lesson
  useEffect(() => {
    if (!content?.lessons?.[activeLessonIndex]) return;
    const lesson = content.lessons[activeLessonIndex] as any;
    // Load answers
    if (Array.isArray(lesson?.userAnswers)) {
      const map: { [k: number]: string } = {};
      (lesson.userAnswers as string[]).forEach((v, i) => { map[i] = v || ""; });
      setUserAnswers(map);
    } else {
      setUserAnswers({});
    }
    // Load results
    if (lesson?.quizResults && typeof lesson.quizResults === 'object') {
      setQuizResults(lesson.quizResults as any);
    } else {
      setQuizResults(null);
    }
    // Load MC quiz questions
    if (Array.isArray(lesson?.mcQuiz) && lesson.mcQuiz.length > 0) {
      setMcQuestions(lesson.mcQuiz);
    } else {
      setMcQuestions([]);
    }
    // Load MC quiz answers
    if (lesson?.mcAnswers && typeof lesson.mcAnswers === 'object') {
      setMcAnswers(lesson.mcAnswers);
    } else {
      setMcAnswers({});
    }
    // Load MC quiz results
    if (lesson?.mcResults && typeof lesson.mcResults === 'object') {
      setMcResults(lesson.mcResults);
    } else {
      setMcResults(null);
    }
  }, [content, activeLessonIndex]);

  // Build paragraph groups when lesson changes
  useEffect(() => {
    if (!content?.lessons?.[activeLessonIndex]?.body) {
      setParagraphGroups({});
      return;
    }

    const body = content.lessons[activeLessonIndex].body;
    const sections = body.split(/(?=^#+ )/m); // Split on headings but keep them
    const groups: { [key: string]: string[] } = {};
    
    
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
          currentPara += trimmed;
        }
      }
      if (currentPara) {
        paragraphs.push(currentPara.trim());
      }
      
      if (paragraphs.length <= 1) continue; // No grouping needed
      
      const sectionLeader = paragraphs[0];
      
      // Map all paragraphs in this section to the group
      paragraphs.forEach(para => {
        groups[para] = paragraphs;
      });
    }
    
    setParagraphGroups(groups);
  }, [content, activeLessonIndex]);


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
              <GlowSpinner size={140} ariaLabel="Loading lesson content" idSuffix="node-initial" />
              <div className="text-sm text-[var(--foreground)]/70">Generating content…</div>
            </div>
          </div>
        ) : (lessonLoading || shorteningLesson) ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center justify-center space-y-6">
              <GlowSpinner size={170} ariaLabel={shorteningLesson ? "Shortening lesson content" : "Generating lesson content"} idSuffix="node-lesson-overlay" />
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-[var(--foreground)]">
                  {shorteningLesson ? "Shortening lesson content…" : "Generating lesson content…"}
                </div>
              </div>
            </div>
          </div>
        ) : content && content.lessonsMeta && content.lessonsMeta[activeLessonIndex] && !content.lessons?.[activeLessonIndex]?.body ? (
          // Ungenerated lesson - show Start button UI
          <div className="relative mx-auto mt-24 flex max-w-md flex-col items-center justify-center gap-6">
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle at center, rgba(0, 229, 255, 0.25), rgba(255, 45, 150, 0.12) 60%, transparent 70%)' }} />
            {lessonLoading && (
              <div className="flex flex-col items-center gap-2">
                <GlowSpinner size={150} ariaLabel="Generating lesson" idSuffix="node-start" />
                <div className="text-sm text-[var(--foreground)]/75">Generating lesson…</div>
              </div>
            )}
            <button
              className="relative inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white font-semibold text-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
              onClick={async () => {
                try {
                  setLessonLoading(true);
                  setError(null);

                  // Check if this is an exam snipe lesson
                  const examSnipeMeta = (content as any)?.examSnipeMeta;
                  if (examSnipeMeta && examSnipeMeta.historySlug && examSnipeMeta.planIdMapping) {
                    // This is an exam snipe lesson - use exam snipe generation flow
                    const planId = examSnipeMeta.planIdMapping[activeLessonIndex];
                    if (!planId) {
                      throw new Error("Plan ID not found for this lesson");
                    }

                    // Fetch the exam snipe history to get full context
                    const historyRes = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(examSnipeMeta.historySlug)}`, {
                      credentials: "include",
                    });
                    const historyJson = await historyRes.json().catch(() => ({}));
                    if (!historyRes.ok || !historyJson?.record) {
                      throw new Error("Failed to load exam snipe history");
                    }

                    const historyRecord = historyJson.record;
                    const results = historyRecord.results || {};
                    const concepts = results.concepts || [];
                    const concept = concepts.find((c: any) => c.name === examSnipeMeta.conceptName);
                    const lessonPlans = results.lessonPlans || {};
                    const conceptPlan = lessonPlans[examSnipeMeta.conceptName] || concept?.lessonPlan;
                    const planItem = conceptPlan?.lessons?.find((l: any) => String(l.id) === planId);

                    if (!planItem) {
                      throw new Error("Lesson plan not found");
                    }

                    // Generate lesson via exam-snipe API (it handles context properly with other lessons)
                    const lessonRes = await fetch("/api/exam-snipe/generate-lesson", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        historySlug: examSnipeMeta.historySlug,
                        courseName: historyRecord.courseName || subjectData?.subject || slug,
                        patternAnalysis: results.patternAnalysis,
                        conceptName: examSnipeMeta.conceptName,
                        conceptDescription: concept?.description || "",
                        keySkills: conceptPlan?.keySkills || [],
                        examConnections: conceptPlan?.examConnections || [],
                        planId,
                        planTitle: planItem.title,
                        planSummary: planItem.summary,
                        planObjectives: planItem.objectives || [],
                        detectedLanguage: results.detectedLanguage,
                        // Don't pass lessonData - let it generate with proper context including other lessons
                      }),
                    });
                    const lessonJson = await lessonRes.json().catch(() => ({}));
                    if (!lessonRes.ok || !lessonJson?.ok) throw new Error(lessonJson?.error || `Server error (${lessonRes.status})`);

                    // Update local content - PRESERVE flashcards only (this is initial generation)
                    const updatedContent = preserveExamSnipeMeta({ ...(content || { overview: "", symbols: [], lessons: [] }) } as TopicGeneratedContent);
                    if (!updatedContent.lessons) updatedContent.lessons = [];
                    while (updatedContent.lessons.length <= activeLessonIndex) {
                      updatedContent.lessons.push(null);
                    }
                    // Preserve only flashcards from existing lesson (if any)
                    const existingLesson = updatedContent.lessons[activeLessonIndex] || {};
                    const existingFlashcards = (existingLesson as any)?.flashcards;
                    updatedContent.lessons[activeLessonIndex] = {
                      title: String(lessonJson.lesson?.title || planItem.title),
                      body: String(lessonJson.lesson?.body || ""),
                    quiz: Array.isArray(lessonJson.lesson?.quiz)
                      ? lessonJson.lesson.quiz.map((q: any) => ({
                          question: String(q.question || ""),
                          answer: q.answer ? String(q.answer) : undefined,
                        }))
                      : [],
                      metadata: lessonJson.lesson?.metadata || null,
                      ...(existingFlashcards ? { flashcards: existingFlashcards } : {}),
                    };
                    if (!updatedContent.lessonsMeta) updatedContent.lessonsMeta = [];
                    if (updatedContent.lessonsMeta[activeLessonIndex]) {
                      (updatedContent.lessonsMeta[activeLessonIndex] as any).type = 'Generated Lesson';
                      (updatedContent.lessonsMeta[activeLessonIndex] as any).title = String(lessonJson.lesson?.title || planItem.title);
                      (updatedContent.lessonsMeta[activeLessonIndex] as any).planId = planId;
                    }
                    updatedContent.rawLessonJson = Array.isArray(updatedContent.rawLessonJson) ? [...updatedContent.rawLessonJson] : [];
                    while (updatedContent.rawLessonJson.length <= activeLessonIndex) {
                      updatedContent.rawLessonJson.push(null);
                    }
                    updatedContent.rawLessonJson[activeLessonIndex] = typeof lessonJson.raw === 'string' ? lessonJson.raw : JSON.stringify(lessonJson.lesson);

                    setContent(updatedContent);
                    await upsertNodeContentAsync(slug, title, updatedContent);
                    return;
                  }

                  // Regular course lesson generation
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
                      lessonIndex: activeLessonIndex,
                      previousLessons: content?.lessons?.filter((l): l is TopicGeneratedLesson => l !== null) || [],
                      generatedLessons: content?.lessons?.filter((l): l is TopicGeneratedLesson => l !== null).map((l, i) => ({ index: i, title: l.title, body: l.body })) || [],
                      otherLessonsMeta: (content?.lessonsMeta || []).slice(activeLessonIndex + 1).map((m, i) => ({ index: activeLessonIndex + 1 + i, type: m.type, title: m.title })),
                      courseTopics,
                      languageName: subjectData?.course_language_name || "",
                    })
                  });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                  const lesson = json.data || {};
                  const next = { ...(content as TopicGeneratedContent) };
                  next.lessons = next.lessons ? [...next.lessons] : [];
                  while (next.lessons.length <= activeLessonIndex) {
                    next.lessons.push(null);
                  }
                  next.lessons[activeLessonIndex] = {
                    title: String(lesson.title || (content?.lessonsMeta?.[activeLessonIndex]?.title || `Lesson ${activeLessonIndex + 1}`)),
                    body: String(lesson.body || ""),
                    quiz: Array.isArray(lesson.quiz)
                      ? lesson.quiz.map((q: any) => ({
                          question: String(q.question || ""),
                          answer: q.answer ? String(q.answer) : undefined,
                        }))
                      : [],
                    metadata: lesson.metadata || null
                  };
                  next.rawLessonJson = Array.isArray(next.rawLessonJson) ? [...next.rawLessonJson] : [];
                  while (next.rawLessonJson.length <= activeLessonIndex) {
                    next.rawLessonJson.push(null);
                  }
                  next.rawLessonJson[activeLessonIndex] = typeof json.raw === 'string' ? json.raw : JSON.stringify(lesson);
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
            >
              {lessonLoading ? '...' : 'Start'}
            </button>
            <div className="text-center space-y-1">
              <div className="text-lg font-medium text-[var(--foreground)]">
                {content?.lessonsMeta?.[activeLessonIndex]?.title || 'Lesson'}
              </div>
              <div className="text-sm text-[var(--foreground)]/60">
                Click to generate
              </div>
            </div>
          </div>
        ) : content && content.lessons && content.lessons[activeLessonIndex]?.body ? (
            <div className="space-y-6">
              
              <div className="rounded-2xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-5 text-[var(--foreground)] shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
              
              <div className="flex items-center gap-2 mb-4">
                {/* Concise button */}
                <div
                  className="inline-flex rounded-xl transition-all duration-300 overflow-hidden"
                  style={{
                    padding: '1.5px',
                    background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                  }}
                >
                  <button
                    onClick={async () => {
                      if (shorteningLesson || lessonLoading) return;
                      setShorteningLesson(true);
                      try {
                        const lessonIdx = activeLessonIndex;
                        const currentLesson = content.lessons[lessonIdx];
                        if (!currentLesson) {
                          alert("No lesson content to shorten");
                          return;
                        }
                        const res = await fetch("/api/shorten-lesson", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            lessonTitle: currentLesson.title,
                            lessonBody: sanitizeLessonBody(currentLesson.body),
                            subject: subjectData?.subject || slug,
                            topic: title,
                          })
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                        const shortenedLesson = json.data || {};
                        const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) });
                        next.lessons[lessonIdx] = {
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
                    className="inline-flex items-center justify-center px-1.5 py-1.5
                               text-[var(--foreground)]
                               bg-[var(--background)]/90 backdrop-blur-md
                               disabled:opacity-60 transition-all duration-300 ease-out"
                    style={{
                      borderRadius: '10.5px',
                      margin: 0,
                      display: 'flex',
                      minWidth: '28px',
                      height: '28px',
                    }}
                    title="Shorten lesson (make it concise)"
                  >
                    <span className="text-lg font-bold leading-none">-</span>
                  </button>
                </div>
                {/* Regenerate button */}
                <div
                  className="inline-flex rounded-xl transition-all duration-300 overflow-hidden"
                  style={{
                    padding: '1.5px',
                    background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                  }}
                >
                  <button
                    onClick={async () => {
                      if (lessonLoading) return;
                      setLessonLoading(true);
                      try {
                        const lessonIdx = activeLessonIndex;
                        
                        // Check if this is an exam snipe lesson
                        const examSnipeMeta = (content as any)?.examSnipeMeta;
                        if (examSnipeMeta && examSnipeMeta.historySlug && examSnipeMeta.planIdMapping) {
                          // This is an exam snipe lesson - regenerate via exam snipe API
                          const planId = examSnipeMeta.planIdMapping[lessonIdx];
                          if (!planId) {
                            throw new Error("Plan ID not found for this lesson");
                          }

                          // Fetch exam snipe history to get context
                          const historyRes = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(examSnipeMeta.historySlug)}`, {
                            credentials: "include",
                          });
                          const historyJson = await historyRes.json().catch(() => ({}));
                          if (!historyRes.ok || !historyJson?.record) {
                            throw new Error("Failed to load exam snipe history");
                          }

                          const historyRecord = historyJson.record;
                          const results = historyRecord.results || {};
                          const concepts = results.concepts || [];
                          const concept = concepts.find((c: any) => c.name === examSnipeMeta.conceptName);
                          const lessonPlans = results.lessonPlans || {};
                          const conceptPlan = lessonPlans[examSnipeMeta.conceptName] || concept?.lessonPlan;
                          const planItem = conceptPlan?.lessons?.find((l: any) => String(l.id) === planId);

                          if (!planItem) {
                            throw new Error("Lesson plan not found");
                          }

                          // Generate new lesson via exam-snipe API (it handles context properly with other lessons)
                          const lessonRes = await fetch("/api/exam-snipe/generate-lesson", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({
                              historySlug: examSnipeMeta.historySlug,
                              courseName: historyRecord.courseName || subjectData?.subject || slug,
                              patternAnalysis: results.patternAnalysis,
                              conceptName: examSnipeMeta.conceptName,
                              conceptDescription: concept?.description || "",
                              keySkills: conceptPlan?.keySkills || [],
                              examConnections: conceptPlan?.examConnections || [],
                              planId,
                              planTitle: planItem.title,
                              planSummary: planItem.summary,
                              planObjectives: planItem.objectives || [],
                              detectedLanguage: results.detectedLanguage,
                              // Don't pass lessonData - let it generate with proper context including other lessons
                            }),
                          });
                          const lessonJson = await lessonRes.json().catch(() => ({}));
                          if (!lessonRes.ok || !lessonJson?.ok) throw new Error(lessonJson?.error || `Server error (${lessonRes.status})`);

                          // Update local content
                          const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) });
                          const existingLesson = next.lessons[lessonIdx];
                          // Preserve flashcards but replace lesson content
                          next.lessons[lessonIdx] = {
                            ...(existingLesson as any),
                            title: String(lessonJson.lesson?.title || planItem.title),
                            body: String(lessonJson.lesson?.body || ""),
                            quiz: Array.isArray(lessonJson.lesson?.quiz)
                              ? lessonJson.lesson.quiz.map((q: any) => ({
                                  question: String(q.question || ""),
                                  answer: q.answer ? String(q.answer) : undefined,
                                }))
                              : [],
                            metadata: lessonJson.lesson?.metadata || null,
                            // Clear old quiz data
                            userAnswers: undefined,
                            quizResults: undefined,
                            quizCompletedAt: undefined,
                          };
                          next.rawLessonJson = Array.isArray(next.rawLessonJson) ? [...next.rawLessonJson] : [];
                          next.rawLessonJson[lessonIdx] = typeof lessonJson.raw === 'string' ? lessonJson.raw : JSON.stringify(lessonJson.lesson);
                          setContent(next);
                          await upsertNodeContentAsync(slug, title, next);
                          
                          // Reset quiz state
                          setUserAnswers({});
                          setQuizResults(null);
                          return;
                        }

                        // Regular course lesson regeneration
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
                            lessonIndex: lessonIdx,
                            previousLessons: content.lessons.slice(0, lessonIdx),
                            generatedLessons: content.lessons.slice(0, lessonIdx).filter((l): l is TopicGeneratedLesson => l !== null).map((l, i) => ({ index: i, title: l.title, body: l.body })),
                            otherLessonsMeta: (content?.lessonsMeta || []).slice(lessonIdx + 1).map((m, i) => ({ index: lessonIdx + 1 + i, type: m.type, title: m.title })),
                            courseTopics,
                            languageName: subjectData?.course_language_name || "",
                          })
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                        const lesson = json.data || {};
                        const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) });
                        const existingLesson = next.lessons[lessonIdx];
                        // Preserve flashcards but replace lesson content
                        next.lessons[lessonIdx] = {
                          ...(existingLesson as any),
                          title: String(lesson.title || next.lessons[lessonIdx]?.title || content?.lessonsMeta?.[activeLessonIndex]?.title || `Lesson ${lessonIdx + 1}`),
                          body: String(lesson.body || ""),
                          quiz: Array.isArray(lesson.quiz)
                            ? lesson.quiz.map((q: any) => ({
                                question: String(q.question || ""),
                                answer: q.answer ? String(q.answer) : undefined,
                              }))
                            : [],
                          metadata: lesson.metadata || null,
                          // Clear old quiz data
                          userAnswers: undefined,
                          quizResults: undefined,
                          quizCompletedAt: undefined,
                        };
                        next.rawLessonJson = Array.isArray(next.rawLessonJson) ? [...next.rawLessonJson] : [];
                        next.rawLessonJson[lessonIdx] = typeof json.raw === 'string' ? json.raw : JSON.stringify(lesson);
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
                    className="inline-flex items-center justify-center px-1.5 py-1.5
                               text-[var(--foreground)]
                               bg-[var(--background)]/90 backdrop-blur-md
                               disabled:opacity-60 transition-all duration-300 ease-out"
                    style={{
                      borderRadius: '10.5px',
                      margin: 0,
                      display: 'flex',
                      minWidth: '28px',
                      height: '28px',
                    }}
                    title="Regenerate this lesson"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 4V9H4.58152M4.58152 9C5.47362 7.27477 7.06307 6 9 6C11.3869 6 13.6761 7.36491 14.9056 9.54555M4.58152 9H9M20 20V15H19.4185M19.4185 15C18.5264 16.7252 16.9369 18 15 18C12.6131 18 10.3239 16.6351 9.09443 14.4545M19.4185 15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                {/* Single-lesson mode: dropdown removed */}
              </div>

              <div className="lesson-content" style={{ wordSpacing: '-0.04em' }}>
                {lessonLoading && (
                  <div className="flex items-center justify-center py-8 mb-4 rounded-lg bg-[#1A1F2E] border border-[#2B3140]">
                    <div className="flex items-center gap-3">
                      <GlowSpinner size={48} padding={0} inline className="shrink-0" ariaLabel="Generating lesson" idSuffix="node-inline-lesson" />
                      <div className="text-sm text-[#A7AFBE]">Generating lesson…</div>
                    </div>
                  </div>
                )}
                {content.lessons[activeLessonIndex]?.body ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-[var(--foreground)]/70">{content.lessonsMeta?.[activeLessonIndex]?.title}</div>
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
                    {lessonMetadata && (
                      <div className="mb-6 rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-4 space-y-4">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--foreground)]/70">
                          <span className="inline-flex items-center rounded-full border border-[var(--foreground)]/20 px-3 py-1 text-[var(--foreground)]">
                            {lessonMetadata.title || content.lessonsMeta?.[activeLessonIndex]?.title || "Lesson overview"}
                          </span>
                          {lessonMetadata.readingTimeMinutes && (
                            <span className="inline-flex items-center rounded-full border border-[var(--foreground)]/20 px-2.5 py-0.5 text-[var(--foreground)]/80">
                              ⏱️ {lessonMetadata.readingTimeMinutes} min read
                            </span>
                          )}
                        </div>
                        {lessonMetadata.summary && (
                          <p className="text-sm leading-relaxed text-[var(--foreground)]/90">
                            {formatMetadataEntry(lessonMetadata.summary)}
                          </p>
                        )}
                        {lessonMetadata.bulletSummary?.length ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/60 mb-1">
                              Bullet Summary
                            </div>
                            <ul className="list-disc space-y-1 pl-4 text-sm text-[var(--foreground)]/90">
                              {lessonMetadata.bulletSummary.map((item, idx) => (
                                <li key={`bullet-${idx}`}>{formatMetadataEntry(item)}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {lessonMetadata.objectives?.length ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/60 mb-1">
                              Objectives
                            </div>
                            <ul className="list-decimal space-y-1 pl-6 text-sm text-[var(--foreground)]/90">
                              {lessonMetadata.objectives.map((item, idx) => (
                                <li key={`objective-${idx}`}>{formatMetadataEntry(item)}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {lessonMetadata.tags?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {lessonMetadata.tags.map((tag) => (
                              <span key={tag} className="inline-flex items-center rounded-full bg-[var(--accent-cyan)]/10 px-3 py-1 text-xs text-[var(--accent-cyan)]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                    <div
                      className="lesson-content"
                      style={{ cursor: hoverWordRects.length > 0 ? 'pointer' : 'default' }}
                      onClick={(e) => {
                        try {
                          const target = e.target as HTMLElement | null;
                          if (!target) return;
                          // Ignore clicks inside links, code, pre, and KaTeX
                          if (target.closest("a, code, pre, .katex")) return;
                          const x = (e as any).clientX as number;
                          const y = (e as any).clientY as number;
                          const doc: any = document as any;
                          let range: Range | null = null;
                          if (doc.caretRangeFromPoint) {
                            range = doc.caretRangeFromPoint(x, y);
                          } else if (doc.caretPositionFromPoint) {
                            const pos = doc.caretPositionFromPoint(x, y);
                            if (pos) {
                              range = document.createRange();
                              range.setStart(pos.offsetNode, pos.offset);
                              range.collapse(true);
                            }
                          }
                          if (!range) return;
                          let node = range.startContainer;
                          if (node.nodeType !== Node.TEXT_NODE) {
                            // find nearest text node
                            const asEl = node as unknown as HTMLElement;
                            const walker = document.createTreeWalker(asEl, NodeFilter.SHOW_TEXT);
                            node = walker.nextNode() || node;
                          }
                          if (node.nodeType !== Node.TEXT_NODE) return;
                          const text = (node.textContent || "");
                          let idx = Math.max(0, Math.min(range.startOffset, text.length));
                          // expand to word boundaries
                          const isWordChar = (ch: string) => /[\p{L}\p{N}\u2019'\-]/u.test(ch);
                          let start = idx;
                          while (start > 0 && isWordChar(text[start - 1])) start--;
                          let end = idx;
                          while (end < text.length && isWordChar(text[end])) end++;
                          const word = text.slice(start, end).trim();
                          if (!word) return;
                          const container = (node.parentElement as HTMLElement | null)?.closest("p, li, td, th, blockquote, div") as HTMLElement | null;
                          const parentText = (container?.innerText || node.parentElement?.textContent || text).trim();
                          onWordClick(word, parentText, e as any);
                        } catch {}
                      }}
                      onMouseMove={(e) => {
                        try {
                          const target = e.target as HTMLElement | null;
                          if (!target) return setHoverWordRects([]);
                          if (target.closest("a, code, pre, .katex")) return setHoverWordRects([]);
                          const x = (e as any).clientX as number;
                          const y = (e as any).clientY as number;
                          
                          // DEBUG: Log mouse position
                          console.log('🔍 Mouse position:', { clientX: x, clientY: y, scrollX: window.scrollX, scrollY: window.scrollY });
                          
                          const doc: any = document as any;
                          let range: Range | null = null;
                          if (doc.caretRangeFromPoint) {
                            range = doc.caretRangeFromPoint(x, y);
                          } else if (doc.caretPositionFromPoint) {
                            const pos = doc.caretPositionFromPoint(x, y);
                            if (pos) {
                              range = document.createRange();
                              range.setStart(pos.offsetNode, pos.offset);
                              range.collapse(true);
                            }
                          }
                          if (!range) return setHoverWordRects([]);
                          let node = range.startContainer;
                          if (node.nodeType !== Node.TEXT_NODE) {
                            const asEl = node as unknown as HTMLElement;
                            const walker = document.createTreeWalker(asEl, NodeFilter.SHOW_TEXT);
                            node = walker.nextNode() || node;
                          }
                          if (node.nodeType !== Node.TEXT_NODE) return setHoverWordRects([]);
                          const text = (node.textContent || "");
                          let idx = Math.max(0, Math.min(range.startOffset, text.length));
                          // Word character: letters, numbers, apostrophes, hyphens (but not whitespace, line breaks, or punctuation)
                          const isWordChar = (ch: string) => /[\p{L}\p{N}\u2019'\-]/u.test(ch);
                          // Expand backwards to find word start
                          let start = idx;
                          while (start > 0 && isWordChar(text[start - 1])) start--;
                          // Expand forwards to find word end
                          let end = idx;
                          while (end < text.length && isWordChar(text[end])) end++;
                          // Trim any trailing whitespace that might have been included
                          while (end > start && /\s/.test(text[end - 1])) end--;
                          if (start === end) return setHoverWordRects([]);
                          
                          const detectedWord = text.slice(start, end);
                          console.log('📝 Detected word:', detectedWord, { start, end, textLength: text.length });
                          
                          const wordRange = document.createRange();
                          wordRange.setStart(node, start);
                          wordRange.setEnd(node, end);
                          
                          // Get parent element to check for transforms/offsets
                          const parentEl = node.parentElement;
                          const parentRect = parentEl?.getBoundingClientRect();
                          console.log('📦 Parent element:', {
                            tagName: parentEl?.tagName,
                            className: parentEl?.className,
                            parentRect: parentRect ? { left: parentRect.left, top: parentRect.top, width: parentRect.width, height: parentRect.height } : null,
                            computedStyle: parentEl ? window.getComputedStyle(parentEl).transform : null,
                          });
                          
                          // Try to get the bounding rect first - more accurate for single-line words
                          const boundingRect = wordRange.getBoundingClientRect();
                          const clientRects = wordRange.getClientRects();
                          
                          console.log('📐 Range coordinates:', {
                            boundingRect: boundingRect ? {
                              left: boundingRect.left,
                              top: boundingRect.top,
                              width: boundingRect.width,
                              height: boundingRect.height,
                              right: boundingRect.right,
                              bottom: boundingRect.bottom,
                            } : null,
                            clientRects: Array.from(clientRects).map(r => ({
                              left: r.left,
                              top: r.top,
                              width: r.width,
                              height: r.height,
                              right: r.right,
                              bottom: r.bottom,
                            })),
                            mouseOffset: {
                              offsetX: x - (boundingRect?.left || 0),
                              offsetY: y - (boundingRect?.top || 0),
                            },
                          });
                          
                          // Get CSS zoom factor and compensate coordinates
                          const htmlZoom = parseFloat(window.getComputedStyle(document.documentElement).zoom || '1');
                          
                          if (boundingRect && boundingRect.width > 0 && boundingRect.height > 0) {
                            // Compensate for CSS zoom: divide coordinates by zoom factor
                            // getBoundingClientRect() returns coordinates in zoomed space, but fixed positioning uses unzoomed space
                            const rect = {
                              left: boundingRect.left / htmlZoom,
                              top: boundingRect.top / htmlZoom,
                              width: boundingRect.width / htmlZoom,
                              height: boundingRect.height / htmlZoom,
                            };
                            console.log('✅ Using boundingRect (compensated for zoom):', rect, {
                              htmlZoom,
                              originalRect: { left: boundingRect.left, top: boundingRect.top, width: boundingRect.width, height: boundingRect.height },
                              mousePos: { x, y },
                              wordCenter: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
                              offset: { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) },
                            });
                            setHoverWordRects([rect]);
                          } else {
                            // Fallback to getClientRects for multi-line words
                            if (!clientRects || clientRects.length === 0) return setHoverWordRects([]);
                            const validRects: Array<{ left: number; top: number; width: number; height: number }> = [];
                            for (let i = 0; i < clientRects.length; i++) {
                              const rect = clientRects[i];
                              if (rect && rect.width > 0 && rect.height > 0) {
                                // Compensate for CSS zoom
                                validRects.push({
                                  left: rect.left / htmlZoom,
                                  top: rect.top / htmlZoom,
                                  width: rect.width / htmlZoom,
                                  height: rect.height / htmlZoom,
                                });
                              }
                            }
                            console.log('✅ Using clientRects (compensated for zoom):', validRects);
                            setHoverWordRects(validRects);
                          }
                        } catch (err) {
                          console.error('❌ Error in hover detection:', err);
                          setHoverWordRects([]);
                        }
                      }}
                      onMouseLeave={() => setHoverWordRects([])}
                    >
                      {(() => {
                        let processedBody = content.lessons[activeLessonIndex].body;
                        // Remove metadata header if present (do not modify delimiters)
                        processedBody = processedBody
                          .replace(/^Lesson Title:.*\n/m, '')
                          .replace(/^Subject:.*\n/m, '')
                          .replace(/^Topic:.*\n/m, '');
                        processedBody = sanitizeLessonBody(processedBody);
                        return <LessonBody body={processedBody} />;
                      })()}
                    </div>
                    <style jsx global>{`
                      .lesson-content p{ margin: 0.45rem 0 !important; }
                      .lesson-content ul, .lesson-content ol{ margin: 0.4rem 0 !important; }
                      .lesson-content h1, .lesson-content h2{ margin-top: 0.6rem !important; margin-bottom: 0.35rem !important; }
                    `}</style>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <div className="text-center">
                      <div className="text-lg font-medium text-[#E5E7EB] mb-2">
                        {content.lessonsMeta?.[activeLessonIndex]?.type}: {content.lessonsMeta?.[activeLessonIndex]?.title}
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
                                lessonIndex: activeLessonIndex,
                                previousLessons: content.lessons.filter((l): l is TopicGeneratedLesson => l !== null),
                                generatedLessons: content.lessons.filter((l): l is TopicGeneratedLesson => l !== null).map((l, i) => ({ index: i, title: l.title, body: l.body })),
                                otherLessonsMeta: (content?.lessonsMeta || []).slice(activeLessonIndex + 1).map((m, i) => ({ index: activeLessonIndex + 1 + i, type: m.type, title: m.title })),
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
                            while (next.lessons.length <= activeLessonIndex) {
                              next.lessons.push(null);
                            }
                            next.lessons[activeLessonIndex] = {
                              title: String(lesson.title || (content?.lessonsMeta?.[activeLessonIndex]?.title || `Lesson ${activeLessonIndex + 1}`)),
                              body: String(lesson.body || ""),
                              quiz: Array.isArray(lesson.quiz)
                                ? lesson.quiz.map((q: any) => ({
                                    question: String(q.question || ""),
                                    answer: q.answer ? String(q.answer) : undefined,
                                  }))
                                : [],
                              metadata: lesson.metadata || null
                            };
                            next.rawLessonJson = Array.isArray(next.rawLessonJson) ? [...next.rawLessonJson] : [];
                            while (next.rawLessonJson.length <= activeLessonIndex) {
                              next.rawLessonJson.push(null);
                            }
                            next.rawLessonJson[activeLessonIndex] = typeof json.raw === 'string' ? json.raw : JSON.stringify(lesson);
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
              </div>
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
                {practiceOpen && lessonQuiz.length > 0 && (
                  <div className="px-4 pt-4 pb-4">
                    <div className="space-y-6">
                      {lessonQuiz.map((q, qi) => (
                        <div key={qi} className="space-y-3 p-4 rounded-lg bg-[var(--background)]/60 border border-[var(--foreground)]/10">
                          <div className="text-sm font-medium text-[var(--foreground)]">
                            <span className="mr-1">{qi + 1}.</span> <LessonBody body={sanitizeLessonBody(String(q.question || ""))} />
                          </div>
                          <div className="space-y-2">
                            <textarea
                              value={userAnswers[qi] || ""}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setUserAnswers(prev => ({ ...prev, [qi]: nextVal }));
                                try {
                                  if (!content) return;
                                  const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) } as any);
                                  next.lessons = Array.isArray(next.lessons) ? [...next.lessons] : [];
                                  const l = { ...(next.lessons[activeLessonIndex] as any) };
                                  const answersArr: string[] = Array.isArray(l.userAnswers) ? [...l.userAnswers] : [];
                                  while (answersArr.length < lessonQuiz.length) answersArr.push("");
                                  answersArr[qi] = nextVal;
                                  l.userAnswers = answersArr;
                                  next.lessons[activeLessonIndex] = l;
                                  upsertNodeContent(slug, title, next);
                                } catch {}
                              }}
                              onTouchStart={(e) => { e.currentTarget.focus(); }}
                              className={
                                quizResults?.[qi]
                                  ? quizResults[qi].correct
                                    ? 'w-full rounded-lg border border-green-300 bg-green-50 text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200 px-3 py-2 text-sm transition-colors resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none'
                                    : 'w-full rounded-lg border border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 px-3 py-2 text-sm transition-colors resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none'
                                  : 'w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none px-3 py-2 text-sm transition-colors resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none'
                              }
                              placeholder="Write your answer here..."
                              rows={3}
                              disabled={checkingAnswers}
                              tabIndex={0}
                              inputMode="text"
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              style={{ WebkitUserSelect: 'text', WebkitTouchCallout: 'none', WebkitAppearance: 'none', touchAction: 'manipulation' }}
                            />
                            {quizResults?.[qi] && (
                              <div className="space-y-2">
                                <div className={
                                  quizResults[qi].correct
                                    ? 'text-xs p-3 rounded bg-green-50 text-green-800 border border-green-200 dark:bg-green-500/10 dark:text-green-200 dark:border-green-500/30'
                                    : 'text-xs p-3 rounded bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/30'
                                }>
                                  <div className="font-semibold mb-1">{quizResults[qi].correct ? '✓ Correct!' : '✗ Not quite'}</div>
                                  <LessonBody body={sanitizeLessonBody(String(quizResults[qi].explanation || ""))} />
                                </div>
                                
                                {!quizResults[qi].correct && quizResults[qi].hint && (
                                  <div className="space-y-1">
                                    <button
                                      onClick={() => setShowHints(prev => ({ ...prev, [qi]: !prev[qi] }))}
                                      className="text-xs text-[#2563EB] hover:text-[#1D4ED8] hover:underline transition-colors dark:text-[#60A5FA] dark:hover:text-[#93C5FD]"
                                    >
                                      {showHints[qi] ? '▼ Hide hint' : '▶ Show hint'}
                                    </button>
                                    {showHints[qi] && (
                                      <div className="text-xs p-3 rounded bg-blue-50 text-blue-900 border border-blue-200 dark:bg-[#1E3A5F]/30 dark:text-[#E0F2FE] dark:border-[#60A5FA]/20">
                                        💡 <LessonBody body={sanitizeLessonBody(String(quizResults[qi].hint || ""))} />
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {quizResults[qi].fullSolution && (
                                  <div className="space-y-1">
                                    <button
                                      onClick={() => setShowSolutions(prev => ({ ...prev, [qi]: !prev[qi] }))}
                                      className="text-xs text-[#7C3AED] hover:text-[#6D28D9] hover:underline transition-colors dark:text-[#C084FC] dark:hover:text-[#D8B4FE]"
                                    >
                                      {showSolutions[qi] ? '▼ Hide solution' : '▶ Show step-by-step solution'}
                                    </button>
                                    {showSolutions[qi] && (
                                      <div className="text-xs p-3 rounded bg-purple-50 text-purple-900 border border-purple-200 dark:bg-[#3B1F4F]/30 dark:text-[#F3E8FF] dark:border-[#C084FC]/20">
                                        <LessonBody body={sanitizeLessonBody(String(quizResults[qi].fullSolution || ""))} />
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
                            const currentLesson = content.lessons[activeLessonIndex];
                            if (!currentLesson) {
                              alert("No lesson content to check answers for");
                              return;
                            }
                            const answers = lessonQuiz.map((q, qi) => ({
                              question: q.question,
                              userAnswer: userAnswers[qi] || ""
                            }));

                            const res = await fetch("/api/check-quiz", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                subject: subjectData?.subject || slug,
                                topic: title,
                                lessonContent: sanitizeLessonBody(currentLesson.body),
                                courseContext: subjectData?.course_context || "",
                                answers,
                                languageName: subjectData?.course_language_name || ""
                              })
                            });

                            const json = await res.json().catch(() => ({}));
                            if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);

                            const results = json.results || {};
                            setQuizResults(results);
                            try {
                              const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) } as any);
                              next.lessons = Array.isArray(next.lessons) ? [...next.lessons] : [];
                              const l = { ...(next.lessons[activeLessonIndex] as any) };
                              const answersArr: string[] = [];
                              const numQ = lessonQuiz.length;
                              for (let i = 0; i < numQ; i++) answersArr[i] = userAnswers[i] || "";
                              l.userAnswers = answersArr;
                              l.quizResults = results;
                              l.quizCompletedAt = Date.now();
                              next.lessons[activeLessonIndex] = l;
                              upsertNodeContent(slug, title, next);
                            } catch {}
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
                          onClick={() => openFlashcardsViewer(0)}
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

              {/* Multiple Choice Quiz item */}
              <div className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                <button
                  onClick={() => setMcQuizOpen(!mcQuizOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors ${mcQuizOpen ? 'rounded-t-xl border-b border-[var(--foreground)]/10 !shadow-none' : 'rounded-xl'}`}
                >
                  <span>Quiz</span>
                  <svg
                    className={`h-4 w-4 transition-transform ${mcQuizOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {mcQuizOpen && (
                  <div className="px-4 pt-4 pb-4">
                    {mcQuestions.length === 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-[var(--foreground)]/70">Generate multiple choice questions to test your understanding.</p>
                        <button
                          onClick={async () => {
                            if (generatingMcQuiz || !currentLesson?.body) return;
                            setGeneratingMcQuiz(true);
                            setMcResults(null);
                            setMcAnswers({});
                            try {
                              const res = await fetch("/api/generate-mc-quiz", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  subject: subjectData?.subject || slug,
                                  topic: title,
                                  lessonContent: sanitizeLessonBody(currentLesson.body),
                                  courseContext: subjectData?.course_context || "",
                                  languageName: subjectData?.course_language_name || ""
                                })
                              });
                              const json = await res.json().catch(() => ({}));
                              if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
                              const questions = json.questions || [];
                              setMcQuestions(questions);
                              
                              // Save MC quiz questions to lesson
                              try {
                                if (!content) return;
                                const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) } as any);
                                next.lessons = Array.isArray(next.lessons) ? [...next.lessons] : [];
                                const l = { ...(next.lessons[activeLessonIndex] as any) };
                                l.mcQuiz = questions;
                                next.lessons[activeLessonIndex] = l;
                                upsertNodeContent(slug, title, next);
                              } catch {}
                            } catch (err: any) {
                              alert(err?.message || "Failed to generate quiz");
                            } finally {
                              setGeneratingMcQuiz(false);
                            }
                          }}
                          disabled={generatingMcQuiz || !currentLesson?.body}
                          className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium !text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
                        >
                          {generatingMcQuiz ? "Generating..." : "Generate Quiz"}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {mcQuestions.map((q, qi) => (
                          <div key={qi} className="space-y-3 p-4 rounded-lg bg-[var(--background)]/60 border border-[var(--foreground)]/10">
                            <div className="text-sm font-medium text-[var(--foreground)]">
                              <span className="mr-1">{qi + 1}.</span> <LessonBody body={sanitizeLessonBody(String(q.question || ""))} />
                            </div>
                            <div className="space-y-2">
                              {q.options.map((option, oi) => (
                                <label
                                  key={oi}
                                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                    mcResults?.[qi]
                                      ? oi === q.correctAnswer
                                        ? 'border-green-500 bg-green-500/10'
                                        : mcAnswers[qi] === oi
                                        ? 'border-red-500 bg-red-500/10'
                                        : 'border-[var(--foreground)]/10 opacity-50'
                                      : mcAnswers[qi] === oi
                                      ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10'
                                      : 'border-[var(--foreground)]/20 hover:border-[var(--accent-cyan)]/50'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`mc-question-${qi}`}
                                    checked={mcAnswers[qi] === oi}
                                    onChange={() => {
                                      if (!mcResults) {
                                        setMcAnswers(prev => {
                                          const updated = { ...prev, [qi]: oi };
                                          // Save MC quiz answers to lesson
                                          try {
                                            if (!content) return updated;
                                            const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) } as any);
                                            next.lessons = Array.isArray(next.lessons) ? [...next.lessons] : [];
                                            const l = { ...(next.lessons[activeLessonIndex] as any) };
                                            l.mcAnswers = updated;
                                            next.lessons[activeLessonIndex] = l;
                                            upsertNodeContent(slug, title, next);
                                          } catch {}
                                          return updated;
                                        });
                                      }
                                    }}
                                    disabled={!!mcResults}
                                    className="mt-0.5"
                                  />
                                  <span className="text-sm flex-1"><LessonBody body={sanitizeLessonBody(String(option || ""))} /></span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-3 justify-center">
                          {!mcResults && (
                            <button
                              onClick={() => {
                                const results: { [key: number]: { correct: boolean; explanation: string } } = {};
                                mcQuestions.forEach((q, qi) => {
                                  const correct = mcAnswers[qi] === q.correctAnswer;
                                  results[qi] = {
                                    correct,
                                    explanation: correct 
                                      ? "Great job! You got it right." 
                                      : `The correct answer is: ${q.options[q.correctAnswer]}`
                                  };
                                });
                                setMcResults(results);
                                
                                // Save MC quiz results to lesson
                                try {
                                  if (!content) return;
                                  const next = preserveExamSnipeMeta({ ...(content as TopicGeneratedContent) } as any);
                                  next.lessons = Array.isArray(next.lessons) ? [...next.lessons] : [];
                                  const l = { ...(next.lessons[activeLessonIndex] as any) };
                                  l.mcAnswers = mcAnswers;
                                  l.mcResults = results;
                                  l.mcQuizCompletedAt = Date.now();
                                  next.lessons[activeLessonIndex] = l;
                                  upsertNodeContent(slug, title, next);
                                } catch {}
                              }}
                              disabled={Object.keys(mcAnswers).length !== mcQuestions.length}
                              className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
                            >
                              Submit Answers
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setMcQuestions([]);
                              setMcAnswers({});
                              setMcResults(null);
                            }}
                            className="inline-flex h-10 items-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-6 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                          >
                            Generate New Quiz
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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

            <div className="flex flex-col items-center gap-4 mt-8">
              {/* Review Rating */}
              {!reviewedThisSession.has(activeLessonIndex) ? (
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
                            markLessonReviewed(slug, title, activeLessonIndex, item.value);
                            setReviewedThisSession(prev => new Set([...prev, activeLessonIndex]));
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
          <div className="relative mx-auto mt-24 flex max-w-md flex-col items-center justify-center gap-6">
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle at center, rgba(0, 229, 255, 0.25), rgba(255, 45, 150, 0.12) 60%, transparent 70%)' }} />
            {lessonLoading && (
              <div className="flex flex-col items-center gap-2">
                <GlowSpinner size={150} ariaLabel="Generating lesson" idSuffix="node-start" />
                <div className="text-sm text-[var(--foreground)]/75">Generating lesson…</div>
              </div>
            )}
            <button
              className="relative inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white font-semibold text-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
              onClick={async () => {
                try {
                  setLessonLoading(true);
                  setError(null);

                  // Check if this is an exam snipe lesson
                  const examSnipeMeta = (content as any)?.examSnipeMeta;
                  if (examSnipeMeta && examSnipeMeta.historySlug && examSnipeMeta.planIdMapping) {
                    // This is an exam snipe lesson - use exam snipe API
                    const planId = examSnipeMeta.planIdMapping[activeLessonIndex];
                    if (!planId) {
                      throw new Error("Plan ID not found for this lesson");
                    }

                    // Get the lesson plan details from the lessonsMeta
                    const lessonMeta = content?.lessonsMeta?.[activeLessonIndex];
                    const planTitle = lessonMeta?.title || title;
                    const planSummary = ""; // We don't have this in the stored data
                    const planObjectives: string[] = []; // We don't have this either

                    // We need to fetch the exam snipe history to get full context
                    const historyRes = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(examSnipeMeta.historySlug)}`, {
                      credentials: "include",
                    });
                    const historyJson = await historyRes.json().catch(() => ({}));
                    if (!historyRes.ok || !historyJson?.record) {
                      throw new Error("Failed to load exam snipe history");
                    }

                    const historyRecord = historyJson.record;
                    const results = historyRecord.results || {};
                    const concepts = results.concepts || [];
                    const concept = concepts.find((c: any) => c.name === examSnipeMeta.conceptName);
                    const lessonPlans = results.lessonPlans || {};
                    const conceptPlan = lessonPlans[examSnipeMeta.conceptName] || concept?.lessonPlan;
                    const planItem = conceptPlan?.lessons?.find((l: any) => String(l.id) === planId);

                    if (!planItem) {
                      throw new Error("Lesson plan not found");
                    }

                    // Generate lesson using exam snipe API
                    const lessonRes = await fetch("/api/exam-snipe/generate-lesson", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        historySlug: examSnipeMeta.historySlug,
                        courseName: historyRecord.courseName || subjectData?.subject || slug,
                        patternAnalysis: results.patternAnalysis,
                        conceptName: examSnipeMeta.conceptName,
                        conceptDescription: concept?.description || "",
                        keySkills: conceptPlan?.keySkills || [],
                        examConnections: conceptPlan?.examConnections || [],
                        planId,
                        planTitle: planItem.title,
                        planSummary: planItem.summary,
                        planObjectives: planItem.objectives || [],
                        detectedLanguage: results.detectedLanguage,
                      }),
                    });
                    const lessonJson = await lessonRes.json().catch(() => ({}));
                    if (!lessonRes.ok || !lessonJson?.ok) throw new Error(lessonJson?.error || `Server error (${lessonRes.status})`);

                    // Update the lesson in the content - PRESERVE flashcards only (this is initial generation)
                    const updatedContent = preserveExamSnipeMeta({ ...(content || { overview: "", symbols: [], lessons: [] }) } as TopicGeneratedContent);
                    if (!updatedContent.lessons) updatedContent.lessons = [];
                    while (updatedContent.lessons.length <= activeLessonIndex) {
                      updatedContent.lessons.push(null);
                    }
                    // Preserve only flashcards from existing lesson (if any)
                    const existingLesson = updatedContent.lessons[activeLessonIndex] || {};
                    const existingFlashcards = (existingLesson as any)?.flashcards;
                    updatedContent.lessons[activeLessonIndex] = {
                      title: String(lessonJson.lesson?.title || planTitle),
                      body: String(lessonJson.lesson?.body || ""),
                      quiz: Array.isArray(lessonJson.lesson?.quiz)
                        ? lessonJson.lesson.quiz.map((q: any) => ({
                            question: String(q.question || ""),
                            answer: q.answer ? String(q.answer) : undefined,
                          }))
                        : [],
                      metadata: lessonJson.lesson?.metadata || null,
                      ...(existingFlashcards ? { flashcards: existingFlashcards } : {}),
                    };
                    if (!updatedContent.lessonsMeta) updatedContent.lessonsMeta = [];
                    if (updatedContent.lessonsMeta[activeLessonIndex]) {
                      (updatedContent.lessonsMeta[activeLessonIndex] as any).type = 'Generated Lesson';
                      (updatedContent.lessonsMeta[activeLessonIndex] as any).title = String(lessonJson.lesson?.title || planTitle);
                      (updatedContent.lessonsMeta[activeLessonIndex] as any).planId = planId;
                    }
                    updatedContent.rawLessonJson = Array.isArray(updatedContent.rawLessonJson) ? [...updatedContent.rawLessonJson] : [];
                    while (updatedContent.rawLessonJson.length <= activeLessonIndex) {
                      updatedContent.rawLessonJson.push(null);
                    }
                    updatedContent.rawLessonJson[activeLessonIndex] = typeof lessonJson.raw === 'string' ? lessonJson.raw : JSON.stringify(lessonJson.lesson);

                    setContent(updatedContent);
                    await upsertNodeContentAsync(slug, title, updatedContent);
                    return;
                  }

                  // Regular lesson generation (non-exam snipe)
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
                      quiz: Array.isArray(lessonData.quiz)
                        ? lessonData.quiz.map((q: any) => ({
                            question: String(q.question || ""),
                            answer: q.answer ? String(q.answer) : undefined,
                          }))
                        : [],
                      metadata: lessonData.metadata || null
                    }],
                    rawLessonJson: [typeof lessonJson.raw === 'string' ? lessonJson.raw : JSON.stringify(lessonData)],
                  };

                  setContent(normalized);
                  await upsertNodeContentAsync(slug, title, normalized as any);
                } catch (err: any) {
                  setError(err?.message || "Failed to start topic");
                } finally {
                  setLessonLoading(false);
                }
              }}
              disabled={lessonLoading}
            >
              <span className="text-center leading-tight px-2 text-white">
                {lessonLoading ? "Generating…" : <>Start<br />Lesson</>}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
    {flashcardModalOpen && lessonFlashcards.length > 0 && (() => {
      const filtered = filteredLessonCards;
      const currentCard = filtered[currentFlashcardIndex];
      const isStarred = currentCard ? starredFlashcards.has(currentCard.id) : false;
      return filtered.length > 0 ? (
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
            <div className="mb-4">
              <div className="mb-1">
                <span className="text-sm text-[var(--foreground)]/70">
                  Flashcard {currentFlashcardIndex + 1} of {filtered.length}
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
                      const newIndex = getRandomCardIndex(filtered, currentFlashcardIndex);
                      setCurrentFlashcardIndex(newIndex);
                    } else {
                      if (currentFlashcardIndex === 0) return;
                      setCurrentFlashcardIndex((idx) => Math.max(idx - 1, 0));
                    }
                    setFlashcardFlipped(false);
                  }}
                  disabled={!isShuffleActive && currentFlashcardIndex === 0}
                  className="flex h-10 w-10 items-center justify-center text-white bg-[var(--background)]/90 backdrop-blur-md transition-all duration-300 ease-out disabled:cursor-not-allowed"
                  style={{ borderRadius: 'calc(0.75rem - 1.5px)' }}
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
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.08 }}>
                  <GlowSpinner size={120} ariaLabel="" idSuffix="flashcard-bg-lesson" />
                </div>
                {currentCard && (
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleStar(currentCard.id); }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/90 backdrop-blur-sm text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 transition-colors pointer-events-auto"
                    aria-label={isStarred ? "Unstar flashcard" : "Star flashcard"}
                  >
                    <svg className={`h-5 w-5 transition-colors ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
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
                  opacity: (!isShuffleActive && currentFlashcardIndex >= filtered.length - 1) ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!(!isShuffleActive && currentFlashcardIndex >= filtered.length - 1)) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!(!isShuffleActive && currentFlashcardIndex >= filtered.length - 1)) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                  }
                }}
              >
                <button
                  onClick={() => {
                    if (isShuffleActive) {
                      const newIndex = getRandomCardIndex(filtered, currentFlashcardIndex);
                      setCurrentFlashcardIndex(newIndex);
                    } else {
                      if (currentFlashcardIndex >= filtered.length - 1) return;
                      setCurrentFlashcardIndex((idx) => Math.min(idx + 1, filtered.length - 1));
                    }
                    setFlashcardFlipped(false);
                  }}
                  disabled={!isShuffleActive && currentFlashcardIndex >= filtered.length - 1}
                  className="flex h-10 w-10 items-center justify-center text-white bg-[var(--background)]/90 backdrop-blur-md transition-all duration-300 ease-out disabled:cursor-not-allowed"
                  style={{ borderRadius: 'calc(0.75rem - 1.5px)' }}
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
                  style={{ borderRadius: 'calc(0.75rem - 1.5px)' }}
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
                  style={{ borderRadius: 'calc(0.75rem - 1.5px)' }}
                  aria-label={showOnlyStarred ? "Show all flashcards" : "Show only starred flashcards"}
                >
                  <svg className={`h-4 w-4 ${showOnlyStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} viewBox="0 0 24 24" fill={showOnlyStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
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
              onClick={() => { setFlashcardModalOpen(false); setShowOnlyStarred(false); }}
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
                onClick={() => { setShowOnlyStarred(false); setCurrentFlashcardIndex(0); }}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]"
              >
                Show All Flashcards
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    {/* Word explanation box - rendered as portal to avoid parent CSS transforms */}
    {showExplanation && createPortal(
      <div
        className="fixed inset-0 z-50 pointer-events-auto"
        onClick={() => setShowExplanation(false)}
      >
        <div
          className="fixed z-50 w-[504px] max-w-[calc(100vw-24px)] rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/95 backdrop-blur-sm p-4 text-[var(--foreground)] shadow-2xl pointer-events-auto"
          style={{
            left: '50%',
            bottom: '16px',
            transform: 'translateX(-50%)'
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
                <LessonBody body={sanitizeLessonBody(String(explanationContent || ""))} />
              </div>
            </div>
          )}
        </div>
      </div>
    , document.body)}
    {hoverWordRects.length > 0 && createPortal(
      <>
        {hoverWordRects.map((rect, idx) => {
          // DEBUG: Log what we're rendering
          if (idx === 0) {
            console.log('🎨 Rendering overlay with rect:', rect, {
              windowInnerWidth: window.innerWidth,
              windowInnerHeight: window.innerHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
            });
          }
          return (
          <div
            key={idx}
            className="pointer-events-none fixed z-40"
            style={{
              left: `${rect.left}px`,
              top: `${rect.top}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              // No transforms, no scaling - use coordinates exactly as provided
              transform: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '-4px',
                right: '-4px',
                bottom: '-2px',
                height: '2px',
                background: 'linear-gradient(90deg, rgba(0,229,255,0.8), rgba(255,45,150,0.8))',
                borderRadius: '1px',
                WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%)',
                maskImage: 'linear-gradient(to right, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, rgba(0,229,255,0.1), rgba(255,45,150,0.1))',
                borderRadius: '4px',
              }}
            />
          </div>
          );
        })}
      </>,
      document.body
    )}
    {/* Bottom utilities: subtle Export PDF */}
    {content && content.lessons && content.lessons[activeLessonIndex]?.body && (
      <div className="mx-auto w-full max-w-3xl px-6 pb-10">
        <div className="flex items-center justify-center mt-4">
          <button
            onClick={async () => {
              try {
                const lesson = content.lessons[activeLessonIndex];
                if (!lesson) return;
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
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                let filename = lesson.title.toLowerCase();
                const invalidChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
                for (const char of invalidChars) { filename = filename.split(char).join('_'); }
                a.download = `${filename}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
              } catch (err: any) {
                alert('Failed to export PDF: ' + err.message);
              }
            }}
            className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-[var(--foreground)] bg-[var(--background)]/70 border border-[var(--foreground)]/15 hover:bg-[var(--background)]/80 transition-colors"
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
      </div>
    )}
    <LarsCoach open={larsOpen} onClose={() => setLarsOpen(false)} />
    </>
  );
}
