"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import GlowSpinner from "@/components/GlowSpinner";
import {
  loadSubjectData,
  saveSubjectData,
  StoredSubjectData,
  TopicGeneratedContent,
  TopicGeneratedLesson,
} from "@/utils/storage";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  hidden?: boolean;
  isLoading?: boolean;
  uiElements?: Array<{
    type: 'button' | 'file_upload';
    id: string;
    label?: string;
    action?: string;
    params?: Record<string, string>;
    message?: string;
  }>;
};

type ParsedAction = {
  name: string;
  params: Record<string, string>;
};

type ParsedUIElement = {
  type: 'button' | 'file_upload';
  id: string;
  label?: string;
  action?: string;
  params?: Record<string, string>;
  message?: string;
};

type PracticeLogEntry = {
  id: string;
  timestamp: number;
  topic: string;
  question: string;
  answer: string;
  assessment: string;
  grade: number; // 0-10 scale
  // Legacy fields for backward compatibility
  concept?: string;
  skill?: string;
  rating?: number;
  strengths?: string[];
  weaknesses?: string[];
  recommendation?: string;
  confidence?: number;
  difficulty?: string;
  raw?: string;
  result?: string;
  questions?: number;
};

type ParsedAssistantContent = {
  cleanedContent: string;
  actions: ParsedAction[];
  logUpdates: PracticeLogEntry[];
  uiElements: ParsedUIElement[];
};

