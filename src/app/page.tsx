"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useState, useRef, useCallback, useMemo, type ChangeEvent, type DragEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import GlowSpinner from "@/components/GlowSpinner";
import CourseCreateModal from "@/components/CourseCreateModal";
import LoginPage from "@/components/LoginPage";
import Modal from "@/components/Modal";
import OnboardingModal from "@/components/OnboardingModal";
import { saveSubjectData, StoredSubjectData, loadSubjectData } from "@/utils/storage";
import { changelog } from "../../CHANGELOG";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";

type Subject = { name: string; slug: string; sharedByUsername?: string | null };

function ChangelogBox() {
  
  return (
    <div className="relative z-0">
      {/* Dark box on top */}
      <div className="relative rounded-2xl bg-[var(--background)] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.7)] z-0">
        {/* Animated gradient glow shadow behind the box - longer for changelog box */}
        <div className="absolute top-0 left-0 right-0 bottom-0 -m-[0.1125rem] rounded-2xl bg-gradient-to-r from-[var(--accent-cyan)]/30 via-[var(--accent-pink)]/30 to-[var(--accent-cyan)]/30 bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] blur-[4.8px] -z-10 pointer-events-none" />
        {/* Overlay to cover glow, same shape as box - above both glows */}
        <div className="absolute top-0 left-0 right-0 bottom-0 rounded-2xl bg-[var(--background)] opacity-100 z-50 pointer-events-none" />
        <div className="relative z-[60] text-sm text-[var(--foreground)] leading-relaxed space-y-2">
          <p className="font-semibold">{changelog.title}</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            {changelog.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

type ExamHistoryCard = {
  id: string;
  slug: string;
  courseName: string;
  createdAt: string;
  fileNames: string[];
  results: any;
};

function readSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("atomicSubjects");
    return raw ? (JSON.parse(raw) as Subject[]) : [];
  } catch {
    return [];
  }
}

// Helper function to calculate days left until the next exam
function getDaysUntilNextExam(examDates?: Array<{ date: string; name?: string }>): number | null {
  if (!examDates || examDates.length === 0) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcoming = examDates
    .map(ed => {
      const examDate = new Date(ed.date);
      examDate.setHours(0, 0, 0, 0);
      return examDate;
    })
    .filter(d => d >= now)
    .sort((a, b) => a.getTime() - b.getTime());
  if (upcoming.length === 0) return null;
  const nextExam = upcoming[0];
  const diffTime = nextExam.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

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
  // Also handle "15/03/24" (DD/MM/YY)
  const slashMatch = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    let year = parseInt(slashMatch[3]);
    // Handle 2-digit years (assume 20XX if < 50, 19XX if >= 50)
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    // Try both formats (DD/MM/YYYY and MM/DD/YYYY)
    const date1 = new Date(year, parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
    const date2 = new Date(year, parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
    
    // Use the one that makes sense (not too far in the future/past, and day <= 31)
    // Prefer DD/MM/YYYY format (date1) if day is > 12, otherwise try both
    let examDate;
    if (parseInt(slashMatch[1]) > 12) {
      // First number is definitely the day (DD/MM/YYYY)
      examDate = date1;
    } else if (parseInt(slashMatch[2]) > 12) {
      // Second number is definitely the day (MM/DD/YYYY)
      examDate = date2;
    } else {
      // Ambiguous - use the one closer to today
      const diff1 = Math.abs(date1.getTime() - today.getTime());
      const diff2 = Math.abs(date2.getTime() - today.getTime());
      examDate = diff1 < diff2 ? date1 : date2;
    }
    
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

const LANGUAGE_OPTIONS = [
  { label: "English", code: "en" },
  { label: "Swedish", code: "sv" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Norwegian", code: "no" },
  { label: "Danish", code: "da" },
  { label: "Finnish", code: "fi" },
  { label: "Italian", code: "it" },
  { label: "Portuguese", code: "pt" },
  { label: "Polish", code: "pl" },
  { label: "Dutch", code: "nl" },
] as const;

function normalizeLanguageName(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const match = LANGUAGE_OPTIONS.find(
    (option) => option.label.toLowerCase() === lower || option.code === lower
  );
  return match ? match.label : trimmed;
}

function languageNameToCode(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  const match = LANGUAGE_OPTIONS.find(
    (option) => option.label.toLowerCase() === lower || option.code === lower
  );
  return match?.code;
}

function updateCourseLanguage(slug: string, language: string) {
  const normalizedName = normalizeLanguageName(language);
  const data = loadSubjectData(slug) as StoredSubjectData | null;
  if (!data) return false;
  if (!normalizedName) {
    delete data.course_language_name;
    delete data.course_language_code;
  } else {
    data.course_language_name = normalizedName;
    data.course_language_code = languageNameToCode(normalizedName) || data.course_language_code;
  }
  saveSubjectData(slug, data);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('synapse:course-language-updated', {
      detail: { slug, language: normalizedName }
    }));
  }
  return true;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

type UIElement = {
  type: 'button' | 'file_upload';
  id: string;
  label?: string;
  message?: string;
  action?: string;
  params?: Record<string, string>;
};

type ChatAttachment =
  | {
      id: string;
      type: 'image';
      data: string;
      name?: string;
      size?: number;
      mimeType?: string;
    }
  | {
      id: string;
      type: 'file';
      name: string;
      size: number;
      extension?: string;
      data?: string; // base64 data URL for binary files
      content?: string; // text content for text files
      mimeType?: string;
    };

type HomepageMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
  uiElements?: UIElement[];
  tutorial?: boolean;
};

type ScriptStep = {
  id: string;
  text: string;
  uiElements?: UIElement[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ATTACHMENT_TILE_SIZE = 36;

const formatFileSize = (size?: number) => {
  if (typeof size !== 'number') return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const extractFileExtension = (name?: string) => {
  if (!name) return '';
  const parts = name.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1].toUpperCase();
};

// File upload component for homepage
function HomepageFileUploadArea({ 
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
  if (!hasPremiumAccess) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border-2 border-dashed p-4 border-[var(--foreground)]/20 bg-[var(--background)]/40">
          <div className="text-xs text-[var(--foreground)]/50 text-center">
            ⚠️ This feature requires Premium access
          </div>
        </div>
      </div>
    );
  }
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      onFilesChange(droppedFiles);
    }
  };
  
  return (
    <div className="space-y-2">
      <div
        onClick={() => hasPremiumAccess && fileInputRef.current?.click()}
        onDragOver={hasPremiumAccess ? handleDragOver : undefined}
        onDragLeave={hasPremiumAccess ? handleDragLeave : undefined}
        onDrop={hasPremiumAccess ? handleDrop : undefined}
        className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
          hasPremiumAccess ? 'cursor-pointer' : 'cursor-not-allowed'
        } ${
          isDragging
            ? 'border-[var(--foreground)]/40'
            : 'border-[var(--foreground)]/20 hover:border-[var(--foreground)]/30'
        }`}
        style={{
          backgroundColor: isDragging
            ? 'color-mix(in srgb, var(--foreground) 12%, transparent)'
            : 'color-mix(in srgb, var(--foreground) 8%, transparent)',
        }}
        onMouseEnter={(e) => {
          if (!isDragging && hasPremiumAccess) {
            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--foreground) 12%, transparent)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--foreground) 8%, transparent)';
          }
        }}
      >
        <div className="text-xs text-[var(--foreground)]/70 text-center">
          {!hasPremiumAccess 
            ? '⚠️ This feature requires Premium access'
            : (isDragging ? 'Drop files here' : (message || 'Upload files or drag and drop'))
          }
        </div>
        {files.length > 0 && hasPremiumAccess && (
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
          if (!hasPremiumAccess) return;
          const selectedFiles = Array.from(e.target.files || []);
          if (selectedFiles.length > 0) {
            onFilesChange(selectedFiles);
          }
        }}
        disabled={!hasPremiumAccess}
      />
      {files.length > 0 && hasPremiumAccess && (
        <button
          onClick={onGenerate}
          disabled={status === 'processing' || !hasPremiumAccess}
          className="synapse-style w-full inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium !text-white transition-opacity disabled:opacity-50"
          style={{ color: 'white', zIndex: 100, position: 'relative' }}
        >
          <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
            {status === 'processing' ? 'Processing...' : (buttonLabel || 'Create')}
          </span>
        </button>
      )}
      {status === 'processing' && (
        <div className="text-xs text-[var(--foreground)]/60 text-center">
          Creating course...
        </div>
      )}
    </div>
  );
}

function WelcomeMessage({ tutorialSignal, setTutorialSignal, onQuickLearn }: { tutorialSignal: number; setTutorialSignal: (updater: (prev: number) => number) => void; onQuickLearn?: (query: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [welcomeText, setWelcomeText] = useState("");
  const [aiName, setAiName] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [homepageMessages, setHomepageMessages] = useState<HomepageMessage[]>([]);
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isAttachmentDragActive, setIsAttachmentDragActive] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [homepageSending, setHomepageSending] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'ready' | 'processing' | 'success'>>({});
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const hasStreamed = useRef(false);
  const thinkingRef = useRef(false);
  const courseCreationInProgress = useRef(false);
  const isCreatingCourseRef = useRef(false);

  const [subscriptionLevel, setSubscriptionLevel] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const hasPremiumAccess =
    subscriptionLevel === "Tester" ||
    subscriptionLevel === "Paid" ||
    subscriptionLevel === "mylittlepwettybebe";

  useEffect(() => {
    // Fetch subscription level for gating premium features on the homepage
    setSubscriptionLoading(true);
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data?.user?.subscriptionLevel) {
          setSubscriptionLevel(data.user.subscriptionLevel);
        } else {
          setSubscriptionLevel("Free");
        }
      })
      .catch(() => {
        setSubscriptionLevel("Free");
      })
      .finally(() => {
        setSubscriptionLoading(false);
      });
  }, []);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pillsScrollRef1 = useRef<HTMLDivElement>(null);
  const pillsScrollRef2 = useRef<HTMLDivElement>(null);
  const [pillsScroll1, setPillsScroll1] = useState({ canScrollLeft: false, canScrollRight: false });
  const [pillsScroll2, setPillsScroll2] = useState({ canScrollLeft: false, canScrollRight: false });
  const tutorialScript = useMemo<ScriptStep[]>(
    () => [
      { id: "welcome", text: "Welcome to Synapse. I'm Chad, your personal assistant built into Synapse to help structure, explain and run actions for you." },
      { id: "method", text: "I'm always with you, whatever page you're on. Just start typing and i will pop up ready to assist" },
      { 
        id: "cta",
        text: "Let's look at the features of Synapse.",
        uiElements: [
          {
            type: "button",
            id: "tutorial_start",
            label: "Start",
            action: "tutorial_continue",
            params: {}
          }
        ]
      }
    ],
    []
  );
  const featureScript = useMemo<ScriptStep[]>(
    () => [
      {
        id: "features",
        text: `Use this chat like mission control. Ask me to start a course, do an exam snipe, open a page or explain something from your current lesson.

---

## Exam Snipe

I prefer past exam theses, so when creating a new course, make sure to have those ready.

---

## Courses

Courses store every document you add. I extract topics for you so you can easily navigate to the ones you need.

---

## Practice Mode

Practice Mode turns those lessons into practice questions that stimulate active recall. I keep track of what you've covered so you can focus on the areas you need to improve.

---

## Surge

Surge is for those who want to minimize friction and get results fast. I will prioritize the highest-value concepts, so we can build good general understanding easily and quickly.`
      }
    ],
    []
  );
  const tutorialPlaybackRef = useRef(false);
  const streamTutorialMessage = useCallback(
    async (text: string, uiElements?: UIElement[]) => {
      if (!text && !uiElements) return;
      let messageIndex = -1;
      setHomepageMessages((prev) => {
        const next = [
          ...prev,
          {
            role: "assistant" as const,
            content: "",
            uiElements: [],
            tutorial: true
          }
        ];
        messageIndex = next.length - 1;
        return next;
      });
      await sleep(150);
      if (messageIndex === -1) return;
      for (let i = 1; i <= text.length; i++) {
        if (!tutorialPlaybackRef.current) return;
        const slice = text.slice(0, i);
        setHomepageMessages((prev) => {
          if (!prev[messageIndex]) return prev;
          const next = [...prev];
          next[messageIndex] = {
            ...next[messageIndex],
            content: slice,
            tutorial: true,
            uiElements: i === text.length && uiElements ? uiElements : next[messageIndex].uiElements
          };
          return next;
        });
        await sleep(18);
      }
      if (text.length === 0 && uiElements) {
        setHomepageMessages((prev) => {
          if (!prev[messageIndex]) return prev;
          const next = [...prev];
          next[messageIndex] = {
            ...next[messageIndex],
            uiElements,
            tutorial: true
          };
          return next;
        });
      }
    },
    []
  );
  const playScript = useCallback(async (steps: ScriptStep[]) => {
    tutorialPlaybackRef.current = true;
    for (const step of steps) {
      if (!tutorialPlaybackRef.current) return;
      await streamTutorialMessage(step.text, step.uiElements);
      await sleep(250);
    }
  }, [streamTutorialMessage]);
  const startTutorial = useCallback(() => {
    tutorialPlaybackRef.current = false;
    setHomepageMessages([]);
    setIsTutorialActive(true);
    setAiName("Chad");
    setShowThinking(false);
    thinkingRef.current = false;
    setIsCreatingCourse(false);
    courseCreationInProgress.current = false;
    setHomepageSending(false);
    setInputValue("");
    setInputFocused(false);
    setIsStreaming(false);
    tutorialPlaybackRef.current = true;
    (async () => {
      await playScript(tutorialScript);
    })();
  }, [playScript, tutorialScript]);
  useEffect(() => {
    if (!tutorialSignal) return;
    startTutorial();
  }, [tutorialSignal, startTutorial]);

  // Listen for tutorial trigger from DevTools
  useEffect(() => {
    const handleTutorialTrigger = () => {
      setTutorialSignal((prev) => prev + 1);
    };
    window.addEventListener('synapse:tutorial-trigger', handleTutorialTrigger);
    return () => {
      window.removeEventListener('synapse:tutorial-trigger', handleTutorialTrigger);
    };
  }, [setTutorialSignal]);
  // Persist chat history during session (limit to last 200 messages)
  // Note: Chat is reset when navigating to homepage (see resetHomepageChat useEffect)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const trimmed = homepageMessages.slice(-200);
      localStorage.setItem('synapse:home-chat', JSON.stringify(trimmed));
    } catch {}
  }, [homepageMessages]);

  useEffect(() => {
    if (!showAttachmentMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-chat-attachment-dropdown]')) {
        setShowAttachmentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachmentMenu]);

  useEffect(() => {
    if (homepageSending || isTutorialActive) {
      setShowAttachmentMenu(false);
    }
  }, [homepageSending, isTutorialActive]);
  const focusChatInput = () => {
    chatInputRef.current?.focus();
  };

  const resetHomepageChat = useCallback(() => {
    tutorialPlaybackRef.current = false;
    setHomepageMessages([]);
    setWelcomeText("");
    setShowThinking(false);
    thinkingRef.current = false;
    setHomepageSending(false);
    setIsCreatingCourse(false);
    setIsTutorialActive(false);
    courseCreationInProgress.current = false;
    setChatAttachments([]);
    setShowAttachmentMenu(false);
    setIsAttachmentDragActive(false);
    setInputValue("");
    hasStreamed.current = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('synapse:home-chat');
    }
  }, []);

  // Reset chat when navigating to homepage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pathname === '/') {
      // Reset chat when on homepage - clear messages and state
      resetHomepageChat();
    }
  }, [pathname, resetHomepageChat]);

  // Handle scroll for pills container 1
  useEffect(() => {
    const container = pillsScrollRef1.current;
    if (!container) return;

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setPillsScroll1({
        canScrollLeft: scrollLeft > 0,
        canScrollRight: scrollLeft < scrollWidth - clientWidth - 1
      });
    };

    updateScrollState();
    container.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [homepageMessages.length]);

  // Handle scroll for pills container 2
  useEffect(() => {
    const container = pillsScrollRef2.current;
    if (!container) return;

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setPillsScroll2({
        canScrollLeft: scrollLeft > 0,
        canScrollRight: scrollLeft < scrollWidth - clientWidth - 1
      });
    };

    updateScrollState();
    container.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [homepageMessages.length]);

  useEffect(() => {
    if (hasStreamed.current || typeof window === "undefined") return;
    hasStreamed.current = true;

    // Wait for page to be visible before starting
    const startStreaming = () => {
      setIsStreaming(true);
      setWelcomeText("");

      const generateWelcome = async () => {
        try {
          // Fetch user info including lastLoginAt and preferredTitle
          let lastLoginAt: string | null = null;
          let preferredTitle: string | null = null;
          try {
            const meRes = await fetch("/api/me", { credentials: "include" });
            const meData = await meRes.json().catch(() => ({}));
            if (meData?.user?.lastLoginAt) {
              lastLoginAt = meData.user.lastLoginAt;
            }
            const prefs = meData?.user?.preferences;
            if (prefs && typeof prefs === "object" && prefs.preferredTitle) {
              preferredTitle = prefs.preferredTitle;
            }
          } catch {}

          const now = new Date();
          const hours = now.getHours();
          let timeOfDay = "unknown";
          if (hours >= 5 && hours < 12) timeOfDay = "morning";
          else if (hours >= 12 && hours < 17) timeOfDay = "afternoon";
          else if (hours >= 17 && hours < 22) timeOfDay = "evening";
          else timeOfDay = "night";

          const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const weekday = weekdays[now.getDay()];

          const ua = navigator.userAgent || "";
          let deviceType = "computer";
          if (/iPad|iPhone|iPod/i.test(ua)) deviceType = "mobile";
          else if (/Android/i.test(ua)) deviceType = "mobile";
          else if (/Tablet/i.test(ua)) deviceType = "tablet";

          const res = await fetch("/api/welcome/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timeOfDay,
              weekday,
              deviceType,
              userAgent: ua,
              lastLoginAt,
              preferredTitle,
            }),
          });

          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          if (reader) {
            let fullText = "";
            let name = "";
            let streamingPromise: Promise<void> | null = null;

            let lastUpdateTime = 0;
            const updateThrottle = 16; // ~60fps (16ms)
            
            const updateWelcomeText = (text: string) => {
              const now = Date.now();
              if (now - lastUpdateTime >= updateThrottle) {
                lastUpdateTime = now;
                setWelcomeText(text);
                setHomepageMessages((prev) => {
                  if (prev.length === 0 || prev[0].role !== 'assistant') {
                    return [{ role: 'assistant', content: text }];
                  }
                  return [{ ...prev[0], content: text }, ...prev.slice(1)];
                });
              }
            };

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              chunk.split("\n").forEach((line) => {
                if (!line.startsWith("data: ")) return;
                const payload = line.slice(6);
                if (!payload) return;
                try {
                  const obj = JSON.parse(payload);
                  if (obj.type === "name" && obj.content) {
                    name = obj.content;
                    setAiName(obj.content);
                  } else if (obj.type === "text" && obj.content) {
                    fullText += obj.content;
                    // Throttled update to prevent stuttering
                    updateWelcomeText(fullText);
                  } else if (obj.type === "done") {
                    // Ensure final update happens
                    setWelcomeText(fullText);
                    setIsStreaming(false);
                    setHomepageMessages((prev) => {
                      if (prev.length === 0 || prev[0].role !== 'assistant') {
                        return [{ role: 'assistant', content: fullText }];
                      }
                      return [{ ...prev[0], content: fullText }, ...prev.slice(1)];
                    });
                  }
                } catch {}
              });
            }

            // Final update if we have text
            if (fullText.length > 0) {
              setWelcomeText(fullText);
              setIsStreaming(false);
              setHomepageMessages((prev) => {
                if (prev.length === 0 || prev[0].role !== 'assistant') {
                  return [{ role: 'assistant', content: fullText }];
                }
                return [{ ...prev[0], content: fullText }, ...prev.slice(1)];
              });
            } else {
              setIsStreaming(false);
            }
          }
        } catch (e: any) {
          setWelcomeText("Welcome back!");
          setIsStreaming(false);
        }
      };

      generateWelcome();
    };

    // Use requestAnimationFrame to ensure page is rendered, then start streaming
    requestAnimationFrame(() => {
      // Small delay to ensure user sees the page before streaming starts
      setTimeout(startStreaming, 100);
    });
  }, []);

  // Parse UI elements and actions from Chad's messages
  function parseUIElementsAndActions(content: string): { cleanedContent: string; uiElements: UIElement[]; actions: Array<{ name: string; params: Record<string, string> }> } {
    // Allow spaces around pipes: ACTION:name | param:value | param2:value
    const actionRegex = /ACTION:(\w+)(?:\s*\|\s*([^|]+(?:\s*\|\s*[^|]+)*))?/g;
    const buttonRegex = /BUTTON:(\w+)(?:\s*\|\s*([^|]+(?:\s*\|\s*[^|]+)*))?/g;
    const fileUploadRegex = /FILE_UPLOAD:(\w+)(?:\s*\|\s*([^|]+(?:\s*\|\s*[^|]+)*))?/g;
    
    const uiElements: UIElement[] = [];
    const actions: Array<{ name: string; params: Record<string, string> }> = [];
    
    // Parse buttons
    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      const id = match[1];
      const params: Record<string, string> = {};
      if (match[2]) {
        match[2].split('|').forEach(param => {
          const colonIndex = param.indexOf(':');
          if (colonIndex > 0) {
            const key = param.slice(0, colonIndex).trim();
            let value = param.slice(colonIndex + 1).trim();
            const spaceIndex = value.search(/[\s\n\r]/);
            if (spaceIndex > 0) {
              value = value.slice(0, spaceIndex);
            }
            if (key && value) {
              params[key] = value;
            }
          }
        });
      }
      uiElements.push({
        type: 'button',
        id,
        label: params.label || 'Button',
        action: params.action,
        params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'label' && k !== 'action'))
      });
    }
    
    // Parse file uploads
    while ((match = fileUploadRegex.exec(content)) !== null) {
      const id = match[1];
      const params: Record<string, string> = {};
      if (match[2]) {
        match[2].split('|').forEach(param => {
          const colonIndex = param.indexOf(':');
          if (colonIndex > 0) {
            const key = param.slice(0, colonIndex).trim();
            let value = param.slice(colonIndex + 1).trim();
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel', 'description', 'query', 'date'];
            if (!spaceAllowedParams.includes(key)) {
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
      }
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
    
    // Parse actions - collect all matches first
    const allMatches: Array<{ name: string; params: Record<string, string>; fullMatch: string }> = [];
    while ((match = actionRegex.exec(content)) !== null) {
      const actionName = match[1];
      const params: Record<string, string> = {};
      if (match[2]) {
        // Split parameters, but be careful with values that contain spaces
        const paramParts = match[2].split('|');
        for (let i = 0; i < paramParts.length; i++) {
          const param = paramParts[i];
          const colonIndex = param.indexOf(':');
          if (colonIndex > 0) {
            const key = param.slice(0, colonIndex).trim();
            let value = param.slice(colonIndex + 1).trim();
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel', 'description', 'query', 'date'];
            
            // For space-allowed params, the value might continue in the next param part
            // if it was incorrectly split (e.g., "description:segling på svenska" split at space)
            if (spaceAllowedParams.includes(key) && value && i < paramParts.length - 1) {
              // Check if the next part doesn't have a colon (meaning it's a continuation)
              const nextPart = paramParts[i + 1]?.trim();
              if (nextPart && !nextPart.includes(':')) {
                // This is likely a continuation of the value, merge it
                value = value + ' ' + nextPart;
                i++; // Skip the next part since we merged it
              }
            }
            
            if (!spaceAllowedParams.includes(key)) {
              const spaceIndex = value.search(/[\s\n\r]/);
              if (spaceIndex > 0) {
                value = value.slice(0, spaceIndex);
              }
            }
            if (key === 'slug' && value) {
              value = value.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
            }
            if (key && value) {
              // For space-allowed params, always use the longest value (in case of multiple parses during streaming)
              if (spaceAllowedParams.includes(key) && params[key] && params[key].length > value.length) {
                // Keep the existing longer value
              } else {
              params[key] = value;
            }
          }
          }
        }
      }
      if (actionName === 'set_exam_date') {
        console.log('🟢 Parsed set_exam_date action:', { actionName, params, fullMatch: match[0] });
      }
      allMatches.push({ name: actionName, params, fullMatch: match[0] });
    }
    
    // Deduplicate actions - keep only the LAST (most complete) occurrence of each action
    // This ensures we use the full description when the stream completes
    const actionMap = new Map<string, { name: string; params: Record<string, string> }>();
    for (const match of allMatches) {
      // For actions with space-allowed params, compare parameter completeness
      const existing = actionMap.get(match.name);
      if (existing) {
        // Check if the new match has more complete parameters (longer values for space-allowed params)
        const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel', 'description', 'query', 'date'];
        let newIsMoreComplete = false;
        for (const key of spaceAllowedParams) {
          const existingValue = existing.params[key] || '';
          const newValue = match.params[key] || '';
          if (newValue.length > existingValue.length) {
            newIsMoreComplete = true;
            break;
          }
        }
        // Also check if new match has more parameters
        if (!newIsMoreComplete && Object.keys(match.params).length > Object.keys(existing.params).length) {
          newIsMoreComplete = true;
        }
        if (newIsMoreComplete) {
          actionMap.set(match.name, { name: match.name, params: match.params });
        }
      } else {
        actionMap.set(match.name, { name: match.name, params: match.params });
      }
    }
    
    // Convert map to array
    for (const action of actionMap.values()) {
      actions.push(action);
    }
    
    // Remove all commands from content for display
    const cleanedContent = content
      .replace(actionRegex, '')
      .replace(buttonRegex, '')
      .replace(fileUploadRegex, '')
      .trim();
    
    return { cleanedContent, uiElements, actions };
  }

  async function triggerTextCourseCreation(descriptionParam: string, courseNameParam: string, userMessage?: string) {
    if (courseCreationInProgress.current) return;

    // ALWAYS use descriptionParam (which Chad should have rewritten into a better description)
    // NEVER fall back to user message - Chad's rewritten description is what we want
    const actualDescription = descriptionParam.trim();

    if (!actualDescription) {
      console.warn('No description provided from Chad - cannot create course');
      return;
    }

    courseCreationInProgress.current = true;
    setIsCreatingCourse(true);

    try {
      // Call API to generate course context from description
      // The description should already be a good description (rewritten by Chad)
      const response = await fetch('/api/course-from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: actualDescription,
          courseName: courseNameParam || undefined,
        }),
      });

      if (response.ok) {
        const json = await response.json().catch(() => ({}));
        if (json.ok && json.courseContext) {
          // Use the generated course context as the syllabus
          const finalName = json.courseName || courseNameParam || 'New Course';
          document.dispatchEvent(new CustomEvent('synapse:create-course-with-text', { 
            detail: { 
              name: finalName, 
              syllabus: json.courseContext, // Use generated context
              topics: json.topics || []
            } 
          }));
          return;
        }
      }
    } catch (err) {
      console.error('Failed to generate course context:', err);
    }

    // Fallback to using description directly if API call fails
    const finalName = courseNameParam || 'New Course';
    document.dispatchEvent(new CustomEvent('synapse:create-course-with-text', { 
      detail: { 
        name: finalName, 
        syllabus: actualDescription,
        topics: []
      } 
    }));
  }

  useEffect(() => {
    isCreatingCourseRef.current = isCreatingCourse;
  }, [isCreatingCourse]);

  useEffect(() => {
    thinkingRef.current = showThinking;
  }, [showThinking]);

  useEffect(() => {
    const handleCourseCreated = (e: Event) => {
      if (!isCreatingCourseRef.current) return;
      const detail = (e as CustomEvent).detail || {};
      const courseName = detail?.name || 'that topic';
      const wasError = !!detail?.error;

      setIsCreatingCourse(false);
      courseCreationInProgress.current = false;

      setHomepageMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === 'assistant' && copy[copy.length - 1].content === '') {
          copy.pop();
        }
        copy.push({
          role: 'assistant',
          content: wasError
            ? 'Something went wrong creating that course. Try again.'
            : `Course created about ${courseName}. Dive in when you’re ready.`,
        });
        return copy;
      });
    };

    document.addEventListener('synapse:course-created', handleCourseCreated as EventListener);
    return () => document.removeEventListener('synapse:course-created', handleCourseCreated as EventListener);
  }, []);

  // Execute actions
  async function executeActions(actions: Array<{ name: string; params: Record<string, string> }>, userMessage?: string) {
    for (const action of actions) {
      if (action.name === 'create_course') {
        const isHomepage = typeof window !== 'undefined' && window.location.pathname === '/';
        if (isHomepage) {
          await triggerTextCourseCreation(action.params.syllabus || action.params.description || '', action.params.name || '', userMessage);
          return;
        }
        const name = action.params.name || 'New Course';
        const syllabus = action.params.syllabus || '';
        document.dispatchEvent(new CustomEvent('synapse:create-course', { detail: { name, syllabus } }));
      } else if (action.name === 'create_course_from_text') {
        const description = action.params.description || '';
        const courseName = action.params.name || '';
        await triggerTextCourseCreation(description, courseName, userMessage);
      } else if (action.name === 'open_course_modal') {
        document.dispatchEvent(new CustomEvent('synapse:open-course-modal'));
      } else if (action.name === 'navigate') {
        const path = action.params.path;
        if (path && typeof window !== 'undefined') {
          router.push(path);
        }
      } else if (action.name === 'navigate_course') {
        let slug = action.params.slug;
        if (slug && typeof window !== 'undefined') {
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          slug = slug.trim().replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            router.push(`/subjects/${slug}`);
          }
        }
      } else if (action.name === 'navigate_surge') {
        let slug = action.params.slug;
        if (slug && typeof window !== 'undefined') {
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find((s) =>
                    s.name.toLowerCase().includes(slug.toLowerCase()) ||
                    slug.toLowerCase().includes(s.name.toLowerCase())
                  );
                  if (partialMatch) slug = partialMatch.slug;
                }
              }
            } catch {}
          }
          if (slug) {
            router.push(`/subjects/${slug}/surge`);
          }
        }
      } else if (action.name === 'set_course_language') {
        let slug = action.params.slug || action.params.course || '';
        let languageValue = action.params.language || action.params.lang || action.params.value || action.params.name || '';
        if (!slug || !languageValue) continue;
        slug = slug.trim();
        if (!slug.match(/^[a-z0-9\-_]+$/)) {
          try {
            const subjectsRaw = localStorage.getItem('atomicSubjects');
            if (subjectsRaw) {
              const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
              const exactMatch = subjects.find((s) => s.name.toLowerCase() === slug.toLowerCase());
              if (exactMatch) {
                slug = exactMatch.slug;
              } else {
                const partialMatch = subjects.find((s) =>
                  s.name.toLowerCase().includes(slug.toLowerCase()) ||
                  slug.toLowerCase().includes(s.name.toLowerCase())
                );
                if (partialMatch) slug = partialMatch.slug;
              }
            }
          } catch {}
        }
        slug = slug.trim().replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
        if (!slug) continue;
        updateCourseLanguage(slug, languageValue);
      } else if (action.name === 'navigate_practice') {
        let slug = action.params.slug;
        if (slug && typeof window !== 'undefined') {
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          slug = slug.trim().replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            router.push(`/subjects/${slug}/practice`);
          }
        }
      } else if (action.name === 'start_exam_snipe') {
        router.push('/exam-snipe');
      } else if (action.name === 'generate_quick_learn') {
        let query = action.params.query || action.params.topic || '';
        // If no query in action params, try to extract from user message
        if (!query && userMessage) {
          // Try to extract topic from user message - look for patterns like "teach me about X", "explain X", "quick learn on X", etc.
          const patterns = [
            /(?:teach|explain|show|create|make|generate|do).*?(?:about|on|for|regarding|concerning)\s+(.+?)(?:\s+please|\s+$|$)/i,
            /(?:quick learn|lesson|learn).*?(?:about|on|for|regarding|concerning)\s+(.+?)(?:\s+please|\s+$|$)/i,
            /(?:subject|topic).*?[:]\s*(.+?)(?:\s+please|\s+$|$)/i,
          ];
          for (const pattern of patterns) {
            const match = userMessage.match(pattern);
            if (match && match[1]) {
              query = match[1].trim();
              break;
            }
          }
          // If still no match, use the whole message (but remove common phrases)
          if (!query) {
            query = userMessage
              .replace(/^(?:please|can you|could you|i want|i need|i'd like|create|make|generate|do|teach|explain|show)\s+/i, '')
              .replace(/\s+(?:please|for me|now|quickly)$/i, '')
              .trim();
          }
        }
        if (query && onQuickLearn) {
          onQuickLearn(query);
        }
      } else if (action.name === 'set_exam_date') {
        console.log('🔵 set_exam_date action received:', { 
          action, 
          params: action.params,
          userMessage 
        });
        
        let slug = action.params.slug?.trim();
        const dateInput = action.params.date?.trim() || action.params.days?.trim() || '';
        const examName = action.params.name?.trim();
        
        console.log('🔵 Initial values:', { slug, dateInput, examName, userMessage });
        
        if (dateInput && typeof window !== 'undefined') {
          // Check if slug exists in course data first
          let courseDataExists = false;
          if (slug) {
            try {
              const testData = loadSubjectData(slug);
              courseDataExists = !!testData;
              console.log('🟡 Course data check:', { slug, courseDataExists });
            } catch {}
          }
          
          // If slug is invalid or a placeholder AND no course data exists, try to extract course name from user message
          const isInvalidSlug = (!slug || (!courseDataExists && (slug === 'new-course' || slug === 'new_course' || slug.startsWith('new-'))));
          
          console.log('🟡 Slug validation:', { slug, courseDataExists, isInvalidSlug });
          
          if (isInvalidSlug) {
            console.log('🟡 Attempting to extract course name from messages...');
            // Try to extract course name from the user message
            const messageText = userMessage || '';
            console.log('🟡 User message text:', messageText);
            
            // First, try to get course name from the most recent assistant message (most reliable)
            let extractedCourseName = '';
            if (homepageMessages.length > 0) {
              console.log('🟡 Checking assistant messages, count:', homepageMessages.length);
              const lastMessage = homepageMessages[homepageMessages.length - 1];
              console.log('🟡 Last message:', { role: lastMessage.role, content: lastMessage.content?.substring(0, 300) });
              if (lastMessage.role === 'assistant' && lastMessage.content) {
                const assistantText = lastMessage.content;
                console.log('🟡 Searching assistant text for course name:', assistantText.substring(0, 300));
                // Look for patterns like "for Reglerteknik", "Reglerteknik exam", "Setting exam date for Reglerteknik", etc.
                const courseNamePatterns = [
                  /(?:Setting.*?for|for|exam|course|subject)\s+([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ\s]+?)(?:\s+to|\s+exam|\s+is|\s+on|$)/i,
                  /([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ\s]{3,}?)(?:\s+exam|\s+to|\s+is|\s+on)/i,
                ];
                for (const pattern of courseNamePatterns) {
                  const match = assistantText.match(pattern);
                  if (match && match[1]) {
                    extractedCourseName = match[1].trim();
                    // Clean up common words that might be captured
                    extractedCourseName = extractedCourseName.replace(/\s+(exam|to|is|on|date)$/i, '').trim();
                    if (extractedCourseName.length > 3) {
                      console.log('🟢 Extracted course name from assistant message:', extractedCourseName);
                      break;
                    }
                  }
                }
              }
            }
            
            // If not found in assistant message, try user message
            if (!extractedCourseName && messageText) {
              // Look for course names at the end of the message (common pattern: "X days course-name")
              const endPattern = /(?:days|weeks|months)\s+([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ\s]{3,}?)$/i;
              const endMatch = messageText.match(endPattern);
              if (endMatch && endMatch[1]) {
                extractedCourseName = endMatch[1].trim();
                console.log('🟢 Extracted course name from end of user message:', extractedCourseName);
              } else {
                // Try other patterns
                const courseNamePatterns = [
                  /(?:Setting.*?for|for|exam|course|subject)\s+([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ\s]+?)(?:\s+to|\s+exam|\s+is|\s+on|$)/i,
                  /([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ\s]{3,}?)(?:\s+exam|\s+to|\s+is|\s+on)/i,
                ];
                for (const pattern of courseNamePatterns) {
                  const match = messageText.match(pattern);
                  if (match && match[1]) {
                    const candidate = match[1].trim().replace(/\s+(exam|to|is|on|date)$/i, '').trim();
                    // Skip common words like "set", "the", "to", etc.
                    if (candidate.length > 3 && !['set', 'the', 'to', 'for', 'exam', 'date'].includes(candidate.toLowerCase())) {
                      extractedCourseName = candidate;
                      console.log('🟢 Extracted course name from user message:', extractedCourseName);
                      break;
                    }
                  }
                }
              }
            }
            
            console.log('🟡 Final extracted course name:', extractedCourseName);
            
            // If we found a course name, try to resolve it to a slug
            if (extractedCourseName) {
              try {
                const subjectsRaw = localStorage.getItem('atomicSubjects');
                if (subjectsRaw) {
                  const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                  const exactMatch = subjects.find(s => s.name.toLowerCase() === extractedCourseName.toLowerCase());
                  if (exactMatch) {
                    slug = exactMatch.slug;
                    console.log('Resolved course name to slug:', { courseName: extractedCourseName, slug });
                  } else {
                    const partialMatch = subjects.find(s => 
                      s.name.toLowerCase().includes(extractedCourseName.toLowerCase()) || 
                      extractedCourseName.toLowerCase().includes(s.name.toLowerCase())
                    );
                    if (partialMatch) {
                      slug = partialMatch.slug;
                      console.log('Resolved course name to slug (partial match):', { courseName: extractedCourseName, slug });
                    }
                  }
                }
              } catch (err) {
                console.error('Error resolving course name:', err);
              }
            }
            
            // If still no valid slug, try to use extracted course name or fallback
            if (!slug || slug === 'new-course' || slug === 'new_course' || slug.startsWith('new-')) {
              try {
                const subjectsRaw = localStorage.getItem('atomicSubjects');
                if (subjectsRaw) {
                  const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                  console.log('🟡 Available courses:', subjects.map(s => ({ name: s.name, slug: s.slug })));
                  
                  // If we have an extracted course name, try to match it
                  if (extractedCourseName) {
                    const exactMatch = subjects.find(s => 
                      s.name.toLowerCase() === extractedCourseName.toLowerCase() ||
                      s.slug.toLowerCase() === extractedCourseName.toLowerCase()
                    );
                    if (exactMatch) {
                      slug = exactMatch.slug;
                      console.log('🟢 Found exact match for extracted course name:', { extractedCourseName, slug });
                    } else {
                      const partialMatch = subjects.find(s => 
                        s.name.toLowerCase().includes(extractedCourseName.toLowerCase()) || 
                        extractedCourseName.toLowerCase().includes(s.name.toLowerCase()) ||
                        s.slug.toLowerCase().includes(extractedCourseName.toLowerCase())
                      );
                      if (partialMatch) {
                        slug = partialMatch.slug;
                        console.log('🟢 Found partial match for extracted course name:', { extractedCourseName, slug });
                      }
                    }
                  }
                  
                  // If still no match, try common patterns
                  if (!slug || slug === 'new-course' || slug === 'new_course' || slug.startsWith('new-')) {
                    // Try to find a course that matches "Reglerteknik" or similar
                    const reglerMatch = subjects.find(s => 
                      s.name.toLowerCase().includes('regler') || 
                      s.slug.toLowerCase().includes('regler')
                    );
                    if (reglerMatch) {
                      slug = reglerMatch.slug;
                      console.log('🟡 Using fallback course match (regler):', { slug });
                    } else if (subjects.length > 0) {
                      // Last resort: use the first course (but log a warning)
                      slug = subjects[0].slug;
                      console.warn('⚠️ Using first available course as fallback (may be incorrect):', { slug, allCourses: subjects.map(s => s.name) });
                    }
                  }
                }
              } catch (err) {
                console.error('Error in fallback course lookup:', err);
              }
            }
            
            // Final check - verify slug exists in subjects list (even if data doesn't exist yet, we can create it)
            if (slug) {
              try {
                const subjectsRaw = localStorage.getItem('atomicSubjects');
                if (subjectsRaw) {
                  const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                  const slugExists = subjects.some(s => s.slug === slug);
                  if (slugExists) {
                    console.log('✅ Slug found in subjects list (valid):', { slug });
                    // Slug is valid, proceed even if it's "new-course"
                  } else {
                    console.warn('Skipping set_exam_date: slug not found in subjects list', { slug, originalSlug: action.params.slug, extractedCourseName, userMessage });
                    return;
                  }
                } else {
                  console.warn('Skipping set_exam_date: no subjects list found', { slug });
                  return;
                }
              } catch (err) {
                console.error('Error checking subjects list:', err);
                return;
              }
            } else {
              console.warn('Skipping set_exam_date: could not resolve course slug', { originalSlug: action.params.slug, extractedCourseName, userMessage });
              return;
            }
          } else if (slug && !courseDataExists) {
            // Slug was provided but no course data exists - try to resolve it
            console.log('🟡 Slug provided but no course data, attempting resolution...');
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const match = subjects.find(s => s.slug === slug);
                if (match) {
                  // Slug exists in subjects list, so it's valid even if data doesn't exist yet
                  courseDataExists = true;
                  console.log('🟢 Slug found in subjects list:', { slug, name: match.name });
                }
              }
            } catch {}
          }
          
          // If slug looks like a course name (not a valid slug format), try to resolve it
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          
          // Clean slug
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          
          // Parse the date input - either a number (days) or DD/MM/YY format
          let isoDate: string | null = null;
          const trimmedDate = dateInput.trim();
          
          // Check if it's just a number (days from now)
          const daysMatch = trimmedDate.match(/^\d+$/);
          if (daysMatch) {
            const days = parseInt(trimmedDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const examDate = new Date(today);
            examDate.setDate(examDate.getDate() + days);
            // Use local date components to avoid timezone issues
            const year = examDate.getFullYear();
            const month = String(examDate.getMonth() + 1).padStart(2, '0');
            const day = String(examDate.getDate()).padStart(2, '0');
            isoDate = `${year}-${month}-${day}`;
            console.log('🟢 Parsed days input:', { days, isoDate });
          } else {
            // Try to parse as DD/MM/YY or DD/MM/YYYY
            const dateMatch = trimmedDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
            if (dateMatch) {
              let day = parseInt(dateMatch[1]);
              let month = parseInt(dateMatch[2]);
              let year = parseInt(dateMatch[3]);
              
              // Handle 2-digit years (assume 20XX if < 50, 19XX if >= 50)
              if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
              }
              
              const examDate = new Date(year, month - 1, day);
              examDate.setHours(0, 0, 0, 0);
              
              // If date is in the past, assume next year
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              if (examDate < today) {
                examDate.setFullYear(examDate.getFullYear() + 1);
              }
              
              // Use local date components to avoid timezone issues
              const finalYear = examDate.getFullYear();
              const finalMonth = String(examDate.getMonth() + 1).padStart(2, '0');
              const finalDay = String(examDate.getDate()).padStart(2, '0');
              isoDate = `${finalYear}-${finalMonth}-${finalDay}`;
              console.log('🟢 Parsed date input:', { input: trimmedDate, isoDate });
            } else {
              // Fallback to old parseDateInput function for other formats
              isoDate = parseDateInput(dateInput);
              console.log('🟡 Using fallback parser:', { input: dateInput, isoDate });
            }
          }
          
          console.log('set_exam_date processing:', { 
            originalSlug: action.params.slug, 
            resolvedSlug: slug, 
            dateInput, 
            isoDate, 
            hasData: !!loadSubjectData(slug) 
          });
          
          if (isoDate && slug) {
            try {
              let data = loadSubjectData(slug);
              
              // If data doesn't exist, create it
              if (!data) {
                console.log('🟡 Creating new course data for slug:', slug);
                // Try to get course name from subjects list
                let courseName = slug;
                try {
                  const subjectsRaw = localStorage.getItem('atomicSubjects');
                  if (subjectsRaw) {
                    const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                    const match = subjects.find(s => s.slug === slug);
                    if (match) {
                      courseName = match.name;
                    }
                  }
                } catch {}
                
                data = {
                  subject: courseName,
                  files: [],
                  combinedText: '',
                  tree: null,
                  topics: [],
                  nodes: {},
                  progress: {},
                  examDates: []
                };
                saveSubjectData(slug, data);
                console.log('✅ Created new course data:', { slug, courseName });
              }
              
              if (data) {
                // Replace all existing exam dates with the new one (overwrite behavior)
                data.examDates = [{ date: isoDate, name: examName }];
                saveSubjectData(slug, data);
                // Trigger a custom event to refresh the UI
                window.dispatchEvent(new CustomEvent("synapse:exam-date-updated", { detail: { slug } }));
                console.log('✅ Exam date set successfully:', { slug, date: isoDate, originalInput: dateInput, examDates: data.examDates });
              } else {
                console.warn('❌ Course data not found for slug:', slug);
              }
            } catch (err) {
              console.error("❌ Failed to set exam date:", err, { slug, dateInput, isoDate });
            }
          } else {
            console.warn('❌ Failed to parse date or invalid slug:', { slug, dateInput, isoDate });
          }
        }
      }
    }
  }

  // Handle button click
  function handleButtonClick(action: string | undefined, params: Record<string, string> | undefined, uploadId?: string) {
    if (uploadId && uploadedFiles[uploadId] && uploadedFiles[uploadId].length > 0) {
      const files = uploadedFiles[uploadId];
      if (uploadId) {
        setUploadStatus(prev => ({ ...prev, [uploadId]: 'processing' }));
      }
      const isCourseCreationAction = action === 'generate_course' || action === 'create_course';
      if (isCourseCreationAction) {
        if (courseCreationInProgress.current) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'idle' }));
          return;
        }
        courseCreationInProgress.current = true;
        setIsCreatingCourse(true);
        setHomepageMessages((prev) => {
          const next = prev.map((message) => {
            if (!message.uiElements || message.uiElements.length === 0) return message;
            const filtered = message.uiElements.filter((ui) => ui.id !== uploadId);
            if (filtered.length === message.uiElements.length) return message;
            return { ...message, uiElements: filtered };
          });
          if (next.length === 0) {
            next.push({ role: 'assistant', content: '', uiElements: [] });
          } else if (next[next.length - 1].role !== 'assistant') {
            next.push({ role: 'assistant', content: '', uiElements: [] });
          } else if (next[next.length - 1].uiElements?.length) {
            next[next.length - 1] = { ...next[next.length - 1], uiElements: [] };
          }
          return next;
        });
      }
      if (action === 'start_exam_snipe') {
        router.push('/exam-snipe');
        (window as any).__pendingExamFiles = files;
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
      } else if (isCourseCreationAction) {
        const name = params?.name || 'New Course';
        const syllabus = params?.syllabus || '';
        document.dispatchEvent(new CustomEvent('synapse:create-course-with-files', { detail: { files, name, syllabus } }));
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
      }
      setUploadedFiles(prev => {
        if (!prev[uploadId] || prev[uploadId].length === 0) return prev;
        return { ...prev, [uploadId]: [] };
      });
    } else if (action) {
      if (action === 'tutorial_continue') {
        setHomepageMessages(prev => {
          const copy = [...prev];
          const lastIndex = copy.length - 1;
          if (lastIndex >= 0) {
            copy[lastIndex] = { ...copy[lastIndex], uiElements: [] };
          }
          return copy;
        });
        (async () => {
          await playScript(featureScript);
          setIsTutorialActive(false);
          tutorialPlaybackRef.current = false;
        })();
        return;
      }
      if (action === 'generate_course' || action === 'create_course') {
        return;
      }
      executeActions([{ name: action, params: params || {} }]);
    }
  }
  
  // Handle file upload
  function handleFileUpload(uploadId: string, files: File[]) {
    setUploadedFiles(prev => ({ ...prev, [uploadId]: files }));
    setUploadStatus(prev => ({ ...prev, [uploadId]: files.length > 0 ? 'ready' : 'idle' }));
  }

  const readAttachmentAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const addAttachmentsFromFiles = async (files: File[]) => {
    if (homepageSending || isTutorialActive) return;
    if (!files.length) return;
    try {
      const processed = await Promise.all(
        files.map(async (file) => {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          if (file.type.startsWith("image/")) {
            const data = await readAttachmentAsDataUrl(file);
            return {
              id,
              type: "image" as const,
              data,
              name: file.name,
              size: file.size,
              mimeType: file.type,
            };
          }
          // For PDFs, extract text using the API
          const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
          if (isPDF) {
            try {
              const formData = new FormData();
              formData.append("file", file);
              const response = await fetch("/api/extract-pdf", {
                method: "POST",
                body: formData,
              });
              if (response.ok) {
                const result = await response.json();
                if (result.ok && result.text) {
                  return {
                    id,
                    type: "file" as const,
                    name: file.name || "File",
                    size: file.size,
                    extension: extractFileExtension(file.name),
                    content: result.text,
                    mimeType: file.type,
                  };
                }
              }
            } catch (e) {
              console.error("PDF extraction failed:", e);
            }
            // Fallback to base64 if extraction fails
            const data = await readAttachmentAsDataUrl(file);
            return {
              id,
              type: "file" as const,
              name: file.name || "File",
              size: file.size,
              extension: extractFileExtension(file.name),
              data,
              mimeType: file.type,
            };
          }
          
          // For text files, read as text
          const isTextFile = file.type.startsWith("text/") || 
            file.type === "application/json" ||
            file.name.endsWith(".txt") ||
            file.name.endsWith(".md") ||
            file.name.endsWith(".csv") ||
            file.name.endsWith(".json") ||
            file.name.endsWith(".js") ||
            file.name.endsWith(".ts") ||
            file.name.endsWith(".py") ||
            file.name.endsWith(".html") ||
            file.name.endsWith(".css");
          
          if (isTextFile) {
            try {
              const content = await readFileAsText(file);
              return {
                id,
                type: "file" as const,
                name: file.name || "File",
                size: file.size,
                extension: extractFileExtension(file.name),
                content,
                mimeType: file.type,
              };
            } catch (e) {
              // Fallback to base64 if text reading fails
              const data = await readAttachmentAsDataUrl(file);
              return {
                id,
                type: "file" as const,
                name: file.name || "File",
                size: file.size,
                extension: extractFileExtension(file.name),
                data,
                mimeType: file.type,
              };
            }
          }
          // For other binary files, read as base64
          const data = await readAttachmentAsDataUrl(file);
          return {
            id,
            type: "file" as const,
            name: file.name || "File",
            size: file.size,
            extension: extractFileExtension(file.name),
            data,
            mimeType: file.type,
          };
        })
      );
      const validAttachments = processed.filter(Boolean) as ChatAttachment[];
      if (validAttachments.length) {
        setChatAttachments((prev) => [...prev, ...validAttachments]);
        focusChatInput();
      }
    } catch (attachmentError) {
      console.error("Error processing attachments:", attachmentError);
    }
  };

  const handleAttachmentInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length) {
      await addAttachmentsFromFiles(files);
    }
    event.target.value = "";
  };

  const handleAttachmentDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (homepageSending || isTutorialActive) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isAttachmentDragActive) {
      setIsAttachmentDragActive(true);
    }
  };

  const handleAttachmentDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (homepageSending || isTutorialActive) return;
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
    if (homepageSending || isTutorialActive) return;
    event.preventDefault();
    event.stopPropagation();
    setIsAttachmentDragActive(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) {
      await addAttachmentsFromFiles(files);
    }
  };

  const openAttachmentPicker = () => {
    if (homepageSending || isTutorialActive) return;
    attachmentInputRef.current?.click();
  };

  const removeAttachment = (imageId: string) => {
    setChatAttachments((prev) => prev.filter((img) => img.id !== imageId));
  };


  // Function to render text with styled "Synapse" instances
  const renderTextWithSynapse = (text: string) => {
    const parts: React.ReactNode[] = [];
    const regex = /(\b[sS]ynapse\b|\b[Ss]urge\b)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const matchedWord = match[0];
      const lower = matchedWord.toLowerCase();
      const isSynapse = lower === 'synapse';
      const isSurge = lower === 'surge';
      if (isSynapse) {
        parts.push(
          <span
            key={`${match.index}-synapse`}
            className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider font-semibold"
            style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}
          >
            {matchedWord}
          </span>
        );
      } else if (isSurge) {
        parts.push(
          <span
            key={`${match.index}-surge`}
            className="text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-[length:200%_200%] animate-[gradient-shift_2s_linear_infinite]"
            style={{ fontFamily: "'Orbitron', var(--font-rajdhani), sans-serif", letterSpacing: '0.08em' }}
          >
            {matchedWord}
          </span>
        );
      } else {
        parts.push(matchedWord);
      }
      lastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const handleSendMessage = async (messageOverride?: string) => {
    const rawInput = messageOverride ?? inputValue;
    const text = rawInput.trim();
    const isManualSend = !messageOverride;
    const hasAttachments = isManualSend && chatAttachments.length > 0;
    if ((!text && !hasAttachments) || !welcomeText || homepageSending || isTutorialActive) return;
    
    // If this is the first message, add the welcome message as the first assistant message
    const isFirstMessage = homepageMessages.length === 0;
    if (isFirstMessage) {
      setHomepageMessages([{ role: 'assistant', content: welcomeText }]);
    }
    
    // Add user message
    const attachmentsForMessage = hasAttachments ? [...chatAttachments] : [];
    const userMessage: HomepageMessage = {
      role: 'user',
      content: text,
      ...(attachmentsForMessage.length ? { attachments: attachmentsForMessage } : {})
    };
    setHomepageMessages(prev => [...prev, userMessage]);
    if (isManualSend) {
      setInputValue("");
      setChatAttachments([]);
      setShowAttachmentMenu(false);
      setIsAttachmentDragActive(false);
    } else {
      setInputValue("");
    }
    // Reset textarea height
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
    }
    setInputFocused(false);
    setHomepageSending(true);
    setShowThinking(true);
    thinkingRef.current = true;

    if (!hasAttachments && text.toLowerCase() === 'create course') {
      const uploadId = `create-course-${Date.now()}`;
      setHomepageMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "Drop your course files below or type a detailed description of the course and I'll build it for you. If you don't have files, just describe the course and I'll handle the rest.",
          uiElements: [
            {
              type: 'file_upload' as const,
              id: uploadId,
              message: 'Drop your course files here or click to select them.',
              action: 'create_course',
              params: {
                buttonLabel: 'Create Course'
              }
            }
          ]
        }
      ]);
      setHomepageSending(false);
      setShowThinking(false);
      thinkingRef.current = false;
      return;
    }

    try {
      // Get course context
      let courseContext = '';
      try {
        const subjectsRaw = localStorage.getItem('atomicSubjects');
        if (subjectsRaw) {
          const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
          const contextParts: string[] = [];
          for (const subject of subjects) {
            if (subject.slug === 'quicklearn') continue;
            const subjectDataRaw = localStorage.getItem(`atomicSubjectData:${subject.slug}`);
            if (subjectDataRaw) {
              try {
                const subjectData = JSON.parse(subjectDataRaw);
                contextParts.push(`Course: ${subject.name} (slug: ${subject.slug})`);
                if (subjectData.course_context) {
                  contextParts.push(`Description: ${subjectData.course_context.slice(0, 200)}`);
                }
              } catch {}
            }
          }
          courseContext = contextParts.join('\n\n');
        }
      } catch {}

      // Send message to API
      const baseHistory: HomepageMessage[] = homepageMessages.length > 0
        ? homepageMessages
        : [{ role: 'assistant', content: welcomeText }];
      const apiHistory = baseHistory.map((m: HomepageMessage) => ({
        role: m.role,
        content: m.content,
        ...(m.attachments ? { attachments: m.attachments } : {}),
      }));
      apiHistory.push({
        role: userMessage.role,
        content: userMessage.content,
        ...(userMessage.attachments ? { attachments: userMessage.attachments } : {}),
      });

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: courseContext,
          messages: apiHistory,
          path: '/'
        })
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      
      if (reader) {
        // Add assistant message placeholder
        setHomepageMessages(prev => {
          const newMessages = [...prev, { role: 'assistant' as const, content: '', uiElements: [] }];
          return newMessages;
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (thinkingRef.current) {
              setShowThinking(false);
              thinkingRef.current = false;
            }
            // After stream completes, parse final content and execute any remaining actions
            const { cleanedContent, uiElements, actions } = parseUIElementsAndActions(accumulatedContent);
            // Execute any remaining actions - pass the user's message
            if (actions.length > 0) {
              // Check for create_course_from_text action BEFORE executing
              const createCourseAction = actions.find(a => a.name === 'create_course_from_text');
              if (createCourseAction) {
                // Extract the FULL course name from the complete action
                // ONLY use the name parameter - never use description as fallback
                const courseName = createCourseAction.params.name?.trim() || 'New Course';
                const tempSlug = courseName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "subject";
                
                // Make slug unique using current subjects list
                const list = readSubjects();
                let uniqueSlug = tempSlug;
                let n = 1;
                const existingSlugs = new Set(list.map((s) => s.slug));
                while (existingSlugs.has(uniqueSlug)) {
                  n++;
                  uniqueSlug = `${tempSlug}-${n}`;
                }
                
                console.log('🔥 DISPATCHING course-preparing event (AFTER STREAM):', { slug: uniqueSlug, name: courseName });
                
                // Dispatch event AFTER stream completes with the FULL name
                document.dispatchEvent(new CustomEvent('synapse:course-preparing', { 
                  detail: { slug: uniqueSlug, name: courseName } 
                }));
              }
              
              await executeActions(actions, userMessage.content);
              
              // If creating a course, show spinner instead of full response
              const isCreatingCourseAction = actions.some(a => a.name === 'create_course_from_text');
              if (isCreatingCourseAction) {
                setHomepageMessages(prev => {
                  const copy = [...prev];
                  if (copy.length > 0) {
                    copy[copy.length - 1] = { 
                      role: 'assistant', 
                      content: '', 
                      uiElements: [] 
                    };
                  }
                  return copy;
                });
              } else {
                // Update final message normally
                setHomepageMessages(prev => {
                  const copy = [...prev];
                  if (copy.length > 0) {
                    copy[copy.length - 1] = { role: 'assistant', content: cleanedContent, uiElements };
                  }
                  return copy;
                });
              }
            } else {
              // Update final message
              setHomepageMessages(prev => {
                const copy = [...prev];
                if (copy.length > 0) {
                  copy[copy.length - 1] = { role: 'assistant', content: cleanedContent, uiElements };
                }
                return copy;
              });
            }
            
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          chunk.split('\n').forEach((line) => {
            if (!line.startsWith('data: ')) return;
            const payload = line.slice(6);
            if (!payload) return;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === 'text') {
                accumulatedContent += obj.content;
                if (thinkingRef.current) {
                  setShowThinking(false);
                  thinkingRef.current = false;
                }
                
                // Parse UI elements and actions from accumulated content
                // BUT don't execute actions during streaming - wait until stream completes
                const { cleanedContent, uiElements, actions } = parseUIElementsAndActions(accumulatedContent);
                const hasActions = actions.length > 0;
                const isCreatingCourseAction = actions.some(a => a.name === 'create_course_from_text');

                // During streaming, only update UI - don't execute actions yet
                // Actions will be executed when stream completes (at line 1558)
                  if (isCreatingCourseAction) {
                  // Show empty message while creating course
                    setHomepageMessages(prev => {
                      const copy = [...prev];
                      if (copy.length > 0) {
                        copy[copy.length - 1] = { role: 'assistant', content: '', uiElements: [] };
                      }
                      return copy;
                    });
                } else if (!isCreatingCourse) {
                  // Update message content during streaming
                  setHomepageMessages(prev => {
                    const copy = [...prev];
                    if (copy.length > 0) {
                      copy[copy.length - 1] = { role: 'assistant', content: cleanedContent, uiElements };
                    }
                    return copy;
                  });
                }
              }
            } catch {}
          });
        }
      }
    } catch (e: any) {
      setHomepageMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (e?.message || 'Failed to send. Please try again.') }]);
    } finally {
      setHomepageSending(false);
      setShowThinking(false);
      thinkingRef.current = false;
    }
  };

  const isImageAttachment = (attachment: ChatAttachment) => {
    if (attachment.type === "image") return true;
    // Backwards compatibility for older messages that only stored data URLs
    if (
      (attachment as any)?.data &&
      typeof (attachment as any).data === "string" &&
      (attachment as any).data.startsWith("data:image")
    ) {
      return true;
    }
    return false;
  };

  const renderAttachmentPreview = (attachment: ChatAttachment) => {
    if (isImageAttachment(attachment)) {
      const src =
        attachment.type === "image"
          ? attachment.data
          : (attachment as any).data || "";
      return (
        <img
          src={src}
          alt={attachment.name || "Attachment"}
          className="w-full h-full object-cover rounded-lg border border-[var(--foreground)]/15"
        />
      );
    }

    const extension =
      (attachment.type === "file" ? attachment.extension : undefined) ||
      extractFileExtension(attachment.name) ||
      "FILE";
    return (
      <div className="w-full h-full rounded-lg border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 flex flex-col items-center justify-center text-[7px] font-semibold uppercase text-[var(--foreground)]/80">
        <svg
          width="14"
          height="18"
          viewBox="0 0 14 18"
          aria-hidden="true"
          className="text-[var(--foreground)]/50 mb-0.5"
        >
          <path
            d="M2 1c-.552 0-1 .448-1 1v14c0 .552.448 1 1 1h10c.552 0 1-.448 1-1V5.414A2 2 0 0 0 12.414 4L9 0.586A2 2 0 0 0 7.586 0H2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M9 0.75V4.5h3.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <span>{extension.slice(0, 4)}</span>
      </div>
    );
  };

  const renderMessageAttachments = (attachments?: ChatAttachment[]) => {
    if (!attachments?.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="relative inline-block"
            style={{
              width: `${ATTACHMENT_TILE_SIZE}px`,
              height: `${ATTACHMENT_TILE_SIZE}px`,
            }}
            title={
              attachment.name
                ? `${attachment.name}${attachment.size ? ` • ${formatFileSize(attachment.size)}` : ""}`
                : undefined
            }
          >
            {renderAttachmentPreview(attachment)}
          </div>
        ))}
      </div>
    );
  };

  const ChatInputArea = () => {
    const hasInputText = inputValue.trim().length > 0;
    const disabled = homepageSending || isTutorialActive;
    
    // Don't render chat input for free users
    if (!hasPremiumAccess) {
      return null;
    }
    
    return (
      <div className="space-y-2">
        {chatAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chatAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="relative inline-block group"
                style={{
                  width: `${ATTACHMENT_TILE_SIZE}px`,
                  height: `${ATTACHMENT_TILE_SIZE}px`,
                }}
                title={
                  attachment.name
                    ? `${attachment.name}${attachment.size ? ` • ${formatFileSize(attachment.size)}` : ""}`
                    : undefined
                }
              >
                {renderAttachmentPreview(attachment)}
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 shadow-lg"
                  aria-label={`Remove ${attachment.type === "file" ? "file" : "image"}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          className={`chat-input-container flex items-center gap-2 pl-0 pr-2 py-2 border ${
            isAttachmentDragActive ? "border-[var(--accent-cyan)]" : "border-[var(--foreground)]/10"
          } overflow-visible`}
          style={{
            boxShadow: "none",
            borderRadius: "1.5rem",
          }}
          onDragEnter={handleAttachmentDragOver}
          onDragOver={handleAttachmentDragOver}
          onDragLeave={handleAttachmentDragLeave}
          onDrop={handleAttachmentDrop}
        >
          <div className="flex-1 relative min-w-0 flex items-center">
            <div
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-30"
              data-chat-attachment-dropdown
              style={{ pointerEvents: "auto" }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (disabled) return;
                  setShowAttachmentMenu((prev) => !prev);
                }}
                className="chat-attach-button inline-flex items-center justify-center rounded-full bg-transparent text-[var(--foreground)] transition-colors w-8 h-8 focus-visible:outline-none"
                style={{ border: "0", boxShadow: "none" }}
                aria-label="Add attachment"
                title="Add attachment"
                disabled={disabled}
              >
                +
              </button>
              {showAttachmentMenu && !disabled && (
                <div
                  className="absolute left-0 bottom-full mb-2 w-48 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/95 shadow-lg overflow-hidden z-50"
                  data-chat-attachment-dropdown
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
                    Upload attachment
                  </button>
                </div>
              )}
            </div>
            <textarea
              ref={chatInputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (chatInputRef.current) {
                  chatInputRef.current.style.height = "auto";
                  chatInputRef.current.style.height = `${Math.min(
                    chatInputRef.current.scrollHeight,
                    120
                  )}px`;
                }
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!disabled && (inputValue.trim() || chatAttachments.length > 0)) {
                    void handleSendMessage();
                  }
                }
              }}
              onPaste={async (event) => {
                if (disabled) return;
                const files = Array.from(event.clipboardData?.files || []).filter((file) =>
                  file.type.startsWith("image/")
                );
                if (files.length) {
                  event.preventDefault();
                  await addAttachmentsFromFiles(files);
                }
              }}
              placeholder={isTutorialActive ? "Use the tutorial controls above" : "Chat with Chad..."}
              disabled={disabled}
              className="w-full bg-transparent border-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/60 focus:outline-none resize-none overflow-hidden pl-10 pr-4 self-center"
              style={{
                boxShadow: "none",
                minHeight: "1.5rem",
                lineHeight: "1.5rem",
                backgroundColor: "transparent",
                paddingTop: 4,
                paddingBottom: 4,
                transform: "translateY(-2px)",
              }}
              rows={1}
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleToggleRecording}
              disabled={homepageSending || isTutorialActive || isTranscribing}
              aria-pressed={isRecording}
              title={isRecording ? "Stop recording" : "Record voice message"}
              className={`unified-button transition-colors flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--foreground)]/10 ${
                isRecording ? "text-[#FFB347] border-[#FFB347]/60" : ""
              } disabled:opacity-50`}
              style={{ boxShadow: "none" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 15c1.66 0 3-1.34 3-3V7a3 3 0 0 0-6 0v5c0 1.66 1.34 3 3 3z" />
                <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
                <path d="M12 19v3" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (!disabled && (inputValue.trim() || chatAttachments.length > 0)) {
                  void handleSendMessage();
                }
              }}
              disabled={disabled || (!inputValue.trim() && chatAttachments.length === 0)}
              className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--foreground)]/10"
              style={{
                boxShadow: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <input
          ref={attachmentInputRef}
          type="file"
          accept="*/*"
          multiple
          className="hidden"
          onChange={handleAttachmentInputChange}
        />
      </div>
    );
  };

  const appendTranscriptionText = useCallback((text: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    setInputValue((prev) => {
      if (!prev) return trimmed;
      const needsSpace = /\s$/.test(prev) ? '' : ' ';
      return `${prev}${needsSpace}${trimmed}`;
    });
    requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
  }, []);

  const cleanupMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopActiveRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupMediaStream();
    }
  }, [cleanupMediaStream]);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    setVoiceError(null);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice-input.webm');
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Failed to transcribe audio.');
      }
      appendTranscriptionText(String(json.text || '').trim());
    } catch (err: any) {
      setVoiceError(err?.message || 'Voice transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  }, [appendTranscriptionText]);

  const handleToggleRecording = useCallback(async () => {
    if (isTranscribing) return;
    if (isRecording) {
      setIsRecording(false);
      stopActiveRecording();
      return;
    }
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setVoiceError('Voice recording is not available in this environment.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setVoiceError('Microphone recording is not supported in this browser yet.');
      return;
    }
    try {
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        cleanupMediaStream();
        setIsRecording(false);
        const chunks = audioChunksRef.current.splice(0);
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await transcribeAudio(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Microphone access failed', err);
      cleanupMediaStream();
      setIsRecording(false);
      setVoiceError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Unable to access the microphone.'
      );
    }
  }, [cleanupMediaStream, isRecording, isTranscribing, stopActiveRecording, transcribeAudio]);

  useEffect(() => {
    return () => {
      stopActiveRecording();
      cleanupMediaStream();
    };
  }, [cleanupMediaStream, stopActiveRecording]);

  // Don't render until subscription level is loaded to prevent flash
  if (subscriptionLoading) {
    return null;
  }

  // If user does not have premium (Free or unknown), show a focused upgrade screen instead of interactive chat
  if (!hasPremiumAccess) {
    return (
      <div className="mx-auto mb-6 w-full max-w-3xl" style={{ overflowY: 'visible' }}>
        <div className="mt-10 mb-8 flex flex-col items-center text-center gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--foreground)]/90">
            Unlock the full Synapse experience
          </h1>
          <p className="max-w-xl text-xs md:text-sm text-[var(--foreground)]/65">
            Turn your course materials into step‑by‑step lessons, practice questions and exam snipes tailored to your exact syllabus.
          </p>
        </div>

        <div className="relative max-w-2xl mx-auto rounded-3xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 py-5 px-5 md:px-6 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top,_rgba(0,229,255,0.12),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(255,45,150,0.14),_transparent_55%)]" />
          <div className="relative grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/70">
                What you get
              </p>
              <ul className="space-y-2 text-xs text-[var(--foreground)]/70">
                <li className="flex items-start gap-2.5">
                  <span className="mt-[4px] h-2 w-2 rounded-full flex-shrink-0 bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-pink)] shadow-[0_0_4px_rgba(0,229,255,0.4)]" />
                  <span>Unlimited lesson generation that actually follows your course notes and exams.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-[4px] h-2 w-2 rounded-full flex-shrink-0 bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-pink)] shadow-[0_0_4px_rgba(0,229,255,0.4)]" />
                  <span>Unlimited Exam Snipes to find patterns in previous exams so you can focus on the most high value concepts.</span>
                </li>
              </ul>
            </div>
            <div className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/70">
                  Start in under a minute
                </p>
                <p className="text-xs text-[var(--foreground)]/65">
                  Upload a couple of PDFs from your course and let Synapse build your personal learning system around them.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof document !== "undefined") {
                    document.dispatchEvent(new CustomEvent("synapse:open-subscription-upgrade"));
                  }
                }}
                className="upgrade-liquid-btn !text-white inline-flex items-center justify-center rounded-full px-5 py-2 text-xs md:text-sm font-semibold shadow-[0_0_16px_rgba(0,0,0,0.6)] transition-opacity mt-4 md:mt-0"
                style={{ color: '#ffffff', zIndex: 100, position: 'relative' }}
              >
                <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>Upgrade now</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-3xl" style={{ overflowY: 'visible' }}>
      {(aiName || homepageMessages.length > 0) && (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {aiName ? (
            <div className="text-xs text-[var(--foreground)]/60 font-medium">
              {aiName}
            </div>
          ) : <span />}
          {homepageMessages.length > 0 && (
            <button
              onClick={resetHomepageChat}
              className="new-chat-button text-xs font-semibold text-[var(--foreground)]/60 transition-colors"
              style={{ boxShadow: 'none' }}
              aria-label="Start a new chat"
            >
              New chat
            </button>
          )}
        </div>
      )}
      {homepageMessages.length === 0 ? (
        <>
          <div 
            className="chat-bubble-assistant inline-block px-3 py-1.5 rounded-full border border-[var(--foreground)]/10"
          >
            <div className="text-sm text-[var(--foreground)]/90 leading-relaxed">
              {renderTextWithSynapse(welcomeText)}
              {isStreaming && (
                <span className="inline-block w-2 h-2 bg-[var(--foreground)]/60 rounded-full animate-pulse ml-1 align-middle"></span>
              )}
            </div>
          </div>
          {!hasPremiumAccess && (
            <div className="mt-4 w-full max-w-2xl mx-auto">
              <div className="relative overflow-hidden rounded-2xl border border-[var(--foreground)]/15 bg-gradient-to-r from-[var(--background)]/90 via-[var(--background)] to-[var(--background)]/90 px-4 py-3 flex items-center gap-3">
                <div className="absolute inset-y-0 right-0 w-32 opacity-30 pointer-events-none" aria-hidden="true" />
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-[#00E5FF]/20 to-[#FF2D96]/30 border border-[var(--foreground)]/10">
                  <span className="text-xs font-semibold text-[var(--foreground)]/80">PRO</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--foreground)]/80 tracking-wide uppercase">
                    Premium features locked
                  </p>
                  <p className="text-xs text-[var(--foreground)]/65">
                    Unlock Quick Learn, Exam Snipe and more with a Tester or Premium subscription.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof document !== "undefined") {
                      document.dispatchEvent(new CustomEvent("synapse:open-subscription"));
                    }
                  }}
                  className="synapse-style inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-opacity whitespace-nowrap"
                  style={{ zIndex: 100, position: 'relative' }}
                >
                  <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>Unlock premium</span>
                </button>
              </div>
            </div>
          )}
          <div className="mt-3 w-full max-w-2xl mx-auto" style={{ width: '80%', overflowY: 'visible' }}>
            {ChatInputArea()}
            {(voiceError || isRecording || isTranscribing) && (
              <p className={`mt-2 text-[11px] ${voiceError ? 'text-[#FF8A8A]' : 'text-[var(--foreground)]/60'}`}>
                {voiceError
                  ? voiceError
                  : isRecording
                    ? 'Recording… tap the mic to stop.'
                    : 'Transcribing voice...'}
              </p>
            )}
            <div 
              ref={pillsScrollRef1}
              className="mt-2 w-full relative pills-scroll-container" 
              style={{ overflowX: 'auto', overflowY: 'visible', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px' }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                flexWrap: 'nowrap', 
                width: 'max-content',
                position: 'relative'
              }}>
                <button
                  onClick={() => {
                    if (!homepageSending && !isTutorialActive) {
                      handleSendMessage("Create Course");
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="pill-button px-3 py-1 rounded-full border border-[var(--foreground)]/10 text-xs text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Create Course
                </button>
                <button
                  onClick={() => {
                    if (!hasPremiumAccess) {
                      if (typeof document !== "undefined") {
                        document.dispatchEvent(new CustomEvent("synapse:open-subscription"));
                      }
                      return;
                    }
                    if (!homepageSending && !isTutorialActive) {
                      setInputValue("Please create a quick learn on the subject: ");
                      chatInputRef.current?.focus();
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="pill-button px-3 py-1 rounded-full border border-[var(--foreground)]/10 text-xs text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Quick Learn
                  {!hasPremiumAccess && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-[var(--foreground)]/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--foreground)]/60">
                      Pro
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (!hasPremiumAccess) {
                      if (typeof document !== "undefined") {
                        document.dispatchEvent(new CustomEvent("synapse:open-subscription"));
                      }
                      return;
                    }
                    if (!homepageSending && !isTutorialActive) {
                      handleSendMessage("Do an exam snipe please.");
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="pill-button px-3 py-1 rounded-full border border-[var(--foreground)]/10 text-xs text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Exam Snipe
                  {!hasPremiumAccess && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-[var(--foreground)]/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--foreground)]/60">
                      Pro
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (!homepageSending && !isTutorialActive) {
                      handleSendMessage("Help!");
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="pill-button px-3 py-1 rounded-full border border-[var(--foreground)]/10 text-xs text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Help!
                </button>
              </div>
              {/* Fadeout gradients */}
              {pillsScroll1.canScrollLeft && (
                <div className="absolute left-0 top-0 bottom-0 pointer-events-none transition-opacity duration-200" style={{ 
                  background: 'linear-gradient(to right, var(--background), transparent)',
                  width: '8px',
                  zIndex: 10
                }}></div>
              )}
              {pillsScroll1.canScrollRight && (
                <div className="absolute right-0 top-0 bottom-0 pointer-events-none transition-opacity duration-200" style={{ 
                  background: 'linear-gradient(to left, var(--background), transparent)',
                  width: '8px',
                  zIndex: 10
                }}></div>
              )}
            </div>
            </div>
        </>
      ) : (
        <div className="space-y-3">
          {homepageMessages.map((m, i) => {
            // Check if this is the welcome message (first assistant message)
            const isWelcomeMessage = i === 0 && m.role === 'assistant' && m.content === welcomeText;
            
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {m.role === 'user' ? (
                  <div 
                    className="chat-bubble-user max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/10"
                  >
                    {m.content ? (
                      <div className="text-sm text-[var(--foreground)]/90 leading-relaxed">
                        {m.content}
                      </div>
                    ) : null}
                    {renderMessageAttachments(m.attachments)}
                  </div>
                ) : (
                  <div 
                    className="chat-bubble-assistant max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/10"
                  >
                    <div className="text-sm text-[var(--foreground)]/90 leading-relaxed">
                      {isCreatingCourse && i === homepageMessages.length - 1 ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 bg-white/60 rounded-full animate-pulse"></span>
                          Creating course...
                        </div>
                      ) : isWelcomeMessage ? (
                        renderTextWithSynapse(m.content)
                      ) : (
                        <div className="chat-bubble">
                        <LessonBody body={sanitizeLessonBody(String(m.content || ''))} />
                        </div>
                      )}
                    </div>
                    {renderMessageAttachments(m.attachments)}
                    {/* Render UI elements */}
                    {m.uiElements && m.uiElements.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {m.uiElements.map((ui, uiIdx) => {
                          if (ui.type === 'button') {
                            return (
                              <button
                                key={uiIdx}
                                onClick={() => handleButtonClick(ui.action, ui.params)}
                                className="synapse-style inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium !text-white transition-opacity"
                                style={{ color: 'white', zIndex: 100, position: 'relative' }}
                              >
                                <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>{ui.label || 'Button'}</span>
                              </button>
                            );
                          } else if (ui.type === 'file_upload') {
                            const files = uploadedFiles[ui.id] || [];
                            const status = uploadStatus[ui.id] || 'idle';
                            const buttonLabel = ui.params?.buttonLabel || 'Generate';
                            return (
                              <HomepageFileUploadArea
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
                  </div>
                )}
              </div>
            );
          })}
          {showThinking && !isCreatingCourse && (
            <div className="flex justify-start">
              <div className="chat-bubble-assistant inline-block px-3 py-1.5 rounded-full border border-[var(--foreground)]/10">
                <div className="text-sm text-[var(--foreground)]/90 leading-relaxed flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-[var(--foreground)]/60 rounded-full animate-pulse"></span>
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 w-full max-w-2xl mx-auto" style={{ width: '80%', overflowY: 'visible' }}>
            {ChatInputArea()}
            {(voiceError || isRecording || isTranscribing) && (
              <p className={`mt-2 text-[11px] ${voiceError ? 'text-[#FF8A8A]' : 'text-white/60'}`}>
                {voiceError
                  ? voiceError
                  : isRecording
                    ? 'Recording… tap the mic to stop.'
                    : 'Transcribing voice...'}
              </p>
            )}
            <div 
              ref={pillsScrollRef2}
              className="mt-2 w-full relative pills-scroll-container" 
              style={{ overflowX: 'auto', overflowY: 'visible', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px' }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '0.5rem', 
                flexWrap: 'nowrap', 
                width: 'max-content', 
                margin: '0 auto',
                position: 'relative'
              }}>
                <button
                  onClick={() => {
                    if (!homepageSending && !isTutorialActive) {
                      handleSendMessage("Create Course");
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="px-3 py-1 rounded-full bg-[rgba(229,231,235,0.08)] border border-white/5 text-xs text-white/80 hover:text-white hover:bg-[rgba(229,231,235,0.12)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Create Course
                </button>
                <button
                  onClick={() => {
                    if (!homepageSending && !isTutorialActive) {
                      setInputValue("Please create a quick learn on the subject: ");
                      chatInputRef.current?.focus();
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="px-3 py-1 rounded-full bg-[rgba(229,231,235,0.08)] border border-white/5 text-xs text-white/80 hover:text-white hover:bg-[rgba(229,231,235,0.12)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Quick Learn
                </button>
                <button
                  onClick={() => {
                    if (!homepageSending && !isTutorialActive) {
                      handleSendMessage("Do an exam snipe please.");
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="px-3 py-1 rounded-full bg-[rgba(229,231,235,0.08)] border border-white/5 text-xs text-white/80 hover:text-white hover:bg-[rgba(229,231,235,0.12)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Exam Snipe
                </button>
                <button
                  onClick={() => {
                    if (!homepageSending && !isTutorialActive) {
                      handleSendMessage("Help!");
                    }
                  }}
                  disabled={homepageSending || isTutorialActive}
                  className="px-3 py-1 rounded-full bg-[rgba(229,231,235,0.08)] border border-white/5 text-xs text-white/80 hover:text-white hover:bg-[rgba(229,231,235,0.12)] transition-colors disabled:opacity-50"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                >
                  Help!
                </button>
              </div>
              {/* Fadeout gradients */}
              {pillsScroll2.canScrollLeft && (
                <div className="absolute left-0 top-0 bottom-0 pointer-events-none transition-opacity duration-200" style={{ 
                  background: 'linear-gradient(to right, var(--background), transparent)',
                  width: '8px',
                  zIndex: 10
                }}></div>
              )}
              {pillsScroll2.canScrollRight && (
                <div className="absolute right-0 top-0 bottom-0 pointer-events-none transition-opacity duration-200" style={{ 
                  background: 'linear-gradient(to left, var(--background), transparent)',
                  width: '8px',
                  zIndex: 10
                }}></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Home() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [preparingSlug, setPreparingSlug] = useState<string | null>(null);
  const [quickLearnOpen, setQuickLearnOpen] = useState(false);
  const [quickLearnQuery, setQuickLearnQuery] = useState("");
  const [quickLearnLoading, setQuickLearnLoading] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState<string | null>(null);
  const [settingsModalFor, setSettingsModalFor] = useState<string | null>(null);
  const [settingsNameInput, setSettingsNameInput] = useState('');
  const [settingsLanguageInput, setSettingsLanguageInput] = useState('');
  const [settingsUploadLoading, setSettingsUploadLoading] = useState(false);
  const [isIOSStandalone, setIsIOSStandalone] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [examHistory, setExamHistory] = useState<ExamHistoryCard[]>([]);
  const [loadingExamHistory, setLoadingExamHistory] = useState(false);
  const [examMenuOpenFor, setExamMenuOpenFor] = useState<string | null>(null);
  const [examDateUpdateTrigger, setExamDateUpdateTrigger] = useState(0); // Force re-render when exam dates change
  const [, setCourseMetaUpdateTrigger] = useState(0);
  const [surgeButtonHovered, setSurgeButtonHovered] = useState<string | null>(null);
  const [tutorialSignal, setTutorialSignal] = useState(0);
  const settingsFileInputRef = useRef<HTMLInputElement>(null);
  const settingsNameSavedRef = useRef('');
  const [calendarOpenFor, setCalendarOpenFor] = useState<string | null>(null); // slug of course for which calendar is open
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date | null>(null);
  const [calendarCurrentMonth, setCalendarCurrentMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  
  const [examSnipeModalOpen, setExamSnipeModalOpen] = useState(false);
  const [detectedExamFiles, setDetectedExamFiles] = useState<File[]>([]);
  const [examSnipeCourseSlug, setExamSnipeCourseSlug] = useState<string | null>(null);
  
  const [subscriptionLevel, setSubscriptionLevel] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const hasPremiumAccess =
    subscriptionLevel === "Tester" ||
    subscriptionLevel === "Paid" ||
    subscriptionLevel === "mylittlepwettybebe";

  // Listen for onboarding trigger event from DevTools
  useEffect(() => {
    const handleOnboardingTrigger = () => {
      setOnboardingOpen(true);
    };
    window.addEventListener('synapse:onboarding-trigger', handleOnboardingTrigger);
    return () => {
      window.removeEventListener('synapse:onboarding-trigger', handleOnboardingTrigger);
    };
  }, []);

  // Check authentication, subscription and sync subjects from server
  useEffect(() => {
    setSubscriptionLoading(true);
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then(async (data) => {
        const authenticated = !!data?.user;
        setIsAuthenticated(authenticated);
        setCheckingAuth(false);
        if (data?.user?.subscriptionLevel) {
          setSubscriptionLevel(data.user.subscriptionLevel);
        } else {
          setSubscriptionLevel("Free");
        }
        
        // Check if user needs onboarding (first time ever)
        if (authenticated && data?.user) {
          const preferences = (data.user.preferences as any) || {};
          const onboardingCompleted = preferences?.onboardingCompleted === true;
          
          // Show onboarding if they haven't completed it yet
          // For new users, this will be false/null. For existing users who haven't seen it, also show it.
          if (!onboardingCompleted) {
            setOnboardingOpen(true);
          }
        }
        
        // Handle redirect after login (e.g., from share page)
        if (authenticated && typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get("redirect") === "share" && urlParams.get("shareId")) {
            const shareId = urlParams.get("shareId");
            // Redirect to share page to save
            router.push(`/share/${shareId}`);
            return;
          }
        }
        
        // If authenticated, load subjects from server
        if (authenticated) {
          try {
            const subjectsRes = await fetch("/api/subjects", { credentials: "include" });
            const subjectsJson = await subjectsRes.json().catch(() => ({}));
              if (subjectsRes.ok && Array.isArray(subjectsJson?.subjects)) {
              // Filter out quicklearn from homepage
              const filteredSubjects = subjectsJson.subjects.filter((s: Subject) => s.slug !== "quicklearn");
              // Update localStorage with server subjects
              localStorage.setItem("atomicSubjects", JSON.stringify(subjectsJson.subjects));
              setSubjects(filteredSubjects);
              
              // Also sync subject data from server
              // CRITICAL: Merge server data with localStorage, don't overwrite
              // This preserves edited timestamps in SurgeLog
              for (const subject of subjectsJson.subjects) {
                try {
                  const dataRes = await fetch(`/api/subject-data?slug=${encodeURIComponent(subject.slug)}`, { credentials: "include" });
                  const dataJson = await dataRes.json().catch(() => ({}));
                  if (dataRes.ok && dataJson?.data) {
                    const serverData = dataJson.data as StoredSubjectData;
                    const localData = loadSubjectData(subject.slug);
                    
                    // If local surgeLog is explicitly empty (was cleared), use that instead of server
                    // Check if localData exists and surgeLog is explicitly set to empty array (not undefined)
                    const useLocalSurgeLog = localData && localData.surgeLog !== undefined && Array.isArray(localData.surgeLog) && localData.surgeLog.length === 0;
                    
                    // If we have local data, merge intelligently to preserve edited timestamps
                    if (!useLocalSurgeLog && localData?.surgeLog && serverData?.surgeLog) {
                      // Create a map of local surgeLog entries by sessionId to preserve edited timestamps
                      const localSurgeLogMap = new Map<string, any>();
                      localData.surgeLog.forEach((entry: any) => {
                        localSurgeLogMap.set(entry.sessionId, entry);
                      });
                      
                      // Merge: use local timestamps if they exist (may have been edited), otherwise use server
                      const mergedSurgeLog = serverData.surgeLog.map((serverEntry: any) => {
                        const localEntry = localSurgeLogMap.get(serverEntry.sessionId);
                        if (localEntry) {
                          // Preserve local timestamp (may have been edited by user)
                          return {
                            ...serverEntry,
                            timestamp: localEntry.timestamp
                          };
                        }
                        return serverEntry;
                      });
                      
                      // Also add any local entries that don't exist on server
                      localData.surgeLog.forEach((localEntry: any) => {
                        if (!serverData.surgeLog || !serverData.surgeLog.find((e: any) => e.sessionId === localEntry.sessionId)) {
                          mergedSurgeLog.push(localEntry);
                        }
                      });
                      
                      // Use merged surgeLog
                      serverData.surgeLog = mergedSurgeLog;
                    }
                    
                    // Merge other fields: prefer local if it exists and is more recent
                    const mergedData: StoredSubjectData = {
                      ...serverData,
                      ...(localData || {}),
                      surgeLog: useLocalSurgeLog ? [] : (serverData?.surgeLog || localData?.surgeLog || [])
                    };
                    
                    localStorage.setItem(`atomicSubjectData:${subject.slug}`, JSON.stringify(mergedData));
                  }
                } catch {}
              }
            }
          } catch {}
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        setCheckingAuth(false);
        setSubscriptionLevel("Free");
      })
      .finally(() => {
        setSubscriptionLoading(false);
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    setIsIOSStandalone(isIOS && isStandalone);
  }, []);
  const searchParams = useSearchParams();
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    const allSubjects = readSubjects();
    // Filter out quicklearn from homepage
    const filteredSubjects = allSubjects.filter((s) => s.slug !== "quicklearn");
    setSubjects(filteredSubjects);
  }, []);

  // Listen for exam date updates to refresh UI
  useEffect(() => {
    const handleExamDateUpdate = () => {
      // Force re-render by updating trigger state and subjects state
      setExamDateUpdateTrigger(prev => prev + 1);
      const allSubjects = readSubjects();
      const filteredSubjects = allSubjects.filter((s) => s.slug !== "quicklearn");
      setSubjects([...filteredSubjects]);
    };
    window.addEventListener('synapse:exam-date-updated', handleExamDateUpdate);
    return () => {
      window.removeEventListener('synapse:exam-date-updated', handleExamDateUpdate);
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setCourseMetaUpdateTrigger((prev) => prev + 1);
    };
    window.addEventListener('synapse:course-language-updated', handler as EventListener);
    return () => window.removeEventListener('synapse:course-language-updated', handler as EventListener);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpenFor) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
    if (!target.closest('[data-menu-dropdown]') && !target.closest('[data-menu-button]')) {
      setMenuOpenFor(null);
      setExamMenuOpenFor(null);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [menuOpenFor, examMenuOpenFor]);

  useEffect(() => {
    if (searchParams.get("quickLesson") === "1") {
      setQuickLearnQuery("");
      setQuickLearnOpen(true);
    }
  }, [searchParams]);

  // Listen for course creation actions from Chad
  useEffect(() => {
    const handleCreateCourse = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { name, syllabus } = customEvent.detail || {};
      if (name) {
        // NEVER open modal on homepage - homepage should only use create_course_from_text
        // Check if we're on homepage by checking if path is '/'
        const isHomepage = typeof window !== 'undefined' && window.location.pathname === '/';
        if (isHomepage) {
          // On homepage, ignore create_course action - it should use create_course_from_text instead
          console.warn('create_course action ignored on homepage - should use create_course_from_text');
          return;
        }
        setCreateOpen(true);
        // Store the course details to pre-fill the modal
        (window as any).__pendingCourseCreate = { name, syllabus };
      }
    };

    const handleCreateCourseWithFiles = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { files, name, syllabus } = customEvent.detail || {};
      if (files && Array.isArray(files) && files.length > 0) {
        // Store files to be processed when createCourse is available
        (window as any).__pendingCourseFiles = { files, name: name || 'New Course', syllabus: syllabus || '' };
        // Trigger a custom event that will be handled after createCourse is defined
        document.dispatchEvent(new CustomEvent('synapse:process-pending-course-files'));
      }
    };

    const handleCreateCourseWithText = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { name, syllabus, topics } = customEvent.detail || {};
      console.log('📝 handleCreateCourseWithText called:', { name, syllabus, topics });
      
      if (name && syllabus) {
        // DON'T set preparing state here - it's already set by handleCoursePreparing
        // Just store the data and trigger processing
        console.log('💾 Storing pending course data');
        
        // Store course data to be processed when createCourse is available
        (window as any).__pendingCourseFromText = { name, syllabus, topics: topics || [] };
        // Trigger a custom event that will be handled after createCourse is defined
        document.dispatchEvent(new CustomEvent('synapse:process-pending-course-from-text'));
      }
    };

    const handleOpenCourseModal = () => {
      setCreateOpen(true);
    };

    const handleCoursePreparing = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { slug, name } = customEvent.detail || {};
      console.log('🎯 RECEIVED course-preparing event:', { slug, name });
      
      if (slug) {
        console.log('✅ Setting preparingSlug:', slug);
        setPreparingSlug(slug);
        
        // Add a placeholder course to the subjects list immediately
        // This ensures the preparing indicator appears on a visible box
        setSubjects(prev => {
          const filtered = prev.filter(s => s.slug !== slug);
          console.log('➕ Adding placeholder course:', { name, slug });
          return [{
            name: name || 'New Course',
            slug: slug,
            isPlaceholder: true
          } as any, ...filtered];
        });
      }
    };

    document.addEventListener('synapse:create-course', handleCreateCourse as EventListener);
    document.addEventListener('synapse:create-course-with-files', handleCreateCourseWithFiles as EventListener);
    document.addEventListener('synapse:create-course-with-text', handleCreateCourseWithText as EventListener);
    document.addEventListener('synapse:open-course-modal', handleOpenCourseModal);
    document.addEventListener('synapse:course-preparing', handleCoursePreparing as EventListener);
    
    return () => {
      document.removeEventListener('synapse:create-course', handleCreateCourse as EventListener);
      document.removeEventListener('synapse:create-course-with-files', handleCreateCourseWithFiles as EventListener);
      document.removeEventListener('synapse:create-course-with-text', handleCreateCourseWithText as EventListener);
      document.removeEventListener('synapse:open-course-modal', handleOpenCourseModal);
      document.removeEventListener('synapse:course-preparing', handleCoursePreparing as EventListener);
    };
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    if (!isAuthenticated) {
      setExamHistory([]);
      setLoadingExamHistory(false);
      return;
    }

    let cancelled = false;
    setLoadingExamHistory(true);

    (async () => {
      try {
        const res = await fetch("/api/exam-snipe/history", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && Array.isArray(json?.history)) {
          const mapped = (json.history as any[]).map((item) => {
            const slug = typeof item?.slug === "string" ? item.slug : "";
            const courseName =
              typeof item?.courseName === "string" && item.courseName.trim()
                ? item.courseName.trim()
                : typeof item?.results?.courseName === "string" && item.results.courseName.trim()
                  ? item.results.courseName.trim()
                  : "Exam Snipe Course";
            const createdAt = typeof item?.createdAt === "string" ? item.createdAt : new Date().toISOString();
            const fileNames = Array.isArray(item?.fileNames) ? item.fileNames.map((name: any) => String(name)) : [];
            const results = item?.results && typeof item.results === "object" ? item.results : {};
            const idSource = item?.id ?? slug ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
            return {
              id: String(idSource),
              slug,
              courseName,
              createdAt,
              fileNames,
              results,
            } as ExamHistoryCard;
          });
          const filtered = mapped.filter((item) => item.slug);
          filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setExamHistory(filtered.slice(0, 6));
        } else {
          setExamHistory([]);
        }
      } catch {
        if (!cancelled) {
          setExamHistory([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingExamHistory(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkingAuth, isAuthenticated]);

  // Store createCourse function reference (must be before early returns)
  const createCourseRef = useRef<((name: string, syllabus: string, files: File[], preferredLanguage?: string) => Promise<void>) | null>(null);
  
  // Handle pending course files from chat (must be before early returns)
  useEffect(() => {
    const handleProcessPendingFiles = async () => {
      const pending = (window as any).__pendingCourseFiles;
      if (pending && pending.files && Array.isArray(pending.files) && pending.files.length > 0) {
        delete (window as any).__pendingCourseFiles;
        // Use the ref to call createCourse
        if (createCourseRef.current) {
          try {
            await createCourseRef.current(pending.name, pending.syllabus, pending.files);
          } catch (err) {
            console.error('Failed to create course with files:', err);
            alert('Failed to create course. Please try again.');
          }
        }
      }
    };

    const handleProcessPendingCourseFromText = async () => {
      const pending = (window as any).__pendingCourseFromText;
      if (pending && pending.name && pending.syllabus) {
        delete (window as any).__pendingCourseFromText;
        // Use the ref to call createCourse with empty files array
        if (createCourseRef.current) {
          try {
            // Create course with empty files - the syllabus contains the generated course context
            // preparingSlug should already be set by handleCreateCourseWithText
            await createCourseRef.current(pending.name, pending.syllabus, []);
            // If topics were provided, we could potentially use them to pre-populate the course structure
            // For now, the course will be created and topics can be generated later from the context
          } catch (err) {
            console.error('Failed to create course from text:', err);
            setPreparingSlug(null); // Clear preparing state on error
            alert('Failed to create course. Please try again.');
          }
        }
      }
    };

    document.addEventListener('synapse:process-pending-course-files', handleProcessPendingFiles);
    document.addEventListener('synapse:process-pending-course-from-text', handleProcessPendingCourseFromText);
    return () => {
      document.removeEventListener('synapse:process-pending-course-files', handleProcessPendingFiles);
      document.removeEventListener('synapse:process-pending-course-from-text', handleProcessPendingCourseFromText);
    };
  }, []);

  const renameSubject = useCallback(async (slug: string, newName: string) => {
    if (!newName.trim()) return;
    const list = readSubjects();
    const updated = list.map((s) => (s.slug === slug ? { ...s, name: newName } : s));
    localStorage.setItem("atomicSubjects", JSON.stringify(updated));
    setSubjects(updated);

    const data = loadSubjectData(slug) as StoredSubjectData | null;
    if (data) {
      data.subject = newName;
      saveSubjectData(slug, data);
    }

    // Sync to server if authenticated
    try {
      const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
      if (me?.user) {
        await fetch("/api/subjects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ slug, name: newName }),
        }).catch(() => {});
      }
    } catch {}
  }, [setSubjects]);

  const handleSaveCourseLanguage = useCallback((slug: string, language: string) => {
    const changed = updateCourseLanguage(slug, language);
    if (changed) {
      setCourseMetaUpdateTrigger((prev) => prev + 1);
    }
    return changed;
  }, [setCourseMetaUpdateTrigger]);

  async function handleQuickLearn() {
    const trimmedQuery = quickLearnQuery?.trim();
    if (!trimmedQuery || quickLearnLoading) return;
    
    try {
      setQuickLearnLoading(true);

      // Load or create the quicklearn subject
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

      // Ensure nodes object exists
      if (!quickLearnData.nodes) {
        quickLearnData.nodes = {};
      }

      const lessonTitle = trimmedQuery;

      // Create placeholder lesson immediately so it shows up
      quickLearnData.nodes[lessonTitle] = {
        overview: `Quick lesson on: ${trimmedQuery}`,
        symbols: [],
        lessonsMeta: [{ type: "Quick Lesson", title: lessonTitle }],
        lessons: [{
          title: lessonTitle,
          body: "", // Empty initially, will be streamed
          quiz: [],
          metadata: null
        }],
        rawLessonJson: []
      };

      // Save placeholder immediately
      const { saveSubjectDataAsync } = await import("@/utils/storage");
      await saveSubjectDataAsync(quickLearnSlug, quickLearnData);

      // Close modal and navigate immediately
      setQuickLearnOpen(false);
      setQuickLearnQuery("");
      router.push(`/subjects/${quickLearnSlug}/node/${encodeURIComponent(lessonTitle)}`);

      // Start streaming in the background
      const streamRes = await fetch('/api/node-lesson/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Quick Learn',
          topic: trimmedQuery,
        })
      });
      
      if (!streamRes.ok) {
        const errorJson = await streamRes.json().catch(() => ({}));
        throw new Error(errorJson?.error || `Server error (${streamRes.status})`);
      }

      const reader = streamRes.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = "";

      // Stream the lesson body and update as we go
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "text") {
              accumulated += parsed.content;
              
              // Update lesson in real-time as it streams
              const updatedData = loadSubjectData(quickLearnSlug) as StoredSubjectData | null;
              const nodeContent = updatedData?.nodes?.[lessonTitle];
              if (nodeContent && typeof nodeContent === 'object' && !Array.isArray(nodeContent) && nodeContent.lessons && nodeContent.lessons[0]) {
                nodeContent.lessons[0].body = accumulated;
                await saveSubjectDataAsync(quickLearnSlug, updatedData);
                
                // Dispatch event to update the lesson page
                window.dispatchEvent(new CustomEvent('synapse:lesson-streaming', { 
                  detail: { slug: quickLearnSlug, topic: lessonTitle, body: accumulated } 
                }));
              }
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            } else if (parsed.type === "done") {
              // Streaming complete
            }
          } catch (err) {
            if (!(err instanceof SyntaxError)) {
              throw err;
            }
          }
        }
      }

      if (!accumulated.trim()) {
        throw new Error("Lesson generation returned empty content");
      }

      // Generate quiz questions separately
      let quiz: any[] = [];
      try {
        const quizRes = await fetch('/api/quick-learn-general', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmedQuery })
        });
        const quizJson = await quizRes.json().catch(() => ({}));
        if (quizRes.ok && quizJson?.ok && Array.isArray(quizJson.data?.quiz)) {
          quiz = quizJson.data.quiz.map((q: any) => ({
            question: String(q.question || ""),
            answer: q.answer ? String(q.answer) : undefined,
          }));
        }
      } catch (quizErr) {
        console.warn("Failed to generate quiz, continuing without quiz:", quizErr);
      }

      // Final save with complete lesson and quiz
      const finalData = loadSubjectData(quickLearnSlug) as StoredSubjectData | null;
      const finalNodeContent = finalData?.nodes?.[lessonTitle];
      if (finalNodeContent && typeof finalNodeContent === 'object' && !Array.isArray(finalNodeContent) && finalNodeContent.lessons && finalNodeContent.lessons[0]) {
        finalNodeContent.lessons[0].body = accumulated;
        finalNodeContent.lessons[0].quiz = quiz;
        finalNodeContent.rawLessonJson = [JSON.stringify({ title: lessonTitle, body: accumulated, quiz })];
        await saveSubjectDataAsync(quickLearnSlug, finalData);
        
        // Dispatch final update event
        window.dispatchEvent(new CustomEvent('synapse:lesson-complete', { 
          detail: { slug: quickLearnSlug, topic: lessonTitle } 
        }));
      }
    } catch (err: any) {
      alert(err?.message || "Failed to generate quick learn lesson");
    } finally {
      setQuickLearnLoading(false);
    }
  }

  useEffect(() => {
    if (!settingsModalFor) return;
    const trimmed = settingsNameInput.trim();
    if (!trimmed || trimmed === settingsNameSavedRef.current) return;
    const timeout = setTimeout(() => {
      renameSubject(settingsModalFor, trimmed);
      settingsNameSavedRef.current = trimmed;
    }, 600);
    return () => clearTimeout(timeout);
  }, [renameSubject, settingsModalFor, settingsNameInput]);

  const createCourse = async (name: string, syllabus: string, files: File[], preferredLanguage?: string) => {
    let effectiveName = name;
    let contextSource: string | null = null;
    const isTextOnlyCourse = files.length === 0;
    try {
      const slugBase = effectiveName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "subject";
      const list = readSubjects();
      let unique = slugBase; let n = 1; const set = new Set(list.map((s) => s.slug));
      while (set.has(unique)) { n++; unique = `${slugBase}-${n}`; }

      const next = [{ name: effectiveName, slug: unique }, ...list];
      localStorage.setItem("atomicSubjects", JSON.stringify(next));
      setSubjects(prev => {
        if (prev.some(s => s.slug === unique)) {
          return prev;
        }
        return [{ name: effectiveName, slug: unique }, ...prev];
      });
      setPreparingSlug(unique);
      // Persist subject to server if logged in
      try {
        const me = await fetch("/api/me").then(r => r.json().catch(() => ({})));
        if (me?.user) {
          await fetch("/api/subjects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: effectiveName, slug: unique }),
          }).catch(() => {});
        }
      } catch {}

      const storedFiles = files.map((f) => ({ name: f.name, type: f.type }));

      const textParts: string[] = [];
      for (const f of files) {
        const lower = f.name.toLowerCase();
        if (f.type.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
          try {
            const t = await f.text();
            if (t) textParts.push(`--- ${f.name} ---\n${t}`);
          } catch {}
        }
      }
      const combinedText = textParts.join("\n\n");
      
      // For text-only courses (no files), use syllabus as the text source
      const effectiveText = files.length > 0 ? combinedText : syllabus;

      const normalizedCourseLanguage = normalizeLanguageName(preferredLanguage);
      const initData: StoredSubjectData = {
        subject: effectiveName,
        files: storedFiles,
        combinedText: effectiveText,
        tree: null,
        topics: [],
        nodes: {},
        progress: {},
        course_context: syllabus,
        course_language_name: normalizedCourseLanguage || undefined,
        course_language_code: languageNameToCode(normalizedCourseLanguage) || undefined,
        examDates: [],
      };
      saveSubjectData(unique, initData);

      let documents: Array<{ name: string; text: string }> = [];
      try {
        // Upload files one-by-one to avoid exceeding Vercel request size limits
        for (const file of files) {
          const form = new FormData();
          form.append('files', file);
          const res = await fetch('/api/upload-course-files', { method: 'POST', body: form });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json?.ok && Array.isArray(json.docs)) {
            // Append any returned docs (server may return an array even for single file)
            documents.push(...json.docs);
          }
        }
      } catch {}

      try {
        const summaryRes = await fetch('/api/course-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: effectiveName,
            syllabus,
            text: effectiveText,
            documents,
            preferredLanguage: preferredLanguage || undefined,
          }),
        });
        if (summaryRes.ok) {
          const json = await summaryRes.json().catch(() => ({}));
          if (json?.ok && json.course_context) {
            const data = loadSubjectData(unique) as StoredSubjectData | null;
            if (data) {
              data.course_context = json.course_context;
              saveSubjectData(unique, data);
            }
            contextSource = json.course_context;
          }
        }
      } catch {}

      if (!contextSource) {
        const latestData = loadSubjectData(unique) as StoredSubjectData | null;
        contextSource = latestData?.course_context || effectiveText;
      }

      try {
        // For text-only courses, always run detection so the name matches the actual subject
        const hasMeaningfulSyllabus = typeof syllabus === 'string' && syllabus.trim().length > 0;
        const shouldRename =
          (isTextOnlyCourse && hasMeaningfulSyllabus) ||
          effectiveName === 'New Course' ||
          effectiveName.length < 3;
        
        if (shouldRename) {
          let renameRes: Response | null = null;
          
          // Build context for name detection - prefer processed documents, then context source, then raw text
          let nameDetectionContext = '';
          
          if (documents.length > 0) {
            // Use processed documents (includes PDFs that have been extracted)
            nameDetectionContext = documents.map(doc => `--- ${doc.name} ---\n${doc.text}`).join('\n\n');
          } else if (contextSource) {
            // Use course context if available
            nameDetectionContext = contextSource;
          } else if (effectiveText) {
            // Fall back to raw text from files
            nameDetectionContext = effectiveText;
          }
          
          if (nameDetectionContext.trim()) {
            renameRes = await fetch('/api/course-detect-name', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                context: nameDetectionContext,
                fallbackTitle: hasMeaningfulSyllabus ? syllabus : (files.length > 0 ? files.map(f => f.name).join(', ') : effectiveName),
                preferredLanguage: preferredLanguage || undefined
              }),
            });
          }
          
          if (renameRes?.ok) {
            const renameJson = await renameRes.json().catch(() => ({}));
            if (renameJson?.ok && renameJson.name && renameJson.name !== effectiveName) {
              effectiveName = renameJson.name;
              
              // Generate new slug from the detected course name
              const newSlugBase = effectiveName.toLowerCase().trim()
                .replace(/[^a-z0-9\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-") || "course";
              
              // Check if we need to update the slug (only if it's a generic one)
              // slugBase was calculated from the original effectiveName at line 3761
              const isGenericSlug = unique === "subject" || unique === "course" || 
                                   unique.startsWith("new-") || unique === "new-course" ||
                                   (unique === slugBase && (slugBase === "subject" || slugBase === "course" || slugBase.startsWith("new-")));
              
              if (isGenericSlug && newSlugBase && newSlugBase !== "course" && newSlugBase !== "subject") {
                // Generate unique slug from the new name
                const list = readSubjects();
                let newUnique = newSlugBase;
                let n = 1;
                const set = new Set(list.map((s) => s.slug).filter(s => s !== unique)); // Exclude current slug
                while (set.has(newUnique)) {
                  n++;
                  newUnique = `${newSlugBase}-${n}`;
                }
                
                // Update slug in localStorage
                const updatedList = list.map((s) => 
                  s.slug === unique ? { ...s, name: effectiveName, slug: newUnique } : s
                );
                localStorage.setItem("atomicSubjects", JSON.stringify(updatedList));
                setSubjects(updatedList);
                
                // Update course data with new slug
                const oldData = loadSubjectData(unique) as StoredSubjectData | null;
                if (oldData) {
                  oldData.subject = effectiveName;
                  saveSubjectData(newUnique, oldData);
                  // Remove old data
                  localStorage.removeItem(`atomicSubjectData_${unique}`);
                }
                
                // Update on server if logged in
                try {
                  const me = await fetch("/api/me").then(r => r.json().catch(() => ({})));
                  if (me?.user) {
                    // Update subject on server
                    await fetch("/api/subjects", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ oldSlug: unique, newSlug: newUnique, name: effectiveName }),
                    }).catch(() => {});
                  }
                } catch {}
                
                // Update unique to the new slug
                unique = newUnique;
                console.log(`Updated course slug from ${unique} to ${newUnique} based on detected name: ${effectiveName}`);
              } else {
                // Just update the name, keep the slug
                renameSubject(unique, effectiveName);
              }
            }
          }
        }
      } catch {}

      // Remove preparing only after naming step is complete
      setPreparingSlug(null);
      
      // Remove placeholder if it exists and replace with real course
      setSubjects(prev => {
        // Remove placeholder with the same slug
        const withoutPlaceholder = prev.filter(s => s.slug !== unique || !(s as any).isPlaceholder);
        // Check if the course already exists (not a placeholder)
        if (withoutPlaceholder.some(s => s.slug === unique)) {
          return withoutPlaceholder;
        }
        // Add the real course
        return [{ name: effectiveName, slug: unique }, ...withoutPlaceholder];
      });
      
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('synapse:course-created', {
          detail: { name: effectiveName, slug: unique }
        }));
      }

      // Kick off quick summary in the background (non-blocking)
      (async () => {
        try {
          const data = loadSubjectData(unique) as StoredSubjectData | null;
          const quickContext = data?.course_context || contextSource || effectiveText;
          if (!quickContext) return;
          const quickRes = await fetch('/api/course-quick-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: quickContext, preferredLanguage: preferredLanguage || undefined }),
          });
          if (!quickRes.ok) return;
          const quickJson = await quickRes.json().catch(() => ({}));
          if (quickJson?.ok && quickJson.summary) {
            const updated = loadSubjectData(unique) as StoredSubjectData | null;
            if (updated) {
              updated.course_quick_summary = quickJson.summary;
              saveSubjectData(unique, updated);
            }
          }
        } catch {}
      })();

      // Auto-detect and process exam files using AI
      (async () => {
        try {
          if (files.length === 0) return;

          console.log(`Analyzing ${files.length} file(s) to detect exams...`);
          
          // Extract first 2000 characters from each file for AI analysis
          const fileSnippets: Array<{ name: string; preview: string }> = [];
          for (const file of files) {
            try {
              const lower = file.name.toLowerCase();
              let preview = '';
              
              if (lower.endsWith('.pdf') || lower.endsWith('.docx')) {
                // For PDFs and DOCX, use server-side extraction
                const form = new FormData();
                form.append('files', file);
                const res = await fetch('/api/upload-course-files', { method: 'POST', body: form });
                const json = await res.json().catch(() => ({}));
                if (res.ok && json?.ok && Array.isArray(json.docs) && json.docs.length > 0) {
                  preview = json.docs[0].text || '';
                }
              } else if (file.type.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md')) {
                preview = await file.text();
              }
              
              // Take first 2000 characters
              if (preview) {
                preview = preview.slice(0, 2000).trim();
                if (preview.length > 50) {
                  fileSnippets.push({ name: file.name, preview });
                }
              }
            } catch (err) {
              console.warn(`Failed to extract preview from ${file.name}:`, err);
            }
          }

          if (fileSnippets.length === 0) return;

          // Use AI to detect which files are exams (keepalive so it continues after navigation)
          const detectRes = await fetch('/api/detect-exam-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileSnippets }),
            keepalive: true,
          });

          if (!detectRes.ok) {
            console.warn('Failed to detect exam files');
            return;
          }

          const detectJson = await detectRes.json().catch(() => ({}));
          if (!detectJson?.ok || !Array.isArray(detectJson.examFiles)) {
            return;
          }

          const examFileNames = new Set(detectJson.examFiles.map((name: string) => name));
          const examFiles = files.filter(file => examFileNames.has(file.name));

          if (examFiles.length === 0) {
            console.log('No exam files detected');
            // Hide the spinner
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('synapse:no-exam-snipe', {
                detail: { subjectSlug: unique, courseName: effectiveName }
              }));
            }
            return;
          }

          console.log(`AI detected ${examFiles.length} exam file(s), showing modal to user...`);
          
          // Show modal asking user if they want to run exam snipe
          setDetectedExamFiles(examFiles);
          setExamSnipeCourseSlug(unique);
          setExamSnipeModalOpen(true);
          
          // Hide the checking spinner since we're showing modal instead
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('synapse:no-exam-snipe', {
              detail: { subjectSlug: unique, courseName: effectiveName }
            }));
          }
        } catch (err) {
          console.warn('Failed to auto-create exam snipe:', err);
          // Don't throw - this is a background process
        }
      })();
    } catch (error) {
      setPreparingSlug(null);
      
      // Remove placeholder on error
      setSubjects(prev => prev.filter(s => !(s as any).isPlaceholder));
      
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('synapse:course-created', {
          detail: { error: true }
        }));
      }
      throw error;
    }
  };

  const handleAddFilesToCourse = async (slug: string, files: File[]) => {
    if (!slug || files.length === 0) return;
    setSettingsUploadLoading(true);
    try {
      let data = loadSubjectData(slug) as StoredSubjectData | null;
      if (!data) {
        data = {
          subject: subjects.find((s) => s.slug === slug)?.name || 'New Course',
          files: [],
          combinedText: '',
          tree: null,
          topics: [],
          nodes: {},
          progress: {},
          examDates: [],
        };
      }

      const newFileMeta = files.map((file) => ({ name: file.name, type: file.type }));
      data.files = [...(data.files || []), ...newFileMeta];

      const textParts: string[] = [];
      for (const file of files) {
        try {
          const lower = file.name.toLowerCase();
          if (file.type.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
            const t = await file.text();
            if (t) textParts.push(`--- ${file.name} ---\n${t}`);
          } else {
            // For unsupported binary formats (pdf/doc/etc) we keep metadata only.
            // Users can upload these via Chad's main course creation flow which handles processing server-side.
            continue;
          }
        } catch {}
      }

      if (textParts.length > 0) {
        const combined = textParts.join('\n\n');
        data.combinedText = data.combinedText ? `${data.combinedText}\n\n${combined}` : combined;
      }

      saveSubjectData(slug, data);
    } finally {
      setSettingsUploadLoading(false);
    }
  };

  // Update the ref and window property with createCourse function (runs after createCourse is defined)
  useEffect(() => {
    createCourseRef.current = createCourse;
    if (typeof window !== "undefined") {
      (window as any).__createCourseFn = createCourse;
    }
  }, [createCourse]);

  const createCourseFromFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setIsDragging(false);
    try {
      // Create with a neutral placeholder; final name will be set after AI summary
      await createCourse('New Course', "", files);
    } catch (err) {
      console.error('Failed to auto-create course', err);
    }
  };

  const renameSnipedExam = async (slug: string, currentName: string) => {
    const next = window.prompt("Rename exam", currentName)?.trim();
    if (!next || next === currentName) return;
    try {
      const res = await fetch("/api/exam-snipe/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug, courseName: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to rename exam (${res.status})`);
      setExamHistory((prev) =>
        prev.map((item) =>
          item.slug === slug
            ? {
                ...item,
                courseName: next,
                results:
                  item.results && typeof item.results === "object"
                    ? { ...item.results, courseName: next }
                    : item.results,
              }
            : item
        )
      );
    } catch (err: any) {
      alert(err?.message || "Failed to rename exam");
    } finally {
      setExamMenuOpenFor(null);
    }
  };

  const deleteSnipedExam = async (slug: string) => {
    const ok = window.confirm("Delete this exam analysis?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/exam-snipe/history?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to delete exam (${res.status})`);
      setExamHistory((prev) => prev.filter((item) => item.slug !== slug));
    } catch (err: any) {
      alert(err?.message || "Failed to delete exam");
    } finally {
      setExamMenuOpenFor(null);
    }
  };

  const exportSnipedExam = (record: ExamHistoryCard) => {
    try {
      const payload = {
        courseName: record.courseName,
        slug: record.slug,
        createdAt: record.createdAt,
        fileNames: record.fileNames,
        results: record.results,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName =
        record.slug ||
        record.courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
        "exam-snipe";
      a.href = url;
      a.download = `${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export exam data");
    } finally {
      setExamMenuOpenFor(null);
    }
  };

  // Show login page if not authenticated
  // Don't show spinner while checking auth - let Shell's LoadingScreen handle it
  if (checkingAuth) {
    return null; // Return null to let Shell render and show LoadingScreen
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <>
      <OnboardingModal
        open={onboardingOpen}
        onComplete={async (userType) => {
          try {
            const res = await fetch("/api/user/onboarding", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ userType }),
            });
            const data = await res.json();
            if (data.ok) {
              setOnboardingOpen(false);
            } else {
              console.error("Failed to save onboarding:", data.error);
              // Still close the modal even if save fails
              setOnboardingOpen(false);
            }
          } catch (err) {
            console.error("Error saving onboarding:", err);
            // Still close the modal even if save fails
            setOnboardingOpen(false);
          }
        }}
      />
      <div 
        className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] px-6 pt-10 pb-4 relative"
        style={{
          ...(onboardingOpen ? { display: 'none' } : {}),
          backgroundImage: 'url(/spinner.png)',
          backgroundSize: '800px 800px',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }}
      >
      {/* Background overlay to make content readable */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: 'var(--background)',
          opacity: 0.95,
          zIndex: 0,
        }}
      />
      <div className="relative z-10">
        {subscriptionLoading ? null : (
          <>
            <WelcomeMessage 
            tutorialSignal={tutorialSignal}
            setTutorialSignal={setTutorialSignal}
            onQuickLearn={(query) => {
              setQuickLearnQuery(query);
              handleQuickLearn();
            }}
          />
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">Your subjects</h1>
          {!hasPremiumAccess && (
            <span className="text-[11px] font-medium text-[var(--foreground)]/40">
              Upgrade to access
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.filter((s) => s.slug !== "quicklearn").map((s) => {
          const lightningGradientId = `surgeLightningGradient-${s.slug}`;
          return (
          <div
            key={s.slug}
            className={`course-box relative rounded-2xl border border-[var(--foreground)]/10 p-5 text-[var(--foreground)] transition-all duration-200 flex flex-col ${
              !hasPremiumAccess
                ? 'cursor-not-allowed opacity-40'
                : preparingSlug === s.slug
                  ? 'cursor-not-allowed opacity-75'
                  : 'cursor-pointer'
            }`}
            style={{ 
              boxShadow: 'none',
            }}
            onMouseEnter={(e) => {
              if (preparingSlug !== s.slug && surgeButtonHovered !== s.slug) {
                e.currentTarget.classList.add('hover');
              }
            }}
            onMouseLeave={(e) => {
              if (preparingSlug !== s.slug && surgeButtonHovered !== s.slug) {
                e.currentTarget.classList.remove('hover');
              }
            }}
            role="link"
            tabIndex={!hasPremiumAccess || preparingSlug === s.slug ? -1 : 0}
            onClick={
              !hasPremiumAccess
                ? () => {
                    if (typeof document !== "undefined") {
                      document.dispatchEvent(new CustomEvent("synapse:open-subscription-upgrade"));
                    }
                  }
                : preparingSlug === s.slug
                  ? undefined
                  : () => router.push(`/subjects/${s.slug}`)
            }
            onKeyDown={
              !hasPremiumAccess || preparingSlug === s.slug
                ? undefined
                : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/subjects/${s.slug}`);
                    }
                  }
            }
          >
            <div className="relative flex flex-col h-full">
              <div className="flex-1 min-w-0">
                {(() => {
                  // Use sharedByUsername from the subject data (not parsed from name)
                  const sharedBy = (s as any).sharedByUsername;
                  
                  return (
                    <div>
                      <div className="text-sm font-semibold leading-snug truncate">{s.name}</div>
                      {sharedBy && (
                        <div className="text-xs text-[var(--foreground)]/50 mt-0.5 truncate">
                          Shared by {sharedBy}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  // Use examDateUpdateTrigger to force re-render when metadata changes
                  const _ = examDateUpdateTrigger;
                  const data = loadSubjectData(s.slug);
                  const topicCount = data?.topics?.length || 0;
                  const daysLeft = getDaysUntilNextExam(data?.examDates);
                  const hasExamDate = data?.examDates && data.examDates.length > 0;
                  return (
                    <>
                      <div className="mt-1">
                        {hasExamDate && daysLeft !== null ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const examDate = data?.examDates?.[0]?.date;
                              if (examDate) {
                                const date = new Date(examDate);
                                setCalendarSelectedDate(date);
                                setCalendarCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                              } else {
                                const today = new Date();
                                setCalendarCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                              }
                              setCalendarOpenFor(s.slug);
                            }}
                            className="date-button inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide text-[var(--foreground)] bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] border border-[var(--foreground)]/20 backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:border-[var(--foreground)]/30 transition-all"
                          >
                            <span className="inline-block w-1 h-1 rounded-full bg-[var(--foreground)]/60 animate-pulse" />
                            {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCalendarSelectedDate(null);
                              const today = new Date();
                              setCalendarCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                              setCalendarOpenFor(s.slug);
                            }}
                            className="date-button inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide text-white/70 border border-white/10 hover:text-white hover:border-white/30 transition-all"
                          >
                            <span className="inline-block w-1 h-1 rounded-full bg-white/50" />
                            Set Date
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="mt-auto pt-3 flex w-full items-center gap-3">
                {(() => {
                  const _ = examDateUpdateTrigger;
                  const data = loadSubjectData(s.slug);
                  const topicCount = data?.topics?.length || 0;
                  return (
                    <>
                      <div className="text-xs text-[var(--foreground)]/20">
                        {topicCount} topic{topicCount === 1 ? "" : "s"}
                      </div>
                      {/* Surge button at bottom right - only show for premium users */}
                      {hasPremiumAccess && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (preparingSlug === s.slug) return;
                            router.push(`/subjects/${s.slug}/surge`);
                          }}
                          onMouseEnter={(e) => {
                            e.stopPropagation();
                            if (preparingSlug === s.slug) return;
                            setSurgeButtonHovered(s.slug);
                          }}
                          onMouseLeave={(e) => {
                            e.stopPropagation();
                            setSurgeButtonHovered(null);
                          }}
                          disabled={preparingSlug === s.slug}
                          className={`ml-auto inline-flex h-7 items-center justify-center rounded-full px-3 text-[10px] font-medium whitespace-nowrap synapse-style !text-white ${
                            preparingSlug === s.slug
                              ? 'opacity-40 cursor-not-allowed'
                              : 'cursor-pointer hover:scale-[1.03]'
                          }`}
                          style={{ zIndex: 100, position: 'relative' }}
                          aria-label="Start Surge"
                          title="Start Synapse Surge"
                        >
                          <span
                            style={{
                              color: '#ffffff',
                              position: 'relative',
                              zIndex: 101,
                              opacity: 1,
                              textShadow: 'none',
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Surge
                          </span>
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="absolute right-0 top-0 flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenFor((cur) => (cur === s.slug ? null : s.slug)); }}
                  disabled={preparingSlug === s.slug}
                  data-menu-button
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors !shadow-none ${
                    preparingSlug === s.slug
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                  }`}
                  aria-label="More actions"
                  title="More actions"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="5" cy="12" r="2" fill="currentColor" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                    <circle cx="19" cy="12" r="2" fill="currentColor" />
                  </svg>
                </button>
              </div>
              </div>
            
            {preparingSlug === s.slug && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm rounded-2xl z-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[var(--background)]/95 px-3 py-1 text-[12px] text-[var(--foreground)] shadow-lg">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/40" /> Preparing…
                </div>
              </div>
            )}
            {menuOpenFor === s.slug && (
              <div data-menu-dropdown className="absolute right-4 top-14 z-50 w-40 rounded-xl border border-white/10 bg-[var(--background)]/95 backdrop-blur-md shadow-lg p-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = window.confirm("Delete this subject and all saved data?");
                    if (!ok) return;
                    
                    // Delete from server if authenticated
                    try {
                      const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
                      if (me?.user) {
                        await fetch(`/api/subjects?slug=${encodeURIComponent(s.slug)}`, {
                          method: "DELETE",
                          credentials: "include",
                        }).catch(() => {});
                      }
                    } catch {}
                    
                    // Delete from local storage
                    const next = subjects.filter((t) => t.slug !== s.slug);
                    localStorage.setItem("atomicSubjects", JSON.stringify(next));
                    try { localStorage.removeItem("atomicSubjectData:" + s.slug); } catch {}
                    try { localStorage.removeItem("atomicPracticeLog:" + s.slug); } catch {}
                    setSubjects(next);
                    setMenuOpenFor(null);
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[#FFC0DA] hover:bg-[#FF2D96]/20 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenFor(null);
                    setSettingsModalFor(s.slug);
                    setSettingsNameInput(s.name);
                    settingsNameSavedRef.current = s.name;
                    const data = loadSubjectData(s.slug);
                    const languageValue = normalizeLanguageName(data?.course_language_name || data?.course_language_code || '');
                    setSettingsLanguageInput(languageValue);
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                >
                  Settings
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenFor(null);
                    setInfoModalOpen(s.slug);
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                >
                  Info
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMenuOpenFor(null);
                    try {
                      const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
                      if (!me?.user) {
                        alert("Please log in to share courses");
                        return;
                      }
                      const response = await fetch("/api/courses/share", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ slug: s.slug }),
                      });
                      const result = await response.json();
                      if (result.ok && result.shareUrl) {
                        setShareUrl(result.shareUrl);
                        setShareModalOpen(true);
                        setCopiedToClipboard(false);
                      } else {
                        alert("Failed to create share link: " + (result.error || "Unknown error"));
                      }
                    } catch (err) {
                      console.error("Error sharing course:", err);
                      alert("Failed to create share link");
                    }
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                >
                  Share
                </button>
              </div>
            )}
          </div>
        );})}
        {hasPremiumAccess && (
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer?.files || []);
              createCourseFromFiles(files);
            }}
            className={`drop-files-area relative rounded-2xl border border-dashed p-6 text-center text-sm transition-all duration-200 min-h-[80px] flex flex-col items-center justify-center gap-2 ${
              isDragging
                ? 'border-[var(--foreground)]/40 shadow-[0_4px_12px_rgba(0,0,0,0.8)] dragging'
                : 'border-[var(--foreground)]/20 hover:border-[var(--foreground)]/30'
            }`}
            style={{
              boxShadow: 'none',
            }}
          >
            <span className="text-[var(--foreground)]/70">Drop files here to auto-create a course</span>
            <span className="text-xs text-[var(--foreground)]/50">We'll scan the files and name it for you</span>
          </div>
        )}
        {/* Quick Learn lessons link - subtle */}
        {hasPremiumAccess && (
          <div
            onClick={() => router.push('/quicklearn')}
            className="relative rounded-xl border border-[var(--foreground)]/5 bg-[var(--background)]/30 p-4 text-[var(--foreground)]/70 transition-all duration-200 cursor-pointer hover:border-[var(--foreground)]/10 hover:bg-[var(--background)]/40 hover:text-[var(--foreground)]/90"
            style={{ 
              boxShadow: 'none',
            }}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push('/quicklearn');
              }
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]/50">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-xs font-medium">Quick Learn</span>
              </div>
              <span className="text-[10px] text-[var(--foreground)]/40">
                {(() => {
                  const quickLearnData = loadSubjectData('quicklearn');
                  const nodeCount = quickLearnData?.nodes ? Object.keys(quickLearnData.nodes).length : 0;
                  return nodeCount > 0 ? `${nodeCount}` : '';
                })()}
              </span>
            </div>
          </div>
        )}
        {subjects.length === 0 && null}
      </div>
          </>
        )}

      {/* Sniped exams section removed per user request */}

      <CourseCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, syllabus, files, preferredLanguage) => {
          (async () => {
            setCreateOpen(false);
            await createCourse(name, syllabus, files, preferredLanguage);
          })();
        }}
      />

      {/* Share Modal */}
      <Modal
        open={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setCopiedToClipboard(false);
        }}
        title="Share Course"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopiedToClipboard(true);
                  setTimeout(() => setCopiedToClipboard(false), 2000);
                } catch (err) {
                  console.error("Failed to copy:", err);
                }
              }}
              className="px-4 py-2 rounded-lg bg-[var(--foreground)]/10 text-[var(--foreground)] hover:bg-[var(--foreground)]/20 transition-colors"
            >
              {copiedToClipboard ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => {
                setShareModalOpen(false);
                setCopiedToClipboard(false);
              }}
              className="px-4 py-2 rounded-lg border border-[var(--foreground)]/20 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--foreground)]/70">
            Share this link with others to let them save this course:
          </p>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--foreground)]/5 border border-[var(--foreground)]/10">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>
        </div>
      </Modal>
      
      {/* Exam Snipe Detection Modal */}
      <Modal
        open={examSnipeModalOpen}
        onClose={() => {
          setExamSnipeModalOpen(false);
          setDetectedExamFiles([]);
          setExamSnipeCourseSlug(null);
        }}
        title="Exam Files Detected"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setExamSnipeModalOpen(false);
                setDetectedExamFiles([]);
                setExamSnipeCourseSlug(null);
              }}
              className="synapse-style inline-flex h-10 items-center rounded-full px-6 text-sm font-medium disabled:opacity-60 transition-opacity"
              style={{ 
                background: 'rgba(128, 128, 128, 0.2)',
                backgroundColor: 'rgba(128, 128, 128, 0.2)',
                color: 'var(--foreground)',
                zIndex: 100, 
                position: 'relative' 
              }}
            >
              <span style={{ color: 'var(--foreground)', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                No
              </span>
            </button>
            <button
              onClick={() => {
                // Navigate to exam snipe page with the detected files
                if (detectedExamFiles.length > 0) {
                  (window as any).__pendingExamFiles = detectedExamFiles;
                  router.push('/exam-snipe');
                }
                setExamSnipeModalOpen(false);
                setDetectedExamFiles([]);
                setExamSnipeCourseSlug(null);
              }}
              className="synapse-style inline-flex h-10 items-center rounded-full px-6 text-sm font-medium text-white disabled:opacity-60 transition-opacity"
              style={{ color: 'white', zIndex: 100, position: 'relative' }}
            >
              <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                Yes
              </span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[var(--foreground)]">
            I detected some past exams in the files. Do you want me to run an exam snipe?
          </p>
          <p className="text-sm text-[var(--foreground)]/70">
            <span className="font-semibold">Recommended</span> - This will analyze the exams and create targeted study materials.
          </p>
          <div className="text-xs text-[var(--foreground)]/60">
            <p className="mb-2">Detected {detectedExamFiles.length} exam file{detectedExamFiles.length !== 1 ? 's' : ''}:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              {detectedExamFiles.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>

      {/* Quick Lesson Modal */}
      {quickLearnOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setInfoModalOpen(null)}
        >
          <div 
            className={isIOSStandalone ? "relative w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-6" : "relative w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md p-6"}
            onClick={(e) => e.stopPropagation()}
          >
            {quickLearnLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[var(--background)]/95 backdrop-blur-md">
                <GlowSpinner size={120} ariaLabel="Generating quick lesson" idSuffix="home-quicklesson" />
                <div className="text-sm font-medium text-[var(--foreground)]/80">Generating lesson…</div>
              </div>
            )}
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Quick Lesson</h3>
            <div className="mb-4">
              <label className="mb-2 block text-xs text-[var(--foreground)]/70">What do you want to learn?</label>
              <textarea
                value={quickLearnQuery}
                onChange={(e) => { if (!e.target) return; setQuickLearnQuery(e.target.value); }}
                onTouchStart={(e) => {
                  // Ensure focus works on iOS PWA
                  e.currentTarget.focus();
                }}
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--foreground)]/40 focus:outline-none resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
                placeholder="e.g. How does machine learning work? Or paste a question from your textbook..."
                rows={4}
                tabIndex={0}
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  WebkitUserSelect: 'text',
                  WebkitTouchCallout: 'none',
                  WebkitAppearance: 'none',
                  touchAction: 'manipulation'
                }}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setQuickLearnOpen(false); router.replace('/'); }}
                className="rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/60"
                disabled={quickLearnLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleQuickLearn}
                disabled={!quickLearnQuery.trim() || quickLearnLoading}
                className="synapse-style inline-flex h-10 items-center rounded-full px-6 text-sm font-medium text-white disabled:opacity-60 transition-opacity"
                style={{ color: 'white', zIndex: 100, position: 'relative' }}
              >
                <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                  {quickLearnLoading ? "Generating..." : "Generate Lesson"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Date Picker Modal */}
      {calendarOpenFor && (() => {
        const slug = calendarOpenFor;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const selectedDate = calendarSelectedDate || today;
        
        const year = calendarCurrentMonth.getFullYear();
        const month = calendarCurrentMonth.getMonth();
        
        // Get first day of month and number of days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Generate calendar days
        const days: (Date | null)[] = [];
        // Add empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
          days.push(null);
        }
        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
          days.push(new Date(year, month, day));
        }
        
        const handleDateSelect = (date: Date) => {
          if (date < today) return; // Don't allow past dates
          
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const isoDate = `${year}-${month}-${day}`;
          
          try {
            const data = loadSubjectData(slug);
            if (data) {
              data.examDates = [{ date: isoDate, name: undefined }];
              saveSubjectData(slug, data);
              window.dispatchEvent(new CustomEvent("synapse:exam-date-updated", { detail: { slug } }));
              setExamDateUpdateTrigger(prev => prev + 1);
              setCalendarOpenFor(null);
              setCalendarSelectedDate(null);
            }
          } catch (err) {
            console.error("Failed to set exam date:", err);
          }
        };
        
        const navigateMonth = (direction: number) => {
          setCalendarCurrentMonth(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + direction);
            // Don't allow going before current month
            const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            if (newDate < todayMonth) {
              return todayMonth;
            }
            return newDate;
          });
        };
        
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => {
              setCalendarOpenFor(null);
              setCalendarSelectedDate(null);
            }}
          >
            <div
              className="rounded-2xl border border-[var(--foreground)]/20 p-6 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
              style={{ 
                boxShadow: 'none',
                backgroundColor: 'var(--background)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="unified-button p-2 rounded-lg transition-colors text-[var(--foreground)]/80 hover:text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={calendarCurrentMonth <= new Date(today.getFullYear(), today.getMonth(), 1)}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">
                  {calendarCurrentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                  onClick={() => navigateMonth(1)}
                  className="unified-button p-2 rounded-lg transition-colors text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
      </div>
              
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-xs text-[var(--foreground)]/60 py-1">
                    {day}
    </div>
                ))}
              </div>
              
              <div className="grid grid-cols-7 gap-1">
                {days.map((date, idx) => {
                  if (!date) {
                    return <div key={idx} className="aspect-square" />;
                  }
                  
                  const isPast = date < today;
                  const isSelected = selectedDate && 
                    date.getDate() === selectedDate.getDate() &&
                    date.getMonth() === selectedDate.getMonth() &&
                    date.getFullYear() === selectedDate.getFullYear();
                  const isToday = date.getDate() === today.getDate() &&
                    date.getMonth() === today.getMonth() &&
                    date.getFullYear() === today.getFullYear();
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => !isPast && handleDateSelect(date)}
                      disabled={isPast}
                      className={`aspect-square rounded-lg text-sm transition-colors flex items-center justify-center ${
                        isPast
                          ? 'bg-[var(--foreground)]/10 text-[var(--foreground)]/10 cursor-not-allowed'
                          : isSelected
                          ? 'bg-[var(--accent-cyan)]/30 text-[var(--foreground)] font-semibold'
                          : isToday
                          ? 'bg-[var(--foreground)]/10 text-[var(--foreground)] hover:bg-[var(--foreground)]/15'
                          : 'date-button-default'
                      }`}
                      style={{ boxShadow: 'none', padding: 0 }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => {
                  setCalendarOpenFor(null);
                  setCalendarSelectedDate(null);
                }}
                className="btn-grey mt-4 w-full rounded-lg px-4 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}
      
      {settingsModalFor && (() => {
        const slug = settingsModalFor;
        const courseData = loadSubjectData(slug);
        const subject = subjects.find(s => s.slug === slug);
        const files = courseData?.files || [];

        return (
          <>
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
              onClick={() => setSettingsModalFor(null)}
            >
              <div
                className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[rgba(15,18,22,0.97)] p-6 text-white shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/40">Course Settings</p>
                    <h2 className="text-xl font-semibold">{subject?.name || slug}</h2>
                  </div>
                  <button
                    onClick={() => setSettingsModalFor(null)}
                    className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5/5 p-4 space-y-4">
                    <h3 className="mb-3 text-sm font-semibold text-white/90">Rename Course</h3>
                    <input
                      value={settingsNameInput}
                      onChange={(e) => setSettingsNameInput(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
                      placeholder="Course name"
                    />
                    <p className="text-[11px] text-white/40">Changes save automatically.</p>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-white/90">Course Language</h3>
                      <select
                        value={settingsLanguageInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSettingsLanguageInput(value);
                          if (settingsModalFor) {
                            handleSaveCourseLanguage(settingsModalFor, value);
                          }
                        }}
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none appearance-none"
                        style={{ color: 'white' }}
                      >
                        <option value="">(Not set)</option>
                        {LANGUAGE_OPTIONS.map(({ label, code }) => (
                          <option key={code} value={label} className="bg-[rgb(15,18,22)] text-white">
                            {label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-[11px] text-white/40">Selecting a language saves instantly.</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5/5 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-white/90">Files</h3>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1 text-xs text-white/70">
                      {files.length === 0 ? (
                        <p className="text-white/50">No files yet.</p>
                      ) : (
                        files.map((file, idx) => (
                          <div key={`${file.name}-${idx}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
                            {file.name}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => settingsFileInputRef.current?.click()}
                        disabled={settingsUploadLoading}
                        className="inline-flex items-center justify-center rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/80 hover:text-white hover:border-white/35 transition-colors disabled:opacity-50"
                      >
                        {settingsUploadLoading ? 'Adding…' : 'Add Files'}
                      </button>
                      <button
                        onClick={() => {
                          try {
                            const raw = localStorage.getItem(`atomicSubjectData:${slug}`);
                            const blob = new Blob([raw || '{}'], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${slug}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch {}
                        }}
                        className="inline-flex items-center justify-center rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/80 hover:text-white hover:border-white/35 transition-colors"
                      >
                        Export JSON
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-white/40">
                      Tip: You can also send Chad a detailed course description and he’ll create the course from text.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {settingsModalFor && (
        <input
          ref={settingsFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (e) => {
            const filesToAdd = Array.from(e.target.files || []);
            if (settingsModalFor && filesToAdd.length > 0) {
              await handleAddFilesToCourse(settingsModalFor, filesToAdd);
            }
            if (settingsFileInputRef.current) {
              settingsFileInputRef.current.value = '';
            }
          }}
        />
      )}

      {/* Course Info Modal */}
      {infoModalOpen && (() => {
        const slug = infoModalOpen;
        const courseData = loadSubjectData(slug);
        const subject = subjects.find(s => s.slug === slug);
        
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setInfoModalOpen(null)}
          >
            <div
              className="rounded-2xl border border-white/10 bg-[rgb(15,18,22)] p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              style={{ boxShadow: 'none' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Course Info: {subject?.name || slug}
                </h2>
                <button
                  onClick={() => setInfoModalOpen(null)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {courseData ? (
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="text-white/90 font-semibold mb-2">Subject Name</h3>
                    <p className="text-white/70">{courseData.subject || 'N/A'}</p>
                  </div>
                  
                  {courseData.course_context && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Course Context</h3>
                      <p className="text-white/70 whitespace-pre-wrap">{courseData.course_context}</p>
                    </div>
                  )}
                  
                  {courseData.course_quick_summary && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Quick Summary</h3>
                      <p className="text-white/70 whitespace-pre-wrap">{courseData.course_quick_summary}</p>
                    </div>
                  )}
                  
                  {courseData.course_notes && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Course Notes</h3>
                      <p className="text-white/70 whitespace-pre-wrap">{courseData.course_notes}</p>
                    </div>
                  )}
                  
                  {courseData.topics && courseData.topics.length > 0 && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Topics ({courseData.topics.length})</h3>
                      <div className="space-y-1">
                        {courseData.topics.map((topic, idx) => (
                          <div key={idx} className="text-white/70">
                            {idx + 1}. {topic.name}
                            {topic.summary && <span className="text-white/50 ml-2">- {topic.summary}</span>}
                            {(topic as any).coverage && <span className="text-white/50 ml-2">({(topic as any).coverage}%)</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {courseData.files && courseData.files.length > 0 && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Files ({courseData.files.length})</h3>
                      <div className="space-y-1">
                        {courseData.files.map((file, idx) => (
                          <div key={idx} className="text-white/70">
                            {file.name} {file.type && <span className="text-white/50">({file.type})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {courseData.examDates && courseData.examDates.length > 0 && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Exam Dates</h3>
                      <div className="space-y-1">
                        {courseData.examDates.map((exam, idx) => (
                          <div key={idx} className="text-white/70">
                            {exam.date} {exam.name && <span className="text-white/50">- {exam.name}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {courseData.course_language_name && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Language</h3>
                      <p className="text-white/70">{courseData.course_language_name} ({courseData.course_language_code})</p>
                    </div>
                  )}
                  
                  {courseData.progress && Object.keys(courseData.progress).length > 0 && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Progress</h3>
                      <div className="space-y-1">
                        {Object.entries(courseData.progress).map(([topic, prog]: [string, any]) => (
                          <div key={topic} className="text-white/70">
                            {topic}: {prog.completedLessons || 0}/{prog.totalLessons || 0} lessons
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {courseData.combinedText && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Combined Text Length</h3>
                      <p className="text-white/70">{courseData.combinedText.length.toLocaleString()} characters</p>
                    </div>
                  )}
                  
                  {courseData.surgeLog && courseData.surgeLog.length > 0 && (
                    <div>
                      <h3 className="text-white/90 font-semibold mb-2">Surge Log Entries ({courseData.surgeLog.length})</h3>
                      <p className="text-white/70">See surge log for details</p>
                    </div>
                  )}
                  
                  <div>
                    <h3 className="text-white/90 font-semibold mb-2">Raw Data (JSON)</h3>
                    <pre className="bg-white/5 p-3 rounded-lg overflow-x-auto text-xs text-white/60">
                      {JSON.stringify(courseData, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-white/70">No course data found for this course.</p>
              )}
            </div>
          </div>
        );
      })()}
      </div>
      </div>
    </>
  );
}
