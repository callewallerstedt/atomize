"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import GlowSpinner from "@/components/GlowSpinner";
import {
  loadSubjectData,
  saveSubjectData,
  saveSubjectDataAsync,
  StoredSubjectData,
  TopicGeneratedContent,
  TopicGeneratedLesson,
} from "@/utils/storage";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  hidden?: boolean;
  isLoading?: boolean;
  attachments?: Array<{
    type: "image" | "file";
    data?: string;
    url?: string;
    name?: string;
    size?: number;
    extension?: string;
    content?: string;
    mimeType?: string;
  }>;
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

// Helper function to parse flexible date input and convert to ISO format (YYYY-MM-DD)
// Accepts: "5 days", "in 2 weeks", "March 15th", "2024-03-15", "next Monday", etc.
function parseDateInput(dateInput: string): string | null {
  if (!dateInput || !dateInput.trim()) return null;
  
  const input = dateInput.trim().toLowerCase();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const today = new Date(now);
  
  // Already in ISO format (YYYY-MM-DD)
  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    date.setHours(0, 0, 0, 0);
    return date.toISOString().split('T')[0];
  }
  
  // Days from now: "5 days", "in 3 days", "3 days left", etc.
  const daysMatch = input.match(/(\d+)\s*days?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const examDate = new Date(today);
    examDate.setDate(examDate.getDate() + days);
    // Use local date components to avoid timezone issues
    const year = examDate.getFullYear();
    const month = String(examDate.getMonth() + 1).padStart(2, '0');
    const day = String(examDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Weeks from now: "2 weeks", "in 1 week", etc.
  const weeksMatch = input.match(/(\d+)\s*weeks?/);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1]);
    const examDate = new Date(today);
    examDate.setDate(examDate.getDate() + (weeks * 7));
    // Use local date components to avoid timezone issues
    const year = examDate.getFullYear();
    const month = String(examDate.getMonth() + 1).padStart(2, '0');
    const day = String(examDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Months from now: "1 month", "in 2 months", etc.
  const monthsMatch = input.match(/(\d+)\s*months?/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1]);
    const examDate = new Date(today);
    examDate.setMonth(examDate.getMonth() + months);
    // Use local date components to avoid timezone issues
    const year = examDate.getFullYear();
    const month = String(examDate.getMonth() + 1).padStart(2, '0');
    const day = String(examDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Try to parse as a natural date string
  try {
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(0, 0, 0, 0);
      // If the date is in the past, assume next year
      if (parsed < today) {
        parsed.setFullYear(parsed.getFullYear() + 1);
      }
      // Use local date components to avoid timezone issues
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Continue to other parsing methods
  }
  
  // Try parsing common date formats
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  // Format: "March 15th", "March 15", "Mar 15", etc.
  for (let i = 0; i < monthNames.length; i++) {
    const monthPattern = new RegExp(`(${monthNames[i]}|${monthAbbrevs[i]})\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i');
    const match = input.match(monthPattern);
    if (match) {
      const month = i;
      const day = parseInt(match[2]);
      let year = today.getFullYear();
      
      const examDate = new Date(year, month, day);
      examDate.setHours(0, 0, 0, 0);
      
      // If date has passed this year, use next year
      if (examDate < today) {
        examDate.setFullYear(year + 1);
      }
      
      // Use local date components to avoid timezone issues
      const finalYear = examDate.getFullYear();
      const finalMonth = String(examDate.getMonth() + 1).padStart(2, '0');
      const finalDay = String(examDate.getDate()).padStart(2, '0');
      return `${finalYear}-${finalMonth}-${finalDay}`;
    }
  }
  
  // Format: "15/03/2024" or "03/15/2024" (DD/MM/YYYY or MM/DD/YYYY)
  const slashMatch = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    // Try both formats
    const date1 = new Date(parseInt(slashMatch[3]), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
    const date2 = new Date(parseInt(slashMatch[3]), parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
    
    // Use the one that makes sense (not too far in the future/past)
    const diff1 = Math.abs(date1.getTime() - today.getTime());
    const diff2 = Math.abs(date2.getTime() - today.getTime());
    const examDate = diff1 < diff2 ? date1 : date2;
    examDate.setHours(0, 0, 0, 0);
    
    if (examDate < today) {
      examDate.setFullYear(examDate.getFullYear() + 1);
    }
    
    // Use local date components to avoid timezone issues
    const finalYear = examDate.getFullYear();
    const finalMonth = String(examDate.getMonth() + 1).padStart(2, '0');
    const finalDay = String(examDate.getDate()).padStart(2, '0');
    return `${finalYear}-${finalMonth}-${finalDay}`;
  }
  
  return null;
}

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

const MAX_CONTEXT_CHARS = 25_000; // leave room for API preamble and full practice logs
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
  status,
  hasPremiumAccess = true
}: {
  uploadId: string;
  message?: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onGenerate: () => void;
  buttonLabel?: string;
  action?: string;
  status?: 'idle' | 'ready' | 'processing' | 'success';
  hasPremiumAccess?: boolean;
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors relative ${
          isDragging
            ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10'
            : 'border-[var(--accent-cyan)]/40 bg-[var(--background)]/60 hover:border-[var(--accent-cyan)]/60 hover:bg-[var(--background)]/80'
        }`}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="unified-button flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--foreground)]/10"
            style={{ boxShadow: 'none', pointerEvents: 'auto' }}
            aria-label="Add files"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <div className="text-xs text-[var(--foreground)]/70 text-center flex-1">
            {isDragging && hasPremiumAccess ? 'Drop files here' : (hasPremiumAccess ? (message || 'Upload files or drag and drop') : '')}
          </div>
        </div>
        {files.length > 0 && (
          <div className="mt-2 text-xs text-[var(--foreground)]/60 text-center">
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
          className="w-full inline-flex items-center justify-center rounded-full synapse-style px-4 py-1.5 text-sm font-medium !text-white  transition-opacity"
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

function renderPracticeContent(
  content: string,
  onOpenLesson?: (questionText: string) => void,
  generatingLessonFor?: string | null
): React.JSX.Element {
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
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full synapse-style"></div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#00E5FF] opacity-80">
                    Practice Question
                  </span>
                </div>
                {onOpenLesson && (
                  <button
                    onClick={() => onOpenLesson(part.content)}
                    disabled={generatingLessonFor === part.content}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 px-3 py-1 text-xs font-medium text-[#00E5FF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingLessonFor === part.content ? (
                      <>
                        <GlowSpinner size={12} ariaLabel="Generating lesson" idSuffix={`lesson-gen-${index}`} />
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Open lesson
                      </>
                    )}
                  </button>
                )}
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

function formatFullPracticeLogs(entries: PracticeLogEntry[]): string {
  if (!entries.length) return "";

  // Sort by timestamp (most recent first)
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  const formattedEntries = sorted.map((entry, idx) => {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const parts: string[] = [];

    parts.push(`--- Entry ${idx + 1} of ${sorted.length} (${timestamp}) ---`);
    
    // Always show ID for tracking
    if (entry.id) parts.push(`ID: ${entry.id}`);
    
    if (entry.topic) parts.push(`Topic: ${entry.topic}`);
    if (entry.concept) parts.push(`Concept: ${entry.concept}`);
    if (entry.skill) parts.push(`Skill: ${entry.skill}`);
    
    if (entry.question) parts.push(`Question: ${entry.question}`);
    if (entry.answer) parts.push(`Answer: ${entry.answer}`);
    
    if (typeof entry.grade === "number") parts.push(`Grade/Points: ${entry.grade}/10`);
    if (typeof entry.rating === "number") parts.push(`Rating: ${entry.rating}`);
    if (typeof entry.confidence === "number") parts.push(`Confidence: ${entry.confidence}`);
    
    if (entry.assessment) parts.push(`Assessment: ${entry.assessment}`);
    if (entry.result) parts.push(`Result: ${entry.result}`);
    if (entry.difficulty) parts.push(`Difficulty: ${entry.difficulty}`);
    
    if (entry.strengths && Array.isArray(entry.strengths) && entry.strengths.length > 0) {
      parts.push(`Strengths: ${entry.strengths.join(", ")}`);
    }
    if (entry.weaknesses && Array.isArray(entry.weaknesses) && entry.weaknesses.length > 0) {
      parts.push(`Weaknesses: ${entry.weaknesses.join(", ")}`);
    }
    
    if (entry.recommendation) parts.push(`Recommendation: ${entry.recommendation}`);
    if (typeof entry.questions === "number") parts.push(`Questions in session: ${entry.questions}`);
    if (entry.raw) parts.push(`Raw data: ${entry.raw}`);

    // Ensure at least something is shown
    const result = parts.join("\n");
    return result || `--- Entry ${idx + 1} of ${sorted.length} (${timestamp}) - No additional data ---`;
  });

  return `COMPLETE PRACTICE LOG HISTORY (${entries.length} total entries, most recent first):\n\n${formattedEntries.join("\n\n")}`;
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
  practiceLog: PracticeLogEntry[],
  examSnipeData?: string | null,
  availableExamSnipes?: Array<{ slug: string; courseName: string; createdAt: string }>
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
  const basicTopics = extractBasicTopics(data);
  const basicTopicBullets =
    basicTopics.length > 0
      ? basicTopics.map((topic) => `• ${topic}`).join("\n")
      : "• Ask the learner which fundamental concept feels rustiest and build from there.";

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
    "PRACTICE LOG ACCESS: You have access to the COMPLETE practice log history with full details for every entry including: topic, concept, skill, question, answer, grade/points (0-10 scale), assessment, result, difficulty, strengths, weaknesses, recommendations, confidence scores, and timestamps. Use this complete history to understand patterns, identify weak areas, track progress on specific topics, and make informed recommendations. Reference specific past questions and answers when relevant."
  );
  lines.push(
    "Startup protocol: Keep your opening message concise (2-3 sentences max). Greet briefly, then offer 3-4 clear focus options: (1) Start with basics/fundamentals, (2) Continue where we left off (reference practice log for weak areas or topics needing review), (3) Focus on exam patterns (if exam snipe data exists, highlight high-frequency concepts/questions that appear repeatedly), (4) Target specific topics. Wait for their choice, then dive straight into questions. Be specific about what each option covers."
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
  lines.push("- navigate_exam_snipe (navigate to the exam snipe analysis page for the current course - opens the full analysis results showing concepts, patterns, and study recommendations. Use this when user asks to view exam analysis, exam patterns, or exam snipe results for the current course.)");
  lines.push("- open_course_modal (opens course creation modal)");
  lines.push("- open_flashcards|slug:course-slug (opens flashcards modal for a course - use the exact slug from the context)");
  lines.push("- open_lesson_flashcards|slug:course-slug|topic:TopicName|lessonIndex:0 (opens flashcards for a specific lesson)");
  lines.push("- set_exam_date|slug:course-slug|date:flexible date input|name:Optional exam name (set or update exam date for a course - date can be in flexible format like '5 days', 'in 2 weeks', 'March 15th', '2024-03-15', etc. The system will automatically convert it to the correct date. Use exact slug from context)");
  lines.push("- fetch_exam_snipe_data|slug:course-name-or-slug (fetch detailed exam snipe data for a course - use the EXACT course name the user mentioned, NOT the course slug. Exam snipe data is stored separately and matched by course name. Shows loading spinner, fetches the data, adds it to chat context, then you should respond naturally about what you found. The data will stay in context for all future messages in this chat. NOTE: In practice mode, exam snipe data for the current course is already loaded in your context - you don't need to fetch it again. Just reference the existing EXAM SNIPE ANALYSIS DATA that's already available.)");
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
  lines.push("- IMPORTANT: In practice mode, exam snipe data for the current course is ALREADY loaded in your context. Check if EXAM SNIPE ANALYSIS DATA is present in the context first.");
  lines.push("- If EXAM SNIPE ANALYSIS DATA is already in context, use it directly - do NOT fetch again. Just reference the existing data and answer the user's question.");
  lines.push("- Only use fetch_exam_snipe_data action if the data is NOT already in context (e.g., user asks about a different course)");
  lines.push("- Examples: 'What are the top concepts?', 'Show exam snipe results', 'What questions appear most?', 'What's the study order?', 'Tell me about exam patterns', 'What did exam snipe find?'");
  lines.push("- CRITICAL: Use the EXACT course name the user mentioned in the slug parameter - do NOT resolve it to a course slug. Exam snipe data is stored separately and matched by course name, not course slug.");
  lines.push("- Example: User says 'What are the top concepts for Signaler och System?' -> ACTION:fetch_exam_snipe_data|slug:Signaler och System (use the exact name, not the course slug)");
  lines.push("- After fetching, the data will be in context and you can answer their question");
  lines.push("");
    lines.push("IMPORTANT: Exam Date Tracking:");
    lines.push("- When the user mentions an exam date (e.g., 'My French Revolution exam is in 5 days', 'Math exam on March 15th', 'Exam in 2 weeks'),");
    lines.push("- Extract the course name and date/days information from their message");
    lines.push("- Match the course name to a course in the context to get the exact slug");
    lines.push("- Use set_exam_date action with the slug and the date/days in the EXACT format the user said it (e.g., '5 days', 'March 15th', 'in 2 weeks', '2024-03-20')");
    lines.push("- The system will automatically parse and convert the date format - you don't need to convert it to ISO format");
    lines.push("- Supported formats: '5 days', 'in 2 weeks', 'March 15th', '2024-03-15', 'next Monday', etc.");
    lines.push("- Example: User says 'French Revolution exam is in 5 days' -> 'Setting exam date for French Revolution to 5 days from now. ACTION:set_exam_date|slug:french-revolution|date:5 days'");
    lines.push("- Example: User says 'Math exam on March 15th' -> 'Setting exam date for Math to March 15th. ACTION:set_exam_date|slug:math-101|date:March 15th'");
    lines.push("- Setting a new exam date will OVERWRITE any existing exam dates for that course - it replaces all previous dates with the new one");
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
    const fullLogs = formatFullPracticeLogs(practiceLog);
    if (fullLogs) {
      lines.push(fullLogs);
    } else {
      lines.push(
        `PRACTICE LOG DATA: ${practiceLog.length} entries found but formatting failed. Raw count: ${practiceLog.length}`
      );
    }
  } else {
    lines.push(
      "PRACTICE LOG STATUS: No previous practice sessions recorded. This is your first time practicing this course."
    );
  }

  // Add available exam snipes list
  if (availableExamSnipes && availableExamSnipes.length > 0) {
    lines.push(`\n\nAVAILABLE EXAM SNIPES (${availableExamSnipes.length} total):`);
    lines.push(`For the current course "${courseName}" (slug: ${slug}), use ACTION:navigate_exam_snipe to view its exam analysis at /subjects/${slug}/examsnipe`);
    lines.push("Format: Course Name (slug: exam-snipe-slug) - Created: date");
    availableExamSnipes.forEach((exam) => {
      const date = new Date(exam.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" });
      lines.push(`- ${exam.courseName} (slug: ${exam.slug}) - Created: ${date}`);
    });
    lines.push(`\nWhen user asks to view exam analysis, exam patterns, or exam snipe results for the current course, use ACTION:navigate_exam_snipe to open /subjects/${slug}/examsnipe`);
  }

  // Add exam snipe data if available
  if (examSnipeData) {
    lines.push(`\n\nEXAM SNIPE ANALYSIS DATA:\n${examSnipeData}\n\nUse this exam analysis to prioritize topics and focus on high-frequency concepts and questions. Reference specific patterns and common questions when relevant.`);
  }

  if (practiceLog.length === 0) {
    const hasExamSnipe = examSnipeData ? "You also have exam snipe analysis showing high-frequency exam topics." : "";
    lines.push(
      `FIRST SESSION DIRECTIVE: No practice history yet. Keep your opening message concise. Offer these focus options: (1) Start with basics - cover fundamental topics like ${basicTopics.slice(0, 3).join(", ") || "core concepts"}, (2) Focus on exam patterns${examSnipeData ? " - target concepts and questions that appear most frequently on exams" : ""}, (3) Jump into specific topics. ${hasExamSnipe} Wait for their choice, then start drilling immediately.`
    );
  } else if (practiceLog.length < Math.max(3, basicTopics.length || 3)) {
    const hasExamSnipe = examSnipeData ? " You also have exam snipe data showing exam patterns." : "";
    lines.push(
      `LOW PRACTICE COVERAGE: Only ${practiceLog.length} practice entries. Offer focus options: (1) Continue where we left off - review weak areas from practice log, (2) Build fundamentals - cover ${basicTopics.slice(0, 3).join(", ") || "core topics"}, (3) Target exam patterns${examSnipeData ? " - focus on high-frequency exam topics" : ""}.${hasExamSnipe} Be concise and wait for their choice.`
    );
  } else {
    const hasExamSnipe = examSnipeData ? " You also have exam snipe analysis available." : "";
    const weakAreas = practiceLog.filter((entry: PracticeLogEntry) => (entry.grade || 0) < 6).length > 0 
      ? " Review weak areas from your practice history" 
      : "";
    lines.push(
      `PRACTICE HISTORY AVAILABLE: You have ${practiceLog.length} practice entries. Offer focus options: (1) Continue where we left off${weakAreas}, (2) Strengthen fundamentals - revisit ${basicTopics.slice(0, 2).join(" and ") || "core concepts"}, (3) Focus on exam patterns${examSnipeData ? " - target recurring exam topics and questions" : ""}, (4) Explore new topics.${hasExamSnipe} Keep it concise and wait for their choice.`
    );
  }

  // Separate practice logs from other content to ensure they're always included
  const practiceLogIndex = lines.findIndex(line => line.includes("COMPLETE PRACTICE LOG HISTORY"));
  let practiceLogsContent = "";
  let otherLines = lines;
  
  if (practiceLogIndex >= 0) {
    practiceLogsContent = lines[practiceLogIndex];
    otherLines = lines.filter((_, idx) => idx !== practiceLogIndex);
  }
  
  // Build context without practice logs first
  let baseContext = otherLines.join("\n\n");
  
  // Reserve space for practice logs (at least 5000 chars, or more if available)
  const reservedForLogs = Math.max(5000, Math.min(10000, practiceLogsContent.length + 1000));
  const maxBaseContext = MAX_CONTEXT_CHARS - reservedForLogs;
  
  if (baseContext.length > maxBaseContext) {
    baseContext = baseContext.slice(0, maxBaseContext);
  }
  
  // Combine base context with practice logs
  const finalContext = practiceLogsContent 
    ? `${baseContext}\n\n${practiceLogsContent}`.slice(0, MAX_CONTEXT_CHARS)
    : baseContext.slice(0, MAX_CONTEXT_CHARS);

  return finalContext;
}

function extractBasicTopics(data: StoredSubjectData | null): string[] {
  if (!data) return [];

  const normalizeName = (value: any): string =>
    typeof value === "string"
      ? value.trim()
      : typeof value?.name === "string"
      ? value.name.trim()
      : "";

  const topicsFromMeta =
    Array.isArray(data.topics) && data.topics.length > 0
      ? data.topics
          .map((topic) => ({
            name: normalizeName(topic),
            coverage:
              typeof topic === "object" && topic && typeof (topic as any).coverage === "number"
                ? (topic as any).coverage
                : 0,
          }))
          .filter((topic) => topic.name)
          .sort((a, b) => b.coverage - a.coverage)
          .map((topic) => topic.name)
      : [];

  if (topicsFromMeta.length > 0) {
    return topicsFromMeta.slice(0, 4);
  }

  if (Array.isArray(data.tree?.topics) && data.tree.topics.length > 0) {
    const legacyTopics = data.tree.topics
      .map((topic: any) => normalizeName(topic))
      .filter(Boolean);
    if (legacyTopics.length > 0) {
      return legacyTopics.slice(0, 4);
    }
  }

  const nodeTopics = Object.keys(data.nodes || {})
    .filter((key) => key && !key.startsWith("__"))
    .slice(0, 4);

  return nodeTopics;
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
  const [practiceLogLoaded, setPracticeLogLoaded] = useState(false);
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
  const [examSnipeData, setExamSnipeData] = useState<string | null>(null);
  const [examSnipeMatching, setExamSnipeMatching] = useState(false);
  const [examSnipeMatched, setExamSnipeMatched] = useState(false);
  const [availableExamSnipes, setAvailableExamSnipes] = useState<Array<{ slug: string; courseName: string; createdAt: string }>>([]);
  const [subscriptionLevel, setSubscriptionLevel] = useState<string>("Free");
  const hasPremiumAccess =
    subscriptionLevel === "Tester" ||
    subscriptionLevel === "Paid" ||
    subscriptionLevel === "mylittlepwettybebe";
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const conversationRef = useRef<Array<Omit<ChatMessage, "hidden">>>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mcQuizModalOpen, setMcQuizModalOpen] = useState(false);
  const [mcQuizTopic, setMcQuizTopic] = useState<string>("");
  const [mcQuizQuestions, setMcQuizQuestions] = useState<
    Array<{ question: string; options: string[]; correctAnswer: number; explanation?: string }>
  >([]);
  const [mcQuizAnswers, setMcQuizAnswers] = useState<Record<number, number>>({});
  const [mcQuizSubmitted, setMcQuizSubmitted] = useState(false);
  const [mcQuizLoading, setMcQuizLoading] = useState(false);
  const [mcQuizError, setMcQuizError] = useState<string | null>(null);
   
  // QR Code feature state
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrImages, setQrImages] = useState<Array<{ id: string; data: string }>>([]);
  const qrImagesRef = useRef<Array<{ id: string; data: string }>>([]);
  const [qrInfoMessage, setQrInfoMessage] = useState<string | null>(null);
  const [qrPollingActive, setQrPollingActive] = useState(false);
  const [isAttachmentDragActive, setIsAttachmentDragActive] = useState(false);
  const qrPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const practiceLogSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    qrImagesRef.current = qrImages;
  }, [qrImages]);

  const mcQuizTopics = useMemo(() => {
    const fromTopics = Array.isArray(subjectData?.topics)
      ? subjectData.topics.map((t) => (t && typeof t.name === "string" ? t.name : "")).filter(Boolean)
      : [];
    const fromNodes = Object.keys(subjectData?.nodes || {}).filter((key) => key && !key.startsWith("__"));
    return Array.from(new Set([...fromTopics, ...fromNodes]));
  }, [subjectData]);

  useEffect(() => {
    if (!mcQuizModalOpen) return;
    if (!mcQuizTopic && mcQuizTopics.length > 0) {
      setMcQuizTopic(mcQuizTopics[0]);
    }
  }, [mcQuizModalOpen, mcQuizTopic, mcQuizTopics]);

  const generateMcQuiz = async () => {
    if (!hasPremiumAccess) {
      setMcQuizError("Premium access is required to generate an MC quiz.");
      return;
    }

    const topic = (mcQuizTopic || mcQuizTopics[0] || "").trim();
    if (!topic) {
      setMcQuizError("Pick a topic first.");
      return;
    }

    setMcQuizLoading(true);
    setMcQuizError(null);
    try {
      const node: any = subjectData?.nodes ? (subjectData.nodes as any)[topic] : null;
      let lessonContent = "";

      if (node && typeof node === "object" && !Array.isArray(node)) {
        const lessons = Array.isArray(node.lessons) ? node.lessons : [];
        for (let i = lessons.length - 1; i >= 0; i--) {
          const body = lessons[i]?.body;
          if (typeof body === "string" && body.trim().length > 0) {
            lessonContent = body;
            break;
          }
        }
        if (!lessonContent && typeof node.overview === "string" && node.overview.trim().length > 0) {
          lessonContent = node.overview;
        }
      }

      if (!lessonContent) {
        const fallbackParts = [
          `Topic: ${topic}`,
          subjectData?.course_context ? `Course context:\n${subjectData.course_context}` : "",
          subjectData?.combinedText ? `Course materials excerpt:\n${String(subjectData.combinedText).slice(0, 12000)}` : "",
        ].filter(Boolean);
        lessonContent = fallbackParts.join("\n\n");
      }

      const res = await fetch("/api/generate-mc-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectData?.subject || slug,
          topic,
          lessonContent: sanitizeLessonBody(String(lessonContent || "")),
          courseContext: subjectData?.course_context || "",
          languageName: subjectData?.course_language_name || "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Server error (${res.status})`);
      }
      const questions = Array.isArray(json.questions) ? json.questions : [];
      if (!questions.length) throw new Error("No questions returned.");

      setMcQuizQuestions(questions);
      setMcQuizAnswers({});
      setMcQuizSubmitted(false);
    } catch (err: any) {
      setMcQuizError(err?.message || "Failed to generate quiz.");
    } finally {
      setMcQuizLoading(false);
    }
  };

  const applyPracticeLogUpdates = (updates: PracticeLogEntry[]) => {
    if (!updates.length) return;
    setPracticeLog((prev) => {
      // Verify localStorage is in sync - if it's empty but prev has entries, something was cleared
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem(`${PRACTICE_LOG_PREFIX}${slug}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length === 0 && prev.length > 0) {
              // localStorage was cleared but state wasn't - respect the clear
              return [];
            }
          } else if (prev.length > 0) {
            // localStorage was removed but state wasn't - respect the clear
            return [];
          }
        } catch (err) {
          // If we can't read localStorage, proceed normally
        }
      }
      
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

  // Remove a practice log entry by ID
  const removePracticeLogEntry = (entryId: string) => {
    setPracticeLog((prev) => {
      const filtered = prev.filter((entry) => entry.id !== entryId);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            `${PRACTICE_LOG_PREFIX}${slug}`,
            JSON.stringify(filtered)
          );
          console.log(`Removed practice log entry: ${entryId}`);
        } catch (err) {
          console.warn("Failed to persist practice log removal:", err);
        }
      }
      return filtered;
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
    conversation.push(
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      }))
    );
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
            attachments: m.attachments,
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
      
      // Handle skipped logs (not an answer attempt)
      if (result.skipped) {
        return;
      }
      
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

      }
    } catch (error) {
      console.error('Error calling practice logger:', error);
    }
  };

  // QR Code functions
  const createQrSession = async () => {
    try {
      // Start a fresh session (only one active poller at a time).
      stopPollingForImages();
      setError(null);
      setQrInfoMessage(null);
      setQrCodeDataUrl(null);
      const response = await fetch("/api/qr-session/create", {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create session");
      }
      const data = await response.json();
      
      if (!data.sessionId) {
        throw new Error("Session ID not returned from server");
      }
      
      // Verify session exists before proceeding
      const verifyResponse = await fetch(`/api/qr-session/${data.sessionId}/images`);
      if (!verifyResponse.ok && verifyResponse.status !== 404) {
        throw new Error("Session verification failed");
      }
      
      setQrSessionId(data.sessionId);
      setQrUrl(data.qrUrl);
      
      // Generate QR code via API (server-side)
      try {
        const qrResponse = await fetch("/api/qr-session/generate-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: data.qrUrl }),
        });
        if (!qrResponse.ok) throw new Error("Failed to generate QR code");
        const qrData = await qrResponse.json();
        setQrCodeDataUrl(qrData.qrDataUrl);
      } catch (qrError) {
        console.error("Error generating QR code:", qrError);
        setQrInfoMessage("Couldn't generate the QR image. Use the link below on your phone instead.");
      }
      
      setShowQrModal(true);
      setShowAttachmentMenu(false);
      startPollingForImages(data.sessionId);
    } catch (error: any) {
      console.error("Error creating QR session:", error);
      setError(error?.message || "Failed to create QR session. Please try again.");
    }
  };

  function stopPollingForImages() {
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = null;
    }
    setQrPollingActive(false);
    setQrSessionId(null);
    setQrUrl(null);
    setQrCodeDataUrl(null);
    setQrInfoMessage(null);
  }

  const startPollingForImages = (sessionId: string) => {
    // Clear any existing polling
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
    }
    setQrPollingActive(true);
    setQrInfoMessage((prev) => prev || "Waiting for photos from your phone...");

    // Poll every 1 second
    qrPollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/qr-session/${sessionId}/images`);
        if (!response.ok) {
          if (response.status === 404 || response.status === 410) {
            // Session expired or not found, stop polling
            if (qrPollIntervalRef.current) {
              clearInterval(qrPollIntervalRef.current);
              qrPollIntervalRef.current = null;
            }
            setQrPollingActive(false);
            setQrInfoMessage('Phone session expired. Tap "Answer with phone" to generate a new QR.');
            return;
          }
          return;
        }
        const data = await response.json();
        if (data.images && data.images.length > 0) {
          const existingIds = new Set(qrImagesRef.current.map((img) => img.id));
          const newImages = data.images.filter((img: { id: string; data: string }) => !existingIds.has(img.id));
          if (newImages.length > 0) {
            setQrImages((prev) => [...prev, ...newImages]);
            focusComposer();
            setQrInfoMessage(`Received ${newImages.length} image${newImages.length === 1 ? "" : "s"} from your phone.`);
          }
        }
      } catch (error) {
        console.error("Error polling for images:", error);
      }
    }, 1000);
  };

  const focusComposer = () => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