const MAX_CONTEXT_CHARS = 11_500; // leave room for API preamble
const PRACTICE_LOG_PREFIX = "atomicPracticeLog:";
// FileUploadArea component
function FileUploadArea({
  uploadId,
  message,
  files,
  onFilesChange,
  onGenerate,
  buttonLabel,
  action,
  status
}: {
  uploadId: string;
  message?: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onGenerate: () => void;
  buttonLabel?: string;
  action?: string;
  status?: 'idle' | 'ready' | 'processing' | 'success';
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      onFilesChange(droppedFiles);
    }
  };

  return (
    <div className="space-y-2">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
          isDragging
            ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10'
            : 'border-[var(--accent-cyan)]/40 bg-[var(--background)]/60 hover:border-[var(--accent-cyan)]/60 hover:bg-[var(--background)]/80'
        }`}
      >
        <div className="text-xs text-[var(--foreground)]/70 text-center">
          {isDragging ? 'Drop files here' : (message || 'Upload files or drag and drop')}
        </div>
        {files.length > 0 && (
          <div className="mt-2 text-xs text-[var(--foreground)]/60">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => {
          const selectedFiles = Array.from(e.target.files || []);
          if (selectedFiles.length > 0) {
            onFilesChange(selectedFiles);
          }
        }}
      />
      {files.length > 0 && (
        <button
          onClick={onGenerate}
          className="w-full inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 py-1.5 text-sm font-medium !text-white hover:opacity-95 transition-opacity"
          style={{ color: 'white' }}
        >
          {buttonLabel || 'Create'}
        </button>
      )}
      {status === 'processing' && (
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--foreground)]/60">
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          Starting...
        </div>
      )}
      {status === 'success' && (
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--accent-cyan)]/90">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          Complete!
        </div>
      )}
    </div>
  );
}

function renderPracticeContent(content: string): React.JSX.Element {
  // Parse ◊ (lozenge) delimiters for practice questions - allows multiline content
  // Also handles incomplete questions (opening ◊ without closing ◊) for streaming
  const parts: (string | { type: 'question'; content: string })[] = [];
  let lastIndex = 0;
  let searchIndex = 0;

  while (searchIndex < content.length) {
    const openIndex = content.indexOf('◊', searchIndex);
    
    if (openIndex === -1) {
      // No more ◊ found, add remaining text
      if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex));
      }
      break;
    }

    // Add text before the opening ◊
    if (openIndex > lastIndex) {
      parts.push(content.slice(lastIndex, openIndex));
    }

    // Look for closing ◊
    const closeIndex = content.indexOf('◊', openIndex + 1);
    
    if (closeIndex === -1) {
      // No closing ◊ found - treat everything from ◊ to end as question (for streaming)
      const questionText = content.slice(openIndex + 1).trim();
      parts.push({ type: 'question', content: questionText });
      lastIndex = content.length;
      break;
    } else {
      // Found complete question block
      const questionText = content.slice(openIndex + 1, closeIndex).trim();
      parts.push({ type: 'question', content: questionText });
      lastIndex = closeIndex + 1;
      searchIndex = closeIndex + 1;
    }
  }

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          // Regular text - use LessonBody
          return part.trim() ? (
            <LessonBody
              key={index}
              body={sanitizeLessonBody(part)}
            />
          ) : null;
        } else {
          // Question - render with gradient background
          return (
            <div
              key={index}
              className="rounded-lg bg-gradient-to-r from-[#00E5FF]/20 via-[#FF2D96]/10 to-[#00E5FF]/20 border border-[#00E5FF]/30 p-4 my-2 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]"></div>
                <span className="text-xs font-semibold uppercase tracking-wide text-[#00E5FF] opacity-80">
                  Practice Question
                </span>
              </div>
              <div className="text-base font-medium leading-relaxed">
                <LessonBody body={sanitizeLessonBody(part.content)} />
              </div>
            </div>
          );
        }
      })}
    </div>
  );
}

function formatPracticeLogSummary(entries: PracticeLogEntry[]): string {
  if (!entries.length) return "";

  // Analyze patterns for better recommendations
  const topicStats: Record<string, { total: number; correct: number; recent: PracticeLogEntry[] }> = {};

  entries.forEach(entry => {
    const topic = entry.topic || entry.skill || "General";
    if (!topicStats[topic]) {
      topicStats[topic] = { total: 0, correct: 0, recent: [] };
    }
    topicStats[topic].total += entry.questions || 1;

    // Count as "correct" if result contains positive indicators
    const result = (entry.result || "").toLowerCase();
    if (result.includes("good") || result.includes("excellent") || result.includes("strong") ||
        result.includes("master") || result.includes("correct") || result.includes("5/5") ||
        result.includes("4/5") || result.includes("100")) {
      topicStats[topic].correct++;
    }

    // Keep recent entries (last 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (entry.timestamp > sevenDaysAgo) {
      topicStats[topic].recent.push(entry);
    }
  });

  // Generate insights
  const insights: string[] = [];
  Object.entries(topicStats).forEach(([topic, stats]) => {
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    const recentCount = stats.recent.length;
    const lastPracticed = stats.recent.length > 0 ?
      Math.max(...stats.recent.map(e => e.timestamp)) : 0;
    const daysSince = lastPracticed > 0 ? Math.floor((Date.now() - lastPracticed) / (24 * 60 * 60 * 1000)) : -1;

    let insight = `${topic}: ${accuracy}% accuracy (${stats.correct}/${stats.total} attempts)`;
    if (daysSince >= 0) {
      insight += `, last practiced ${daysSince} days ago`;
    }
    if (recentCount > 0) {
      insight += `, ${recentCount} recent sessions`;
    }

    // Priority recommendations
    if (accuracy < 70) {
      insight += " - NEEDS ATTENTION (low accuracy)";
    } else if (daysSince > 14) {
      insight += " - DUE FOR REVIEW (not practiced recently)";
    } else if (accuracy >= 90) {
      insight += " - STRONG PERFORMANCE (consider advancing)";
    }

    insights.push(insight);
  });

  // Add recent detailed entries
  const recent = entries.slice(-8).reverse();
  const recentDetails = recent.map((entry) => {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const focus = entry.topic || entry.skill || "General";
    const result = entry.result || "unknown";
    const difficulty = entry.difficulty || "n/a";
    const questions = typeof entry.questions === "number" ? entry.questions : "?";
    const recommendation = entry.recommendation || "n/a";
    return `• ${focus} | Result: ${result} | Difficulty: ${difficulty} | Questions: ${questions} | Next: ${recommendation} (${timestamp})`;
  });

  return `PRACTICE INSIGHTS (based on ${entries.length} actual practice entries):\n${insights.join("\n")}\n\nRECENT SESSIONS (last ${recent.length} entries):\n${recentDetails.join("\n")}`;
}

function parseAssistantContent(raw: string): Omit<ParsedAssistantContent, 'logUpdates'> {
  const actions: ParsedAction[] = [];
  const uiElements: ParsedUIElement[] = [];

  // Parse actions
  const actionRegex =
    /ACTION:([A-Za-z0-9_-]+)(?:\|([^\n\r]*))?(?=$|\n|\r)/g;
  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(raw)) !== null) {
    const [, name, paramString] = match;
    const params: Record<string, string> = {};
    if (paramString) {
      paramString.split("|").forEach((part) => {
        const colonIndex = part.indexOf(":");
        if (colonIndex > -1) {
          const key = part.slice(0, colonIndex).trim();
          const value = part.slice(colonIndex + 1).trim();
          if (key) {
            params[key] = value;
          }
        }
      });
    }
    actions.push({ name, params });
  }

  // Parse buttons
  const buttonRegex = /BUTTON:(\w+)(?:\|([^\n\r]*))?/g;
  while ((match = buttonRegex.exec(raw)) !== null) {
    const id = match[1];
    const paramString = match[2] || '';
    const params: Record<string, string> = {};

    paramString.split('|').forEach(param => {
      const colonIndex = param.indexOf(':');
      if (colonIndex > 0) {
        const key = param.slice(0, colonIndex).trim();
        let value = param.slice(colonIndex + 1).trim();
        // Clean value: remove any trailing text after whitespace/newline
        const spaceIndex = value.search(/[\s\n\r]/);
        if (spaceIndex > 0) {
          value = value.slice(0, spaceIndex);
        }
        if (key && value) {
          params[key] = value;
        }
      }
    });

    uiElements.push({
      type: 'button',
      id,
      label: params.label || 'Button',
      action: params.action,
      params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'label' && k !== 'action'))
    });
  }

  // Parse file uploads
  const fileUploadRegex = /FILE_UPLOAD:(\w+)(?:\|([^\n\r]*))?/g;
  while ((match = fileUploadRegex.exec(raw)) !== null) {
    const id = match[1];
    const paramString = match[2] || '';
    const params: Record<string, string> = {};

    paramString.split('|').forEach(param => {
      const colonIndex = param.indexOf(':');
      if (colonIndex > 0) {
        const key = param.slice(0, colonIndex).trim();
        let value = param.slice(colonIndex + 1).trim();
        // For parameters that can contain spaces (topic, name, syllabus, message, label, buttonLabel), keep the full value
        // For other parameters, stop at whitespace to prevent issues when action is in the middle of text
        const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel'];
        if (!spaceAllowedParams.includes(key)) {
          // Clean value: remove any trailing text after whitespace/newline
          const spaceIndex = value.search(/[\s\n\r]/);
          if (spaceIndex > 0) {
            value = value.slice(0, spaceIndex);
          }
        }
        if (key && value) {
          params[key] = value;
        }
      }
    });

    const buttonLabel = params.buttonLabel || 'Generate';
    const action = params.action || 'generate_course';
    uiElements.push({
      type: 'file_upload',
      id,
      message: params.message || 'Upload files',
      action,
      params: {
        ...Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'message' && k !== 'action' && k !== 'buttonLabel')),
        buttonLabel
      }
    });
  }

  const cleanedContent = raw
    .replace(actionRegex, "")
    .replace(buttonRegex, "")
    .replace(fileUploadRegex, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanedContent, actions, uiElements };
}

function getTopicSummaryLines(
  data: StoredSubjectData | null
): string[] {
  if (!data?.nodes) return [];
  const topicLines: string[] = [];

  Object.entries(data.nodes).forEach(([topicName, value]) => {
    if (!topicName) return;
    if (!value || typeof value !== "object") return;

    const topic = value as TopicGeneratedContent;
    const lessonTitles: string[] = [];
    if (Array.isArray(topic.lessons)) {
      topic.lessons.forEach((lesson, idx) => {
        if (!lesson) return;
        const typedLesson = lesson as TopicGeneratedLesson;
        const title =
          typedLesson.title?.trim() || `Lesson ${idx + 1}`;
        const quizCount = Array.isArray(typedLesson.quiz)
          ? typedLesson.quiz.length
          : 0;
        lessonTitles.push(
          quizCount > 0
            ? `${title} (quiz: ${quizCount} q)`
            : title
        );
      });
    }

    if (lessonTitles.length === 0 && !topic.overview) return;

    topicLines.push(
      `TOPIC: ${topicName}${
        lessonTitles.length ? ` — lessons: ${lessonTitles.join(", ")}` : ""
      }`
    );

    if (topic.overview) {
      topicLines.push(
        `Overview: ${topic.overview.replace(/\s+/g, " ").slice(0, 280)}`
      );
    }
  });

  return topicLines;
}

function buildPracticeContext(
  slug: string,
  data: StoredSubjectData | null,
  practiceLog: PracticeLogEntry[]
): string {
  if (!data) {
    return [
      `PRACTICE MODE ACTIVE`,
      `Course slug: ${slug}`,
      "No stored course data was found. Focus on asking the student which topics they want to practice.",
      "Startup protocol: Immediately greet the learner, propose 2-4 focus options, wait for their choice, then start drilling.",
      "Always log practice progress using ACTION:update_practice_log|entry=<url encoded summary> after each question."
    ].join("\n");
  }

  const lines: string[] = [];
  const courseName = data.subject || slug;

  lines.push(`PRACTICE MODE ACTIVE FOR COURSE "${courseName}" (slug: ${slug})`);
  lines.push(
    "Role: act like a driven practice coach. Each reply should push the student into concrete practice—ask them to solve problems, recall steps, explain concepts aloud, or attempt mini quizzes."
  );
  lines.push(
    "Strategy: cycle through course topics, vary difficulty, check retention, give follow-up challenges. Insist on specifics before revealing answers. Track which topics have been covered in this session."
  );
  lines.push(
    "Question formatting: When asking a NEW practice question (not when referencing old questions), wrap the COMPLETE ENTIRE question (including any LaTeX math, formulas, or multiline content) between ◊ (lozenge) characters like '◊What is the derivative of f(x) = x² + 3x?◊'. CRITICAL: Only use ◊ delimiters for NEW questions you are asking right now. Never use ◊ when referencing, discussing, or mentioning previous questions. Always wrap the FULL question from start to finish - never wrap only part of a question."
  );
  lines.push(
    "CRITICAL: Only analyze and reference the actual PRACTICE LOG DATA provided in context. Do NOT invent, assume, or hallucinate any practice history, performance data, or study patterns. If no practice log entries exist, explicitly state 'you haven't practiced this course yet' and suggest starting with fundamental topics. Never suggest topics or difficulties based on assumptions - only use the concrete data provided."
  );
  lines.push(
    "Startup protocol: immediately greet the learner, then say 'Based on your previous practice sessions, I suggest we focus on...' followed by 3-5 specific recommendations drawn ONLY from the practice log insights. If no previous practice data exists, suggest starting with the most fundamental topics from the course. Always be explicit about what's based on actual data vs general recommendations. Wait for their choice before drilling. Once a focus is chosen, push straight into targeted questions."
  );
  lines.push(
    "Continuously reference the practice log to detect weak areas, time since last review, and repetition counts. Prioritize spaced coverage while doubling down on trouble spots."
  );
  lines.push(
    "Difficulty control: if the learner triggers a difficulty change, adjust instantly (more complex for +, gentler with scaffolding for −) and acknowledge the new level."
  );
  lines.push(
    "Question presentation: When asking NEW practice questions (not when referencing old questions), wrap the COMPLETE ENTIRE question (including any LaTeX math, formulas, or multiline content) between ◊ (lozenge) characters like '◊What is the derivative of f(x) = x² + 3x?◊'. This applies gradient highlighting to make questions stand out visually. CRITICAL: Only use ◊ delimiters for NEW questions you are asking right now. Never use ◊ when referencing, discussing, or mentioning previous questions. Always wrap the FULL question from start to finish - never wrap only part of a question."
  );
  lines.push(
    "Adaptive progression protocol: For each new concept, start with basic foundational questions. If the learner demonstrates understanding (correct answer or good explanation), immediately progress to deeper/more complex questions on the same topic. If they struggle (incorrect, partial, or uncertain answers), log the failure and revisit that concept later in the session or future sessions. Never skip foundational understanding - mastery builds progressively."
  );
  lines.push(
    "Practice Session: Focus on teaching and assessing understanding through interactive questions. Provide clear explanations when students struggle. Your responses will be automatically logged and analyzed by a separate assessment system."
  );
  lines.push(
    "You can interact with the site using special action commands. When you want to perform an action, use this format:"
  );
  lines.push(
    "ACTION:action_name|param1:value1|param2:value2"
  );
  lines.push("");
  lines.push("Available actions:");
  lines.push("- create_course|name:CourseName|syllabus:Optional description (NOTE: When creating courses, the system uses AUTOCREATE - files are automatically processed and the course is created without opening a modal. If you have files to upload, use FILE_UPLOAD with action:generate_course instead)");
  lines.push("- request_files|message:Tell user what files you need");
  lines.push("- navigate|path:/subjects/slug or /exam-snipe or /quicklearn");
  lines.push("- navigate_course|slug:course-slug (navigate to a course page - use the exact slug from the context, e.g., if context shows 'Course: French Revolution (slug: french-revolution)', use 'french-revolution' as the slug)");
  lines.push("- navigate_topic|slug:course-slug|topic:TopicName (navigate to a specific topic - use the EXACT topic name from the Topics list, and the EXACT slug from 'Course: Name (slug: course-slug)')");
  lines.push("- navigate_lesson|slug:course-slug|topic:TopicName|lessonIndex:0 (navigate to a specific lesson, index is 0-based - use EXACT topic name and slug from context)");
  lines.push("- open_course_modal (opens course creation modal)");
  lines.push("- open_flashcards|slug:course-slug (opens flashcards modal for a course - use the exact slug from the context)");
  lines.push("- open_lesson_flashcards|slug:course-slug|topic:TopicName|lessonIndex:0 (opens flashcards for a specific lesson)");
  lines.push("- set_exam_date|slug:course-slug|date:YYYY-MM-DD|name:Optional exam name (set or update exam date for a course - date must be in ISO format YYYY-MM-DD, use exact slug from context)");
  lines.push("- fetch_exam_snipe_data|slug:course-name-or-slug (fetch detailed exam snipe data for a course - use the EXACT course name the user mentioned, NOT the course slug. Exam snipe data is stored separately and matched by course name. Shows loading spinner, fetches the data, adds it to chat context, then you should respond naturally about what you found. The data will stay in context for all future messages in this chat)");
  lines.push("");
  lines.push("You can also render interactive UI elements in your messages using:");
  lines.push("BUTTON:button_id|label:Button Text|action:action_name|param1:value1");
  lines.push("FILE_UPLOAD:upload_id|message:Instructions for what files to upload");
  lines.push("");
  lines.push("Site features you should know about:");
  lines.push("- Exam Snipe: Upload old exam PDFs to analyze patterns and create prioritized study plans. Navigate to /exam-snipe");
  lines.push("- Course Creation: Users can upload files (PDFs, DOCX, TXT) to create courses with AI-generated lessons. IMPORTANT: The system uses AUTOCREATE - when files are provided, courses are automatically created and processed without requiring manual steps. Use FILE_UPLOAD with action:generate_course when you have files to upload.");
  lines.push("- Quick Learn: Generate quick lessons on any topic at /quicklearn");
  lines.push("- Course Structure: Each course has topics, and each topic has lessons with quizzes");
  lines.push("- Routes: /subjects/{slug} for course, /subjects/{slug}/node/{topic} for topic, /subjects/{slug}/node/{topic}/lesson/{index} for lesson");
  lines.push("- Flashcards: Each lesson can have flashcards, and courses have a flashcards modal showing all flashcards");
  lines.push("");
  lines.push("CRITICAL: The CONTEXT includes course information in this format: 'Course: CourseName (slug: course-slug)' followed by 'Topics (X): Topic1, Topic2, Topic3'.");
  lines.push("When navigating to a course, you MUST use the exact slug shown in the context. Do NOT generate or guess slugs.");
  lines.push("When navigating to a topic, you MUST use the EXACT topic name from the Topics list in the context.");
  lines.push("If the context shows 'Course: French Revolution (slug: french-revolution)' and 'Topics: The Estates-General, The Fall of Bastille',");
  lines.push("use 'french-revolution' as the slug and 'The Estates-General' (exact match) as the topic name.");
  lines.push("");
  lines.push("When recommending actions:");
  lines.push("- If user has exam files, suggest Exam Snipe to analyze them");
  lines.push("- If user wants to study a course, help them navigate to it or create one");
  lines.push("- If user wants to review flashcards, open the flashcards modal for the course or specific lesson");
  lines.push("- Use buttons to make actions clear and easy (e.g., 'Snipe' button for exam analysis, 'Generate' for course creation)");
  lines.push("- Use file upload areas when you need specific files from the user");
  lines.push("- Recommend using the Pomodoro timer (visible in the header) for focused study sessions - it helps maintain focus and track study time");
  lines.push("");
  lines.push("MANDATORY: Exam Snipe Data - If user asks about exam snipe, exam results, study order, common questions, or exam patterns:");
  lines.push("- You MUST immediately use fetch_exam_snipe_data action - do NOT say you don't have the data, ALWAYS fetch it first");
  lines.push("- Examples: 'What are the top concepts?', 'Show exam snipe results', 'What questions appear most?', 'What's the study order?', 'Tell me about exam patterns', 'What did exam snipe find?'");
  lines.push("- CRITICAL: Use the EXACT course name the user mentioned in the slug parameter - do NOT resolve it to a course slug. Exam snipe data is stored separately and matched by course name, not course slug.");
  lines.push("- Example: User says 'What are the top concepts for Signaler och System?' -> ACTION:fetch_exam_snipe_data|slug:Signaler och System (use the exact name, not the course slug)");
  lines.push("- After fetching, the data will be in context and you can answer their question");
  lines.push("");
  lines.push("IMPORTANT: Exam Date Tracking:");
  lines.push("- When the user mentions an exam date (e.g., 'My French Revolution exam is on March 15th' or 'Math exam on 2024-03-20'),");
  lines.push("- Extract the course name and date from their message");
  lines.push("- Match the course name to a course in the context to get the exact slug");
  lines.push("- Use set_exam_date action with the slug and date in ISO format (YYYY-MM-DD)");
  lines.push("- Example: User says 'French Revolution exam is March 15th' -> ACTION:set_exam_date|slug:french-revolution|date:2024-03-15");
  lines.push("- If the user mentions a date without a year, assume current year or next year if the date has already passed this year");
  lines.push("- Setting a new exam date will OVERWRITE any existing exam dates for that course - it replaces all previous dates with the new one");
  lines.push("- Always confirm what you're doing: 'Setting exam date for French Revolution to March 15th. ACTION:set_exam_date|slug:french-revolution|date:2024-03-15'");
  lines.push("");
  lines.push("CRITICAL RULE: When using ACTION commands:");
  lines.push("1. ACTION commands are ALWAYS optional - you can respond normally without any actions");
  lines.push("2. If you use an ACTION, write your natural response FIRST, then put the ACTION command at the END");
  lines.push("3. The action command is automatically hidden - the user only sees your natural message");
  lines.push("4. Your message should be natural and conversational - like 'Okay, opening the French Revolution course for you...' or 'Loading flashcards now...'");
  lines.push("5. NEVER output just an ACTION without a message - always write a natural response first");
  lines.push("");
  lines.push("FORMAT: [Your natural response explaining what you're doing] ACTION:action_name|params");
  lines.push("");
  lines.push("GOOD Examples:");
  lines.push("- 'Okay, opening the French Revolution course for you. You can explore the topics and start working through the lessons. ACTION:navigate_course|slug:french-revolution'");
  lines.push("- 'Loading flashcards for Math 101. These will help you review the key concepts we covered. ACTION:open_flashcards|slug:math-101'");
  lines.push("- 'Creating a new Physics course for you. Once it's set up, you can upload materials and start learning. ACTION:create_course|name:Physics|syllabus:Introduction'");
  lines.push("- Without action: 'The French Revolution course covers topics like the Estates-General, the fall of Bastille, and the Reign of Terror. What would you like to explore?'");
  lines.push("");
  lines.push("BAD Examples (NEVER DO THIS):");
  lines.push("- 'ACTION:navigate_course|slug:french-revolution' (no message at all)");
  lines.push("- 'Opening. ACTION:open_flashcards|slug:math-101' (too short, not helpful)");
  lines.push("");
  lines.push("REMEMBER: Write naturally first, then add the action at the end. The user sees your message stream naturally, and the action happens after.");

  if (data.course_context) {
    lines.push(`Course overview: ${data.course_context.slice(0, 500)}`);
  }
  if (data.course_quick_summary) {
    lines.push(`Quick summary: ${data.course_quick_summary.slice(0, 400)}`);
  }
  if (data.course_notes) {
    lines.push(`Instructor/student notes: ${data.course_notes.slice(0, 400)}`);
  }

  const topicNames = Array.isArray(data.topics)
    ? data.topics
        .map((t) =>
          typeof t === "string" ? t : t?.name?.trim() ?? ""
        )
        .filter(Boolean)
    : [];

  if (topicNames.length > 0) {
    lines.push(
      `Topics (${topicNames.length}): ${topicNames.join(", ")}`
    );
  } else if (Array.isArray(data.tree?.topics)) {
    const legacyTopics = data.tree.topics
      .map((t: any) =>
        typeof t === "string" ? t : t?.name?.trim() ?? ""
      )
      .filter(Boolean);
    if (legacyTopics.length > 0) {
      lines.push(`Topics (${legacyTopics.length}): ${legacyTopics.join(", ")}`);
    }
  }

  const topicDetails = getTopicSummaryLines(data);
  if (topicDetails.length > 0) {
    lines.push(...topicDetails);
  }

  if (typeof data.combinedText === "string" && data.combinedText.trim()) {
    lines.push(
      `Source excerpts:\n${data.combinedText.replace(/\s+/g, " ").slice(0, 2500)}`
    );
  }

  if (data.reviewSchedules && Object.keys(data.reviewSchedules).length > 0) {
    const dueSoon = Object.values(data.reviewSchedules)
      .filter((schedule) => {
        if (!schedule?.nextReview) return false;
        const daysUntil =
          (schedule.nextReview - Date.now()) / (1000 * 60 * 60 * 24);
        return daysUntil <= 7;
      })
      .slice(0, 5)
      .map(
        (schedule) =>
          `${schedule.topicName} lesson ${schedule.lessonIndex + 1} in ~${Math.max(
            0,
            Math.round((schedule.nextReview - Date.now()) / (1000 * 60 * 60 * 24))
          )} day(s)`
      );
    if (dueSoon.length > 0) {
      lines.push(`Upcoming reviews (≤7 days): ${dueSoon.join("; ")}`);
    }
  }

  if (practiceLog.length > 0) {
    const summary = formatPracticeLogSummary(practiceLog);
    if (summary) {
      lines.push(
        `PRACTICE LOG DATA (${practiceLog.length} total entries):\n${summary.slice(
          0,
          3500
        )}`
      );
    }
  } else {
    lines.push(
      "PRACTICE LOG STATUS: No previous practice sessions recorded. This is your first time practicing this course."
    );
  }

  const joined = lines.join("\n\n");
  return joined.slice(0, MAX_CONTEXT_CHARS);
}

export default function PracticePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const router = useRouter();

  const [subjectData, setSubjectData] = useState<StoredSubjectData | null>(null);
  const [loadingSubject, setLoadingSubject] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialPromptSent, setInitialPromptSent] = useState(false);
  const [practiceLog, setPracticeLog] = useState<PracticeLogEntry[]>([]);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [rawLogModalOpen, setRawLogModalOpen] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [currentSkill, setCurrentSkill] = useState<string | null>(null);
  const [fetchingContext, setFetchingContext] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'ready' | 'processing' | 'success'>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const conversationRef = useRef<Array<Omit<ChatMessage, "hidden">>>([]);

  const applyPracticeLogUpdates = (updates: PracticeLogEntry[]) => {
    if (!updates.length) return;
    setPracticeLog((prev) => {
      const existingIds = new Set(prev.map((entry) => entry.id));
      const nextEntries = updates
        .filter((entry) => entry && entry.id)
        .filter((entry) => !existingIds.has(entry.id))
        .map((entry) => ({
          ...entry,
          id: entry.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: entry.timestamp ?? Date.now(),
        }));
      if (!nextEntries.length) return prev;
      const combined = [...prev, ...nextEntries];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            `${PRACTICE_LOG_PREFIX}${slug}`,
            JSON.stringify(combined)
          );
        } catch (err) {
          console.warn("Failed to persist practice log:", err);
        }
      }
      return combined;
    });
  };

  // Send message with existing messages (used for action follow-ups)
  const sendMessageWithExistingMessages = async (messages: ChatMessage[]) => {
    if (sending) return;

    const conversation = conversationRef.current;
    const uiMessages: ChatMessage[] = [];

    // Add all messages to UI
    uiMessages.push(...messages.filter(m => !m.hidden));

    // Add placeholder for assistant response
    const assistantPlaceholder: ChatMessage = { role: "assistant", content: "" };
    uiMessages.push(assistantPlaceholder);

    setMessages((prev) => [...prev, ...uiMessages]);

    // Add all messages to conversation
    conversation.push(...messages.map(m => ({ role: m.role, content: m.content })));
    conversation.push({ role: "assistant", content: "" });

    const historyForApi = conversation.slice(0, -1);

    try {
      setSending(true);
      setError(null);

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: practiceContext,
          messages: historyForApi.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          path: typeof window !== "undefined" ? window.location.pathname : `/subjects/${slug}/practice`,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let finalActions: ParsedAction[] = [];
      let finalLogUpdates: PracticeLogEntry[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        const chunk = decoder.decode(value, { stream: true });
        chunk.split("\n").forEach((line) => {
          if (!line.startsWith("data: ")) return;
          const payload = line.slice(6);
          if (!payload) return;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "text") {
              accumulated += parsed.content;
              const { cleanedContent, uiElements } = parseAssistantContent(accumulated);
              setMessages((prev) => {
                const copy = [...prev];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
                  copy[lastIdx] = {
                    ...copy[lastIdx],
                    content: cleanedContent,
                    uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined,
                  };
                }
                return copy;
              });
              conversation[conversation.length - 1] = {
                role: "assistant",
                content: cleanedContent,
              };
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            }
          } catch (err) {
            if (!(err instanceof SyntaxError)) {
              throw err;
            }
          }
        });
      }

      const { cleanedContent, actions, uiElements } = parseAssistantContent(accumulated);
      finalActions = actions;

      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
          copy[lastIdx] = {
            ...copy[lastIdx],
            content: cleanedContent || copy[lastIdx].content || "",
            uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined,
          };
        }
        return copy;
      });

      // Extract question from Chad's response for logging (using ◊ delimiter)
      const questionMatch = cleanedContent.match(/◊([\s\S]*?)◊/);
      if (questionMatch) {
        const question = questionMatch[1].trim();
        setCurrentQuestion(question);

        // Try to extract topic and skill from the content or use defaults
        const topicMatch = cleanedContent.match(/topic[:\s]+([^\n\r.,]+)/i);
        const skillMatch = cleanedContent.match(/skill[:\s]+([^\n\r.,]+)/i);

        setCurrentTopic(topicMatch ? topicMatch[1].trim() : null);
        setCurrentSkill(skillMatch ? skillMatch[1].trim() : null);
      }

      const assistantIdx = conversation.length - 1;
      if (assistantIdx >= 0 && conversation[assistantIdx]?.role === "assistant") {
        conversation[assistantIdx] = {
          role: "assistant",
          content: cleanedContent || conversation[assistantIdx].content || "",
        };
      }


      if (finalActions.length > 0) {
        finalActions.forEach((action) => {
          if (action.name === "update_practice_log") {
            const encoded = action.params.entry || "";
            if (!encoded) return;
            try {
              const decoded = decodeURIComponent(encoded);
              applyPracticeLogUpdates([
                {
                  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                  timestamp: Date.now(),
                  topic: "Legacy entry",
                  question: "Legacy question",
                  answer: decoded.slice(0, 200),
                  assessment: "Legacy entry",
                  grade: 5,
                  result: decoded.slice(0, 200),
                },
              ]);
            } catch (err) {
              console.error("Failed to decode legacy practice log entry:", err);
            }
          } else {
            executeActions([action]);
          }
        });
      }
    } catch (err: any) {
      console.error("Practice chat error:", err);
      const fallback = err?.message || "Something went wrong. Please try again.";
      setError(fallback);
      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
          copy[lastIdx] = { ...copy[lastIdx], content: fallback };
        }
        return copy;
      });
    } finally {
      setSending(false);
    }
  };

  // Handle file uploads for UI elements
  const handleFileUpload = (uploadId: string, files: File[]) => {
    setUploadedFiles(prev => ({ ...prev, [uploadId]: files }));
    setUploadStatus(prev => ({ ...prev, [uploadId]: 'ready' }));
  };

  // Call AI logger API to assess answer
  const callPracticeLogger = async (question: string, answer: string) => {
    const trimmedQuestion = (question || "").trim();
    const trimmedAnswer = (answer || "").trim();
    if (!trimmedQuestion || !trimmedAnswer) return;

    try {
      // Get existing logs to provide context for consistent naming
      const existingLogs = practiceLog;

      const response = await fetch('/api/practice-logger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedQuestion,
          answer: trimmedAnswer,
          courseSlug: slug,
          existingLogs: existingLogs
        }),
      });

      if (!response.ok) {
        console.error('Failed to log practice session:', response.statusText);
        return;
      }

      const result = await response.json();
      if (result.success && result.logEntry) {
        const logEntry: PracticeLogEntry = result.logEntry;

        setPracticeLog((prev) => {
          const next = [...prev, logEntry];
          try {
            localStorage.setItem(`${PRACTICE_LOG_PREFIX}${slug}`, JSON.stringify(next));
          } catch (error) {
            console.warn("Failed to persist practice log:", error);
          }
          return next;
        });

        console.log("📝 Practice log recorded:", logEntry);
      }
    } catch (error) {
      console.error('Error calling practice logger:', error);
    }
  };

  // Handle button clicks for UI elements
  const handleButtonClick = (action: string | undefined, params: Record<string, string> | undefined, uploadId?: string) => {
    if (uploadId && uploadedFiles[uploadId] && uploadedFiles[uploadId].length > 0) {
      // If button is associated with file upload, process the files
      const files = uploadedFiles[uploadId];
      if (uploadId) {
        setUploadStatus(prev => ({ ...prev, [uploadId]: 'processing' }));
      }
      if (action === 'start_exam_snipe') {
        // Store files temporarily for exam snipe page to pick up
        (window as any).__pendingExamFiles = files;
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
        // Navigate to exam snipe page (do this last to ensure files are set)
        setTimeout(() => router.push('/exam-snipe'), 10);
      } else {
        // Handle other file-based actions
        executeActions([{ name: action || 'generate_course', params: params || {} }]);
      }
      // Clear files after processing so the upload area resets (except for exam snipe which handles files differently)
      if (action !== 'start_exam_snipe') {
        setUploadedFiles(prev => {
          if (!prev[uploadId] || prev[uploadId].length === 0) return prev;
          return { ...prev, [uploadId]: [] };
        });
      }
    } else {
      // Handle regular button clicks
      executeActions([{ name: action || 'create_course', params: params || {} }]);
    }
  };

  // Execute actions parsed from Chad's messages
  const executeActions = (actions: ParsedAction[]) => {
    actions.forEach((action) => {
      if (action.name === "create_course") {
        const name = action.params.name || "New Course";
        const syllabus = action.params.syllabus || "";
        document.dispatchEvent(
          new CustomEvent("synapse:create-course", { detail: { name, syllabus } })
        );
      } else if (action.name === "open_course_modal") {
        document.dispatchEvent(new CustomEvent("synapse:open-course-modal"));
      } else if (action.name === "navigate") {
        const path = action.params.path;
        if (path && typeof window !== "undefined") {
          router.push(path);
        }
      } else if (action.name === "navigate_course") {
        let slug = action.params.slug;
        if (slug && typeof window !== "undefined") {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem("atomicSubjects");
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find((s) => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.trim().replace(/[^a-zA-Z0-9\-_]/g, "").toLowerCase();
          if (slug) {
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}`);
          }
        }
      } else if (action.name === "navigate_topic") {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        if (slug && topic && typeof window !== "undefined") {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem("atomicSubjects");
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find((s) => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, "").toLowerCase();
          if (slug && topic) {
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
          }
        }
      } else if (action.name === "navigate_lesson") {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        const lessonIndex = action.params.lessonIndex;
        if (slug && topic && lessonIndex !== undefined && typeof window !== "undefined") {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem("atomicSubjects");
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find((s) => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, "").toLowerCase();
          if (slug && topic) {
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lessonIndex}`);
          }
        }
      } else if (action.name === "open_flashcards") {
        let slug = action.params.slug?.trim();
        if (slug && typeof window !== "undefined") {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem("atomicSubjects");
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find((s) => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, "").toLowerCase();
          if (slug) {
            // Store flashcard open intent in sessionStorage
            sessionStorage.setItem("__pendingFlashcardOpen", slug);
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}`);
          }
        }
      } else if (action.name === "open_lesson_flashcards") {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        const lessonIndex = action.params.lessonIndex;
        if (slug && topic && lessonIndex !== undefined && typeof window !== "undefined") {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem("atomicSubjects");
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find((s) => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, "").toLowerCase();
          if (slug && topic) {
            // Navigate to lesson page first, then trigger flashcard modal
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lessonIndex}`);
            // Dispatch event to open lesson flashcards modal
            setTimeout(() => {
              document.dispatchEvent(
                new CustomEvent("synapse:open-lesson-flashcards", {
                  detail: { slug, topic, lessonIndex },
                })
              );
            }, 500);
          }
        }
      } else if (action.name === "request_files") {
        const message = action.params.message || "Please upload the files I need.";
        alert(message);
      } else if (action.name === "start_exam_snipe") {
        // Navigate to exam snipe page
        router.push("/exam-snipe");
      } else if (action.name === "generate_course") {
        // Open course creation modal
        document.dispatchEvent(new CustomEvent("synapse:open-course-modal"));
      } else if (action.name === "set_exam_date") {
        let slug = action.params.slug?.trim();
        const dateStr = action.params.date?.trim();
        const examName = action.params.name?.trim();
        if (slug && dateStr && typeof window !== "undefined") {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem("atomicSubjects");
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find((s) => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, "").toLowerCase();
          if (slug && dateStr) {
            // Validate date format (YYYY-MM-DD)
            const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateMatch) {
              try {
                const data = loadSubjectData(slug);
                if (data) {
                  // Replace all existing exam dates with the new one (overwrite behavior)
                  data.examDates = [{ date: dateStr, name: examName }];
                  saveSubjectData(slug, data);
                  // Trigger a custom event to refresh the UI
                  window.dispatchEvent(new CustomEvent("synapse:exam-date-updated", { detail: { slug } }));
                }
              } catch (err) {
                console.error("Failed to set exam date:", err);
              }
            }
          }
        }
      } else if (action.name === "fetch_exam_snipe_data") {
        let slug = action.params.slug?.trim();
        const originalInput = slug; // Store original input for name matching
        if (slug && typeof window !== "undefined") {
          // For exam snipe data, we match by course name, not slug
          // Don't try to resolve course names to slugs - exam snipe data is stored separately
          // Only clean if it looks like a slug (alphanumeric with hyphens/underscores)
          let cleanedSlug = null;
          if (slug.match(/^[a-z0-9\-_]+$/)) {
            // It's already a slug, use it for slug-based matching as fallback
            cleanedSlug = slug.toLowerCase();
          }
          if (slug) {
            // Show loading spinner
            setFetchingContext(true);
            setMessages((m) => [...m, { role: "assistant", content: "", isLoading: true }]);

            // Fetch exam snipe data
            (async () => {
              try {
                const examRes = await fetch("/api/exam-snipe/history", { credentials: "include" });
                const examJson = await examRes.json().catch(() => ({}));

                if (examJson?.ok && Array.isArray(examJson.history)) {
                  // First, try to match by course name (case-insensitive, partial match)
                  // This is more reliable since exam snipe data might have different slugs
                  let matchingExamSnipe = examJson.history.find((exam: any) => {
                    const examCourseName = (exam.courseName || "").toLowerCase().trim();
                    const inputName = originalInput.toLowerCase().trim();
                    return examCourseName === inputName ||
                           examCourseName.includes(inputName) ||
                           inputName.includes(examCourseName);
                  });

                  // If not found by name, try by slug
                  if (!matchingExamSnipe && cleanedSlug) {
                    matchingExamSnipe = examJson.history.find((exam: any) => {
                      const examSlug = (exam.slug || "").toLowerCase().trim();
                      return examSlug === cleanedSlug;
                    });
                  }

                  if (matchingExamSnipe && matchingExamSnipe.results) {
                    const results = matchingExamSnipe.results;
                    const contextData: string[] = [];

                    contextData.push(`DETAILED EXAM SNIPE DATA FOR ${matchingExamSnipe.courseName || slug.toUpperCase()}:`);
                    contextData.push(`Total exams analyzed: ${results.totalExams || 0}`);

                    if (results.gradeInfo) {
                      contextData.push(`Grade info: ${results.gradeInfo}`);
                    }
                    if (results.patternAnalysis) {
                      contextData.push(`Pattern analysis: ${results.patternAnalysis}`);
                    }

                    // Full study order (all concepts)
                    if (results.concepts && Array.isArray(results.concepts) && results.concepts.length > 0) {
                      const studyOrder = results.concepts.map((c: any, idx: number) => {
                        const name = c.name || `Concept ${idx + 1}`;
                        const desc = c.description ? ` - ${c.description}` : "";
                        return `${idx + 1}. ${name}${desc}`;
                      }).join("\n");
                      contextData.push(`STUDY ORDER (priority, all concepts):\n${studyOrder}`);
                    }

                    // All common questions
                    if (results.commonQuestions && Array.isArray(results.commonQuestions) && results.commonQuestions.length > 0) {
                      const allQuestions = results.commonQuestions.map((q: any, idx: number) => {
                        const question = q.question || "";
                        const count = q.examCount || 0;
                        const points = q.averagePoints || 0;
                        return `${idx + 1}. "${question}" (appears in ${count} exams, avg ${points} pts)`;
                      }).join("\n");
                      contextData.push(`ALL COMMON QUESTIONS:\n${allQuestions}`);
                    }

                    const contextText = contextData.join("\n\n");

                    // Remove loading message and add context as system message (hidden from user, but included in API context)
                    setMessages((m) => {
                      const copy = [...m];
                      // Remove the loading message
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      // Add context as system message (hidden from user, but included in API context)
                      const systemEntry: ChatMessage = { role: "system", content: contextText };
                      const updated: ChatMessage[] = [...copy, systemEntry];

                      // Then automatically send a message from Chad about what he found
                      // Add a user message to trigger Chad's response, then include system context
                      const triggerEntry: ChatMessage = { role: "user", content: "What did you find?" };
                      const messagesWithTrigger: ChatMessage[] = [...updated, triggerEntry];
                      setTimeout(() => {
                        sendMessageWithExistingMessages(messagesWithTrigger);
                      }, 100);

                      return updated;
                    });
                  } else {
                    // No exam snipe data found
                    setMessages((m) => {
                      const copy = [...m];
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      copy.push({ role: "assistant", content: `No exam snipe data found for "${originalInput}". You may need to run Exam Snipe first for this course.` });
                      return copy;
                    });
                  }
                } else {
                  // Error fetching data
                  setMessages((m) => {
                    const copy = [...m];
                    const lastIdx = copy.length - 1;
                    if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                      copy.pop();
                    }
                    copy.push({ role: "assistant", content: "Failed to fetch exam snipe data." });
                    return copy;
                  });
                }
              } catch (err) {
                console.error("Failed to fetch exam snipe data:", err);
                setMessages((m) => {
                  const copy = [...m];
                  const lastIdx = copy.length - 1;
                  if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                    copy.pop();
                  }
                  copy.push({ role: "assistant", content: "Error fetching exam snipe data." });
                  return copy;
                });
              } finally {
                setFetchingContext(false);
              }
            })();
          }
        }
      }
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const data = loadSubjectData(slug);
      setSubjectData(data);
    } catch (err) {
      console.error("Failed to load subject data for practice:", err);
    } finally {
      setLoadingSubject(false);
    }
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(`${PRACTICE_LOG_PREFIX}${slug}`);
    if (!stored) {
      setPracticeLog([]);
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setPracticeLog(
          parsed
            .filter((entry) => entry && typeof entry === "object")
            .map((entry: any) => ({
              id:
                typeof entry.id === "string"
                  ? entry.id
                  : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              timestamp:
                typeof entry.timestamp === "number"
                  ? entry.timestamp
                  : Date.now(),
              topic: typeof entry.topic === "string" ? entry.topic : "General Practice",
              question: typeof entry.question === "string" ? entry.question : entry.result || "No question recorded",
              answer: typeof entry.answer === "string" ? entry.answer : "No answer recorded",
              assessment: typeof entry.assessment === "string" ? entry.assessment : "Legacy entry",
              grade: typeof entry.grade === "number" ? entry.grade : (typeof entry.rating === "number" ? entry.rating : 5),
              // Legacy fields
              skill: typeof entry.skill === "string" ? entry.skill : undefined,
              rating: typeof entry.rating === "number" ? entry.rating : undefined,
              strengths: Array.isArray(entry.strengths)
                ? entry.strengths.filter((item: any) => typeof item === "string")
                : undefined,
              weaknesses: Array.isArray(entry.weaknesses)
                ? entry.weaknesses.filter((item: any) => typeof item === "string")
                : undefined,
              recommendation: typeof entry.recommendation === "string" ? entry.recommendation : undefined,
              confidence: typeof entry.confidence === "number" ? entry.confidence : undefined,
              difficulty: typeof entry.difficulty === "string" ? entry.difficulty : undefined,
              raw: typeof entry.raw === "string" ? entry.raw : undefined,
              result: typeof entry.result === "string" ? entry.result : undefined,
              questions: typeof entry.questions === "number" ? entry.questions : undefined,
            }))
        );
      } else if (typeof parsed === "string") {
        setPracticeLog([
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            timestamp: Date.now(),
            topic: "Legacy entry",
            question: "Legacy question",
            answer: parsed.slice(0, 120),
            assessment: "Legacy entry",
            grade: 5,
            result: parsed.slice(0, 120),
          },
        ]);
      } else {
        setPracticeLog([]);
      }
    } catch {
      // Legacy string log fallback
      const normalized = stored.trim();
      if (!normalized) {
        setPracticeLog([]);
        return;
      }
      setPracticeLog([
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: Date.now(),
          topic: "Legacy entry",
          question: "Legacy question",
          answer: normalized.slice(0, 200),
          assessment: "Legacy entry",
          grade: 5,
          result: normalized.slice(0, 200),
        },
      ]);
    }
    } catch (err) {
      console.error("Failed to load practice log:", err);
    setPracticeLog([]);
    }
  }, [slug]);

useEffect(() => {
  conversationRef.current = [];
  setMessages([]);
  setInitialPromptSent(false);
  setError(null);
}, [slug]);

useEffect(() => {
  if (!initialPromptSent && !loadingSubject && !sending) {
    setInitialPromptSent(true);
    setTimeout(() => {
      void sendMessage("", { suppressUser: true, omitFromHistory: true });
    }, 150);
  }
}, [subjectData, loadingSubject, initialPromptSent, sending]);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

const practiceContext = useMemo(
  () => buildPracticeContext(slug, subjectData, practiceLog),
  [slug, subjectData, practiceLog]
);

async function sendMessage(
  textOverride?: string,
  options?: { suppressUser?: boolean; omitFromHistory?: boolean }
) {
  const rawText = typeof textOverride === "string" ? textOverride : input;
  const suppressUser = options?.suppressUser ?? false;
  const omitFromHistory = options?.omitFromHistory ?? false;
  const text = rawText?.trim() ?? "";

  if (sending) return;
  if (!omitFromHistory && !text) return;

  if (!suppressUser && !textOverride) {
    setInput("");
  }

  const conversation = conversationRef.current;
  const uiMessages: ChatMessage[] = [];

  if (!omitFromHistory && text) {
    conversation.push({ role: "user", content: text });
    if (!suppressUser) {
      uiMessages.push({ role: "user", content: text });
    }

    // Log the question-answer pair by finding the most recent question in conversation
    if (!suppressUser && !omitFromHistory) {
      // Scan conversation history for the most recent question
      let mostRecentQuestion: string | null = null;
      let questionTopic: string | null = null;
      let questionSkill: string | null = null;

      // Look through the messages (not conversation) for question blocks
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant" && msg.content) {
          const questionMatch = msg.content.match(/◊([\s\S]*?)◊/);
          if (questionMatch) {
            mostRecentQuestion = questionMatch[1].trim();
            // Try to extract topic and skill from the assistant message
            const topicMatch = msg.content.match(/topic[:\s]+([^\n\r.,]+)/i);
            const skillMatch = msg.content.match(/skill[:\s]+([^\n\r.,]+)/i);
            questionTopic = topicMatch ? topicMatch[1].trim() : null;
            questionSkill = skillMatch ? skillMatch[1].trim() : null;
            break; // Found the most recent question
          }
        }
      }

      // If we found a question, log the answer
      if (mostRecentQuestion) {
        callPracticeLogger(mostRecentQuestion, text);
      }

      // Clear the current question state
      setCurrentQuestion(null);
      setCurrentTopic(null);
      setCurrentSkill(null);
    }
  }

  const assistantPlaceholder: ChatMessage = { role: "assistant", content: "" };
  uiMessages.push(assistantPlaceholder);
  setMessages((prev) => [...prev, ...uiMessages]);
  conversation.push({ role: "assistant", content: "" });

  const historyForApi = conversation.slice(0, -1);

  try {
    setSending(true);
    setError(null);

    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: practiceContext,
        messages: historyForApi.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        path:
          typeof window !== "undefined"
            ? window.location.pathname
            : `/subjects/${slug}/practice`,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Chat failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let finalActions: ParsedAction[] = [];
    let finalLogUpdates: PracticeLogEntry[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = decoder.decode(value, { stream: true });
      chunk.split("\n").forEach((line) => {
        if (!line.startsWith("data: ")) return;
        const payload = line.slice(6);
        if (!payload) return;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === "text") {
            accumulated += parsed.content;
            const { cleanedContent, uiElements } = parseAssistantContent(accumulated);
            setMessages((prev) => {
              const copy = [...prev];
              const lastIdx = copy.length - 1;
              if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
                copy[lastIdx] = {
                  ...copy[lastIdx],
                  content: cleanedContent,
                  uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined,
                };
              }
              return copy;
            });
            const assistantIdx = conversation.length - 1;
            if (
              assistantIdx >= 0 &&
              conversation[assistantIdx]?.role === "assistant"
            ) {
              conversation[assistantIdx] = {
                role: "assistant",
                content: cleanedContent,
              };
            }
          } else if (parsed.type === "error") {
            throw new Error(parsed.error || "Streaming error");
          }
        } catch (err) {
          if (!(err instanceof SyntaxError)) {
            throw err;
          }
        }
      });
    }

      const { cleanedContent, actions, uiElements } = parseAssistantContent(accumulated);
      finalActions = actions;

    setMessages((prev) => {
      const copy = [...prev];
      const lastIdx = copy.length - 1;
      if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
        copy[lastIdx] = {
          ...copy[lastIdx],
          content: cleanedContent || copy[lastIdx].content || "",
          uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined,
        };
      }
      return copy;
    });

    const assistantIdx = conversation.length - 1;
    if (
      assistantIdx >= 0 &&
      conversation[assistantIdx]?.role === "assistant"
    ) {
      conversation[assistantIdx] = {
        role: "assistant",
        content: cleanedContent || conversation[assistantIdx].content || "",
      };
    }

    if (!cleanedContent) {
      const fallback =
        "I couldn't generate a response. Let's try a different prompt.";
      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
          copy[lastIdx] = { ...copy[lastIdx], content: fallback };
        }
        return copy;
      });
      if (
        assistantIdx >= 0 &&
        conversation[assistantIdx]?.role === "assistant"
      ) {
        conversation[assistantIdx] = {
          role: "assistant",
          content: fallback,
        };
      }
    }

    if (finalLogUpdates.length > 0) {
      applyPracticeLogUpdates(finalLogUpdates);
    }

    if (finalActions.length > 0) {
      finalActions.forEach((action) => {
        if (action.name === "update_practice_log") {
          // Legacy compatibility: decode entry and store as recommendation-only entry
          const encoded = action.params.entry || "";
          if (!encoded) return;
          try {
            const decoded = decodeURIComponent(encoded);
            applyPracticeLogUpdates([
              {
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                timestamp: Date.now(),
                topic: "Legacy entry",
                concept: "General Concept",
                question: "Legacy question",
                answer: decoded.slice(0, 200),
                assessment: "Legacy entry",
                grade: 5,
                result: decoded.slice(0, 200),
              },
            ]);
          } catch (err) {
            console.error("Failed to decode legacy practice log entry:", err);
          }
        } else {
          // Handle other actions with the executeActions function
          executeActions([action]);
        }
      });
    }
  } catch (err: any) {
    console.error("Practice chat error:", err);
    const fallback =
      err?.message || "Something went wrong. Please try again.";
    setError(fallback);
    setMessages((prev) => {
      const copy = [...prev];
      const lastIdx = copy.length - 1;
      if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
        copy[lastIdx] = {
          ...copy[lastIdx],
          content: fallback,
        };
      } else {
        copy.push({ role: "assistant", content: fallback });
      }
      return copy;
    });
    const assistantIdx = conversation.length - 1;
    if (
      assistantIdx >= 0 &&
      conversation[assistantIdx]?.role === "assistant"
    ) {
      conversation[assistantIdx] = {
        role: "assistant",
        content: fallback,
      };
    } else {
      conversation.push({ role: "assistant", content: fallback });
    }
  } finally {
    setSending(false);
  }
}

  const handleDifficultyAdjustment = (direction: "up" | "down") => {
    if (sending) return;
    const prompt =
      direction === "up"
        ? "Let's dial the difficulty up. Push me with more complex, multi-step questions."
        : "Let's ease off a bit. Give me simpler questions or add more guidance.";
    void sendMessage(prompt);
  };

  if (loadingSubject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <GlowSpinner size={64} ariaLabel="Loading practice" idSuffix="practice-load" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="border-b border-[var(--foreground)]/10 bg-[var(--background)]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => router.push(`/subjects/${slug}`)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 hover:bg-[var(--background)]/70 transition-colors flex-shrink-0"
              aria-label="Back to course"
            >
              <span className="text-lg">←</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-widest text-[var(--foreground)]/60">
                Practice Mode
              </div>
              <h1 className="text-lg font-semibold leading-tight truncate">
                {subjectData?.subject || slug}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setLogModalOpen(true)}
              className="inline-flex items-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-4 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors whitespace-nowrap"
            >
              Practice Log
            </button>
            <button
              onClick={() => setRawLogModalOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors whitespace-nowrap"
            >
              Raw Logs
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear all practice logs? This cannot be undone.')) {
                  try {
                    localStorage.removeItem(`${PRACTICE_LOG_PREFIX}${slug}`);
                  } catch (error) {
                    console.warn("Failed to clear practice logs from storage:", error);
                  }
                  const subjectData = loadSubjectData(slug);
                  if (subjectData) {
                    saveSubjectData(slug, {
                      ...subjectData,
                      practiceLogs: []
                    });
                  }
                  setPracticeLog([]);
                }
              }}
              className="inline-flex items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors whitespace-nowrap"
              title="Clear all practice logs"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </div>

      {!subjectData && (
        <div className="mx-auto mt-6 w-full max-w-2xl rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          We couldn’t find local data for this course. Open the course page once
          to analyze materials, then come back to practice.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6">
        <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-4">
          {messages.length === 0 && (
            <div className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/80 px-4 py-6 text-sm text-[var(--foreground)]/70">
              Chad will lead a focused practice session for this course. Get
              ready to answer questions, solve problems, and explain concepts
              out loud.
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.hidden) return null;
            const isUser = msg.role === "user";
            const isAssistant = msg.role === "assistant";
            const showSpinner = isAssistant && sending && msg.content.trim() === "";
            return (
              <div
                key={`${msg.role}-${idx}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[82%]">
                  <div className="mb-1 text-[10px] text-[var(--foreground)]/60">
                    {isUser ? "You" : "Chad"}
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? "border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/15"
                        : "border-[var(--foreground)]/15 bg-[var(--background)]/85"
                    }`}
                  >
                    {showSpinner ? (
                      <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/60">
                        <GlowSpinner
                          size={16}
                          ariaLabel="Chad thinking"
                          idSuffix={`practice-thinking-${idx}`}
                        />
                        Thinking...
                      </div>
                    ) : isAssistant ? (
                      <>
                        {renderPracticeContent(msg.content || "")}
                        {/* Render UI elements */}
                        {msg.uiElements && msg.uiElements.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {msg.uiElements.map((ui, uiIdx) => {
                              if (ui.type === 'button') {
                                return (
                                  <button
                                    key={uiIdx}
                                    onClick={() => handleButtonClick(ui.action, ui.params)}
                                    className="inline-flex items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 py-1.5 text-sm font-medium !text-white hover:opacity-95 transition-opacity"
                                    style={{ color: 'white' }}
                                  >
                                    {ui.label || 'Button'}
                                  </button>
                                );
                              } else if (ui.type === 'file_upload') {
                                const files = uploadedFiles[ui.id] || [];
                                const status = uploadStatus[ui.id] || 'idle';
                                const buttonLabel = ui.params?.buttonLabel || 'Generate';
                                return (
                                  <FileUploadArea
                                    key={uiIdx}
                                    uploadId={ui.id}
                                    message={ui.message}
                                    files={files}
                                    buttonLabel={buttonLabel}
                                    action={ui.action}
                                    status={status}
                                    onFilesChange={(newFiles) => handleFileUpload(ui.id, newFiles)}
                                    onGenerate={() => handleButtonClick(ui.action, ui.params, ui.id)}
                                  />
                                );
                              }
                              return null;
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="mt-4 space-y-3 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-4"
        >
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handleDifficultyAdjustment("down")}
              disabled={sending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-lg text-[var(--foreground)] hover:bg-[var(--background)]/70 disabled:opacity-50 transition-colors"
              aria-label="Lower difficulty"
              title="Lower difficulty"
            >
              –
            </button>
            <button
              type="button"
              onClick={() => handleDifficultyAdjustment("up")}
              disabled={sending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-lg text-[var(--foreground)] hover:bg-[var(--background)]/70 disabled:opacity-50 transition-colors"
              aria-label="Raise difficulty"
              title="Raise difficulty"
            >
              +
            </button>
          </div>
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Respond with your work, explain your reasoning, or ask for a different drill…"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:border-[var(--accent-cyan)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
      </div>

      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--foreground)]/30 bg-[var(--background)]/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  Practice Log
                </h2>
                <p className="text-xs text-[var(--foreground)]/60">
                  Chad keeps this updated as you work. Entries persist per course.
                </p>
              </div>
              <button
                onClick={() => setLogModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors"
                aria-label="Close practice log"
              >
                ×
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-4 text-sm leading-relaxed text-[var(--foreground)] space-y-2">
              {practiceLog.length ? (
                (() => {
                  // Group entries by topic
                  const groupedByTopic: Record<string, PracticeLogEntry[]> = {};
                  practiceLog.forEach(entry => {
                    const key = entry.topic || "General Practice";
                    if (!groupedByTopic[key]) {
                      groupedByTopic[key] = [];
                    }
                    groupedByTopic[key].push(entry);
                  });

                  return Object.entries(groupedByTopic)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([topicName, entries]) => {
                      const isExpanded = expandedTopics.has(topicName);
                      const avgGrade = entries.reduce((sum, e) => sum + (e.grade || e.rating || 0), 0) / entries.length;
                      const latestEntry = entries.sort((a, b) => b.timestamp - a.timestamp)[0];

                      return (
                        <div
                          key={topicName}
                          className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/80 overflow-hidden"
                        >
                          {/* Topic Header - Clickable */}
                          <button
                            onClick={() => {
                              setExpandedTopics(prev => {
                                const next = new Set(prev);
                                if (next.has(topicName)) {
                                  next.delete(topicName);
                                } else {
                                  next.add(topicName);
                                }
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between p-4 hover:bg-[var(--background)]/60 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`text-base font-semibold text-[var(--foreground)]`}>
                                {topicName}
                              </div>
                              <div className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
                                {entries.length} question{entries.length !== 1 ? 's' : ''}
                              </div>
                              <div className={`px-2 py-1 rounded text-xs font-bold ${
                                avgGrade >= 8 ? 'bg-green-500/20 text-green-400' :
                                avgGrade >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                Avg: {avgGrade.toFixed(1)}/10
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-[var(--foreground)]/50">
                                {new Date(latestEntry.timestamp).toLocaleDateString()}
                              </div>
                              <svg
                                className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>

                          {/* Questions List */}
                          {isExpanded && (
                            <div className="border-t border-[var(--foreground)]/10 p-4 space-y-2">
                              {entries
                                .sort((a, b) => b.timestamp - a.timestamp)
                                .map((entry) => {
                                  const isQuestionExpanded = expandedQuestions.has(entry.id);
                                  // Extract plain text from question for preview (remove HTML/markdown and ◊ delimiters)
                                  const questionPreview = entry.question
                                    ? entry.question
                                        .replace(/◊/g, '')
                                        .replace(/<[^>]*>/g, '')
                                        .replace(/\*\*/g, '')
                                        .replace(/#{1,6}\s/g, '')
                                        .trim()
                                        .slice(0, 100)
                                    : 'No question recorded';
                                  
                                  return (
                                    <div
                                      key={entry.id}
                                      className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/60 overflow-hidden"
                                    >
                                      {/* Question List Item - Clickable */}
                                      <button
                                        onClick={() => {
                                          setExpandedQuestions(prev => {
                                            const next = new Set(prev);
                                            if (next.has(entry.id)) {
                                              next.delete(entry.id);
                                            } else {
                                              next.add(entry.id);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/80 transition-colors text-left"
                                      >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <div className={`px-2 py-1 rounded text-xs font-bold flex-shrink-0 ${
                                            (entry.grade || entry.rating || 0) >= 8 ? 'bg-green-500/20 text-green-400' :
                                            (entry.grade || entry.rating || 0) >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'
                                          }`}>
                                            {(entry.grade || entry.rating || 0)}/10
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm text-[var(--foreground)]/90 truncate">
                                              {questionPreview}
                                              {questionPreview.length >= 100 && '...'}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <div className="text-xs text-[var(--foreground)]/50">
                                            {new Date(entry.timestamp).toLocaleDateString()}
                                          </div>
                                          <svg
                                            className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform flex-shrink-0 ${isQuestionExpanded ? 'rotate-180' : ''}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                          </svg>
                                        </div>
                                      </button>

                                      {/* Expanded Question Details */}
                                      {isQuestionExpanded && (
                                        <div className="border-t border-[var(--foreground)]/10 p-4 space-y-3">
                                          {entry.question && (
                                            <div>
                                              <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                Question
                                              </div>
                                              <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                <LessonBody body={sanitizeLessonBody(entry.question)} />
                                              </div>
                                            </div>
                                          )}

                                          {entry.answer && (
                                            <div>
                                              <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                Your Answer
                                              </div>
                                              <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5 italic">
                                                {entry.answer}
                                              </div>
                                            </div>
                                          )}

                                          {entry.assessment && (
                                            <div className="pt-2 border-t border-[var(--foreground)]/10">
                                              <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                Assessment
                                              </div>
                                              <div className="text-sm text-[var(--foreground)]/80">
                                                {entry.assessment}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    });
                })()
              ) : (
                <div className="text-center py-8 text-[var(--foreground)]/60">
                  <div className="text-lg mb-2">🧠</div>
                  <div className="font-medium mb-1">No Practice Data Yet</div>
                  <div className="text-sm">
                    Once you start practicing, each question-answer pair will be analyzed and stored here.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Raw Logs Modal */}
      {rawLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[80vh] overflow-hidden rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--foreground)]/10 px-6 py-4">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Raw Practice Logs
              </h2>
              <button
                onClick={() => setRawLogModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 hover:bg-[var(--background)]/70 transition-colors"
                aria-label="Close raw logs"
              >
                ×
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-4 text-sm text-cyan-100">
                  <div className="font-medium mb-2">🤖 AI Logger Output</div>
                  <div>
                    These are the detailed assessments from our AI logger that analyzes each question-answer pair.
                    The logger provides objective ratings, strengths/weaknesses analysis, and learning recommendations.
                  </div>
                </div>

                {practiceLog.length ? (
                  practiceLog
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/90 p-4 font-mono text-xs whitespace-pre-wrap"
                      >
                        <div className="text-[var(--foreground)]/50 mb-2">
                          {new Date(entry.timestamp).toISOString()} — ID: {entry.id}
                        </div>
                        <pre className="bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/10 overflow-x-auto text-[var(--foreground)]">
{JSON.stringify(entry, null, 2)}
                        </pre>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-8 text-[var(--foreground)]/60">
                    <div className="text-lg mb-2">🧠</div>
                    <div className="font-medium mb-1">No Raw Logs Yet</div>
                    <div className="text-sm">
                      Once you start practicing, raw log entries will appear here exactly as they are recorded.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


