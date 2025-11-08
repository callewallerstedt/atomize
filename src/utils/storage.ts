export type TopicMeta = { name: string; summary: string; coverage: number };
export type QuizResult = { correct: boolean; explanation: string; hint?: string; fullSolution?: string };
export type LessonFlashcard = {
  prompt: string;
  answer: string;
};

export type TopicGeneratedLesson = {
  title: string;
  body: string;
  quiz: { question: string }[];
  // Optional persisted quiz state
  userAnswers?: string[];
  quizResults?: { [index: number]: QuizResult };
  quizCompletedAt?: number; // timestamp when answers were checked
  flashcards?: LessonFlashcard[];
};
export type TopicGeneratedContent = {
  overview: string;
  symbols: { symbol: string; meaning: string; units?: string }[];
  lessonsMeta?: { type: string; title: string }[];
  lessons: (TopicGeneratedLesson | null)[]; // may be partially generated
  rawLessonJson?: (string | null)[]; // raw AI JSON response per lesson (unparsed)
};
export type StoredSubjectNodeContent = {
  [nodeName: string]: TopicGeneratedContent | string; // legacy string supported
};

export type ReviewSchedule = {
  topicName: string;
  lessonIndex: number;
  lastReviewed: number; // timestamp
  nextReview: number; // timestamp
  interval: number; // days until next review
  ease: number; // difficulty multiplier (higher = easier)
  reviews: number; // count of reviews
};

export type StoredSubjectData = {
  subject: string;
  files: { name: string; type?: string; data?: string }[];
  combinedText: string;
  course_file_ids?: string[];
  tree?: { subject: string; topics: { name: string; subtopics?: any[] }[] } | null; // legacy
  topics?: TopicMeta[]; // new main topics meta
  nodes: StoredSubjectNodeContent;
  progress?: { [topicName: string]: { totalLessons: number; completedLessons: number } };
  course_context?: string;
  course_language_code?: string; // e.g., 'en', 'sv'
  course_language_name?: string; // e.g., 'English', 'Svenska'
  course_notes?: string; // freeform notes for the course
  topic_notes?: { [topicName: string]: string }; // freeform notes per topic
  course_icon?: string; // emoji or short icon text
  course_quick_summary?: string; // fast AI read of course context
  reviewSchedules?: { [key: string]: ReviewSchedule }; // key: "topicName-lessonIndex"
};

const PREFIX = "atomicSubjectData:";

export function loadSubjectData(slug: string): StoredSubjectData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + slug);
    return raw ? (JSON.parse(raw) as StoredSubjectData) : null;
  } catch {
    return null;
  }
}

// Async function to sync data to server (awaits completion)
export async function syncSubjectDataToServer(slug: string, data: StoredSubjectData): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const meRes = await fetch("/api/me", { credentials: "include" });
    const meJson = await meRes.json().catch(() => ({}));
    if (meJson?.user) {
      await fetch("/api/subject-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug, data }),
      });
    }
  } catch (err) {
    // Silently fail - local storage is still saved
    console.warn("Failed to sync subject data to server:", err);
  }
}

export function saveSubjectData(slug: string, data: StoredSubjectData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + slug, JSON.stringify(data));
    // Best-effort async sync to server if logged in (fire and forget for non-critical saves)
    syncSubjectDataToServer(slug, data).catch(() => {});
  } catch (err) {
    try {
      const slim: StoredSubjectData = { ...data } as any;
      // Drop heavy fields if quota exceeded
      if (Array.isArray(slim.files)) {
        slim.files = slim.files.map((f) => ({ name: f.name, type: f.type }));
      }
      if (typeof slim.combinedText === 'string' && slim.combinedText.length > 200_000) {
        slim.combinedText = slim.combinedText.slice(0, 200_000);
      }
      // Trim rawLessonJson if present
      if (slim.nodes) {
        for (const k of Object.keys(slim.nodes)) {
          const v: any = (slim.nodes as any)[k];
          if (v && Array.isArray(v.rawLessonJson) && v.rawLessonJson.length > 0) {
            v.rawLessonJson = [];
          }
        }
      }
      localStorage.setItem(PREFIX + slug, JSON.stringify(slim));
    } catch {}
  }
}

