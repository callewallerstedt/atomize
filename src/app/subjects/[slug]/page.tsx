"use client";

import { useEffect, useMemo, useRef, useState, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { LessonBody } from "@/components/LessonBody";
import { FlashcardContent } from "@/components/FlashcardContent";
import { sanitizeLessonBody, sanitizeFlashcardContent } from "@/lib/sanitizeLesson";
import { getLastSurgeSession, getSurgeLog, loadSubjectData, saveSubjectData, saveSubjectDataAsync, StoredSubjectData, TopicMeta, getLessonsDueForReview, getUpcomingReviews, LessonFlashcard, LessonHighlight } from "@/utils/storage";
import HighlightsModal from "@/components/HighlightsModal";
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
  const [pendingTopicNav, setPendingTopicNav] = useState<string | null>(null);
  const [isTopicNavPending, startTopicNavTransition] = useTransition();
  const [practiceMetaTick, setPracticeMetaTick] = useState(0);
  const [surgeMetaTick, setSurgeMetaTick] = useState(0);
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
  // Track which topic row is hovered so the Generate AI button only shows for that topic
  const [hoveredTopicName, setHoveredTopicName] = useState<string | null>(null);
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
  const [showFlashcardTopicList, setShowFlashcardTopicList] = useState(true);
  const [selectedFlashcardTopic, setSelectedFlashcardTopic] = useState<string | null>(null);
  const [examDateUpdateTrigger, setExamDateUpdateTrigger] = useState(0); // Force re-render when exam dates change
  const [daysLeft, setDaysLeft] = useState<number | null>(null); // Days until next exam
  const [examSnipes, setExamSnipes] = useState<Array<{
    id: string;
    courseName: string;
    slug: string;
    createdAt: string;
    fileNames: string[];
    topConcepts: string[];
    patternAnalysis?: string;
    commonQuestions?: Array<{ question: string; examCount?: number; averagePoints?: number }>;
  }>>([]);
  const [loadingExamSnipes, setLoadingExamSnipes] = useState(false);
  const [surgeExamSnipeData, setSurgeExamSnipeData] = useState<string | null>(null);
  const [surgeSuggestedTopics, setSurgeSuggestedTopics] = useState<string[]>([]);
  const [surgeSuggesting, setSurgeSuggesting] = useState(false);
  const [surgeSuggestError, setSurgeSuggestError] = useState<string | null>(null);
  const [surgeSuggestKick, setSurgeSuggestKick] = useState(0);
  const surgeSuggestAttemptedRef = useRef<string | null>(null);
  const [surgeCustomTopicOpen, setSurgeCustomTopicOpen] = useState(false);
  const [surgeCustomTopicValue, setSurgeCustomTopicValue] = useState("");
  const [pageLoading, setPageLoading] = useState(true); // Initial page load state
  const [subscriptionLevel, setSubscriptionLevel] = useState<string>("Free");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [topicInfoOpen, setTopicInfoOpen] = useState<string | null>(null);
  const [lessonMenuOpen, setLessonMenuOpen] = useState<string | null>(null);
  const [renamingLesson, setRenamingLesson] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const isSyncingExamSnipesRef = useRef(false);
  const [allHighlightsModalOpen, setAllHighlightsModalOpen] = useState(false);
  const [allHighlights, setAllHighlights] = useState<Array<{ highlight: LessonHighlight; topicName: string; lessonTitle: string; lessonIndex: number }>>([]);
  
  const hasPremiumAccess =
    subscriptionLevel === "Tester" ||
    subscriptionLevel === "Paid" ||
    subscriptionLevel === "mylittlepwettybebe";

  function getRandomCardIndex(filteredFlashcards: typeof allFlashcards, currentIndex: number): number {
    if (filteredFlashcards.length <= 1) return currentIndex;
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * filteredFlashcards.length);
    } while (newIndex === currentIndex && filteredFlashcards.length > 1);
    return newIndex;
  }


  // Listen for exam date updates to refresh UI
  useEffect(() => {
    const handleExamDateUpdate = (e: CustomEvent) => {
      if (e.detail?.slug === slug) {
        // Force re-render by updating trigger state
        setExamDateUpdateTrigger(prev => prev + 1);
        // Also reload subject name in case it changed
        const saved = loadSubjectData(slug);
        if (saved) {
          setSubjectName(saved.subject || slug);
        }
      }
    };
    window.addEventListener('synapse:exam-date-updated', handleExamDateUpdate as EventListener);
    return () => {
      window.removeEventListener('synapse:exam-date-updated', handleExamDateUpdate as EventListener);
    };
  }, [slug]);

  // Check subscription level and authentication
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        setIsAuthenticated(!!data?.user);
        if (data?.user?.subscriptionLevel) {
          setSubscriptionLevel(data.user.subscriptionLevel);
        }
      })
      .catch(() => {});
  }, []);

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
    
    // Check for pending flashcard open from navigation
    const pendingFlashcardOpen = typeof window !== 'undefined' ? sessionStorage.getItem('__pendingFlashcardOpen') : null;
    if (pendingFlashcardOpen === slug) {
      // Clear the pending flag immediately
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('__pendingFlashcardOpen');
      }
      // Wait for data to load, then open flashcards
      // Use a more aggressive retry mechanism
      const checkAndOpen = () => {
        const saved = loadSubjectData(slug);
        if (saved && saved.nodes && Object.keys(saved.nodes).length > 0) {
          // Data is loaded, open flashcards immediately
          collectAllFlashcards();
        } else {
          // Retry more frequently if data isn't loaded yet (max 10 retries = 2 seconds)
          let retryCount = 0;
          const maxRetries = 10;
          const retryInterval = setInterval(() => {
            retryCount++;
            const saved = loadSubjectData(slug);
            if (saved && saved.nodes && Object.keys(saved.nodes).length > 0) {
              clearInterval(retryInterval);
              collectAllFlashcards();
            } else if (retryCount >= maxRetries) {
              clearInterval(retryInterval);
              // If still not loaded after max retries, try opening anyway
              collectAllFlashcards();
            }
          }, 200);
        }
      };
      // Start checking immediately, then also check after a short delay
      checkAndOpen();
      setTimeout(checkAndOpen, 100);
    }
    
    // Listen for flashcard modal open event
    const handleOpenFlashcards = (e: Event) => {
      const customEvent = e as CustomEvent;
      const eventSlug = customEvent.detail?.slug;
      if (eventSlug === slug) {
        collectAllFlashcards();
      }
    };
    
    document.addEventListener('synapse:open-flashcards', handleOpenFlashcards as EventListener);
    return () => {
      document.removeEventListener('synapse:open-flashcards', handleOpenFlashcards as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Close lesson menu when clicking outside and update position on scroll/resize
  useEffect(() => {
    if (!lessonMenuOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the menu and not on a menu button
      if (!target.closest('[data-menu-dropdown]') && !target.closest('[data-menu-button]')) {
        setLessonMenuOpen(null);
        setMenuPosition(null);
      }
    };
    
    const updateMenuPosition = () => {
      if (lessonMenuOpen && menuButtonRefs.current[lessonMenuOpen]) {
        const button = menuButtonRefs.current[lessonMenuOpen];
        if (button) {
          const rect = button.getBoundingClientRect();
          setMenuPosition({
            top: rect.bottom + 8,
            right: window.innerWidth - rect.right,
          });
        }
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [lessonMenuOpen]);

  const refreshSubjectData = useCallback(() => {
    const saved = loadSubjectData(slug);

    if (saved?.topics && saved.topics.length) {
      setTopics(saved.topics);
      setCombinedText(saved.combinedText || "");
      setSavedFiles(saved.files || []);
      setCourseNotes(saved.course_notes || "");
      setProgress(saved.progress || {});
      setNodes(saved.nodes || ({} as any));
      if (saved.tree && saved.tree.topics && saved.tree.topics.length > 0) {
        setTree(saved.tree);
      } else {
        setTree({
          subject: saved.subject || slug,
          topics: saved.topics.map((t: any) => ({ name: t.name || t, subtopics: [] })),
        });
      }
    } else if (saved?.tree) {
      const legacyTopics = (saved.tree?.topics || []).map((t: any) => ({ name: t.name, summary: "" }));
      setTopics(legacyTopics);
      setCombinedText(saved.combinedText || "");
      setSavedFiles(saved.files || []);
      setProgress(saved.progress || {});
      setTree(saved.tree);
      setNodes(saved.nodes || ({} as any));
    } else {
      setTopics(null);
      setCombinedText("");
      setSavedFiles([]);
      setCourseNotes("");
      setProgress({});
      setTree(null);
      setNodes({});
    }

    setReviewsDue(getLessonsDueForReview(slug));
    setUpcomingReviews(getUpcomingReviews(slug, 7));
    return saved || null;
  }, [slug]);

  // Helper function to normalize generated lessons
  function normalizeGeneratedLessons(generatedLessons: any): Record<string, Record<string, any>> {
    if (!generatedLessons || typeof generatedLessons !== "object") return {};
    const normalized: Record<string, Record<string, any>> = {};
    for (const [conceptName, conceptLessons] of Object.entries(generatedLessons)) {
      if (conceptLessons && typeof conceptLessons === "object") {
        normalized[conceptName] = conceptLessons as Record<string, any>;
      }
    }
    return normalized;
  }

  const syncExamSnipeLessonsToMainCourse = useCallback(async (examSnipeRecords: any[]) => {
    if (!examSnipeRecords || examSnipeRecords.length === 0) return;
    if (isSyncingExamSnipesRef.current) return; // Prevent concurrent syncing
    
    isSyncingExamSnipesRef.current = true;
    try {
      const courseData = loadSubjectData(slug) as StoredSubjectData | null;
      if (!courseData) return;
      
      let hasUpdates = false;
      const updatedNodes = { ...(courseData.nodes || {}) };
      const updatedTopics = [...(courseData.topics || [])];
      
      // Sort exam snipes by most recent first, and only process ones with valid data
      const validRecords = examSnipeRecords
        .filter(record => {
          // Only process records with valid results
          if (!record.results || typeof record.results !== 'object') return false;
          const results = record.results;
          const normalizedGenerated = normalizeGeneratedLessons(results.generatedLessons) || {};
          
          // Only sync from exam snipes that have actually generated lessons (not just plans)
          const hasGeneratedLessons = Object.keys(normalizedGenerated).length > 0 && 
            Object.values(normalizedGenerated).some((conceptLessons: any) => 
              conceptLessons && typeof conceptLessons === 'object' && Object.keys(conceptLessons).length > 0
            );
          
          return hasGeneratedLessons;
        })
        .sort((a, b) => {
          // Sort by most recent first (if createdAt is available)
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
      
      for (const record of validRecords) {
        const results = record.results || {};
        const concepts = Array.isArray(results.concepts) ? results.concepts : [];
        const lessonPlans = results.lessonPlans || {};
        const normalizedGenerated = normalizeGeneratedLessons(results.generatedLessons) || {};
        
        for (const concept of concepts) {
          const conceptName = concept.name;
          if (!conceptName) continue;
          
          const conceptPlan = lessonPlans[conceptName] || concept?.lessonPlan;
          const lessons = conceptPlan?.lessons || [];
          if (lessons.length === 0) continue;
          
          // Only sync concepts that have generated lessons
          const generatedMap = normalizedGenerated[conceptName] || {};
          if (Object.keys(generatedMap).length === 0) {
            // Skip concepts that don't have any generated lessons yet
            continue;
          }
          const existingNode = updatedNodes[conceptName];
          const existingLessons = Array.isArray((existingNode as any)?.lessons) ? (existingNode as any).lessons : [];
          const existingSymbols = (existingNode as any)?.symbols || [];
          const existingRawLesson = (existingNode as any)?.rawLessonJson || [];
          const existingLessonsMeta = Array.isArray((existingNode as any)?.lessonsMeta) ? (existingNode as any).lessonsMeta : [];
          
          const planIdMapping: Record<number, string> = {};
          const lessonsMeta: Array<{ type: string; title: string; planId?: string; tag?: string }> = [...existingLessonsMeta];
          // Merge existing lessons with new ones from exam snipe.
          // Never dedupe by title to avoid merging similarly named lessons.
          // Use planId to update/replace; otherwise append.
          const lessonsArray: any[] = Array.isArray(existingLessons) ? [...existingLessons] : [];
          
          lessons.forEach((lessonPlanItem: any, idx: number) => {
            const lessonPlanId = String(lessonPlanItem?.id ?? idx);
            planIdMapping[idx] = lessonPlanId;
            const lessonGenerated = generatedMap?.[lessonPlanId];
            const lessonTitle = String(lessonGenerated?.title || lessonPlanItem?.title || `Lesson ${idx + 1}`);
            
            const quizFromGenerated = Array.isArray((lessonGenerated as any)?.quiz)
              ? (lessonGenerated as any).quiz.map((q: any) => ({
                  question: String(q?.question || ""),
                  answer: q?.answer ? String(q.answer) : undefined,
                }))
              : [];
            
            const newLesson = {
              title: lessonTitle,
              body: typeof lessonGenerated?.body === "string" ? lessonGenerated.body : "",
              origin: "exam-snipe",
              planId: lessonPlanId,
              quiz: quizFromGenerated,
            };
            
            const existingIndexByPlan = lessonsArray.findIndex((l: any) => l?.planId === lessonPlanId);
            if (existingIndexByPlan !== -1) {
              lessonsArray[existingIndexByPlan] = { ...lessonsArray[existingIndexByPlan], ...newLesson };
            } else {
              lessonsArray.push(newLesson);
            }
            
            if (!lessonsMeta.some((m: any) => m.planId === lessonPlanId)) {
              lessonsMeta.push({
                type: lessonGenerated ? "Exam Snipe" : "Exam Snipe Outline",
                title: lessonTitle,
                planId: lessonPlanId,
                tag: "Exam Snipe",
              });
            }
          });
          
          // Update or create the node
          const topicSummary = concept?.description || `Exam Snipe concept: ${conceptName}`;
          if (!updatedTopics.some((t: any) => (typeof t === "string" ? t === conceptName : t?.name === conceptName))) {
            updatedTopics.push({ name: conceptName, summary: topicSummary });
            hasUpdates = true;
          }
          
          const planLessons = lessons.map((lessonPlanItem: any) => ({
            id: String(lessonPlanItem.id ?? ""),
            title: String(lessonPlanItem.title || ""),
            summary: lessonPlanItem.summary || "",
            objectives: Array.isArray(lessonPlanItem.objectives) ? lessonPlanItem.objectives : [],
          }));
          
          // Preserve existing examSnipeMeta if it exists, otherwise create new one
          const existingExamSnipeMeta = (existingNode as any)?.examSnipeMeta;
          const examSnipeMeta = existingExamSnipeMeta ? {
            ...existingExamSnipeMeta,
            // Update with latest data but preserve existing planIdMapping and planLessons
            historySlug: record.slug || existingExamSnipeMeta.historySlug || "",
            conceptName: conceptName,
            conceptDescription: concept?.description || existingExamSnipeMeta.conceptDescription || "",
            keySkills: conceptPlan?.keySkills || existingExamSnipeMeta.keySkills || [],
            examConnections: conceptPlan?.examConnections || existingExamSnipeMeta.examConnections || [],
            planIdMapping: { ...existingExamSnipeMeta.planIdMapping, ...planIdMapping },
            planLessons: existingExamSnipeMeta.planLessons || planLessons,
            courseName: record.courseName || existingExamSnipeMeta.courseName || "",
            patternAnalysis: results.patternAnalysis || existingExamSnipeMeta.patternAnalysis || "",
            detectedLanguage: results.detectedLanguage || existingExamSnipeMeta.detectedLanguage || null,
          } : {
            historySlug: record.slug || "",
            conceptName: conceptName,
            conceptDescription: concept?.description || "",
            keySkills: conceptPlan?.keySkills || [],
            examConnections: conceptPlan?.examConnections || [],
            planIdMapping,
            planLessons,
            courseName: record.courseName || "",
            patternAnalysis: results.patternAnalysis || "",
            detectedLanguage: results.detectedLanguage || null,
          };
          
          // Ensure we only spread plain object-like data to satisfy TypeScript
          const existingNodeObject =
            existingNode && typeof existingNode === "object" ? (existingNode as Record<string, any>) : {};

          updatedNodes[conceptName] = {
            ...existingNodeObject,
            overview: (existingNode as any)?.overview || `Lessons generated from Exam Snipe for: ${conceptName}`,
            symbols: existingSymbols,
            lessonsMeta,
            lessons: lessonsArray,
            rawLessonJson: existingRawLesson,
            examSnipeMeta,
          } as any;
          
          hasUpdates = true;
        }
      }
      
      if (hasUpdates) {
        const updatedData: StoredSubjectData = {
          ...courseData,
          nodes: updatedNodes,
          topics: updatedTopics,
        };
        await saveSubjectDataAsync(slug, updatedData);
        refreshSubjectData();
        try {
          window.dispatchEvent(new CustomEvent("synapse:subject-data-updated", { 
            detail: { slug, fromExamSnipeSync: true } 
          }));
        } catch {}
      }
    } finally {
      isSyncingExamSnipesRef.current = false;
    }
  }, [slug, refreshSubjectData]);

  const extractExamSnipeConceptNames = useCallback((results: any): string[] => {
    const concepts = Array.isArray(results?.concepts) ? results.concepts : [];
    return concepts
      .map((c: any) => String(c?.name || "").trim())
      .filter(Boolean)
      .slice(0, 6);
  }, []);

  const extractSurgeTopicSuggestions = useCallback((text: string, requiredCount = 4): string[] => {
    const uniqueTopics: string[] = [];
    const normalizedSeen = new Set<string>();

    const recordTopic = (raw?: string | null) => {
      if (!raw) return false;
      let topic = raw.replace(/^[-•]\s*/, "").replace(/[`*"_]/g, "").trim();
      if (!topic) return false;
      topic = topic.replace(/^[0-9]+\.\s*/, "").trim();
      if (!topic) return false;

      const normalized = topic.toLowerCase().replace(/\s+/g, " ").trim();
      if (!normalized || normalizedSeen.has(normalized)) return false;

      normalizedSeen.add(normalized);
      uniqueTopics.push(topic);
      return true;
    };

    if (!text.includes("TOPIC") && !text.includes("SUGGESTION")) return [];

    const suggestionRegex = /TOPIC[_\s-]*SUGGESTION\s*[:\-]\s*([^\r\n]+?)(?:\r?\n|$)/gi;
    const matches = Array.from(text.matchAll(suggestionRegex));
    for (const match of matches) {
      const topicText = match[1];
      if (topicText && topicText.trim()) {
        const added = recordTopic(topicText);
        if (added && uniqueTopics.length >= requiredCount) break;
      }
    }
    return uniqueTopics.slice(0, requiredCount);
  }, []);

  const handleExtractTopics = useCallback(async () => {
    if (!hasPremiumAccess) {
      alert("This feature requires Premium access");
      return;
    }
    try {
      setError(null);
      setGeneratingBasics(true);
      const saved = loadSubjectData(slug) as StoredSubjectData | null;
      const fileIds = saved?.course_file_ids || [];
      const contextText = [saved?.course_context || "", saved?.combinedText || ""].filter(Boolean).join("\n\n");

      if (!fileIds.length && !contextText.trim()) {
        throw new Error("No course context found. Upload/analyze course files first.");
      }

      const res = await fetch("/api/extract-by-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectName || slug,
          fileIds,
          contextText,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);

      const gotTopics: TopicMeta[] = json.data?.topics || [];
      const existingTopics = topics || [];
      const existingTopicNames = new Set(existingTopics.map((t) => t.name));
      const newTopics = gotTopics.filter((t) => !existingTopicNames.has(t.name));
      const mergedTopics = [...existingTopics, ...newTopics];

      setTopics(mergedTopics);
      const nextTree = { subject: subjectName || slug, topics: mergedTopics.map((t: any) => ({ name: t.name, subtopics: [] })) } as any;
      setTree(nextTree);

      const nextSaved = (loadSubjectData(slug) as StoredSubjectData | null) || saved;
      if (nextSaved) {
        nextSaved.topics = mergedTopics;
        nextSaved.tree = nextTree;
        nextSaved.combinedText = json.combinedText || nextSaved.combinedText || "";
        nextSaved.course_context = json.course_context || nextSaved.course_context || "";
        nextSaved.course_language_code = json.detected_language_code || nextSaved.course_language_code;
        nextSaved.course_language_name = json.detected_language_name || nextSaved.course_language_name;
        saveSubjectData(slug, nextSaved);
      }
    } catch (e: any) {
      console.error("Failed to extract topics:", e);
      setError(e?.message || "Failed to extract topics");
    } finally {
      setGeneratingBasics(false);
    }
  }, [hasPremiumAccess, slug, subjectName, topics]);

  const loadExamSnipes = useCallback(async () => {
    setLoadingExamSnipes(true);
    try {
      console.log(`Loading exam snipes for course: ${slug}`);
      const res = await fetch(`/api/exam-snipe/history?subjectSlug=${encodeURIComponent(slug)}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      console.log(`Exam snipes response for ${slug}:`, { ok: res.ok, count: json?.history?.length || 0, history: json?.history });
      if (res.ok && Array.isArray(json?.history)) {
        const records = json.history.map((record: any) => ({
          id: record.id || record.slug,
          courseName: record.courseName || "Untitled Exam Snipe",
          slug: record.slug,
          createdAt: record.createdAt,
          fileNames: Array.isArray(record.fileNames) ? record.fileNames : [],
          results: record.results || {},
        }));
        try {
          setSurgeExamSnipeData(records?.[0]?.results ? JSON.stringify(records[0].results, null, 2) : null);
        } catch {
          setSurgeExamSnipeData(null);
        }
        setExamSnipes(records.map((r: any) => ({
          id: r.id,
          courseName: r.courseName,
          slug: r.slug,
          createdAt: r.createdAt,
          fileNames: r.fileNames,
          topConcepts: extractExamSnipeConceptNames(r.results),
          patternAnalysis: typeof r.results?.patternAnalysis === "string" ? r.results.patternAnalysis : "",
          commonQuestions: Array.isArray(r.results?.commonQuestions)
            ? r.results.commonQuestions
                .map((q: any) => ({
                  question: String(q?.question || ""),
                  examCount: typeof q?.examCount === "number" ? q.examCount : undefined,
                  averagePoints: typeof q?.averagePoints === "number" ? q.averagePoints : undefined,
                }))
                .filter((q: any) => q.question)
            : [],
        })));
        // Sync lessons from exam snipes to main course
        await syncExamSnipeLessonsToMainCourse(records);
      } else {
        // Fallback for shared/offline viewing: read embedded exam snipes from local subject data.
        const local = loadSubjectData(slug) as any;
        const embedded = Array.isArray(local?.examSnipes) ? local.examSnipes : [];
        if (embedded.length) {
          const records = embedded.map((record: any, idx: number) => ({
            id: record?.id || record?.slug || `embedded-${idx}`,
            courseName: record?.courseName || local?.subject || "Untitled Exam Snipe",
            slug: record?.slug || `embedded-${idx}`,
            createdAt: record?.createdAt || new Date().toISOString(),
            fileNames: Array.isArray(record?.fileNames) ? record.fileNames : [],
            results: record?.results || {},
          }));
          try {
            setSurgeExamSnipeData(records?.[0]?.results ? JSON.stringify(records[0].results, null, 2) : null);
          } catch {
            setSurgeExamSnipeData(null);
          }
          setExamSnipes(records.map((r: any) => ({
            id: r.id,
            courseName: r.courseName,
            slug: r.slug,
            createdAt: r.createdAt,
            fileNames: r.fileNames,
            topConcepts: extractExamSnipeConceptNames(r.results),
            patternAnalysis: typeof r.results?.patternAnalysis === "string" ? r.results.patternAnalysis : "",
            commonQuestions: Array.isArray(r.results?.commonQuestions)
              ? r.results.commonQuestions
                  .map((q: any) => ({
                    question: String(q?.question || ""),
                    examCount: typeof q?.examCount === "number" ? q.examCount : undefined,
                    averagePoints: typeof q?.averagePoints === "number" ? q.averagePoints : undefined,
                  }))
                  .filter((q: any) => q.question)
              : [],
          })));
          await syncExamSnipeLessonsToMainCourse(records);
        } else {
          setSurgeExamSnipeData(null);
          setExamSnipes([]);
        }
      }
    } catch {
      const local = loadSubjectData(slug) as any;
      const embedded = Array.isArray(local?.examSnipes) ? local.examSnipes : [];
      if (embedded.length) {
        const records = embedded.map((record: any, idx: number) => ({
          id: record?.id || record?.slug || `embedded-${idx}`,
          courseName: record?.courseName || local?.subject || "Untitled Exam Snipe",
          slug: record?.slug || `embedded-${idx}`,
          createdAt: record?.createdAt || new Date().toISOString(),
          fileNames: Array.isArray(record?.fileNames) ? record.fileNames : [],
          results: record?.results || {},
        }));
        try {
          setSurgeExamSnipeData(records?.[0]?.results ? JSON.stringify(records[0].results, null, 2) : null);
        } catch {
          setSurgeExamSnipeData(null);
        }
        setExamSnipes(records.map((r: any) => ({
          id: r.id,
          courseName: r.courseName,
          slug: r.slug,
          createdAt: r.createdAt,
          fileNames: r.fileNames,
          topConcepts: extractExamSnipeConceptNames(r.results),
          patternAnalysis: typeof r.results?.patternAnalysis === "string" ? r.results.patternAnalysis : "",
          commonQuestions: Array.isArray(r.results?.commonQuestions)
            ? r.results.commonQuestions
                .map((q: any) => ({
                  question: String(q?.question || ""),
                  examCount: typeof q?.examCount === "number" ? q.examCount : undefined,
                  averagePoints: typeof q?.averagePoints === "number" ? q.averagePoints : undefined,
                }))
                .filter((q: any) => q.question)
            : [],
        })));
        await syncExamSnipeLessonsToMainCourse(records);
      } else {
        setSurgeExamSnipeData(null);
        setExamSnipes([]);
      }
    } finally {
      setLoadingExamSnipes(false);
      setPageLoading(false); // Mark page as loaded when exam snipes finish loading
    }
  }, [extractExamSnipeConceptNames, slug, syncExamSnipeLessonsToMainCourse]);


  useEffect(() => {
    setPageLoading(true); // Start loading when slug changes
    setSurgeSuggestedTopics([]);
    setSurgeSuggestError(null);
    setSurgeSuggestKick(0);
    surgeSuggestAttemptedRef.current = null;
    const saved = refreshSubjectData();
    void loadExamSnipes();

    const pendingFlashcardOpen = typeof window !== 'undefined' ? sessionStorage.getItem('__pendingFlashcardOpen') : null;
    if (pendingFlashcardOpen === slug && saved && saved.nodes && Object.keys(saved.nodes).length > 0) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('__pendingFlashcardOpen');
      }
      setTimeout(() => {
        collectAllFlashcards();
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Refresh exam snipes when page gains focus (in case user created one in another tab)
  useEffect(() => {
    const handleFocus = async () => {
      void loadExamSnipes();
      setPracticeMetaTick((t) => t + 1);
      setSurgeMetaTick((t) => t + 1);
      if (reviewsDue.length === 0 && surgeSuggestedTopics.length === 0) {
        setSurgeSuggestKick((k) => k + 1);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, subjectName]);

  useEffect(() => {
    const handleSubjectDataUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.slug === slug) {
        refreshSubjectData();
        setSurgeMetaTick((t) => t + 1);
        // Only reload exam snipes if the update didn't come from exam snipe sync
        // (to prevent infinite loops)
        if (!detail?.fromExamSnipeSync) {
          void loadExamSnipes();
        }
      }
    };
    window.addEventListener('synapse:subject-data-updated', handleSubjectDataUpdated as EventListener);
    return () => {
      window.removeEventListener('synapse:subject-data-updated', handleSubjectDataUpdated as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Calculate days until next exam (client-side only to avoid hydration mismatch)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = loadSubjectData(slug);
    if (!saved?.examDates || saved.examDates.length === 0) {
      setDaysLeft(null);
      return;
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const upcoming = saved.examDates
      .map(ed => {
        const examDate = new Date(ed.date);
        examDate.setHours(0, 0, 0, 0);
        return examDate;
      })
      .filter(d => d >= now)
      .sort((a, b) => a.getTime() - b.getTime());
    if (upcoming.length === 0) {
      setDaysLeft(null);
      return;
    }
    const nextExam = upcoming[0];
    const diffTime = nextExam.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    setDaysLeft(diffDays);
  }, [slug, examDateUpdateTrigger]);

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
    if (!saved) {
      alert("No flashcards found. Generate flashcards first.");
      return;
    }
    const nodes = (saved.nodes && typeof saved.nodes === 'object' ? saved.nodes : {}) as any;

    const flashcards: Array<LessonFlashcard & { topicName: string; lessonTitle: string; id: string }> = [];

    // Course-level flashcards (not tied to a topic)
    if (Array.isArray((saved as any).course_flashcards) && (saved as any).course_flashcards.length > 0) {
      (saved as any).course_flashcards.forEach((flashcard: LessonFlashcard) => {
        const id = `__course__:Course Deck:${flashcard.prompt}`;
        flashcards.push({
          ...flashcard,
          topicName: "__course__",
          lessonTitle: "Course Deck",
          id,
        });
      });
    }
    
    // Iterate through all topics (nodes)
    Object.keys(nodes).forEach((topicName) => {
      const node = nodes[topicName];
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
      alert("No flashcards found. Generate flashcards first.");
      return;
    }

    setAllFlashcards(flashcards);
    setCurrentFlashcardIndex(0);
    setFlashcardFlipped(false);
    setShowOnlyStarred(false);
    setIsShuffleActive(false);
    const uniqueTopics = Array.from(new Set(flashcards.map((f) => f.topicName)));
    setShowFlashcardTopicList(uniqueTopics.length > 1);
    setSelectedFlashcardTopic(null);
    setAllFlashcardsModalOpen(true);
  }

  function collectAllHighlights() {
    const saved = loadSubjectData(slug);
    if (!saved || !saved.nodes) {
      alert("No highlights found. Create highlights by selecting text in lessons.");
      return;
    }

    const highlights: Array<{ highlight: LessonHighlight; topicName: string; lessonTitle: string; lessonIndex: number }> = [];
    
    // Iterate through all topics (nodes)
    Object.keys(saved.nodes).forEach((topicName) => {
      const node = saved.nodes[topicName];
      if (!node || typeof node !== 'object') return;
      
      // Check if it's the format with lessons array
      if (Array.isArray(node.lessons)) {
        node.lessons.forEach((lesson: any, lessonIndex: number) => {
          if (lesson && Array.isArray(lesson.highlights) && lesson.highlights.length > 0) {
            lesson.highlights.forEach((highlight: LessonHighlight) => {
              highlights.push({
                highlight,
                topicName,
                lessonTitle: lesson.title || 'Untitled Lesson',
                lessonIndex,
              });
            });
          }
        });
      }
    });

    if (highlights.length === 0) {
      alert("No highlights found. Create highlights by selecting text in lessons.");
      return;
    }

    setAllHighlights(highlights);
    setAllHighlightsModalOpen(true);
  }

  function navigateToLessonWithHighlight(topicName: string, lessonIndex: number) {
    // Encode the topic name for the URL
    const encodedTopicName = encodeURIComponent(topicName);
    router.push(`/subjects/${slug}/node/${encodedTopicName}?lesson=${lessonIndex}`);
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

  async function handleRenameLesson() {
    if (!renamingLesson || !renameValue.trim() || renameValue.trim() === renamingLesson) {
      return;
    }
    const newName = renameValue.trim();
    try {
      const data = loadSubjectData(slug) as StoredSubjectData | null;
      if (!data) {
        alert("Failed to load subject data");
        return;
      }
      
      // Check if new name already exists
      const nameExists = (data.topics || []).some((t: any) => t.name === newName) ||
                         (data.tree?.topics || []).some((t: any) => t.name === newName);
      if (nameExists) {
        alert(`A lesson with the name "${newName}" already exists. Please choose a different name.`);
        return;
      }

      // Update topics array
      if (data.topics) {
        data.topics = data.topics.map((t: any) => 
          t.name === renamingLesson ? { ...t, name: newName } : t
        );
      }
      
      // Update tree.topics
      if (data.tree?.topics) {
        data.tree.topics = data.tree.topics.map((t: any) => 
          t.name === renamingLesson ? { ...t, name: newName } : t
        );
      }
      
      // Update node data if it exists (rename the key)
      if (data.nodes && data.nodes[renamingLesson]) {
        const nodeData = data.nodes[renamingLesson];
        delete data.nodes[renamingLesson];
        data.nodes[newName] = nodeData;
      }
      
      // Save updated data
      await saveSubjectDataAsync(slug, data);
      
      // Update local state
      setTopics(data.topics || []);
      setTree(data.tree || { subject: data.subject || slug, topics: [] });
      setNodes({ ...data.nodes || {} });
      
      // Sync to server if authenticated
      try {
        const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
        if (me?.user) {
          await fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ data }),
          }).catch(() => {});
        }
      } catch {}
      
      // Close modal
      setRenamingLesson(null);
      setRenameValue("");
    } catch (err: any) {
      console.error('Failed to rename lesson:', err);
      alert(err?.message || "Failed to rename lesson");
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
      // Load existing data to preserve examDates and other fields
      const existingData = loadSubjectData(slug);
      const saveObj: StoredSubjectData = {
        subject: subjectName || slug,
        files: json.files || [],
        combinedText: json.combinedText || "",
        tree: null,
        topics: gotTopics,
        nodes: existingData?.nodes || {},
        progress: existingData?.progress || {},
        course_context: json.course_context || "",
        course_language_code: json.detected_language_code || "en",
        course_language_name: json.detected_language_name || "English",
        examDates: existingData?.examDates || [],
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

  const surgeNext = useMemo(() => {
    if (reviewsDue.length > 0) {
      const count = reviewsDue.length;
      return {
        activeStep: "review" as const,
        nextLabel: `Next: review ${count} lesson${count === 1 ? "" : "s"}`,
      };
    }
    if (!tree?.topics?.length) {
      return { activeStep: "learn" as const, nextLabel: "Next: extract topics, then start Surge" };
    }
    return { activeStep: "learn" as const, nextLabel: "Next: learn a new topic" };
  }, [reviewsDue.length, tree?.topics?.length]);

  const topicRowMetaByName = useMemo(() => {
    const map: Record<string, { examSnipe: boolean; surge: boolean; generated: boolean }> = {};
    for (const t of topics || []) {
      const rawNode = nodes?.[t.name];
      const node = rawNode && typeof rawNode === "object" ? rawNode : null;
      const examSnipeFromMeta =
        !!(node as any)?.examSnipeMeta ||
        (Array.isArray((node as any)?.lessonsMeta) &&
          (node as any).lessonsMeta.some((m: any) => String(m?.tag || m?.type || "").toLowerCase().includes("exam snipe")));
      const surgeFromLessons =
        Array.isArray((node as any)?.lessons) &&
        (node as any).lessons.some((l: any) => l && typeof l === "object" && (l.origin === "surge" || !!l.surgeSessionId));

      const generatedFromLessons =
        Array.isArray((node as any)?.lessons) &&
        (node as any).lessons.some((l: any) => {
          const body = l && typeof l === "object" ? (l as any).body : "";
          return typeof body === "string" && body.trim().length > 0;
        });

      map[t.name] = { examSnipe: !!examSnipeFromMeta, surge: !!surgeFromLessons, generated: !!generatedFromLessons };
    }
    return map;
  }, [nodes, topics]);

  const lastSurgeSession = useMemo(() => getLastSurgeSession(slug), [slug, surgeMetaTick]);

  const surgeCard = useMemo(() => {
    const uniqueReviewTopics = Array.from(new Set(reviewsDue.map((r) => r.topicName))).filter(Boolean);

    if (reviewsDue.length > 0) {
      const list = uniqueReviewTopics.slice(0, 6);
      return {
        mode: "review" as const,
        headline: "Next, review:",
        subline: list.length ? list.join(", ") : "Review what's due",
        pills: [] as string[],
      };
    }

    if (surgeSuggestedTopics.length > 0) {
      const [recommended, ...other] = surgeSuggestedTopics;
      return {
        mode: "learn" as const,
        headline: recommended || "Next",
        subline: "Chad recommends starting with",
        pills: other.slice(0, 3),
      };
    }

    if (surgeSuggesting) {
      return {
        mode: "loading" as const,
        headline: "Next",
        subline: "Finding the best topics...",
        pills: [] as string[],
      };
    }

    return {
      mode: "idle" as const,
      headline: "Next",
      subline: surgeSuggestError || "Start Surge to begin",
      pills: [] as string[],
    };
  }, [reviewsDue, surgeSuggestedTopics, surgeSuggestError, surgeSuggesting]);

  const practiceLogs = useMemo(() => {
    if (typeof window === "undefined") return [] as any[];
    const fromSubject = (() => {
      try {
        const data = loadSubjectData(slug) as StoredSubjectData | null;
        return Array.isArray(data?.practiceLogs) ? data!.practiceLogs : [];
      } catch {
        return [];
      }
    })();
    const fromLocalKey = (() => {
      try {
        const raw = window.localStorage.getItem(`atomicPracticeLog:${slug}`);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    const merged = [...fromSubject, ...fromLocalKey].filter((e) => e && typeof e === "object");
    const byId = new Map<string, any>();
    for (const entry of merged) {
      const id = String((entry as any).id || "");
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev || Number((entry as any).timestamp || 0) > Number((prev as any).timestamp || 0)) {
        byId.set(id, entry);
      }
    }
    const deduped = Array.from(byId.values());
    deduped.sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
    return deduped;
  }, [practiceMetaTick, slug]);

  const lastPracticeLabel = useMemo(() => {
    const ts = Number(practiceLogs.length ? (practiceLogs[practiceLogs.length - 1] as any)?.timestamp : 0);
    if (!ts) return null;
    const diffMs = Date.now() - ts;
    if (!Number.isFinite(diffMs) || diffMs < 0) return null;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 2) return "Last practice: just now";
    if (diffMin < 60) return `Last practice: ${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Last practice: ${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `Last practice: ${diffDay}d ago`;
  }, [practiceLogs]);

  const practiceCard = useMemo(() => {
    const recentTopics: string[] = [];
    const seen = new Set<string>();
    for (let i = practiceLogs.length - 1; i >= 0 && recentTopics.length < 3; i--) {
      const raw = String((practiceLogs[i] as any)?.topic || "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recentTopics.push(raw);
    }

    if (practiceLogs.length === 0) {
      const topicNames = (topics || []).map((t) => t.name).filter(Boolean);
      const ungeneratedTopic = topicNames.find((name) => !topicRowMetaByName[name]?.generated);
      const suggestion = ungeneratedTopic || topicNames[0] || null;
      return {
        headline: "Practice mode",
        subline: suggestion ? "Suggested start" : "Active recall on any topic",
        chips: suggestion ? [suggestion] : ([] as string[]),
        buttonLabel: "Start",
      };
    }

    return {
      headline: "Continue practice",
      subline: recentTopics.length ? "Pick up where you left off" : "Review your recent topics",
      chips: recentTopics,
      buttonLabel: "Continue",
    };
  }, [practiceLogs, topicRowMetaByName, topics]);

  const startSurgeLearnWithTopic = useCallback(
    (topic: string) => {
      const t = String(topic || "").trim();
      if (!t) return;
      try {
        sessionStorage.setItem(`surge:prefillTopic:${slug}`, t);
      } catch {}
      router.push(`/subjects/${slug}/surge?topic=${encodeURIComponent(t)}`);
    },
    [router, slug],
  );

  useEffect(() => {
    if (!slug) return;
    if (reviewsDue.length > 0) return;
    if (surgeSuggestedTopics.length > 0) return;
    if (surgeSuggesting) return;
    const attemptKey = `${slug}:${surgeSuggestKick}:${isAuthenticated ? 1 : 0}:${hasPremiumAccess ? 1 : 0}`;
    if (surgeSuggestAttemptedRef.current === attemptKey) return;

    surgeSuggestAttemptedRef.current = attemptKey;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 25_000);

    (async () => {
      const fallbackTopics = () => {
        const out: string[] = [];
        const seen = new Set<string>();

        // Prefer exam snipe concepts if available
        try {
          const results = surgeExamSnipeData ? JSON.parse(surgeExamSnipeData) : null;
          const concepts = Array.isArray(results?.concepts) ? results.concepts : [];
          for (const c of concepts) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(name);
            if (out.length >= 4) break;
          }
        } catch {}

        const topicNames = (topics || []).map((t) => t.name).filter(Boolean);
        for (const name of topicNames) {
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(name);
          if (out.length >= 4) break;
        }

        return out.slice(0, 4);
      };

      try {
        setSurgeSuggesting(true);
        setSurgeSuggestError(null);

        const fallback = fallbackTopics();
        if (!isAuthenticated) {
          if (fallback.length) setSurgeSuggestedTopics(fallback);
          setSurgeSuggestError("Log in to get AI topic suggestions.");
          return;
        }
        if (!hasPremiumAccess) {
          if (fallback.length) setSurgeSuggestedTopics(fallback);
          setSurgeSuggestError(fallback.length ? null : "This feature requires Premium access.");
          return;
        }

        const data = loadSubjectData(slug) as StoredSubjectData | null;
        const courseLanguageName =
          data?.course_language_name ||
          (data?.course_language_code ? data.course_language_code.toUpperCase() : null);
        const courseName = data?.subject || subjectName || slug;

        const lines: string[] = [];
        lines.push(`SURGE MODE ACTIVE FOR COURSE "${courseName}" (slug: ${slug})`);
        lines.push("");
        lines.push("CURRENT PHASE: LEARN - Suggesting a new topic");
        lines.push("");
        lines.push("INITIAL STEP - TOPIC SELECTION:");
        lines.push("- Use COURSE CONTEXT, AVAILABLE TOPICS, EXAM SNIPE ANALYSIS, and PAST SURGE SESSIONS");
        lines.push("- Suggest exactly 4 topics that would provide maximum study value for this course");
        lines.push("- Prioritize: (1) Exam snipe concepts not yet covered, (2) Course topics not yet learned");
        lines.push("- Use specific, actionable, exam-ready topics. Avoid broad categories.");
        if (courseLanguageName) {
          lines.push(`- LANGUAGE REQUIREMENT: Output topic names exactly as they appear in ${courseLanguageName}. Do NOT translate.`);
        }
        lines.push("");
        lines.push("COURSE CONTEXT:");
        lines.push(data?.course_context ? data.course_context : "No course summary available.");
        lines.push("");
        lines.push("COURSE FILES (first 20k chars):");
        if (data?.combinedText) {
          lines.push(data.combinedText.slice(0, 20000));
        } else {
          lines.push("No course files available.");
        }
        lines.push("");
        lines.push("AVAILABLE TOPICS:");
        const availableTopics = (topics && topics.length > 0 ? topics : (Array.isArray(data?.topics) ? data!.topics : [])) as TopicMeta[];
        if (availableTopics.length > 0) {
          for (const t of availableTopics) {
            lines.push(`- ${t.name}${t.summary ? ` - ${t.summary}` : ""}`);
          }
        } else {
          lines.push("No topics available.");
        }
        lines.push("");
        lines.push("EXAM SNIPE ANALYSIS:");
        lines.push(surgeExamSnipeData ? surgeExamSnipeData : "No exam snipe analysis available.");
        lines.push("");
        lines.push("PAST SURGE SESSIONS:");
        if (lastSurgeSession?.summary) {
          lines.push(lastSurgeSession.summary);
        } else {
          lines.push("No past Surge sessions available.");
        }
        if (practiceLogs.length > 0) {
          lines.push("");
          lines.push("Practice log (last 20 entries):");
          practiceLogs.slice(-20).forEach((entry: any) => {
            lines.push(`[${String(entry?.topic || "")}] Q: ${String(entry?.question || "")} | A: ${String(entry?.answer || "")} | Grade: ${Number(entry?.grade ?? 0)}/10`);
          });
        }
        lines.push("");

        const context = lines.join("\n");
        const systemPrompt =
          "You must output exactly 4 topic suggestions.\n" +
          "Format:\n" +
          "TOPIC_SUGGESTION: Topic Name 1\n" +
          "TOPIC_SUGGESTION: Topic Name 2\n" +
          "TOPIC_SUGGESTION: Topic Name 3\n" +
          "TOPIC_SUGGESTION: Topic Name 4\n\n" +
          "Do not write anything else. No explanations, no introductions, no dashes, no bullets. Just those 4 lines starting with TOPIC_SUGGESTION.";

        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context,
            messages: [{ role: "system", content: systemPrompt }],
            path: `/subjects/${slug}`,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error || `Chat failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let finalTopics: string[] = [];

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (!payload) continue;
            if (payload === "[DONE]") {
              break;
            }
            try {
              const parsed = JSON.parse(payload);
              if (parsed.type === "text") {
                accumulated += String(parsed.content || "");
                const topicsNow = extractSurgeTopicSuggestions(accumulated, 4);
                if (topicsNow.length >= 4) {
                  finalTopics = topicsNow;
                  try { await reader.cancel(); } catch {}
                  break;
                }
              } else if (parsed.type === "error") {
                throw new Error(parsed.error || "Chat error");
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
          if (finalTopics.length >= 4) break;
        }

        if (!finalTopics.length) {
          finalTopics = extractSurgeTopicSuggestions(accumulated, 4);
        }
        const recentSurgeTopics = (() => {
          try {
            const log = getSurgeLog(slug);
            const topics = log
              .slice(-20)
              .map((e) => String(e?.newTopic || "").trim())
              .filter(Boolean);
            return new Set(topics.map((t) => t.toLowerCase()));
          } catch {
            return new Set<string>();
          }
        })();

        const normalizedUnique = (arr: string[]) => {
          const out: string[] = [];
          const seen = new Set<string>();
          for (const s of arr) {
            const t = String(s || "").trim();
            if (!t) continue;
            const key = t.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(t);
          }
          return out;
        };

        const rawFinal = finalTopics.length ? finalTopics : fallbackTopics();
        let filtered = normalizedUnique(rawFinal).filter((t) => !recentSurgeTopics.has(t.toLowerCase()));
        if (filtered.length < 4) {
          const fill = normalizedUnique(fallbackTopics()).filter((t) => !recentSurgeTopics.has(t.toLowerCase()));
          for (const t of fill) {
            if (filtered.length >= 4) break;
            if (!filtered.some((x) => x.toLowerCase() === t.toLowerCase())) filtered.push(t);
          }
        }

        if (filtered.length) setSurgeSuggestedTopics(filtered.slice(0, 4));
      } catch (e: any) {
        if (e?.name === "AbortError") {
          const final = fallbackTopics();
          if (final.length) setSurgeSuggestedTopics(final);
          else setSurgeSuggestError("Timed out getting suggestions.");
          return;
        }
        console.warn("Failed to fetch Surge topic suggestions:", e);
        const final = fallbackTopics();
        if (final.length) setSurgeSuggestedTopics(final);
        else setSurgeSuggestError(e?.message || "Failed to fetch topic suggestions.");
      } finally {
        clearTimeout(timeoutId);
        setSurgeSuggesting(false);
      }
    })();

    return () => {
      clearTimeout(timeoutId);
      try { controller.abort(); } catch {}
      setSurgeSuggesting(false);
    };
  }, [
    extractSurgeTopicSuggestions,
    lastSurgeSession?.summary,
    reviewsDue.length,
    slug,
    subjectName,
    surgeExamSnipeData,
    surgeSuggestedTopics.length,
    surgeSuggesting,
    practiceMetaTick,
    (topics || []).length,
    hasPremiumAccess,
    isAuthenticated,
    surgeSuggestKick,
    surgeMetaTick,
  ]);

  const lastSurgeLabel = useMemo(() => {
    const ts = lastSurgeSession?.timestamp;
    if (!ts) return null;
    const diffMs = Date.now() - ts;
    if (!Number.isFinite(diffMs) || diffMs < 0) return null;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 2) return "Last Surge: just now";
    if (diffMin < 60) return `Last Surge: ${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Last Surge: ${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `Last Surge: ${diffDay}d ago`;
  }, [lastSurgeSession?.timestamp]);

  // If a new Surge session happens, refresh topic suggestions so we don't keep showing old recommendations.
  useEffect(() => {
    if (!slug) return;
    if (reviewsDue.length > 0) return;
    if (!lastSurgeSession?.timestamp) return;
    if (surgeSuggestedTopics.length === 0) return;
    setSurgeSuggestedTopics([]);
    surgeSuggestAttemptedRef.current = null;
    setSurgeSuggestKick((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSurgeSession?.timestamp]);

  // Show loading spinner while initial data is loading
  const renderExamSnipesSection = (heading: string) => (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{heading}</h3>
        <span className="text-xs text-[var(--foreground)]/50">{examSnipes.length} saved</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {examSnipes.map((examSnipe) => {
          const topTopics = examSnipe.topConcepts.slice(0, 4);
          const commonQuestions = (examSnipe.commonQuestions || []).slice(0, 3);
          const createdAt = examSnipe.createdAt ? new Date(examSnipe.createdAt) : null;
          const createdLabel = createdAt
            ? createdAt.toLocaleDateString(undefined, { dateStyle: "medium" })
            : "Unknown date";
          const pattern = (examSnipe.patternAnalysis || "").trim();

          return (
            <div
              key={examSnipe.id}
              className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 p-4 transition-colors hover:border-[var(--foreground)]/30"
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/subjects/${slug}/examsnipe?examSnipeSlug=${encodeURIComponent(examSnipe.slug)}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/subjects/${slug}/examsnipe?examSnipeSlug=${encodeURIComponent(examSnipe.slug)}`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--foreground)] line-clamp-2">
                    {examSnipe.courseName}
                  </div>
                  <div className="mt-1 text-xs text-[var(--foreground)]/60">
                    {createdLabel} - {examSnipe.fileNames.length} exam{examSnipe.fileNames.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <span className="rounded-full border border-[var(--accent-pink)]/20 bg-[var(--accent-pink)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-pink)]/90">
                  Exam Snipe
                </span>
              </div>

              {pattern ? (
                <div className="mt-3 rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)]/70 px-3 py-2 text-xs text-[var(--foreground)]/70 line-clamp-3">
                  {pattern}
                </div>
              ) : null}

              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--foreground)]/50">Top topics to learn</div>
                {topTopics.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topTopics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full border border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/10 px-2.5 py-0.5 text-[11px] text-[var(--accent-cyan)]/90"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-[var(--foreground)]/50">No concept highlights yet.</div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wide text-[var(--foreground)]/50">Common questions</div>
                {commonQuestions.length ? (
                  <div className="mt-2 space-y-2 text-xs text-[var(--foreground)]/70">
                    {commonQuestions.map((q, idx) => (
                      <div key={`${examSnipe.id}-q-${idx}`} className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/70 px-2.5 py-2">
                        <div className="line-clamp-2">{q.question}</div>
                        {(q.examCount || q.averagePoints) && (
                          <div className="mt-1 text-[10px] text-[var(--foreground)]/50">
                            {typeof q.examCount === "number" ? `${q.examCount} exam${q.examCount === 1 ? "" : "s"}` : ""}
                            {typeof q.averagePoints === "number" ? ` - ${q.averagePoints.toFixed(1)} avg points` : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-[var(--foreground)]/50">No recurring questions detected.</div>
                )}
              </div>

              <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[var(--accent-cyan)]/80">
                <span>Open analysis</span>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Show loading spinner while initial data is loading
  if (pageLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <GlowSpinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        {(generatingBasics || loading) && (
          <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm">
            <GlowSpinner size={160} ariaLabel="Extracting topics" idSuffix="subject-extract" />
            <div className="mt-4 text-lg font-semibold text-[var(--foreground)]">
              {generatingBasics ? 'Generating course basics…' : 'Extracting topics…'}
            </div>
          </div>
        )}
        {/* Reviews Due Banner */}
        {false && reviewsDue.length > 0 && (
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
        {false && upcomingReviews.length > 0 && reviewsDue.length === 0 && (
          <div className="mb-6 rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4">
            <div className="text-sm text-[var(--foreground)]">📅 {upcomingReviews.length} upcoming review{upcomingReviews.length > 1 ? 's' : ''} in the next 7 days</div>
            <div className="text-xs text-[#A7AFBE] mt-1">Keep up the great work!</div>
          </div>
        )}

        {/* Course Header with Exam Date */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{subjectName || slug}</h1>
          {daysLeft !== null && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--foreground)]/5 border border-[var(--foreground)]/15 text-[var(--foreground)]/70">
              <span>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
            </div>
          )}
        </div>

        {/* Course layout: topics left, actions right */}
        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--foreground)]">Topics</div>
                {isAuthenticated && (
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/15 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/25 transition-colors"
                      onClick={() => { setNewTopicValue(""); setNewTopicOpen(true); }}
                      aria-label="New topic"
                      title="New topic"
                    >
                      +
                    </button>
                    <button
                      className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-white hover:opacity-95 synapse-style disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ color: "white" }}
                      disabled={!hasPremiumAccess}
                      title={!hasPremiumAccess ? "Requires Premium access" : "Extract topics from course files"}
                      onClick={handleExtractTopics}
                    >
                      Extract
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={collectAllFlashcards}
                  className="inline-flex h-8 items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--background)] px-3 text-xs font-medium text-[var(--foreground)]/75 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/25 transition-colors"
                >
                  Flashcards
                </button>
                <button
                  onClick={collectAllHighlights}
                  className="inline-flex h-8 items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--background)] px-3 text-xs font-medium text-[var(--foreground)]/75 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/25 transition-colors"
                >
                  Highlights
                </button>
              </div>

              {topics && topics.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)]">
                  <ul className="max-h-[calc(100vh-260px)] divide-y divide-[var(--foreground)]/10 overflow-auto">
                    {topics.map((t, i) => {
                      const href = `/subjects/${slug}/node/${encodeURIComponent(t.name)}`;
                      const meta = topicRowMetaByName[t.name];
                      const isGenerated = !!meta?.generated;
                      const isPending = pendingTopicNav === t.name && isTopicNavPending;
                      return (
                        <li key={`${t.name}-${i}`}>
                          <Link
                            href={href}
                            prefetch
                            onMouseEnter={() => {
                              try { router.prefetch(href); } catch {}
                            }}
                            onClick={(e) => {
                              if (e.defaultPrevented) return;
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                              e.preventDefault();
                              setPendingTopicNav(t.name);
                              startTopicNavTransition(() => router.push(href));
                            }}
                            className="block px-3 py-2.5 hover:bg-[var(--foreground)]/5 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className={["min-w-0 truncate text-sm font-medium", isGenerated ? "text-[var(--foreground)]" : "text-[var(--foreground)]/15"].join(" ")}>
                                {t.name}
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {(meta?.examSnipe || meta?.surge) && (
                                  <span className="flex items-center gap-1">
                                    {meta?.examSnipe && (
                                      <span className="rounded-full border border-[var(--accent-pink)]/25 bg-[var(--accent-pink)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-pink)]/90">
                                        Exam Snipe
                                      </span>
                                    )}
                                    {meta?.surge && (
                                      <span className="rounded-full border border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-cyan)]/90">
                                        Surge
                                      </span>
                                    )}
                                  </span>
                                )}
                                {isPending && (
                                  <span className="h-3 w-3 animate-spin rounded-full border border-[var(--foreground)]/30 border-t-[var(--foreground)]/70" />
                                )}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)] p-3 text-sm text-[var(--foreground)]/65">
                  No topics yet.
                </div>
              )}
            </div>
          </aside>

          <main className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-5 shadow-sm">
              <div
                className="pointer-events-none absolute -inset-10 opacity-60 blur-3xl"
                style={{ background: "radial-gradient(circle at 30% 20%, rgba(0,229,255,0.16), transparent 60%), radial-gradient(circle at 70% 50%, rgba(255,45,150,0.10), transparent 60%)" }}
              />
              <div className="relative">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">Surge</div>
                {surgeCard.mode === "learn" ? (
                  <>
                    <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">Select a topic to start</div>
                    <div className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">
                      Chad recommends
                    </div>
                    <button
                      type="button"
                      onClick={() => startSurgeLearnWithTopic(surgeCard.headline)}
                      className="mt-2 w-full rounded-2xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-4 py-3 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--foreground)]/8 transition-colors"
                    >
                      <span className="block truncate">{surgeCard.headline}</span>
                    </button>

                    <div className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">
                      Or pick one
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {surgeCard.pills.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => startSurgeLearnWithTopic(t)}
                          className="inline-flex items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-3 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/8 transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSurgeCustomTopicOpen((v) => !v)}
                        className="inline-flex items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-3 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/8 transition-colors"
                      >
                        + Custom topic
                      </button>
                    </div>
                    {surgeCustomTopicOpen ? (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          value={surgeCustomTopicValue}
                          onChange={(e) => setSurgeCustomTopicValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              startSurgeLearnWithTopic(surgeCustomTopicValue);
                            }
                          }}
                          placeholder="Enter a topic…"
                          className="h-10 w-full rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => startSurgeLearnWithTopic(surgeCustomTopicValue)}
                          className="synapse-style inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold !text-white hover:opacity-95 transition-opacity"
                        >
                          Start
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="mt-2 text-base font-semibold text-[var(--foreground)]">{surgeCard.headline}</div>
                    <div className="mt-1 text-sm text-[var(--foreground)]/65">{surgeCard.subline}</div>
                  </>
                )}
                {lastSurgeLabel ? (
                  <div className="mt-2 text-xs text-[var(--foreground)]/50">{lastSurgeLabel}</div>
                ) : null}

                {surgeCard.mode !== "learn" ? (
                  <button
                    onClick={() => router.push(`/subjects/${slug}/surge`)}
                    className="synapse-style mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl px-6 text-base font-semibold !text-white transition-opacity hover:opacity-95"
                  >
                    Start
                  </button>
                ) : null}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-5 shadow-sm">
              <div
                className="pointer-events-none absolute -inset-10 opacity-60 blur-3xl"
                style={{ background: "radial-gradient(circle at 30% 20%, rgba(0,229,255,0.16), transparent 60%), radial-gradient(circle at 70% 50%, rgba(255,45,150,0.10), transparent 60%)" }}
              />
              <div className="relative">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">Practice</div>
                <div className="mt-2 text-base font-semibold text-[var(--foreground)]">{practiceCard.headline}</div>
                <div className="mt-1 text-sm text-[var(--foreground)]/65">{practiceCard.subline}</div>
                {lastPracticeLabel ? (
                  <div className="mt-2 text-xs text-[var(--foreground)]/50">{lastPracticeLabel}</div>
                ) : null}

                {practiceCard.chips.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {practiceCard.chips.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-2.5 py-1 text-xs font-medium text-[var(--foreground)]/75"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : null}

                <button
                  onClick={() => router.push(`/subjects/${slug}/practice`)}
                  className="synapse-style mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl px-6 text-base font-semibold !text-white transition-opacity hover:opacity-95"
                >
                  {practiceCard.buttonLabel}
                </button>
              </div>
            </div>
            </div>

            <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--foreground)]">Exam Snipe</div>
                {examSnipes.length > 0 && (
                  <button
                    onClick={() => router.push(`/subjects/${slug}/examsnipe`)}
                    className="inline-flex h-8 items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--background)] px-3 text-xs font-medium text-[var(--foreground)]/75 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/25 transition-colors"
                  >
                    View all
                  </button>
                )}
              </div>
              {loadingExamSnipes ? (
                <div className="mt-3 text-sm text-[var(--foreground)]/60">Loading…</div>
              ) : examSnipes.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {examSnipes[0]?.topConcepts?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {examSnipes[0].topConcepts.slice(0, 6).map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-2.5 py-1 text-xs font-medium text-[var(--foreground)]/75"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button
                    onClick={() => router.push(`/subjects/${slug}/examsnipe?examSnipeSlug=${encodeURIComponent(examSnipes[0].slug)}`)}
                    className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/25 transition-colors"
                  >
                    View
                  </button>
                  {examSnipes.slice(0, 1).map((examSnipe) => (
                    <button
                      key={examSnipe.id}
                      onClick={() => router.push(`/subjects/${slug}/examsnipe?examSnipeSlug=${encodeURIComponent(examSnipe.slug)}`)}
                      className="w-full rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)] px-3 py-2 text-left hover:border-[var(--foreground)]/20 hover:bg-[var(--foreground)]/5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-[var(--foreground)]">{examSnipe.courseName}</div>
                          <div className="mt-0.5 text-xs text-[var(--foreground)]/55">
                            {new Date(examSnipe.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })} · {examSnipe.fileNames.length} file{examSnipe.fileNames.length === 1 ? "" : "s"}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs font-medium text-[var(--accent-cyan)]/80">Open</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-[var(--foreground)]/60">No exam snipes yet.</div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 shadow-sm">
              <div className="text-sm font-semibold text-[var(--foreground)]">Notes</div>
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
                  e.currentTarget.focus();
                }}
                rows={10}
                className="mt-3 w-full resize-y rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)] p-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
                placeholder="Write course notes…"
                tabIndex={0}
                style={{
                  WebkitUserSelect: 'text',
                  WebkitTouchCallout: 'none',
                  WebkitAppearance: 'none'
                }}
              />
            </div>
          </main>
        </div>

        {false && (
          <>
        {/* Surge: default workflow */}
        <div className="mb-6 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">Surge</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="text-sm text-[var(--foreground)]/75">{surgeNext.nextLabel}</div>
                {reviewsDue.length > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent-cyan)]/90">
                    {reviewsDue.length} due
                  </span>
                ) : upcomingReviews.length > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-2.5 py-1 text-xs font-medium text-[var(--foreground)]/70">
                    {upcomingReviews.length} upcoming
                  </span>
                ) : null}
              </div>
            </div>
            <button
              onClick={() => router.push(`/subjects/${slug}/surge`)}
              className="synapse-style inline-flex h-10 shrink-0 items-center justify-center rounded-full px-5 text-sm font-semibold !text-white transition-opacity hover:opacity-95"
            >
              Start
            </button>
          </div>
        </div>

        {/* Surge: legacy detailed box (hidden) */}
        <div className="hidden mb-6 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">Surge</div>
              <div className="mt-1 text-lg font-semibold text-[var(--foreground)]">Review → Learn → Quiz</div>
              <div className="mt-1 text-sm text-[var(--foreground)]/65">{surgeNext.nextLabel}</div>
            </div>
            <button
              onClick={() => router.push(`/subjects/${slug}/surge`)}
              className="synapse-style inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold !text-white transition-opacity hover:opacity-95"
            >
              Start Surge
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { key: "review" as const, title: "Review", body: "Old topics due now." },
              { key: "learn" as const, title: "Learn", body: "One new topic." },
              { key: "quiz" as const, title: "Quiz", body: "Check it sticks." },
            ].map((step) => {
              const isActive = surgeNext.activeStep === step.key;
              return (
                <div
                  key={step.key}
                  className={`rounded-xl border p-3 ${
                    isActive
                      ? "border-[var(--foreground)]/25 bg-[var(--foreground)]/5"
                      : "border-[var(--foreground)]/10 bg-[var(--background)]"
                  }`}
                >
                  <div className="text-sm font-medium text-[var(--foreground)]">{step.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--foreground)]/60">{step.body}</div>
                </div>
              );
            })}
          </div>

          {(reviewsDue.length > 0 || (upcomingReviews.length > 0 && reviewsDue.length === 0)) && (
            <div className="mt-4 rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)] p-3">
              {reviewsDue.length > 0 ? (
                <>
                  <div className="text-xs font-medium text-[var(--foreground)]/80">
                    {reviewsDue.length} lesson{reviewsDue.length === 1 ? "" : "s"} due for review
                  </div>
                  <div className="mt-2 space-y-1">
                    {reviewsDue.slice(0, 3).map((review, idx) => (
                      <Link
                        key={idx}
                        href={`/subjects/${slug}/node/${encodeURIComponent(review.topicName)}`}
                        className="block text-xs text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors"
                      >
                        {review.topicName} · Lesson {review.lessonIndex + 1}
                      </Link>
                    ))}
                    {reviewsDue.length > 3 && (
                      <div className="text-xs text-[var(--foreground)]/45">+ {reviewsDue.length - 3} more</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-[var(--foreground)]/65">
                  {upcomingReviews.length} upcoming review{upcomingReviews.length === 1 ? "" : "s"} in the next 7 days
                </div>
              )}
            </div>
          )}
        </div>

        <details className="mt-10 rounded-2xl border border-[var(--foreground)]/10 bg-[var(--background)]/30 p-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-[var(--foreground)]/75 hover:text-[var(--foreground)] transition-colors">
            Advanced
          </summary>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr,340px] lg:items-start">
          <div className="min-w-0">
            {activeTab === 'tree' && (
          <div className="mt-4">
            <div className="hidden mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={collectAllFlashcards}
                className="pill-button w-full sm:w-auto inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors"
              >
                Flashcards
              </button>
              <button
                onClick={collectAllHighlights}
                className="pill-button w-full sm:w-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Highlights
              </button>
              {isAuthenticated && (
                <>
                  <button
                    onClick={() => router.push(`/subjects/${slug}/practice`)}
                    className="pill-button w-full sm:w-auto inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors"
                  >
                    Practice
                  </button>
                  <button
                    onClick={() => router.push(`/subjects/${slug}/surge`)}
                    className="pill-button w-full sm:w-auto inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors"
                  >
                    Surge
                  </button>
                </>
              )}
            </div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-[var(--foreground)]">Topics</div>
              <div className="flex items-center gap-2">
                {isAuthenticated && (
                  <>
                    <button
                      className="pill-button inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors"
                      onClick={() => { setNewTopicValue(""); setNewTopicOpen(true); }}
                      aria-label="New topic"
                    >
                      +
                    </button>
                    <button
                      className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-white hover:opacity-95 synapse-style disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ color: "white" }}
                      disabled={!hasPremiumAccess}
                      title={!hasPremiumAccess ? "Requires Premium access" : "Extract topics from course files"}
                      onClick={handleExtractTopics}
                    >
                      <span style={{ color: '#ffffff', position: 'relative', zIndex: 101, opacity: 1, textShadow: 'none' }}>
                        Extract Topics
                      </span>
                    </button>
                  </>
                )}
                {subscriptionLevel === "Tester" && (tree?.topics?.length || 0) > 0 && (
                  <button
                    onClick={async () => {
                      if (!window.confirm("Are you sure you want to clear all topics? This action cannot be undone.")) return;
                      const data = loadSubjectData(slug) as StoredSubjectData | null;
                      if (data) {
                        data.topics = [];
                        data.tree = { subject: data.subject || slug, topics: [] };
                        await saveSubjectDataAsync(slug, data);
                        setTopics([]);
                        setTree({ subject: data.subject || slug, topics: [] });
                        // Sync to server if authenticated
                        try {
                          const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
                          if (me?.user) {
                            await fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ data }),
                            }).catch(() => {});
                          }
                        } catch {}
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Clear All Topics (Tester)
                  </button>
                )}
              </div>
            </div>
            {(tree?.topics?.length || 0) > 0 ? (
              <ul className="divide-y divide-[var(--foreground)]/10 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]">
                {[...tree!.topics].sort((a, b) => {
                  const aGen = !!(Array.isArray(nodes?.[a.name]?.lessons) && nodes[a.name].lessons.length > 0);
                  const bGen = !!(Array.isArray(nodes?.[b.name]?.lessons) && nodes[b.name].lessons.length > 0);
                  if (aGen && !bGen) return -1; // Generated first
                  if (!aGen && bGen) return 1;  // Generated first
                  return 0; // Maintain order for same type
                }).map((t: any, i: number) => {
                  const name = t.name;
                  const isGen = !!(Array.isArray(nodes?.[name]?.lessons) && nodes[name].lessons.length > 0);
                  const hasSurgeLesson =
                    Array.isArray(nodes?.[name]?.lessons) &&
                    nodes[name].lessons.some((lesson: any) => lesson?.origin === "surge");
                  const hasExamSnipeLesson =
                    Array.isArray(nodes?.[name]?.lessons) &&
                    nodes[name].lessons.some((lesson: any) => lesson?.origin === "exam-snipe");
                  const isGenerating = !!nodeGenerating[name];
                  const isFirst = i === 0;
                  const isLast = i === tree!.topics.length - 1;
                  const isOnly = tree!.topics.length === 1;
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
                    <li 
                      key={`${name}-${i}`} 
                      className={`group relative flex items-center justify-between px-4 py-3 transition-colors cursor-pointer overflow-hidden ${roundedClass} ${isGen ? 'bg-transparent' : 'hover:bg-[var(--background)]/80'}`} 
                      onClick={(e) => {
                        // Don't navigate if clicking on buttons or if generating
                        if ((e.target as HTMLElement).closest('button') || isGenerating) return;
                        // Use Next.js router for clean navigation
                        router.push(`/subjects/${slug}/node/${encodeURIComponent(name)}`);
                      }}
                      onMouseEnter={() => {
                        setHoveredTopicName(name);
                      }}
                      onMouseLeave={() => {
                        setHoveredTopicName((current) => (current === name ? null : current));
                      }}
                      onTouchStart={(e) => {
                        // Ensure touch events work on mobile/iPad
                        if ((e.target as HTMLElement).closest('button') || isGenerating) return;
                      }}
                    >
                      {isGen && (
                        <div className={`pointer-events-none absolute inset-0 opacity-20 ${roundedClass}`} style={{ backgroundImage: 'linear-gradient(90deg, #00E5FF, #FF2D96)' }} />
                      )}
                      <div className="flex items-center gap-2 flex-1 min-w-0" onClick={(e) => {
                        // Allow clicking on the text area to navigate
                        if (!(e.target as HTMLElement).closest('button')) {
                          if (!isGenerating) {
                            router.push(`/subjects/${slug}/node/${encodeURIComponent(name)}`);
                          }
                        }
                      }}>
                        <span
                          className={`text-sm transition-colors ${
                            isGen
                              ? 'text-[var(--foreground)] hover:opacity-90'
                              : 'text-[var(--foreground)]/70 hover:text-[var(--foreground)]'
                          }`}
                        >
                          {name}
                        </span>
                        {hasSurgeLesson && (
                          <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-[var(--foreground)]/80">
                            Surge
                          </span>
                        )}
                        {hasExamSnipeLesson && (
                          <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-[var(--foreground)]/80">
                            Exam Snipe
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {subscriptionLevel === "Tester" && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setTopicInfoOpen(topicInfoOpen === name ? null : name);
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--background)]/60 border border-[var(--foreground)]/20 text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/10 hover:border-[var(--foreground)]/30 transition-all opacity-0 group-hover:opacity-100"
                            title="View topic info"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <path d="M12 16v-4"></path>
                              <path d="M12 8h.01"></path>
                            </svg>
                          </button>
                        )}
                        {isGen && quizCompleted && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] text-green-700 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Done
                          </span>
                        )}
                        {/* 3-dot menu button - only visible on hover */}
                        <div className="relative lesson-menu-container">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[name] = el;
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (lessonMenuOpen === name) {
                                // Closing the menu
                                setLessonMenuOpen(null);
                                setMenuPosition(null);
                              } else {
                                // Opening the menu
                                const button = e.currentTarget;
                                const rect = button.getBoundingClientRect();
                                setMenuPosition({
                                  top: rect.bottom + 8,
                                  right: window.innerWidth - rect.right,
                                });
                                setLessonMenuOpen(name);
                              }
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-all opacity-0 group-hover:opacity-100"
                            title="Lesson options"
                            data-menu-button
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="5" cy="12" r="2" fill="currentColor" />
                              <circle cx="12" cy="12" r="2" fill="currentColor" />
                              <circle cx="19" cy="12" r="2" fill="currentColor" />
                            </svg>
                          </button>
                          {/* Dropdown menu - rendered via portal */}
                          {lessonMenuOpen === name && menuPosition && typeof window !== 'undefined' && createPortal(
                            <div 
                              data-menu-dropdown
                              className="fixed z-[9999] w-40 rounded-xl border border-white/10 bg-[var(--background)]/95 backdrop-blur-md shadow-lg p-2 space-y-2"
                              style={{
                                top: `${menuPosition.top}px`,
                                right: `${menuPosition.right}px`,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setLessonMenuOpen(null);
                                  setMenuPosition(null);
                                  setRenamingLesson(name);
                                  setRenameValue(name);
                                }}
                                className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                              >
                                Rename
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setLessonMenuOpen(null);
                                  setMenuPosition(null);
                                  setTopicInfoOpen(name);
                                }}
                                className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                              >
                                Info
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setLessonMenuOpen(null);
                                  setMenuPosition(null);
                                  if (!window.confirm(`Are you sure you want to delete "${name}"? This will remove the lesson and all its content. This action cannot be undone.`)) {
                                    return;
                                  }
                                  try {
                                    const data = loadSubjectData(slug) as StoredSubjectData | null;
                                    if (data) {
                                      // Remove from topics array
                                      if (data.topics) {
                                        data.topics = data.topics.filter((t: any) => t.name !== name);
                                      }
                                      // Remove from tree.topics
                                      if (data.tree?.topics) {
                                        data.tree.topics = data.tree.topics.filter((t: any) => t.name !== name);
                                      }
                                      // Remove node data (lessons)
                                      if (data.nodes) {
                                        delete data.nodes[name];
                                      }
                                      // Save updated data
                                      await saveSubjectDataAsync(slug, data);
                                      // Update local state
                                      setTopics(data.topics || []);
                                      setTree(data.tree || { subject: data.subject || slug, topics: [] });
                                      setNodes({ ...data.nodes || {} });
                                      // Sync to server if authenticated
                                      try {
                                        const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
                                        if (me?.user) {
                                          await fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            credentials: 'include',
                                            body: JSON.stringify({ data }),
                                          }).catch(() => {});
                                        }
                                      } catch {}
                                    }
                                  } catch (err: any) {
                                    console.error('Failed to delete lesson:', err);
                                    alert(err?.message || "Failed to delete lesson");
                                  }
                                }}
                                className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[#FFC0DA] hover:bg-[#FF2D96]/20 transition-colors"
                              >
                                Delete
                              </button>
                            </div>,
                            document.body
                          )}
                        </div>
                      {!isGen && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {!isGenerating && hoveredTopicName === name && (
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
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full shadow cursor-pointer hover:shadow-lg hover:scale-110 transition-all duration-300"
                              style={{
                                backgroundImage: 'var(--accent-grad)',
                                backgroundSize: '200% 200%',
                                animation: 'gradient-shift 4s ease-in-out infinite',
                              }}
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


            {/* Topic Info Modal for Testers */}
            {subscriptionLevel === "Tester" && topicInfoOpen && (() => {
              const topicData = (topics || []).find((t: TopicMeta) => t.name === topicInfoOpen);
              if (!topicData) return null;
              
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTopicInfoOpen(null)}>
                  <div className="w-full max-w-lg rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 backdrop-blur-sm p-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-[var(--foreground)]">Topic Information</h3>
                      <button
                        onClick={() => setTopicInfoOpen(null)}
                        className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] text-xl"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-medium text-[var(--foreground)]/70 mb-1">Topic Name</div>
                        <div className="text-base font-semibold text-[var(--foreground)]">{topicData!.name}</div>
                      </div>

                      {topicData!.summary && (
                        <div>
                          <div className="text-xs font-medium text-[var(--foreground)]/70 mb-1">Summary</div>
                          <div className="text-sm text-[var(--foreground)]/90">{topicData!.summary}</div>
                        </div>
                      )}


                      <div className="pt-4 border-t border-[var(--foreground)]/10">
                        <div className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Raw Data (JSON)</div>
                        <pre className="text-xs bg-[var(--background)]/60 border border-[var(--foreground)]/10 rounded-lg p-3 overflow-auto max-h-48 text-[var(--foreground)]/80">
                          {JSON.stringify(topicData!, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={() => setTopicInfoOpen(null)}
                        className="rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--background)]/75"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Rename Lesson Modal */}
            {renamingLesson && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRenamingLesson(null)}>
                <div className="w-full max-w-md rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 backdrop-blur-sm p-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">Rename Lesson</h3>
                    <button
                      onClick={() => setRenamingLesson(null)}
                      className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] text-xl"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--foreground)]/70 mb-2">
                        Lesson Name
                      </label>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleRenameLesson();
                          } else if (e.key === 'Escape') {
                            setRenamingLesson(null);
                          }
                        }}
                        className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50"
                        placeholder="Enter new lesson name"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      onClick={() => setRenamingLesson(null)}
                      className="rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--background)]/75"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRenameLesson}
                      disabled={!renameValue.trim() || renameValue.trim() === renamingLesson}
                      className="rounded-lg border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-4 py-2 text-sm text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Exam Snipes Section - shown under topics in tree view */}
            {examSnipes.length > 0 && renderExamSnipesSection("Saved Exam Snipes")}
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-xl border border-[#3A1E2C] bg-[#1B0F15] p-3 text-sm text-[#FFC0DA]">
            {error}
          </div>
        ) : null}

        {activeTab === 'topics' && (
          <>
            {topics ? (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--foreground)]">
                    Topics <span className="text-[var(--foreground)]/50 font-normal">({(topics || []).length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={collectAllFlashcards}
                      className="inline-flex h-9 items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--background)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/25 transition-colors"
                    >
                      Flashcards
                    </button>
                    <button
                      onClick={collectAllHighlights}
                      className="inline-flex h-9 items-center rounded-full border border-[var(--foreground)]/15 bg-[var(--background)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/25 transition-colors"
                    >
                      Highlights
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    value={query}
                    onChange={(e) => { if (!e.target) return; setQuery(e.target.value); }}
                    placeholder="Filter topics…"
                    className="w-full rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/45 focus:outline-none"
                  />
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]">
                  <ul className="divide-y divide-[var(--foreground)]/10">
                    {(topics || [])
                      .filter((t) =>
                        query.trim() ? (t.name + " " + (t.summary || "")).toLowerCase().includes(query.toLowerCase()) : true
                      )
                      .map((t, i) => {
                        const p = progress[t.name];
                        const pct = p && p.totalLessons > 0 ? Math.round((p.completedLessons / p.totalLessons) * 100) : 0;
                        const badges = topicRowMetaByName[t.name];
                        return (
                          <li key={`${t.name}-${i}`}>
                            <Link
                              href={`/subjects/${slug}/node/${encodeURIComponent(t.name)}`}
                              className="block px-4 py-3 hover:bg-[var(--foreground)]/5 transition-colors"
                            >
                              <div className="flex items-start gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className="truncate text-sm font-medium text-[var(--foreground)]">{t.name}</div>
                                    {(badges?.examSnipe || badges?.surge) && (
                                      <div className="flex items-center gap-1">
                                        {badges?.examSnipe && (
                                          <span className="rounded-full border border-[var(--accent-pink)]/25 bg-[var(--accent-pink)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-pink)]/90">
                                            Exam Snipe
                                          </span>
                                        )}
                                        {badges?.surge && (
                                          <span className="rounded-full border border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-cyan)]/90">
                                            Surge
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {t.summary ? (
                                    <div className="mt-0.5 line-clamp-1 text-xs text-[var(--foreground)]/55" title={t.summary}>
                                      {t.summary}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="w-24 shrink-0">
                                  <div className="flex items-center justify-end text-[10px] text-[var(--foreground)]/55">
                                    {pct}%
                                  </div>
                                  <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--foreground)]/10">
                                    <div className="h-1.5 rounded-full synapse-style" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                </div>
            
            {/* Exam Snipes Section */}
            {examSnipes.length > 0 && renderExamSnipesSection("Saved Exam Snipes")}
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

          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-5">
              <div className="text-sm font-semibold text-[var(--foreground)]">Tools</div>
              <div className="mt-3 grid gap-2">
                <button
                  onClick={collectAllFlashcards}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-colors"
                >
                  Flashcards
                </button>
                <button
                  onClick={collectAllHighlights}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-colors"
                >
                  Highlights
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-5">
              <div className="text-sm font-semibold text-[var(--foreground)]">Practice</div>
              <div className="mt-1 text-sm text-[var(--foreground)]/65">Intensive mode for a single topic.</div>
              <button
                onClick={() => router.push(`/subjects/${slug}/practice`)}
                className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-colors"
              >
                Open Practice
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-5">
              <div className="text-sm font-semibold text-[var(--foreground)]">Context</div>
              <div className="mt-1 text-sm text-[var(--foreground)]/65">
                {tree?.topics?.length ? `${tree?.topics?.length} topics` : "No topics yet"}
                {daysLeft !== null ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}
              </div>
              {examSnipes.length > 0 && (
                <button
                  onClick={() => router.push(`/subjects/${slug}/examsnipe`)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)] px-4 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-colors"
                >
                  Exam Snipe
                </button>
              )}
            </div>
          </aside>
        </div>
        </details>
          </>
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
                className="inline-flex h-9 items-center rounded-full synapse-style px-4 text-sm font-medium text-white"
                style={{ color: 'white' }}
                disabled={generatingBasics}
              >
                <span style={{ color: '#ffffff', opacity: 1, textShadow: 'none' }}>
                  {generatingBasics ? 'Extracting…' : 'Extract Topics'}
                </span>
              </button>
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
                      data.topics = Array.isArray(data.topics) ? [...data.topics, { name, summary: overview?.slice(0, 140) || '' }] : [{ name, summary: overview?.slice(0, 140) || '' }];
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
                className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white synapse-style"
                disabled={creatingTopic}
              >
                <span style={{ color: '#ffffff', position: 'relative', zIndex: 101, opacity: 1, textShadow: 'none' }}>
                  {creatingTopic ? 'Adding…' : 'Add topic'}
                </span>
              </button>
            </div>
          }
        >
          <div>
            <label className="mb-2 block text-xs text-[#A7AFBE]">Topic name or question</label>
            <input
              value={newTopicValue}
              onChange={(e) => { if (!e.target) return; setNewTopicValue(e.target.value); }}
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none"
              placeholder="Enter topic name or question"
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
              <div className="w-full chat-input-container rounded-xl border border-[var(--foreground)]/10 px-3 py-2">
                <textarea
                  value={quickLearnQuery}
                  onChange={(e) => { if (!e.target) return; setQuickLearnQuery(e.target.value); }}
                  onTouchStart={(e) => {
                    // Ensure focus works on iOS PWA
                    e.currentTarget.focus();
                  }}
                  className="w-full bg-transparent border-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/60 focus:outline-none resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
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
      {allFlashcardsModalOpen && (() => {
        // Group flashcards by topic
        const flashcardsByTopic: Record<string, typeof allFlashcards> = {};
        allFlashcards.forEach(f => {
          if (!flashcardsByTopic[f.topicName]) {
            flashcardsByTopic[f.topicName] = [];
          }
          flashcardsByTopic[f.topicName].push(f);
        });
        const topicsWithFlashcards = Object.keys(flashcardsByTopic).sort();
        
        const filteredFlashcards = showOnlyStarred 
          ? allFlashcards.filter(f => starredFlashcards.has(f.id))
          : selectedFlashcardTopic
          ? flashcardsByTopic[selectedFlashcardTopic] || []
          : allFlashcards;
        const currentCard = filteredFlashcards[currentFlashcardIndex];
        const isStarred = currentCard ? starredFlashcards.has(currentCard.id) : false;
        
        // Show topic list if no topic selected and we have multiple topics, or if no flashcards yet
        if (allFlashcards.length === 0) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
              <div className="relative w-full max-w-xl rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 p-6 shadow-2xl">
                <button
                  onClick={() => {
                    setAllFlashcardsModalOpen(false);
                    setFlashcardFlipped(false);
                  }}
                  className="unified-button absolute right-4 top-4 h-8 w-8 rounded-full flex items-center justify-center"
                  aria-label="Close flashcards"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <div className="text-center py-8">
                  <p className="text-[var(--foreground)]/70">No flashcards found. Generate flashcards from lessons first.</p>
                </div>
              </div>
            </div>
          );
        }
        
        // Show topic list if no topic selected and we have multiple topics
        if (showFlashcardTopicList && topicsWithFlashcards.length > 1 && !selectedFlashcardTopic) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
              <div className="relative w-full max-w-xl rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 p-6 shadow-2xl">
                <button
                  onClick={() => {
                    setAllFlashcardsModalOpen(false);
                    setFlashcardFlipped(false);
                  }}
                  className="unified-button absolute right-4 top-4 h-8 w-8 rounded-full flex items-center justify-center"
                  aria-label="Close flashcards"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Flashcards</h2>
                  <p className="text-sm text-[var(--foreground)]/70">Select a deck</p>
                </div>
                <div className="max-h-[400px]" style={{ padding: '1rem 0.75rem', overflowY: 'auto', overflowX: 'visible' }}>
                  <div className="space-y-3">
                    {topicsWithFlashcards.map((topic) => (
                      <button
                        key={topic}
                        onClick={() => {
                          setSelectedFlashcardTopic(topic);
                          setShowFlashcardTopicList(false);
                          setCurrentFlashcardIndex(0);
                        }}
                        className="w-full text-left btn-grey font-medium px-4 py-2.5 transition-colors"
                        style={{
                          borderRadius: '9999px',
                          boxShadow: '0 0.5px 1px rgba(0, 0, 0, 0.03)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = '0 0.5px 1px rgba(0, 0, 0, 0.03)';
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{topic === "__course__" ? "Course Deck" : topic}</span>
                          <span className="text-sm opacity-60 whitespace-nowrap">
                            {flashcardsByTopic[topic].length} {flashcardsByTopic[topic].length === 1 ? 'flashcard' : 'flashcards'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--foreground)]/10">
                  <button
                    onClick={() => {
                      setShowFlashcardTopicList(false);
                      setSelectedFlashcardTopic(null);
                      setCurrentFlashcardIndex(0);
                    }}
                    className="w-full btn-grey rounded-lg font-medium"
                    style={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                  >
                    View All Flashcards
                  </button>
                </div>
              </div>
            </div>
          );
        }
        
        return filteredFlashcards.length > 0 ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="relative w-full max-w-xl rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/95 p-6 shadow-2xl">
              <button
                onClick={() => {
                  setAllFlashcardsModalOpen(false);
                  setFlashcardFlipped(false);
                }}
                className="unified-button absolute right-4 top-4 h-8 w-8 rounded-full flex items-center justify-center"
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
                  {currentCard?.topicName === "__course__"
                    ? "Course Deck"
                    : `${currentCard?.topicName} • ${currentCard?.lessonTitle}`}
                </div>
              </div>
              <div className="relative flex items-center justify-center gap-3">
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
                  className="btn-grey rounded-lg flex h-10 w-10 items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous flashcard"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <div
                  className="relative h-72 w-full max-w-md cursor-pointer rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 text-center shadow-inner overflow-hidden"
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
                      className="unified-button absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full pointer-events-auto"
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
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 pb-12 text-lg font-medium leading-relaxed text-[var(--foreground)] transition-opacity duration-300 z-10 pointer-events-none ${flashcardFlipped ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="pointer-events-auto w-full overflow-y-auto overflow-x-hidden text-center" style={{ maxHeight: 'calc(100% - 3rem)' }}>
                      <div className="flex flex-col items-center justify-center min-h-full py-4">
                        <FlashcardContent content={sanitizeFlashcardContent(String(currentCard?.prompt || ""))} />
                      </div>
                    </div>
                  </div>
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 pb-12 text-lg font-medium leading-relaxed text-[var(--foreground)] transition-opacity duration-300 z-10 pointer-events-none ${flashcardFlipped ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="pointer-events-auto w-full overflow-y-auto overflow-x-hidden text-center" style={{ maxHeight: 'calc(100% - 3rem)' }}>
                      <div className="flex flex-col items-center justify-center min-h-full py-4">
                        <FlashcardContent content={sanitizeFlashcardContent(String(currentCard?.answer || ""))} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-xs text-[var(--foreground)]/60 z-10 pointer-events-none">
                    {flashcardFlipped ? "Tap to view prompt" : "Tap to reveal answer"}
                  </div>
                </div>
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
                  className="btn-grey rounded-lg flex h-10 w-10 items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next flashcard"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => setIsShuffleActive(!isShuffleActive)}
                  className="btn-grey font-medium relative overflow-hidden"
                  style={isShuffleActive ? {
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    color: 'var(--foreground)',
                  } : {}}
                  aria-label={isShuffleActive ? "Disable shuffle mode" : "Enable shuffle mode"}
                >
                  {isShuffleActive && (
                    <div 
                      className="absolute inset-0"
                      style={{
                        backgroundImage: 'linear-gradient(90deg, rgba(0, 229, 255, 0.4), rgba(255, 45, 150, 0.4))',
                        borderRadius: '9999px',
                        zIndex: 0,
                      }}
                    />
                  )}
                  <span className="relative z-10">Shuffle</span>
                </button>
                <button
                  onClick={() => {
                    setShowOnlyStarred(!showOnlyStarred);
                    setCurrentFlashcardIndex(0);
                    setFlashcardFlipped(false);
                  }}
                  className="btn-grey font-medium flex items-center gap-1.5 relative overflow-hidden"
                  style={showOnlyStarred ? {
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    color: 'var(--foreground)',
                  } : {}}
                  aria-label={showOnlyStarred ? "Show all flashcards" : "Show only starred flashcards"}
                >
                  {showOnlyStarred && (
                    <div 
                      className="absolute inset-0"
                      style={{
                        backgroundImage: 'linear-gradient(90deg, rgba(250, 204, 21, 0.4), rgba(234, 179, 8, 0.4))',
                        borderRadius: '9999px',
                        zIndex: 0,
                      }}
                    />
                  )}
                  <svg 
                    className={`h-4 w-4 relative z-10 ${showOnlyStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} 
                    viewBox="0 0 24 24" 
                    fill={showOnlyStarred ? "currentColor" : "none"} 
                    stroke="currentColor" 
                    strokeWidth="2"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span className="relative z-10">{showOnlyStarred ? 'Starred Only' : 'Show Starred'}</span>
                </button>
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
                className="unified-button absolute right-4 top-4 h-8 w-8 rounded-full flex items-center justify-center"
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
                  className="btn-grey rounded-lg font-medium px-4 py-2"
                >
                  Show All Flashcards
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* All Course Highlights Modal */}
      <HighlightsModal
        open={allHighlightsModalOpen}
        onClose={() => setAllHighlightsModalOpen(false)}
        highlights={[]}
        onSave={() => {}}
        onDelete={() => {}}
        allHighlights={allHighlights}
        isCourseView={true}
        onNavigateToLesson={navigateToLessonWithHighlight}
      />
    </div>
  );
}
