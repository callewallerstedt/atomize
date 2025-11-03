export type TopicMeta = { name: string; summary: string; coverage: number };
export type TopicGeneratedLesson = { title: string; body: string; quiz: { question: string }[] };
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

export function saveSubjectData(slug: string, data: StoredSubjectData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + slug, JSON.stringify(data));
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


