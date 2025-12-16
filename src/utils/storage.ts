import type { LessonMetadata } from "@/types/lesson";

export type TopicMeta = { name: string; summary: string };
export type QuizResult = { correct: boolean; explanation: string; hint?: string; fullSolution?: string };
export type LessonFlashcard = {
  prompt: string;
  answer: string;
};

export type LessonVideo = {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  thumbnail: string;
  duration: string;
  viewsFormatted?: string;
  views?: number;
};

export type LessonHighlight = {
  id: string;
  text: string; // The highlighted text
  color: string; // Highlight color (hex or named)
  note?: string; // User's note/annotation
  elaboration?: string; // AI-generated elaboration (markdown)
  startOffset: number; // Character offset from start of lesson body
  endOffset: number; // Character offset from start of lesson body
  occurrenceIndex?: number; // Which occurrence of the text (0-based) in rendered text
  createdAt: number; // Timestamp
  updatedAt?: number; // Timestamp of last update
};

export type TopicGeneratedLesson = {
  title: string;
  body: string;
  quiz: { question: string; answer?: string }[];
  practiceProblems?: Array<{ problem: string; solution: string }>; // Practice problems with solutions
  // Optional persisted quiz state
  userAnswers?: string[];
  quizResults?: { [index: number]: QuizResult };
  quizCompletedAt?: number; // timestamp when answers were checked
  flashcards?: LessonFlashcard[];
  metadata?: LessonMetadata | null;
  videos?: LessonVideo[]; // Saved YouTube videos for this lesson
  videosQueries?: string[]; // Search queries used to find videos
  videosFetchedAt?: number; // Timestamp when videos were fetched
  highlights?: LessonHighlight[]; // User-created text highlights
  origin?: "surge" | "ai" | "quicklearn" | "manual" | string;
  surgeSessionId?: string;
  createdAt?: number;
  updatedAt?: number;
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

export type SurgeLogEntry = {
  sessionId: string;
  timestamp: number;
  updatedAt?: number; // Timestamp of last update (used for cross-device merges)
  repeatedTopics: Array<{
    topic: string;
    questions: Array<{ question: string; answer: string; grade: number }>;
    averageScore: number;
  }>;
  newTopic: string;
  newTopicLesson: string; // The lesson content generated
  quizResults: Array<{
    question: string;
    answer: string;
    grade: number;
    topic: string;
    correctAnswer?: string;
    explanation?: string;
    stage?: "mc" | "harder" | "review";
  }>;
  quizStageTransitions?: Array<{
    from: string;
    to: string;
    timestamp: number;
    topic: string;
  }>;
  mcStageCompletedAt?: number;
  summary: string; // AI-generated summary for next session
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
  practiceLogs?: any[]; // New detailed practice logging
  practiceLogsClearedAt?: number; // timestamp marker to support safe cross-device clears
  course_context?: string;
  course_language_code?: string; // e.g., 'en', 'sv'
  course_language_name?: string; // e.g., 'English', 'Svenska'
  course_notes?: string; // freeform notes for the course
  topic_notes?: { [topicName: string]: string }; // freeform notes per topic
  course_icon?: string; // emoji or short icon text
  course_quick_summary?: string; // fast AI read of course context
  reviewSchedules?: { [key: string]: ReviewSchedule }; // key: "topicName-lessonIndex"
  examDates?: Array<{ date: string; name?: string }>; // ISO date strings, e.g., "2024-03-15"
  surgeLog?: SurgeLogEntry[]; // History of Synapse Surge sessions
  reviewedTopics?: { [topicName: string]: number }; // Map of topic names to last review timestamp
};

const PREFIX = "atomicSubjectData:";
const MAX_SURGE_LOG_ENTRIES = 100;

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
  // Local-only preview courses created from share links should never sync to the server.
  if (slug.startsWith("shared-")) return;
  try {
    const meRes = await fetch("/api/me", { credentials: "include" });
    const meJson = await meRes.json().catch(() => ({}));
    if (meJson?.user) {
      // Ensure subject exists in database (especially for quicklearn)
      if (slug === "quicklearn") {
        try {
          await fetch("/api/subjects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: data.subject || "Quick Learn", slug }),
          }).catch(() => {}); // Ignore if already exists
        } catch {}
      }
      
      await fetch("/api/subject-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
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
      // If local storage fails (quota), still try to sync the full payload to server.
      syncSubjectDataToServer(slug, data).catch(() => {});

      const slim: StoredSubjectData = { ...data } as any;
      // Drop heavy fields if quota exceeded
      if (Array.isArray(slim.files)) {
        slim.files = slim.files.map((f) => ({ name: f.name, type: f.type }));
      }
      if (typeof slim.combinedText === "string" && slim.combinedText.length > 200_000) {
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
    // If local storage fails (quota), still try to sync the full payload to server first.
    let fullSyncOk = false;
    try {
      await syncSubjectDataToServer(slug, data);
      fullSyncOk = true;
    } catch {}
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
      // If full sync failed above, the slimmed version is a fallback.
      if (!fullSyncOk) {
        await syncSubjectDataToServer(slug, slim).catch(() => {});
      }
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
    examDates: [],
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
    examDates: [],
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

// Surge Log Functions

export function getSurgeLog(slug: string): SurgeLogEntry[] {
  const data = loadSubjectData(slug);
  if (!data || !data.surgeLog) return [];
  return data.surgeLog;
}

export function getLastSurgeSession(slug: string): SurgeLogEntry | null {
  const log = getSurgeLog(slug);
  if (log.length === 0) return null;
  // Return session with the most recent timestamp (not just last in array)
  // This ensures that if dates are edited, we get the chronologically most recent session
  const latest = log.reduce((latest, entry) => {
    return entry.timestamp > latest.timestamp ? entry : latest;
  }, log[0]);
  return latest;
}

export function addSurgeLogEntry(slug: string, entry: SurgeLogEntry): void {
  const data =
    loadSubjectData(slug) ||
    ({
      subject: slug,
      files: [],
      combinedText: "",
      topics: [],
      nodes: {},
      examDates: [],
    } as StoredSubjectData);
  
  if (!data.surgeLog) {
    data.surgeLog = [];
  }
  
  data.surgeLog.push({ ...entry, updatedAt: entry.updatedAt ?? Date.now() });
  // Keep only last N sessions to prevent storage bloat
  if (data.surgeLog.length > MAX_SURGE_LOG_ENTRIES) {
    data.surgeLog = data.surgeLog.slice(-MAX_SURGE_LOG_ENTRIES);
  }
  
  saveSubjectData(slug, data);
}

export async function addSurgeLogEntryAsync(slug: string, entry: SurgeLogEntry): Promise<void> {
  const data =
    loadSubjectData(slug) ||
    ({
      subject: slug,
      files: [],
      combinedText: "",
      topics: [],
      nodes: {},
      examDates: [],
    } as StoredSubjectData);
  
  if (!data.surgeLog) {
    data.surgeLog = [];
  }
  
  data.surgeLog.push({ ...entry, updatedAt: entry.updatedAt ?? Date.now() });
  // Keep only last N sessions to prevent storage bloat
  if (data.surgeLog.length > MAX_SURGE_LOG_ENTRIES) {
    data.surgeLog = data.surgeLog.slice(-MAX_SURGE_LOG_ENTRIES);
  }
  
  await saveSubjectDataAsync(slug, data);
}

export async function updateOrAddSurgeLogEntryAsync(slug: string, entry: SurgeLogEntry): Promise<void> {
  const data =
    loadSubjectData(slug) ||
    ({
      subject: slug,
      files: [],
      combinedText: "",
      topics: [],
      nodes: {},
      examDates: [],
    } as StoredSubjectData);
  
  if (!data.surgeLog) {
    data.surgeLog = [];
  }
  
  // Find existing entry with same sessionId
  const existingIndex = data.surgeLog.findIndex(e => e.sessionId === entry.sessionId);
  const normalizedEntry = { ...entry, updatedAt: entry.updatedAt ?? Date.now() };
  
  if (existingIndex !== -1) {
    // Update existing entry
    data.surgeLog[existingIndex] = normalizedEntry;
  } else {
    // Add new entry
    data.surgeLog.push(normalizedEntry);
  }
  
  // Keep only last N sessions to prevent storage bloat
  if (data.surgeLog.length > MAX_SURGE_LOG_ENTRIES) {
    data.surgeLog = data.surgeLog.slice(-MAX_SURGE_LOG_ENTRIES);
  }
  
  await saveSubjectDataAsync(slug, data);
}

export async function updateSurgeLogEntryTimestampAsync(
  slug: string,
  sessionId: string,
  timestamp: number
): Promise<boolean> {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return false;

  const data =
    loadSubjectData(slug) ||
    ({
      subject: slug,
      files: [],
      combinedText: "",
      topics: [],
      nodes: {},
      examDates: [],
    } as StoredSubjectData);

  if (!Array.isArray(data.surgeLog) || data.surgeLog.length === 0) return false;

  const now = Date.now();
  let updated = false;

  data.surgeLog = data.surgeLog.map((entry) => {
    if (entry?.sessionId !== normalizedSessionId) return entry;
    updated = true;
    return { ...entry, timestamp, updatedAt: now };
  });

  if (!updated) return false;

  await saveSubjectDataAsync(slug, data);
  return true;
}

export async function markReviewedTopicsAsync(slug: string, topics: string[], reviewedAt = Date.now()): Promise<void> {
  const data =
    loadSubjectData(slug) ||
    ({
      subject: slug,
      files: [],
      combinedText: "",
      topics: [],
      nodes: {},
      examDates: [],
    } as StoredSubjectData);

  const reviewedTopics = (data.reviewedTopics && typeof data.reviewedTopics === "object" ? data.reviewedTopics : {}) as Record<
    string,
    number
  >;

  for (const topic of topics) {
    const key = String(topic || "").trim();
    if (!key) continue;
    reviewedTopics[key] = Math.max(Number(reviewedTopics[key] || 0), reviewedAt);
  }

  data.reviewedTopics = reviewedTopics;
  await saveSubjectDataAsync(slug, data);
}