// Async version that awaits server sync (use for critical saves like lesson generation)
export async function saveSubjectDataAsync(slug: string, data: StoredSubjectData): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + slug, JSON.stringify(data));
    await syncSubjectDataToServer(slug, data);
  } catch (err) {
    try {
      const slim: StoredSubjectData = { ...data } as any;
      // Drop heavy fields if quota exceeded
      if (Array.isArray(slim.files)) {
        slim.files = slim.files.map((f) => ({ name: f.name, type: f.type }));
      }
      if (typeof slim.combinedText === 'string' && slim.combinedText.length > 200_000) {
        slim.combinedText = slim.combinedText.slice(0, 200_000);
      }
      // Trim rawLessonJson if present
      if (slim.nodes) {
        for (const k of Object.keys(slim.nodes)) {
          const v: any = (slim.nodes as any)[k];
          if (v && Array.isArray(v.rawLessonJson) && v.rawLessonJson.length > 0) {
            v.rawLessonJson = [];
          }
        }
      }
      localStorage.setItem(PREFIX + slug, JSON.stringify(slim));
      // Try to sync the slimmed version
      await syncSubjectDataToServer(slug, slim);
    } catch {}
  }
}

export function upsertNodeContent(slug: string, nodeName: string, content: string | TopicGeneratedContent) {
  const existing = loadSubjectData(slug) || {
    subject: slug,
    files: [],
    combinedText: "",
    tree: null,
    topics: [],
    nodes: {},
  } as StoredSubjectData;
  existing.nodes[nodeName] = content as any;
  saveSubjectData(slug, existing);
}

// Async version that awaits server sync (use for critical updates like lesson generation)
export async function upsertNodeContentAsync(slug: string, nodeName: string, content: string | TopicGeneratedContent): Promise<void> {
  const existing = loadSubjectData(slug) || {
    subject: slug,
    files: [],
    combinedText: "",
    tree: null,
    topics: [],
    nodes: {},
  } as StoredSubjectData;
  existing.nodes[nodeName] = content as any;
  await saveSubjectDataAsync(slug, existing);
}

// Spaced Repetition Functions
// Based on SM-2 algorithm with intervals: 1, 3, 7, 14, 30, 60, 120+ days

export function markLessonReviewed(
  slug: string,
  topicName: string,
  lessonIndex: number,
  quality: number // 0-5, where 0=forgot, 3=okay, 5=perfect
) {
  const data = loadSubjectData(slug);
  if (!data) return;
  
  const key = `${topicName}-${lessonIndex}`;
  const now = Date.now();
  const existingSchedule = data.reviewSchedules?.[key];
  
  if (!existingSchedule) {
    // First review
    const initialInterval = quality >= 3 ? 1 : 0.5; // days
    const newSchedule: ReviewSchedule = {
      topicName,
      lessonIndex,
      lastReviewed: now,
      nextReview: now + (initialInterval * 24 * 60 * 60 * 1000),
      interval: initialInterval,
      ease: 2.5,
      reviews: 1
    };
    data.reviewSchedules = data.reviewSchedules || {};
    data.reviewSchedules[key] = newSchedule;
  } else {
    // Subsequent review - use SM-2 algorithm
    let newEase = existingSchedule.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEase = Math.max(1.3, newEase); // minimum ease factor
    
    let newInterval: number;
    if (quality < 3) {
      // Forgot or struggled - reset to short interval
      newInterval = 1;
    } else {
      // Remember - increase interval
      if (existingSchedule.reviews === 1) {
        newInterval = 3; // second review after 3 days
      } else {
        newInterval = Math.round(existingSchedule.interval * newEase);
      }
    }
    
    const updatedSchedule: ReviewSchedule = {
      ...existingSchedule,
      lastReviewed: now,
      nextReview: now + (newInterval * 24 * 60 * 60 * 1000),
      interval: newInterval,
      ease: newEase,
      reviews: existingSchedule.reviews + 1
    };
    data.reviewSchedules = data.reviewSchedules || {};
    data.reviewSchedules[key] = updatedSchedule;
  }
  
  saveSubjectData(slug, data);
}

export function getLessonsDueForReview(slug: string): ReviewSchedule[] {
  const data = loadSubjectData(slug);
  if (!data || !data.reviewSchedules) return [];
  
  const now = Date.now();
  return Object.values(data.reviewSchedules).filter(
    schedule => schedule.nextReview <= now
  ).sort((a, b) => a.nextReview - b.nextReview); // oldest due first
}

export function getUpcomingReviews(slug: string, days: number = 7): ReviewSchedule[] {
  const data = loadSubjectData(slug);
  if (!data || !data.reviewSchedules) return [];
  
  const now = Date.now();
  const future = now + (days * 24 * 60 * 60 * 1000);
  return Object.values(data.reviewSchedules).filter(
    schedule => schedule.nextReview > now && schedule.nextReview <= future
  ).sort((a, b) => a.nextReview - b.nextReview);
}