const ATTACHMENT_TILE_SIZE = 36;

const removeQrImage = (imageId: string) => {
  setQrImages((prev) => prev.filter((img) => img.id !== imageId));
};

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const addImagesFromFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      return;
    }

    try {
      const processed = await Promise.all(
        imageFiles.map(async (file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          data: await readFileAsDataUrl(file),
        }))
      );
      setQrImages((prev) => [...prev, ...processed]);
      focusComposer();
    } catch (attachmentError) {
      console.error("Error processing attachments:", attachmentError);
      setError("Failed to add image. Please try again.");
    }
  };

  const handleAttachmentInputChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    if (files.length) {
      await addImagesFromFiles(files);
    }
    // Reset so the same file can be selected again
    event.target.value = "";
  };

  const handleAttachmentDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isAttachmentDragActive) {
      setIsAttachmentDragActive(true);
    }
  };

  const handleAttachmentDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const related = event.relatedTarget as Node | null;
    if (related && (event.currentTarget === related || event.currentTarget.contains(related))) {
      return;
    }
    if (isAttachmentDragActive) {
      setIsAttachmentDragActive(false);
    }
  };

  const handleAttachmentDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsAttachmentDragActive(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) {
      await addImagesFromFiles(files);
    }
  };

  const openAttachmentPicker = () => {
    attachmentInputRef.current?.click();
  };

  // Fetch subscription level
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data?.user?.subscriptionLevel) {
          setSubscriptionLevel(data.user.subscriptionLevel);
        }
      })
      .catch(() => {});
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (qrPollIntervalRef.current) {
        clearInterval(qrPollIntervalRef.current);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAttachmentMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-attachment-dropdown]')) {
          setShowAttachmentMenu(false);
        }
      }
    };
    if (showAttachmentMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAttachmentMenu]);

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
      } else if (action.name === "navigate_exam_snipe") {
        // Navigate to exam snipe for current course
        if (slug && typeof window !== "undefined") {
          console.log("Navigating to exam snipe for course:", slug);
          router.push(`/subjects/${slug}/examsnipe`);
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
            // Parse the flexible date input
            const isoDate = parseDateInput(dateStr);
            
            if (isoDate) {
              try {
                const data = loadSubjectData(slug);
                if (data) {
                  // Replace all existing exam dates with the new one (overwrite behavior)
                  data.examDates = [{ date: isoDate, name: examName }];
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
          // In practice mode, exam snipe data is already loaded at the start
          // If we already have it, just tell Chad to use the existing data
          if (examSnipeData) {
            setMessages((m) => {
              const copy = [...m];
              // Add system message with existing exam snipe data
              const systemEntry: ChatMessage = { role: "system", content: examSnipeData, hidden: true };
              const updated: ChatMessage[] = [...copy, systemEntry];
              
              // Automatically have Chad respond using the existing data
              setTimeout(() => {
                sendMessageWithExistingMessages(updated);
              }, 50);
              
              return updated;
            });
            return; // Skip fetching, we already have it
          }
          
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

                    // Remove loading message immediately and automatically have Chad respond
                    setMessages((m) => {
                      const copy = [...m];
                      // Remove the loading message immediately
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      // Add context as system message (hidden from user, but included in API context)
                      const systemEntry: ChatMessage = { role: "system", content: contextText, hidden: true };
                      const updated: ChatMessage[] = [...copy, systemEntry];

                      // Automatically have Chad respond about what he found
                      // The system message with exam data will be included in the API context
                      // Don't add placeholder here - sendMessageWithExistingMessages will add it
                      // This ensures the spinner stops immediately and streaming starts cleanly
                      setTimeout(() => {
                        sendMessageWithExistingMessages(updated);
                      }, 50);

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
    let cancelled = false;

    (async () => {
      setLoadingSubject(true);
      try {
        const local = loadSubjectData(slug);
        if (!cancelled) setSubjectData(local);

        // Shared course previews are local-only; never pull/push server state for them.
        if (slug.startsWith("shared-")) return;

        const meRes = await fetch("/api/me", { credentials: "include" });
        const meJson = await meRes.json().catch(() => ({}));
        if (!meJson?.user) return;

        let merged: StoredSubjectData | null = null;

        if (local) {
          // Let the server merge local + DB state (prevents shallow merge data loss).
          const putRes = await fetch("/api/subject-data", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ slug, data: local }),
          });
          const putJson = await putRes.json().catch(() => ({}));
          if (putRes.ok && putJson?.data) {
            merged = putJson.data as StoredSubjectData;
          }
        } else {
          const getRes = await fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, { credentials: "include" });
          const getJson = await getRes.json().catch(() => ({}));
          if (getRes.ok && getJson?.data) {
            merged = getJson.data as StoredSubjectData;
          }
        }

        if (merged) {
          try {
            localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(merged));
          } catch {}
          if (!cancelled) setSubjectData(merged);
        }
      } catch (err) {
        console.warn("Failed to load server subject data for practice:", err);
      } finally {
        if (!cancelled) setLoadingSubject(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // AI function to match exam snipe entry to course - returns the slug of the matching entry
  const matchExamSnipeWithAI = async (courseName: string, courseSlug: string, examHistory: any[]): Promise<string | null> => {
    if (!examHistory || examHistory.length === 0) return null;

    try {
      // Create a prompt for AI to match - only show names and slugs, not full results
      const examList = examHistory.map((exam, idx) => {
        return `${idx + 1}. Course Name: "${exam.courseName || 'Unknown'}", Slug: "${exam.slug || 'Unknown'}"`;
      }).join('\n');

      const matchingPrompt = `You are a course matching assistant. Your task is to determine which exam snipe entry matches the given course.

Current Course:
- Name: "${courseName}"
- Slug: "${courseSlug}"

Available Exam Snipe Entries:
${examList}

Analyze the course names and determine which exam snipe entry (if any) corresponds to the same course. Consider:
- Exact name matches
- Abbreviations (e.g., "Signals & Systems" vs "Signaler och System")
- Different languages (e.g., Swedish vs English course names)
- Course codes (e.g., "TMA123" vs "TMA 123")
- Common variations in naming

Respond with ONLY the slug of the matching entry (e.g., "signals-systems" or "tma123"), or "NONE" if no match is found. Do not include any explanation, just the slug or "NONE".`;

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "You are a course matching assistant. Match exam snipe entries to courses based on course names, considering variations, abbreviations, and different languages. Return only the slug of the matching entry.",
          messages: [
            { role: "user", content: matchingPrompt }
          ],
          path: `/subjects/${courseSlug}/practice`,
        }),
      });

      if (!res.ok || !res.body) {
        console.error("Failed to get AI match for exam snipe");
        return null;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let response = "";

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
              response += parsed.content;
            }
          } catch (e) {
            // Ignore parse errors
          }
        });
      }

      // Parse the response - should be a slug or "NONE"
      const trimmed = response.trim().toUpperCase();
      if (trimmed === "NONE" || trimmed === "") {
        return null;
      }

      // Try to find the slug in the response (it might have extra text)
      const matchedEntry = examHistory.find((exam) => {
        const examSlug = (exam.slug || "").toLowerCase().trim();
        return response.toLowerCase().includes(examSlug);
      });

      return matchedEntry?.slug || null;
    } catch (err) {
      console.error("Error in AI exam snipe matching:", err);
      return null;
    }
  };

  // Fetch exam snipe data for the course on load using AI matching
  useEffect(() => {
    if (typeof window === "undefined" || !subjectData) return;
    
    const courseName = subjectData.subject || slug;
    setExamSnipeMatching(true);
    
    // Show preparing message in chat
    setMessages([{ role: "assistant", content: "", isLoading: true }]);
    
    (async () => {
      try {
        // First, get the list of exam snipe entries (just metadata)
        const examRes = await fetch("/api/exam-snipe/history", { credentials: "include" });
        const examJson = await examRes.json().catch(() => ({}));

        if (examJson?.ok && Array.isArray(examJson.history) && examJson.history.length > 0) {
          // Use AI to determine which exam snipe entry matches this course
          const matchedSlug = await matchExamSnipeWithAI(courseName, slug, examJson.history);

          if (matchedSlug) {
            // Fetch only the matched exam snipe's full data
            const fullDataRes = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(matchedSlug)}`, { credentials: "include" });
            const fullDataJson = await fullDataRes.json().catch(() => ({}));

            if (fullDataJson?.ok && fullDataJson.record && fullDataJson.record.results) {
              const results = fullDataJson.record.results;
              const contextData: string[] = [];

              contextData.push(`DETAILED EXAM SNIPE DATA FOR ${fullDataJson.record.courseName || courseName.toUpperCase()}:`);
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
              setExamSnipeData(contextText);
            } else {
              setExamSnipeData(null);
            }
          } else {
            setExamSnipeData(null);
          }
          // Mark as matched after AI matching completes (whether match found or not)
          setExamSnipeMatching(false);
          setExamSnipeMatched(true);
          // Remove preparing message
          setMessages([]);
        } else {
          setExamSnipeData(null);
          // Still mark as matched even if no exam snipe entries exist
          setExamSnipeMatching(false);
          setExamSnipeMatched(true);
          // Remove preparing message
          setMessages([]);
        }
      } catch (err) {
        console.error("Failed to fetch exam snipe data for initial context:", err);
        setExamSnipeData(null);
        // Mark as matched even on error so initial prompt can proceed
        setExamSnipeMatching(false);
        setExamSnipeMatched(true);
        // Remove preparing message
        setMessages([]);
      }
    })();
  }, [slug, subjectData]);

  // Load all available exam snipes for Chad's context
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    (async () => {
      try {
        const res = await fetch("/api/exam-snipe/history", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(json?.history)) {
          const examSnipes = json.history.map((record: any) => ({
            slug: record.slug,
            courseName: record.courseName || "Untitled Exam Snipe",
            createdAt: record.createdAt,
          }));
          setAvailableExamSnipes(examSnipes);
        }
      } catch (err) {
        console.error("Failed to load exam snipes for context:", err);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPracticeLogLoaded(false);

    const normalizeEntry = (entry: any): PracticeLogEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      return {
        id: typeof entry.id === "string" ? entry.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
        topic: typeof entry.topic === "string" ? entry.topic : "General Practice",
        question: typeof entry.question === "string" ? entry.question : entry.result || "No question recorded",
        answer: typeof entry.answer === "string" ? entry.answer : "No answer recorded",
        assessment: typeof entry.assessment === "string" ? entry.assessment : "Legacy entry",
        grade: typeof entry.grade === "number" ? entry.grade : (typeof entry.rating === "number" ? entry.rating : 5),
        // Legacy fields
        skill: typeof entry.skill === "string" ? entry.skill : undefined,
        rating: typeof entry.rating === "number" ? entry.rating : undefined,
        strengths: Array.isArray(entry.strengths) ? entry.strengths.filter((item: any) => typeof item === "string") : undefined,
        weaknesses: Array.isArray(entry.weaknesses) ? entry.weaknesses.filter((item: any) => typeof item === "string") : undefined,
        recommendation: typeof entry.recommendation === "string" ? entry.recommendation : undefined,
        confidence: typeof entry.confidence === "number" ? entry.confidence : undefined,
        difficulty: typeof entry.difficulty === "string" ? entry.difficulty : undefined,
        raw: typeof entry.raw === "string" ? entry.raw : undefined,
        result: typeof entry.result === "string" ? entry.result : undefined,
        questions: typeof entry.questions === "number" ? entry.questions : undefined,
      };
    };

    const normalizeAnyToEntries = (value: any): PracticeLogEntry[] => {
      if (Array.isArray(value)) {
        return value.map(normalizeEntry).filter(Boolean) as PracticeLogEntry[];
      }
      if (typeof value === "string") {
        const normalized = value.trim();
        if (!normalized) return [];
        return [
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
        ];
      }
      return [];
    };

    try {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(`${PRACTICE_LOG_PREFIX}${slug}`);
      } catch {}

      let localParsed: any = null;
      if (stored) {
        try {
          localParsed = JSON.parse(stored);
        } catch {
          localParsed = stored;
        }
      }

      const localEntries = normalizeAnyToEntries(localParsed);
      const subjectEntries = normalizeAnyToEntries((subjectData as any)?.practiceLogs);

      const byId = new Map<string, PracticeLogEntry>();
      const chooseBetter = (a: PracticeLogEntry, b: PracticeLogEntry) => (b.timestamp > a.timestamp ? b : a);

      for (const e of subjectEntries) {
        byId.set(e.id, e);
      }
      for (const e of localEntries) {
        const prev = byId.get(e.id);
        byId.set(e.id, prev ? chooseBetter(prev, e) : e);
      }

      const merged = Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
      setPracticeLog(merged);
      try {
        localStorage.setItem(`${PRACTICE_LOG_PREFIX}${slug}`, JSON.stringify(merged));
      } catch {}
    } catch (err) {
      console.error("Failed to load practice log:", err);
      setPracticeLog([]);
    } finally {
      setPracticeLogLoaded(true);
    }
  }, [slug, subjectData]);

  // Persist practice logs into SubjectData so they sync cross-device and get included in share snapshots.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!practiceLogLoaded) return;
    if (slug.startsWith("shared-")) return;

    if (practiceLogSyncTimeoutRef.current) {
      clearTimeout(practiceLogSyncTimeoutRef.current);
    }

    practiceLogSyncTimeoutRef.current = setTimeout(() => {
      (async () => {
        try {
          const existing =
            loadSubjectData(slug) ||
            ({
              subject: slug,
              files: [],
              combinedText: "",
              topics: [],
              nodes: {},
              examDates: [],
            } as StoredSubjectData);

          const next: StoredSubjectData = {
            ...existing,
            practiceLogs: practiceLog,
            practiceLogsClearedAt: (existing as any).practiceLogsClearedAt,
          };

          await saveSubjectDataAsync(slug, next);
        } catch (err) {
          console.warn("Failed to sync practice logs:", err);
        }
      })();
    }, 1200);

    return () => {
      if (practiceLogSyncTimeoutRef.current) {
        clearTimeout(practiceLogSyncTimeoutRef.current);
        practiceLogSyncTimeoutRef.current = null;
      }
    };
  }, [slug, practiceLog, practiceLogLoaded]);

useEffect(() => {
  conversationRef.current = [];
  setMessages([]);
  setInitialPromptSent(false);
  setError(null);
  setExamSnipeMatched(false);
  setExamSnipeMatching(false);
  setExamSnipeData(null);
}, [slug]);

useEffect(() => {
  // Wait for exam snipe matching to complete before sending initial prompt
  if (!initialPromptSent && !loadingSubject && !sending && practiceLogLoaded && examSnipeMatched && !examSnipeMatching) {
    setInitialPromptSent(true);
    setTimeout(() => {
      void sendMessage("", { suppressUser: true, omitFromHistory: true });
    }, 150);
  }
}, [subjectData, loadingSubject, initialPromptSent, sending, practiceLogLoaded, examSnipeMatched, examSnipeMatching]);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

const practiceContext = useMemo(
  () => buildPracticeContext(slug, subjectData, practiceLog, examSnipeData, availableExamSnipes),
  [slug, subjectData, practiceLog, examSnipeData, availableExamSnipes]
);

async function sendMessage(
  textOverride?: string,
  options?: { suppressUser?: boolean; omitFromHistory?: boolean }
) {
  const rawText = typeof textOverride === "string" ? textOverride : input;
  const suppressUser = options?.suppressUser ?? false;
  const omitFromHistory = options?.omitFromHistory ?? false;
  const text = rawText ?? "";
  const trimmedText = text.trim();
  const hasUserText = trimmedText.length > 0;
  const imagesToSend = qrImages.length > 0 ? [...qrImages] : [];
  const attachments =
    imagesToSend.length > 0
      ? imagesToSend.map((img) => ({ type: "image" as const, data: img.data }))
      : undefined;
  const messageText = hasUserText ? trimmedText : "";

  if (sending) return;
  if (!omitFromHistory && !hasUserText && imagesToSend.length === 0) return;

  if (!suppressUser && !textOverride) {
    setInput("");
    setQrImages([]);
    setShowAttachmentMenu(false);
  }

  const conversation = conversationRef.current;
  const uiMessages: ChatMessage[] = [];

  if (!omitFromHistory && (hasUserText || imagesToSend.length > 0)) {
    conversation.push({ role: "user", content: messageText, attachments });
    if (!suppressUser) {
      uiMessages.push({ role: "user", content: messageText, attachments });
    }

    // Log the question-answer pair by finding the most recent question in conversation
    if (!suppressUser && !omitFromHistory && hasUserText) {
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
        callPracticeLogger(mostRecentQuestion, trimmedText);
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
            attachments: m.attachments,
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

  // State for tracking lesson generation
  const [generatingLessonFor, setGeneratingLessonFor] = useState<string | null>(null);

  // Extract topic from question using AI
  const extractTopicFromQuestion = async (questionText: string): Promise<string | null> => {
    try {
      const courseName = subjectData?.subject || slug;
      const courseTopics = subjectData?.topics?.map(t => t.name) || 
                          Object.keys(subjectData?.nodes || {}).filter(k => !k.startsWith("__")) || [];
      
      const topicList = courseTopics.length > 0 
        ? courseTopics.map((t, idx) => `${idx + 1}. "${t}"`).join('\n')
        : 'No topics available';

      const prompt = `You are a topic matching assistant. Given a practice question, determine which course topic it relates to.

Course: "${courseName}"
Available Topics:
${topicList}

Question: "${questionText}"

Analyze the question and determine which topic it matches. Consider:
- The main concept or subject matter being tested
- Keywords and terminology
- The type of problem or skill required

Respond with ONLY the exact topic name from the list above, or "NONE" if no match is found. Do not include any explanation, just the topic name or "NONE".`;

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "You are a topic matching assistant. Match practice questions to course topics based on content, concepts, and terminology.",
          messages: [
            { role: "user", content: prompt }
          ],
          path: `/subjects/${slug}/practice`,
        }),
      });

      if (!res.ok || !res.body) {
        console.error("Failed to extract topic from question");
        return null;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let response = "";

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
              response += parsed.content;
            }
          } catch (e) {
            // Ignore parse errors
          }
        });
      }

      const trimmed = response.trim();
      if (trimmed.toUpperCase() === "NONE" || !trimmed) {
        return null;
      }

      // Try to find exact match in course topics
      const matchedTopic = courseTopics.find((topic) => 
        trimmed.toLowerCase().includes(topic.toLowerCase()) || 
        topic.toLowerCase().includes(trimmed.toLowerCase())
      );

      return matchedTopic || trimmed;
    } catch (err) {
      console.error("Error extracting topic from question:", err);
      return null;
    }
  };

  // Check if lesson exists for a topic
  const lessonExists = (topicName: string): boolean => {
    if (!subjectData?.nodes) return false;
    const topicData = subjectData.nodes[topicName];
    if (!topicData || typeof topicData === 'string') return false;
    return Array.isArray(topicData.lessons) && topicData.lessons.length > 0;
  };

  // Generate a specific topic name based on the question
  const generateSpecificTopicName = async (baseTopic: string, questionText: string): Promise<string> => {
    try {
      const prompt = `You are a topic naming assistant. Given a base topic and a specific practice question, create a more specific and descriptive topic name that captures both the general concept and the specific aspect asked in the question.

Base Topic: "${baseTopic}"
Question: "${questionText}"

Create a topic name that:
- Includes the base topic
- Adds specificity based on what the question is asking about
- Is concise (3-8 words max)
- Captures the specific skill, method, or application mentioned in the question

Examples:
- Base: "PID Regulators", Question: "Dimensionera en pid regulator för fasmarginalen 45 grader" → "PID Regulators and Dimensioning"
- Base: "Derivatives", Question: "Find the derivative of f(x) = x² + 3x" → "Derivatives and Basic Differentiation"
- Base: "Integration", Question: "Solve the integral using substitution" → "Integration and Substitution Method"

Respond with ONLY the specific topic name, no explanation.`;

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "You are a topic naming assistant. Create specific topic names that combine base concepts with specific applications or methods from practice questions.",
          messages: [
            { role: "user", content: prompt }
          ],
          path: `/subjects/${slug}/practice`,
        }),
      });

      if (!res.ok || !res.body) {
        return baseTopic; // Fallback to base topic
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let response = "";

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
              response += parsed.content;
            }
          } catch (e) {
            // Ignore parse errors
          }
        });
      }

      const trimmed = response.trim();
      return trimmed || baseTopic;
    } catch (err) {
      console.error("Error generating specific topic name:", err);
      return baseTopic;
    }
  };

  // Generate lesson for a topic with question-specific context
  const generateLessonForTopic = async (topicName: string, questionText: string, specificTopicName: string): Promise<boolean> => {
    try {
      if (!subjectData) return false;

      const courseName = subjectData.subject || slug;
      const courseContext = subjectData.course_context || "";
      const combinedText = subjectData.combinedText || "";
      const topicNode = subjectData.nodes?.[topicName];
      const baseTopicSummary = (topicNode && typeof topicNode === 'object' && 'overview' in topicNode) 
        ? topicNode.overview || "" 
        : "";
      
      // Create question-specific topic summary
      const topicSummary = `${baseTopicSummary ? baseTopicSummary + "\n\n" : ""}SPECIFIC FOCUS: This lesson is being generated in response to a practice question: "${questionText}". The lesson should cover the general topic "${topicName}" but with particular emphasis on the specific aspect, method, or application mentioned in the question. Make sure to include detailed explanations and examples related to what the question is asking about.`;
      
      const courseTopics = subjectData.topics?.map(t => t.name) || 
                          Object.keys(subjectData.nodes || {}).filter(k => !k.startsWith("__")) || [];

      // Build course_context ensuring the original course context is included first
      let fullCourseContext = courseContext;
      if (fullCourseContext) {
        fullCourseContext += "\n\n";
      }
      fullCourseContext += `This lesson is being generated to help answer a specific practice question: "${questionText}". Focus on the general topic but emphasize the specific aspect asked in the question.`;

      const res = await fetch("/api/node-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: courseName,
          topic: specificTopicName,
          course_context: fullCourseContext,
          combinedText: combinedText,
          topicSummary: topicSummary,
          lessonsMeta: [{ type: "Full Lesson", title: specificTopicName }],
          lessonIndex: 0,
          previousLessons: [],
          generatedLessons: [],
          otherLessonsMeta: [],
          courseTopics: courseTopics,
          languageName: subjectData.course_language_name || "English",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Lesson generation failed");
      }

      const lessonData = json.data || {};
      if (!lessonData.body) {
        throw new Error("Lesson generation returned empty body");
      }

      // Save the generated lesson under the specific topic name
      const updatedData = { ...subjectData };
      updatedData.nodes = updatedData.nodes || {};
      updatedData.nodes[specificTopicName] = {
        overview: baseTopicSummary || '',
        symbols: [],
        lessonsMeta: [{ type: 'Full Lesson', title: String(lessonData.title || specificTopicName) }],
        lessons: [{
          title: String(lessonData.title || specificTopicName),
          body: String(lessonData.body || ''),
          quiz: Array.isArray(lessonData.quiz)
            ? lessonData.quiz.map((q: any) => ({
                question: String(q.question || ''),
                answer: q.answer ? String(q.answer) : undefined,
              }))
            : []
        }],
        rawLessonJson: [typeof json.raw === 'string' ? json.raw : JSON.stringify(lessonData)],
      } as any;

      await saveSubjectDataAsync(slug, updatedData);
      setSubjectData(updatedData);

      return true;
    } catch (err) {
      console.error("Error generating lesson:", err);
      return false;
    }
  };

  // Main handler for opening lesson
  const handleOpenLesson = async (questionText: string) => {
    if (generatingLessonFor) return; // Prevent multiple simultaneous requests
    
    try {
      setGeneratingLessonFor(questionText);
      
      // Extract topic from question
      const topicName = await extractTopicFromQuestion(questionText);
      
      if (!topicName) {
        alert("Could not determine the topic for this question. Please try again.");
        return;
      }

      // Generate specific topic name based on question
      const specificTopicName = await generateSpecificTopicName(topicName, questionText);
      
      // Check if lesson exists for specific topic first, then base topic
      let finalTopicName = specificTopicName;
      let lessonAlreadyExists = lessonExists(specificTopicName);
      
      if (!lessonAlreadyExists) {
        // Check if base topic has a lesson
        if (lessonExists(topicName)) {
          // Use existing base topic lesson
          finalTopicName = topicName;
        } else {
          // Generate new lesson with question-specific context
          const success = await generateLessonForTopic(topicName, questionText, specificTopicName);
          if (!success) {
            alert("Failed to generate lesson. Please try again.");
            return;
          }
          // Use the specific topic name
          finalTopicName = specificTopicName;
        }
      }

      // Navigate to the lesson
      router.push(`/subjects/${slug}/node/${encodeURIComponent(finalTopicName)}/lesson/0`);
    } catch (err) {
      console.error("Error opening lesson:", err);
      alert("An error occurred while opening the lesson. Please try again.");
    } finally {
      setGeneratingLessonFor(null);
    }
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
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-[var(--foreground)]/60">
              Practice Mode
            </div>
            <h1 className="text-base font-semibold leading-tight truncate">
              {subjectData?.subject || slug}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setLogModalOpen(true)}
              className="inline-flex items-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors whitespace-nowrap"
            >
              Practice Log
            </button>
            <button
              onClick={() => {
                setMcQuizError(null);
                setMcQuizModalOpen(true);
              }}
              disabled={!hasPremiumAccess}
              className="inline-flex items-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              title={hasPremiumAccess ? "Quick multiple choice quiz" : "Premium required"}
            >
              MC Quiz
            </button>
            <button
              onClick={() => setRawLogModalOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-2 py-1 text-[10px] font-medium text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors whitespace-nowrap"
            >
              Raw Logs
            </button>
            <button
              onClick={() => {
                if (!confirm("Are you sure you want to clear all practice logs? This cannot be undone.")) return;
                const clearedAt = Date.now();
                setPracticeLog([]);
                try {
                  localStorage.setItem(`${PRACTICE_LOG_PREFIX}${slug}`, JSON.stringify([]));
                } catch (error) {
                  console.warn("Failed to clear practice logs from storage:", error);
                }
                void (async () => {
                  try {
                    const existing =
                      loadSubjectData(slug) ||
                      ({
                        subject: slug,
                        files: [],
                        combinedText: "",
                        topics: [],
                        nodes: {},
                        examDates: [],
                      } as StoredSubjectData);
                    await saveSubjectDataAsync(slug, {
                      ...existing,
                      practiceLogs: [],
                      practiceLogsClearedAt: clearedAt,
                    });
                  } catch (error) {
                    console.warn("Failed to clear practice logs on server:", error);
                  }
                })();
              }}
              className="inline-flex items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/20 transition-colors whitespace-nowrap"
              title="Clear all practice logs"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </div>

      {!subjectData && (
        <div className="mx-auto mt-6 w-full max-w-2xl rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          We couldn't find local data for this course. Open the course page once
          to analyze materials, then come back to practice.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6 min-h-0">
        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-4">
          {messages.length === 0 && (
            <div className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/80 px-4 py-6 text-sm text-[var(--foreground)]/70">
              Chad will lead a focused practice session for this course. Get
              ready to answer questions, solve problems, and explain concepts
              out loud.
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.hidden || msg.role === "system") return null;
            const isUser = msg.role === "user";
            const isAssistant = msg.role === "assistant";
            const showSpinner = (isAssistant && sending && msg.content.trim() === "") || (isAssistant && msg.isLoading);
            const isPreparing = isAssistant && msg.isLoading && examSnipeMatching;
            const imageAttachments = (msg.attachments || []).filter((att) => {
              if (!att) return false;
              if (att.type === "image") return true;
              const data = typeof att.data === "string" ? att.data : "";
              const url = typeof att.url === "string" ? att.url : "";
              return data.startsWith("data:image") || url.startsWith("data:image");
            });
            return (
              <div
                key={`${msg.role}-${idx}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                {isUser ? (
                  <div 
                    className="chat-bubble-user max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/10"
                  >
                    {msg.content ? (
                      <div className="text-sm text-[var(--foreground)]/90 leading-relaxed">
                        {msg.content}
                      </div>
                    ) : null}
                    {imageAttachments.length > 0 ? (
                      <div className={`${msg.content ? "mt-2" : ""} grid grid-cols-2 gap-2`}>
                        {imageAttachments.map((att, attIdx) => {
                          const src = (att.url || att.data || "") as string;
                          if (!src) return null;
                          return (
                            <a
                              key={`${idx}-att-${attIdx}`}
                              href={src}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/40"
                              title="Open image"
                            >
                              <img src={src} alt={`Attachment ${attIdx + 1}`} className="h-auto w-full object-cover" />
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div 
                    className="chat-bubble-assistant max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/10"
                  >
                    {showSpinner ? (
                      <div className="text-sm text-[var(--foreground)]/90 leading-relaxed flex items-center gap-2">
                        <GlowSpinner
                          size={16}
                          ariaLabel={isPreparing ? "Preparing" : "Chad thinking"}
                          idSuffix={isPreparing ? `practice-preparing-${idx}` : `practice-thinking-${idx}`}
                        />
                        {isPreparing ? "Preparing..." : "Thinking..."}
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-[var(--foreground)]/90 leading-relaxed">
                          {renderPracticeContent(msg.content || "", handleOpenLesson, generatingLessonFor)}
                        </div>
                        {/* Render UI elements */}
                        {msg.uiElements && msg.uiElements.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {msg.uiElements.map((ui, uiIdx) => {
                              if (ui.type === 'button') {
                                return (
                                  <button
                                    key={uiIdx}
                                    onClick={() => handleButtonClick(ui.action, ui.params)}
                                    className="inline-flex items-center rounded-full synapse-style px-4 py-1.5 text-sm font-medium !text-white  transition-opacity"
                                    style={{ color: 'white' }}
                                  >
                                    {ui.label || 'Button'}
                                  </button>
                                );
                              } else if (ui.type === 'file_upload') {
                                const files = uploadedFiles[ui.id] || [];
                                const status = uploadStatus[ui.id] || 'idle';
                                const buttonLabel = ui.params?.buttonLabel || 'Generate';
                                if (!hasPremiumAccess) return null;
                                return (
                                  <FileUploadArea
                                    key={uiIdx}
                                    uploadId={ui.id}
                                    message={ui.message}
                                    files={files}
                                    buttonLabel={buttonLabel}
                                    action={ui.action}
                                    status={status}
                                    hasPremiumAccess={hasPremiumAccess}
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
                    )}
                  </div>
                )}
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
          className="mt-4 sticky bottom-4 z-20"
        >
          {qrPollingActive && qrSessionId ? (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 px-3 py-2 text-xs text-[var(--foreground)]/80">
              <div>Phone session active</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/60 px-2 text-[11px] text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                >
                  Show
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopPollingForImages();
                    setQrInfoMessage("Phone session stopped.");
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-2 text-[11px] text-red-200 hover:bg-red-500/20 transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
          ) : null}
          {qrImages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {qrImages.map((image) => (
                <div
                  key={image.id}
                  className="relative inline-block group"
                  style={{
                    width: `${ATTACHMENT_TILE_SIZE}px`,
                    height: `${ATTACHMENT_TILE_SIZE}px`,
                  }}
                >
                  <img
                    src={image.data}
                    alt="Uploaded"
                    className="w-full h-full object-cover rounded-lg border border-[var(--foreground)]/15"
                  />
                  <button
                    type="button"
                    onClick={() => removeQrImage(image.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 shadow-lg"
                    aria-label="Remove image"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div
            className={`chat-input-container flex items-center gap-2 pl-0 pr-2 py-2 border ${
              isAttachmentDragActive ? "border-[var(--accent-cyan)]" : "border-[var(--foreground)]/10"
            } rounded-full`}
            style={{
              backgroundColor: "rgba(255,255,255,0.08)",
              boxShadow: "none",
            }}
            onDragEnter={handleAttachmentDragOver}
            onDragOver={handleAttachmentDragOver}
            onDragLeave={handleAttachmentDragLeave}
            onDrop={handleAttachmentDrop}
          >
            <div className="relative" data-attachment-dropdown style={{ pointerEvents: "auto" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowAttachmentMenu((prev) => !prev);
                }}
                className="chat-attach-button inline-flex items-center justify-center rounded-full bg-transparent text-[var(--foreground)] transition-colors w-8 h-8 focus-visible:outline-none"
                style={{ border: "0", boxShadow: "none" }}
                aria-label="More options"
                title="More options"
              >
                +
              </button>
              {showAttachmentMenu && (
                <div
                  className="absolute left-0 bottom-full mb-2 w-48 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/95 shadow-lg overflow-hidden z-30"
                  data-attachment-dropdown
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openAttachmentPicker();
                      setShowAttachmentMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors"
                  >
                    Upload image
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void createQrSession();
                      setShowAttachmentMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors border-t border-[var(--foreground)]/10"
                  >
                    Answer with phone
                  </button>
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              onPaste={async (event) => {
                const files = Array.from(event.clipboardData?.files || []).filter((file) =>
                  file.type.startsWith("image/")
                );
                if (files.length) {
                  event.preventDefault();
                  await addImagesFromFiles(files);
                }
              }}
              placeholder="Respond with your work, explain your reasoning, or ask for a different drill..."
              rows={1}
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/60 focus:outline-none resize-none overflow-hidden pl-2 pr-4"
              style={{ minHeight: "1.5rem", lineHeight: "1.5rem" }}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleDifficultyAdjustment("down")}
                disabled={sending}
                className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--foreground)]/12 text-[var(--foreground)]"
                style={{ boxShadow: "none" }}
                aria-label="Lower difficulty"
                title="Lower difficulty"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handleDifficultyAdjustment("up")}
                disabled={sending}
                className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--foreground)]/12 text-[var(--foreground)]"
                style={{ boxShadow: "none" }}
                aria-label="Raise difficulty"
                title="Raise difficulty"
              >
                +
              </button>
            </div>
            <button
              type="submit"
              disabled={sending || (!input.trim() && qrImages.length === 0)}
              className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--foreground)]/12 text-[var(--foreground)]"
              style={{ boxShadow: "none" }}
            >
              {sending ? (
                <GlowSpinner size={16} ariaLabel="Sending message" idSuffix="practice-send" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
            <input
              ref={attachmentInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAttachmentInputChange}
            />
          </div>
        </form>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
      </div>

      {/* MC Quiz Modal */}
      {mcQuizModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--foreground)]/30 bg-[var(--background)]/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)]">MC Quiz</h2>
                <p className="text-xs text-[var(--foreground)]/60">Pick a topic and drill 4 multiple choice questions.</p>
              </div>
              <button
                type="button"
                onClick={() => setMcQuizModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--foreground)]/15 bg-[var(--background)]/70 text-[var(--foreground)]/70 hover:bg-[var(--background)]/60 hover:text-[var(--foreground)] transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!hasPremiumAccess ? (
              <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                Premium access is required to generate MC quizzes.
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <div className="text-xs font-medium text-[var(--foreground)]/70 mb-1">Topic</div>
                  <select
                    value={mcQuizTopic}
                    onChange={(e) => setMcQuizTopic(e.target.value)}
                    className="w-full rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  >
                    {mcQuizTopics.length === 0 ? (
                      <option value="">No topics found</option>
                    ) : (
                      mcQuizTopics.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void generateMcQuiz()}
                    disabled={!hasPremiumAccess || mcQuizLoading || mcQuizTopics.length === 0}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {mcQuizLoading ? "Generating..." : "Generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMcQuizQuestions([]);
                      setMcQuizAnswers({});
                      setMcQuizSubmitted(false);
                      setMcQuizError(null);
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 px-4 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {mcQuizError ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {mcQuizError}
                </div>
              ) : null}

              {mcQuizQuestions.length > 0 ? (
                <div className="max-h-[60vh] overflow-y-auto space-y-5 rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-4">
                  {mcQuizQuestions.map((q, qi) => {
                    const selected = mcQuizAnswers[qi];
                    const correct = selected === q.correctAnswer;
                    const correctOptionText = String(q.options?.[q.correctAnswer] ?? "");
                    const explanation = typeof q.explanation === "string" && q.explanation.trim().length > 0
                      ? q.explanation
                      : `**Correct answer:** ${correctOptionText}`;

                    return (
                      <div key={qi} className="space-y-3 rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)]/60 p-4">
                        <div className="text-sm font-medium text-[var(--foreground)]">
                          <span className="mr-1">{qi + 1}.</span>{" "}
                          <LessonBody body={sanitizeLessonBody(String(q.question || ""))} />
                        </div>
                        <div className="space-y-2">
                          {(q.options || []).map((option, oi) => {
                            const isSelected = selected === oi;
                            const isCorrect = oi === q.correctAnswer;
                            const showResult = mcQuizSubmitted;
                            const cls = showResult
                              ? isCorrect
                                ? "border-green-500/40 bg-green-500/10"
                                : isSelected
                                  ? "border-red-500/40 bg-red-500/10"
                                  : "border-[var(--foreground)]/10 opacity-70"
                              : isSelected
                                ? "border-[var(--foreground)]/40 bg-[var(--background)]/50"
                                : "border-[var(--foreground)]/15 bg-[var(--background)]/40 hover:bg-[var(--background)]/50";

                            return (
                              <button
                                key={oi}
                                type="button"
                                disabled={mcQuizSubmitted}
                                onClick={() => {
                                  setMcQuizAnswers((prev) => ({ ...prev, [qi]: oi }));
                                }}
                                className={`w-full text-left rounded-xl border px-3 py-2 text-sm text-[var(--foreground)] transition-colors disabled:cursor-not-allowed ${cls}`}
                              >
                                <LessonBody body={sanitizeLessonBody(String(option || ""))} />
                              </button>
                            );
                          })}
                        </div>
                        {mcQuizSubmitted ? (
                          <div
                            className={`rounded-xl border px-3 py-2 text-sm ${
                              correct ? "border-green-500/30 bg-green-500/10 text-green-200" : "border-red-500/30 bg-red-500/10 text-red-200"
                            }`}
                          >
                            <div className="text-xs font-semibold mb-1">
                              {correct ? "Correct" : "Incorrect"}
                            </div>
                            <LessonBody body={sanitizeLessonBody(String(explanation || ""))} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {mcQuizQuestions.length > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setMcQuizSubmitted(true)}
                    disabled={Object.keys(mcQuizAnswers).length !== mcQuizQuestions.length || mcQuizSubmitted}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/10 px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--foreground)]/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Submit
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateMcQuiz()}
                    disabled={!hasPremiumAccess || mcQuizLoading}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 px-4 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/60 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Generate new
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQrModal(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--foreground)]/30 bg-[var(--background)]/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Answer with Phone
              </h2>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--foreground)]/15 bg-[var(--background)]/70 text-[var(--foreground)]/70 hover:bg-[var(--background)]/60 hover:text-[var(--foreground)] transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-[var(--foreground)]/70">
                Scan this QR code with your phone to open the camera. Take photos
                of your work, and they will automatically appear in the text field.
              </p>
              {qrInfoMessage ? (
                <div className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 px-3 py-2 text-xs text-[var(--foreground)]/80">
                  {qrInfoMessage}
                </div>
              ) : null}
              <div className="flex justify-center p-4 bg-white rounded-lg">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="QR Code" className="w-64 h-64" />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center text-[var(--foreground)]/50">
                    Generating QR code...
                  </div>
                )}
              </div>
              {qrUrl ? (
                <div className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-3">
                  <div className="text-[11px] font-medium text-[var(--foreground)]/70">Or open this link on your phone</div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={qrUrl}
                      readOnly
                      className="flex-1 rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/60 px-2 py-1.5 text-xs text-[var(--foreground)] outline-none"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(qrUrl);
                          setQrInfoMessage("Link copied.");
                        } catch {
                          setQrInfoMessage("Couldn't copy. Select the link and copy manually.");
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/60 px-3 text-xs text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-xs text-[var(--foreground)]/60">
                <div>{qrPollingActive ? "Listening for photos..." : "Session stopped."}</div>
                <div>{qrImages.length} image{qrImages.length === 1 ? "" : "s"} ready</div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopPollingForImages();
                    setQrInfoMessage("Phone session stopped.");
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs text-red-200 hover:bg-red-500/20 transition-colors"
                >
                  Stop session
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/60 px-3 text-xs text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
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
                        className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/90 p-4 font-mono text-xs whitespace-pre-wrap relative"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[var(--foreground)]/50">
                            {new Date(entry.timestamp).toISOString()} — ID: {entry.id}
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to remove this practice log entry?\n\nID: ${entry.id}\nTopic: ${entry.topic || 'N/A'}\nTimestamp: ${new Date(entry.timestamp).toLocaleString()}`)) {
                                removePracticeLogEntry(entry.id);
                              }
                            }}
                            className="inline-flex items-center justify-center h-6 w-6 rounded border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors ml-2 flex-shrink-0"
                            aria-label={`Remove practice log entry ${entry.id}`}
                            title="Remove this entry"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
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
