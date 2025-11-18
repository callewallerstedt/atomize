"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GlowSpinner from "@/components/GlowSpinner";
import CourseCreateModal from "@/components/CourseCreateModal";
import LoginPage from "@/components/LoginPage";
import { saveSubjectData, StoredSubjectData, loadSubjectData } from "@/utils/storage";
import { changelog } from "../../CHANGELOG";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";

type Subject = { name: string; slug: string };

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

type HomepageMessage = {
  role: 'user' | 'assistant';
  content: string;
  uiElements?: UIElement[];
  tutorial?: boolean;
};

type ScriptStep = {
  id: string;
  text: string;
  uiElements?: UIElement[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// File upload component for homepage
function HomepageFileUploadArea({ 
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
          disabled={status === 'processing'}
          className="w-full inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 py-1.5 text-sm font-medium !text-white hover:opacity-95 transition-opacity disabled:opacity-50"
          style={{ color: 'white' }}
        >
          {status === 'processing' ? 'Processing...' : (buttonLabel || 'Create')}
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

function WelcomeMessage({ tutorialSignal }: { tutorialSignal: number }) {
  const router = useRouter();
  const [welcomeText, setWelcomeText] = useState("");
  const [aiName, setAiName] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [homepageMessages, setHomepageMessages] = useState<HomepageMessage[]>([]);
  const [isTutorialActive, setIsTutorialActive] = useState(false);
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
  // Load saved homepage chat history on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('synapse:home-chat');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every((m) => typeof m?.role === 'string' && typeof m?.content === 'string')) {
          setHomepageMessages(parsed);
        }
      }
    } catch {}
  }, []);

  // Persist chat history (limit to last 200 messages)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const trimmed = homepageMessages.slice(-200);
      localStorage.setItem('synapse:home-chat', JSON.stringify(trimmed));
    } catch {}
  }, [homepageMessages]);
  const [homepageSending, setHomepageSending] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'ready' | 'processing' | 'success'>>({});
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const hasStreamed = useRef(false);
  const thinkingRef = useRef(false);
  const courseCreationInProgress = useRef(false);
  const isCreatingCourseRef = useRef(false);

  const resetHomepageChat = useCallback(() => {
    tutorialPlaybackRef.current = false;
    setHomepageMessages([]);
    setShowThinking(false);
    thinkingRef.current = false;
    setHomepageSending(false);
    setIsCreatingCourse(false);
    setIsTutorialActive(false);
    courseCreationInProgress.current = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('synapse:home-chat');
    }
  }, []);

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
                  } else if (obj.type === "done") {
                    // If streaming hasn't started yet, show immediately
                    if (!streamingPromise) {
                      setWelcomeText(fullText);
                      setIsStreaming(false);
                    }
                  }
                } catch {}
              });
            }

            // If we collected all text before starting to stream, check if we should stream or show immediately
            if (fullText.length > 0) {
              // If text is very short or already complete, show immediately
              if (fullText.length <= 20) {
                setWelcomeText(fullText);
                setIsStreaming(false);
              } else {
                // Stream character by character with faster delay
                const streamDelay = 10; // Faster: 10ms instead of 30ms
                for (let i = 0; i < fullText.length; i++) {
                  await new Promise(resolve => setTimeout(resolve, streamDelay));
                  setWelcomeText(fullText.slice(0, i + 1));
                }
                setIsStreaming(false);
              }
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
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel', 'description'];
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
    
    // Parse actions
    while ((match = actionRegex.exec(content)) !== null) {
      const actionName = match[1];
      const params: Record<string, string> = {};
      if (match[2]) {
        match[2].split('|').forEach(param => {
          const colonIndex = param.indexOf(':');
          if (colonIndex > 0) {
            const key = param.slice(0, colonIndex).trim();
            let value = param.slice(colonIndex + 1).trim();
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel', 'description'];
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
              params[key] = value;
            }
          }
        });
      }
      actions.push({ name: actionName, params });
    }
    
    // Remove all commands from content for display
    const cleanedContent = content
      .replace(actionRegex, '')
      .replace(buttonRegex, '')
      .replace(fileUploadRegex, '')
      .trim();
    
    return { cleanedContent, uiElements, actions };
  }

  function triggerTextCourseCreation(descriptionParam: string, courseNameParam: string, userMessage?: string) {
    if (courseCreationInProgress.current) return;

    const userOriginalMessage = userMessage || '';
    const actualDescription = (userOriginalMessage && userOriginalMessage.trim().length > 0)
      ? userOriginalMessage.trim()
      : descriptionParam.trim();

    if (!actualDescription) return;

    courseCreationInProgress.current = true;
    setIsCreatingCourse(true);

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
  function executeActions(actions: Array<{ name: string; params: Record<string, string> }>, userMessage?: string) {
    actions.forEach(action => {
      if (action.name === 'create_course') {
        const isHomepage = typeof window !== 'undefined' && window.location.pathname === '/';
        if (isHomepage) {
          triggerTextCourseCreation(action.params.syllabus || action.params.description || '', action.params.name || '', userMessage);
          return;
        }
        const name = action.params.name || 'New Course';
        const syllabus = action.params.syllabus || '';
        document.dispatchEvent(new CustomEvent('synapse:create-course', { detail: { name, syllabus } }));
      } else if (action.name === 'create_course_from_text') {
        const description = action.params.description || '';
        const courseName = action.params.name || '';
        triggerTextCourseCreation(description, courseName, userMessage);
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
      }
    });
  }

  // Handle button click
  function handleButtonClick(action: string | undefined, params: Record<string, string> | undefined, uploadId?: string) {
    if (uploadId && uploadedFiles[uploadId] && uploadedFiles[uploadId].length > 0) {
      const files = uploadedFiles[uploadId];
      if (uploadId) {
        setUploadStatus(prev => ({ ...prev, [uploadId]: 'processing' }));
      }
      if (action === 'start_exam_snipe') {
        router.push('/exam-snipe');
        (window as any).__pendingExamFiles = files;
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
      } else if (action === 'generate_course' || action === 'create_course') {
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

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || !welcomeText || homepageSending || isTutorialActive) return;
    
    // If this is the first message, add the welcome message as the first assistant message
    const isFirstMessage = homepageMessages.length === 0;
    if (isFirstMessage) {
      setHomepageMessages([{ role: 'assistant', content: welcomeText }]);
    }
    
    // Add user message
    const userMessage = { role: 'user' as const, content: text };
    setHomepageMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setInputFocused(false);
    setHomepageSending(true);
    setShowThinking(true);
    thinkingRef.current = true;

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
      const baseHistory = homepageMessages.length > 0
        ? homepageMessages
        : [{ role: 'assistant' as const, content: welcomeText }];
      const apiHistory = baseHistory.map((m) => ({ role: m.role, content: m.content }));
      apiHistory.push(userMessage);

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
              executeActions(actions, userMessage.content);
              
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
                const { cleanedContent, uiElements, actions } = parseUIElementsAndActions(accumulatedContent);
                const hasActions = actions.length > 0;
                const isCreatingCourseAction = actions.some(a => a.name === 'create_course_from_text');

                if (hasActions) {
                  executeActions(actions, userMessage.content);

                  if (isCreatingCourseAction) {
                    setHomepageMessages(prev => {
                      const copy = [...prev];
                      if (copy.length > 0) {
                        copy[copy.length - 1] = { role: 'assistant', content: '', uiElements: [] };
                      }
                      return copy;
                    });
                  } else {
                    setHomepageMessages(prev => {
                      const copy = [...prev];
                      if (copy.length > 0) {
                        copy[copy.length - 1] = { role: 'assistant', content: cleanedContent, uiElements };
                      }
                      return copy;
                    });
                  }
                } else if (!isCreatingCourse) {
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

  return (
    <div className="mx-auto mb-6 w-full max-w-3xl">
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
              className="text-xs font-semibold text-[var(--foreground)]/60 hover:text-[var(--foreground)] transition-colors"
              aria-label="Start a new chat"
            >
              New chat
            </button>
          )}
        </div>
      )}
      {homepageMessages.length === 0 ? (
        <>
          <div className="inline-block px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)]/5 to-[var(--accent-pink)]/5 border border-[var(--accent-cyan)]/20">
            <div className="text-base text-[var(--foreground)]/90 leading-relaxed">
              {renderTextWithSynapse(welcomeText)}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] animate-pulse ml-1 align-middle"></span>
              )}
            </div>
          </div>
          {welcomeText && !isStreaming && (
            <div className="mt-3 w-full max-w-2xl mx-auto">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              placeholder={isTutorialActive ? "Use the tutorial controls above" : "Type a message..."}
              disabled={homepageSending || isTutorialActive}
                className={`w-full px-3 py-2 rounded-lg border transition-all ${
                  inputFocused
                    ? 'border-[var(--accent-cyan)]/40 bg-[var(--background)]/90 text-[var(--foreground)]'
                    : 'border-[var(--foreground)]/10 bg-[var(--background)]/30 text-[var(--foreground)]/40'
              } placeholder:text-[var(--foreground)]/20 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]/30 disabled:opacity-60`}
              />
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {homepageMessages.map((m, i) => {
            // Check if this is the welcome message (first assistant message)
            const isWelcomeMessage = i === 0 && m.role === 'assistant' && m.content === welcomeText;
            
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {m.role === 'user' ? (
                  <div className="max-w-[80%] inline-block px-3 py-1.5 rounded-lg bg-[var(--accent-cyan)]/20 border border-[var(--accent-cyan)]/40">
                    <div className="text-base text-[var(--foreground)]/90 leading-relaxed">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[80%] inline-block px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)]/5 to-[var(--accent-pink)]/5 border border-[var(--accent-cyan)]/20">
                    <div className="text-base text-[var(--foreground)]/90 leading-relaxed">
                      {isCreatingCourse && i === homepageMessages.length - 1 ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 bg-[var(--accent-cyan)] rounded-full animate-pulse"></span>
                          Creating course...
                        </div>
                      ) : isWelcomeMessage ? (
                        renderTextWithSynapse(m.content)
                      ) : (
                        <LessonBody body={sanitizeLessonBody(String(m.content || ''))} />
                      )}
                    </div>
                    {/* Render UI elements */}
                    {m.uiElements && m.uiElements.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {m.uiElements.map((ui, uiIdx) => {
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
                              <HomepageFileUploadArea
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
                  </div>
                )}
              </div>
            );
          })}
          {showThinking && !isCreatingCourse && (
            <div className="flex justify-start">
              <div className="inline-block px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)]/5 to-[var(--accent-pink)]/5 border border-[var(--accent-cyan)]/20">
                <div className="text-base text-[var(--foreground)]/90 leading-relaxed flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-[var(--accent-cyan)] rounded-full animate-pulse"></span>
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 w-full max-w-2xl mx-auto">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            placeholder={isTutorialActive ? "Use the tutorial controls above" : "Type a message..."}
            disabled={homepageSending || isTutorialActive}
              className={`w-full px-3 py-2 rounded-lg border transition-all ${
                inputFocused
                  ? 'border-[var(--accent-cyan)]/40 bg-[var(--background)]/90 text-[var(--foreground)]'
                  : 'border-[var(--foreground)]/10 bg-[var(--background)]/30 text-[var(--foreground)]/40'
            } placeholder:text-[var(--foreground)]/20 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]/30 disabled:opacity-50`}
            />
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
  const [filesModalOpen, setFilesModalOpen] = useState<string | null>(null);
  const [isIOSStandalone, setIsIOSStandalone] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [examHistory, setExamHistory] = useState<ExamHistoryCard[]>([]);
  const [loadingExamHistory, setLoadingExamHistory] = useState(false);
  const [examMenuOpenFor, setExamMenuOpenFor] = useState<string | null>(null);
  const [examDateUpdateTrigger, setExamDateUpdateTrigger] = useState(0); // Force re-render when exam dates change
  const [surgeButtonHovered, setSurgeButtonHovered] = useState<string | null>(null);
  const [tutorialSignal, setTutorialSignal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Check authentication and sync subjects from server
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then(async (data) => {
        const authenticated = !!data?.user;
        setIsAuthenticated(authenticated);
        setCheckingAuth(false);
        
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
      if (name && syllabus) {
        // Store course data to be processed when createCourse is available
        (window as any).__pendingCourseFromText = { name, syllabus, topics: topics || [] };
        // Trigger a custom event that will be handled after createCourse is defined
        document.dispatchEvent(new CustomEvent('synapse:process-pending-course-from-text'));
      }
    };

    const handleOpenCourseModal = () => {
      setCreateOpen(true);
    };

    document.addEventListener('synapse:create-course', handleCreateCourse as EventListener);
    document.addEventListener('synapse:create-course-with-files', handleCreateCourseWithFiles as EventListener);
    document.addEventListener('synapse:create-course-with-text', handleCreateCourseWithText as EventListener);
    document.addEventListener('synapse:open-course-modal', handleOpenCourseModal);
    
    return () => {
      document.removeEventListener('synapse:create-course', handleCreateCourse as EventListener);
      document.removeEventListener('synapse:create-course-with-files', handleCreateCourseWithFiles as EventListener);
      document.removeEventListener('synapse:create-course-with-text', handleCreateCourseWithText as EventListener);
      document.removeEventListener('synapse:open-course-modal', handleOpenCourseModal);
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
            // createCourse will set preparingSlug immediately at the start
            await createCourseRef.current(pending.name, pending.syllabus, []);
            // If topics were provided, we could potentially use them to pre-populate the course structure
            // For now, the course will be created and topics can be generated later from the context
          } catch (err) {
            console.error('Failed to create course from text:', err);
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

  // Show login page if not authenticated
  // Don't show spinner while checking auth - let Shell's LoadingScreen handle it
  if (checkingAuth) {
    return null; // Return null to let Shell render and show LoadingScreen
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  async function handleQuickLearn() {
    try {
      setQuickLearnLoading(true);

      const res = await fetch('/api/quick-learn-general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: quickLearnQuery,
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);

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

      // Add the new quick learn lesson
      const lessonTitle = json.data.title || quickLearnQuery;
      quickLearnData.nodes[lessonTitle] = {
            overview: `Quick lesson on: ${quickLearnQuery}`,
            symbols: [],
        lessonsMeta: [{ type: "Quick Lesson", title: lessonTitle }],
            lessons: [{
          title: lessonTitle,
              body: json.data.body,
              quiz: Array.isArray(json.data.quiz)
                ? json.data.quiz.map((q: any) => ({
                    question: String(q.question || ""),
                    answer: q.answer ? String(q.answer) : undefined,
                  }))
                : [],
              metadata: json.data.metadata || null
            }],
            rawLessonJson: [json.raw || JSON.stringify(json.data)]
      };

      // Save to server (await to ensure it's saved)
      const { saveSubjectDataAsync } = await import("@/utils/storage");
      await saveSubjectDataAsync(quickLearnSlug, quickLearnData);

      // Close modal and navigate to the lesson
      setQuickLearnOpen(false);
      router.replace('/');
      router.push(`/subjects/${quickLearnSlug}/node/${encodeURIComponent(lessonTitle)}`);
    } catch (err: any) {
      alert(err?.message || "Failed to generate quick learn lesson");
    } finally {
      setQuickLearnLoading(false);
    }
  }

  const renameSubject = async (slug: string, newName: string) => {
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
  };

  const createCourse = async (name: string, syllabus: string, files: File[], preferredLanguage?: string) => {
    let effectiveName = name;
    let contextSource: string | null = null;
    const isTextOnlyCourse = files.length === 0;
    try {
      const slugBase = effectiveName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "subject";
      const list = readSubjects();
      let unique = slugBase; let n = 1; const set = new Set(list.map((s) => s.slug));
      while (set.has(unique)) { n++; unique = `${slugBase}-${n}`; }

      const next = [...list, { name: effectiveName, slug: unique }];
      localStorage.setItem("atomicSubjects", JSON.stringify(next));
      setSubjects(next);
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

      const initData: StoredSubjectData = { subject: effectiveName, files: storedFiles, combinedText: effectiveText, tree: null, topics: [], nodes: {}, progress: {}, course_context: syllabus, course_language_name: preferredLanguage || undefined };
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
              renameSubject(unique, effectiveName);
            }
          }
        }
      } catch {}

      // Remove preparing only after naming step is complete
      setPreparingSlug(null);
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
    } catch (error) {
      setPreparingSlug(null);
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('synapse:course-created', {
          detail: { error: true }
        }));
      }
      throw error;
    }
  };

  // Update the ref and window property with createCourse function (runs after createCourse is defined)
  createCourseRef.current = createCourse;
  (window as any).__createCourseFn = createCourse;

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

  return (
    <div 
      className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] px-6 pt-10 pb-4 relative"
      style={{
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
      <WelcomeMessage tutorialSignal={tutorialSignal} />
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Your subjects</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTutorialSignal((prev) => prev + 1)}
            className="inline-flex items-center rounded-full border border-[var(--accent-cyan)]/40 px-4 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--accent-cyan)]/60 hover:bg-[var(--accent-cyan)]/10 transition-colors"
          >
            Tutorial
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--foreground)] bg-[var(--background)]/90 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.7)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)] hover:bg-[var(--background)]/95 transition-all duration-200 ease-out"
            aria-label="Add course"
          >
            <span className="text-lg leading-none text-[var(--foreground)]">+</span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.filter((s) => s.slug !== "quicklearn").map((s) => (
          <div
            key={s.slug}
            className={`relative rounded-2xl bg-[var(--background)] p-5 text-[var(--foreground)] transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.7)] ${
              preparingSlug === s.slug
                ? 'cursor-not-allowed opacity-75'
                : surgeButtonHovered === s.slug
                ? 'cursor-pointer'
                : 'cursor-pointer hover:bg-gradient-to-r hover:from-[var(--accent-cyan)]/5 hover:to-[var(--accent-pink)]/5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)]'
            }`}
            role="link"
            tabIndex={preparingSlug === s.slug ? -1 : 0}
            onClick={preparingSlug === s.slug ? undefined : () => router.push(`/subjects/${s.slug}`)}
            onKeyDown={preparingSlug === s.slug ? undefined : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(`/subjects/${s.slug}`);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-snug truncate">{s.name}</div>
                {(() => {
                  // Use examDateUpdateTrigger to force re-render when exam dates change
                  const _ = examDateUpdateTrigger;
                  const data = loadSubjectData(s.slug);
                  const topicCount = data?.topics?.length || 0;
                  const daysLeft = getDaysUntilNextExam(data?.examDates);
                  // Try to get createdAt from subject (if from server) or use current date as fallback
                  const createdAt = (s as any).createdAt || null;
                  return (
                    <>
                      {createdAt && (
                        <div className="mt-1 text-xs text-[var(--foreground)]/20">
                          {new Date(createdAt).toLocaleString(undefined, { dateStyle: "medium" })}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <div className="text-xs text-[var(--foreground)]/20">
                          {topicCount} topic{topicCount === 1 ? "" : "s"}
                        </div>
                        {daysLeft !== null && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-[var(--foreground)]/5 border border-[var(--foreground)]/15 text-[var(--foreground)]/70">
                            <span>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
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
            
            {/* Surge button - bottom right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/subjects/${s.slug}/surge`);
              }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                setSurgeButtonHovered(s.slug);
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
                setSurgeButtonHovered(null);
              }}
              disabled={preparingSlug === s.slug}
              className={`absolute bottom-4 right-4 inline-flex items-center justify-center w-8 h-8 rounded-full transition-all z-20 ${
                preparingSlug === s.slug
                  ? 'opacity-40 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-[var(--foreground)]/15'
              }`}
              style={{
                background: preparingSlug === s.slug 
                  ? 'rgba(229, 231, 235, 0.05)'
                  : 'rgba(229, 231, 235, 0.08)',
                boxShadow: surgeButtonHovered === s.slug
                  ? '0 2px 8px rgba(0, 0, 0, 0.7), 0 0 10px rgba(0, 229, 255, 0.7), 0 0 20px rgba(0, 229, 255, 0.5), 0 0 30px rgba(255, 45, 150, 0.4), 0 0 40px rgba(255, 45, 150, 0.2)'
                  : undefined,
                border: 'none',
                transition: 'box-shadow 0.3s ease, background 0.3s ease'
              }}
              aria-label="Start Surge"
              title="Start Synapse Surge"
            >
              <span className={`text-sm ${preparingSlug === s.slug ? 'text-[var(--foreground)]/30' : 'text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)]'}`}>⚡</span>
            </button>
            
            {preparingSlug === s.slug && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm rounded-2xl z-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/95 px-3 py-1 text-[12px] text-[var(--foreground)] shadow-lg">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" /> Preparing…
                </div>
              </div>
            )}
            {menuOpenFor === s.slug && (
              <div data-menu-dropdown className="absolute right-4 top-14 z-50 w-40 rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/95 backdrop-blur-md shadow-lg p-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMenuOpenFor(null);
                    const name = window.prompt("Rename course", s.name) || s.name;
                    if (name !== s.name) {
                      await renameSubject(s.slug, name);
                    }
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                >
                  Rename
                </button>
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
                    setFilesModalOpen(s.slug);
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                >
                  View Files
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    try {
                      const raw = localStorage.getItem("atomicSubjectData:" + s.slug);
                      const blob = new Blob([raw || "{}"], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${s.slug}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {}
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                >
                  Export
                </button>
              </div>
            )}
          </div>
        ))}
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
          className={`relative rounded-2xl border border-dashed border-[var(--accent-cyan)]/30 bg-[var(--background)]/60 p-6 text-center text-sm transition-all duration-200 min-h-[80px] flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 shadow-[0_4px_12px_rgba(0,0,0,0.8)]'
              : 'hover:border-[var(--accent-cyan)]/50 hover:bg-[var(--background)]/70'
          }`}
        >
          <span className="text-[var(--foreground)]/70">Drop files here to auto-create a course</span>
          <span className="text-xs text-[var(--foreground)]/50">We’ll scan the files and name it for you</span>
        </div>
        {subjects.length === 0 && null}
      </div>

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

      {/* Quick Lesson Modal */}
      {quickLearnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={isIOSStandalone ? "relative w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-6" : "relative w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md p-6"}>
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
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
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
                className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
                style={{ color: 'white' }}
              >
                {quickLearnLoading ? "Generating..." : "Generate Lesson"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Files Modal */}
      {filesModalOpen && (() => {
        const slug = filesModalOpen;
        const data = loadSubjectData(slug) as StoredSubjectData | null;
        const files = data?.files || [];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setFilesModalOpen(null)}>
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/95 backdrop-blur-sm p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Course Files</h3>
                <button
                  onClick={() => setFilesModalOpen(null)}
                  className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 space-y-2 max-h-96 overflow-y-auto">
                {files.length === 0 ? (
                  <div className="text-sm text-[var(--foreground)]/70 py-6 text-center">
                    No files added yet. Click "Add Files" below to upload course materials.
                  </div>
                ) : (
                  files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20 px-4 py-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <svg className="flex-shrink-0 w-5 h-5 text-[var(--accent-cyan)]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--foreground)] truncate">{file.name}</div>
                          <div className="text-xs text-[var(--foreground)]/70">{file.type || 'Unknown type'}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (!window.confirm(`Remove "${file.name}" from this course?`)) return;
                          const updatedFiles = files.filter((_, i) => i !== idx);
                          if (data) {
                            data.files = updatedFiles;
                            // Also update combinedText if needed
                            saveSubjectData(slug, data);
                            // Sync to server if authenticated
                            if (isAuthenticated) {
                              fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ data }),
                              }).catch(() => {});
                            }
                            setFilesModalOpen(null);
                            setTimeout(() => setFilesModalOpen(slug), 10);
                          }
                        }}
                        className="ml-3 text-[#FF2D96] hover:text-[#FF2D96]/80 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--accent-cyan)]/20">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  className="hidden"
                  onChange={async (e) => {
                    const target = e.target as HTMLInputElement;
                    const newFiles = Array.from(target.files || []);
                    if (newFiles.length === 0) return;

                    // Process files and extract text
                    const storedFiles: Array<{ name: string; type: string; data?: string }> = [];
                    let combinedText = data?.combinedText || '';

                    for (const file of newFiles) {
                      const lower = file.name.toLowerCase();
                      let text = '';
                      
                      if (file.type.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
                        try {
                          text = await file.text();
                          if (text) combinedText += (combinedText ? '\n\n' : '') + `--- ${file.name} ---\n${text}`;
                        } catch {}
                      }
                      
                      storedFiles.push({ name: file.name, type: file.type, data: text || undefined });
                    }

                    // Update subject data
                    if (data) {
                      data.files = [...files, ...storedFiles];
                      data.combinedText = combinedText;
                      saveSubjectData(slug, data);
                      
                      // Sync to server if authenticated
                      if (isAuthenticated) {
                        fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ data }),
                        }).catch(() => {});
                      }
                      
                      setFilesModalOpen(null);
                      setTimeout(() => setFilesModalOpen(slug), 10);
                    }
                    
                    // Reset input
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95"
                >
                  Add Files
                </button>
                <button
                  onClick={() => setFilesModalOpen(null)}
                  className="rounded-lg border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
}
