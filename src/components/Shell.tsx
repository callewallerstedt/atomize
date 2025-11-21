"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsModal from "@/components/SettingsModal";
import Modal from "@/components/Modal";
import GlowSpinner from "@/components/GlowSpinner";
import { APP_VERSION } from "@/lib/version";

// Generate stable dots that don't change on re-render
function generateDots(count: number) {
  return Array.from({ length: count }).map((_, i) => {
    const size = Math.random() * 2 + 1;
    const isCyan = Math.random() > 0.5;
    const color = isCyan ? '#00E5FF' : '#FF2D96';
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const glowSize = Math.random() * 4 + 2;
    const duration = Math.random() * 20 + 15;
    const delay = Math.random() * 5;
    return {
      key: `loading-dot-${i}`,
      size,
      color,
      left,
      top,
      glowSize,
      duration,
      delay,
      animation: `float-${i % 3}`,
    };
  });
}

// Loading Screen Component
function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [loadingDots, setLoadingDots] = useState<ReturnType<typeof generateDots>>([]);
  
  // Generate dots only on client side to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLoadingDots(generateDots(80));
    }
  }, []);

  // Play startup sound when component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const audio = new Audio('/startup.mp3');
        audio.volume = 0.3; // Set volume to 30%
        audio.play().catch(err => {
          console.log('Audio play failed:', err);
        });
      } catch (err) {
        console.log('Audio initialization failed:', err);
      }
    }
  }, []);

  useEffect(() => {
    // Start fade-out animation after 2.5 seconds
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 2500);

    // Complete loading after animation
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 3000); // Show for 3 seconds total

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)] transition-all duration-500 ease-out ${
      isFadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
    }`}>
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {loadingDots.map((dot) => (
          <div
            key={dot.key}
            className="absolute rounded-full opacity-40"
             style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              left: `${dot.left}%`,
              top: `${dot.top}%`,
              background: dot.color,
              boxShadow: `0 0 ${dot.glowSize}px ${dot.color}`,
              animation: `${dot.animation} ${dot.duration}s linear infinite`,
              animationDelay: `${dot.delay}s`,
            }}
          />
        ))}
      </div>


      {/* Spinning gradient ring - same as login page */}
      <div className="logo-wrap mb-2" style={{ width: 240, aspectRatio: "1 / 1", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "-15vh" }}>
        <div style={{ transform: "scale(1.3)", transformOrigin: "center" }}>
          <img
            src="/spinner.png"
            alt=""
            width={320}
            height={320}
            style={{ width: 320, height: 320, objectFit: "contain", transformOrigin: "center" }}
            className="animate-spin"
            loading="eager"
          />
        </div>
      </div>

      {/* Welcome text */}
      <div className="text-center">
        <h1
          className="text-7xl font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider relative inline-block"
          style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}
        >
          Welcome to Synapse
          <sup className="text-xl text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] absolute -top-1 left-full ml-1" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>(ALPHA)</sup>
        </h1>
      </div>
    </div>
  );
}

// Pomodoro Timer Component
function PomodoroTimer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [studyTime, setStudyTime] = useState(25);
  const [breakTime, setBreakTime] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);

  // Play notification sound
  const playNotificationSound = () => {
    if (typeof window !== 'undefined') {
      try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800; // Frequency in Hz
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (e) {
        // Fallback: try to play a system beep or just log
        console.log('Could not play notification sound');
      }
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => {
          if (time <= 1) {
            // Timer finished
            setIsRunning(false);
            setIsBreak(!isBreak);
            setShowPlayButton(true); // Show the play button

            // Play notification sound
            playNotificationSound();

            // Show browser notification
            if (typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification(isBreak ? 'Break Time!' : 'Study Time!', {
                  body: isBreak ? 'Time for a break!' : 'Time to study!',
                  icon: '/favicon.ico'
                });
              }
            }
            return isBreak ? breakTime * 60 : studyTime * 60;
          }
          return time - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, isBreak, studyTime, breakTime]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettings && !(event.target as Element).closest('.pomodoro-timer')) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsBreak(false);
    setTimeLeft(studyTime * 60);
    setShowPlayButton(false);
  };

  const toggleTimer = () => {
    setIsRunning(!isRunning);
    setShowPlayButton(false);
  };

  const startNextTimer = () => {
    setIsRunning(true);
    setShowPlayButton(false);
  };

  return (
    <div className="relative pomodoro-timer">
      {/* Icon mode when not running */}
      {!isRunning && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            onMouseDown={(e) => {
              e.preventDefault();
              e.currentTarget.blur();
            }}
            className="relative inline-flex items-center justify-center px-1.5 py-1.5
                       focus:outline-none focus:ring-0 focus-visible:outline-none
                       transition-all duration-300 ease-out"
            style={{ 
              outline: 'none', 
              WebkitTapHighlightColor: 'transparent', 
              transform: 'none !important',
              borderRadius: '50%',
              margin: 0,
              display: 'flex',
              height: '32px',
              width: '32px',
              boxShadow: 'none',
              background: 'rgba(229, 231, 235, 0.08)',
            }}
            aria-label="Pomodoro Timer"
            title="Pomodoro Timer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
      )}
      
      {/* Expanded mode when running */}
      {isRunning && (
        <div
          className="inline-block rounded-xl transition-all duration-300"
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
            onClick={() => setShowSettings(!showSettings)}
            className="relative inline-flex items-center justify-between gap-1 px-1.5 py-1.5 min-w-[100px]
                       text-white bg-[var(--background)]/90 backdrop-blur-md
                       transition-all duration-300 ease-out"
            style={{
              borderRadius: 'calc(0.75rem - 1.5px)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-lg sm:text-xl font-bold leading-none">
                {formatTime(timeLeft)}
              </span>
              <span className="text-[10px] sm:text-xs opacity-75">
                {isBreak ? 'BREAK' : 'STUDY'}
              </span>
            </div>
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${showSettings ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Next Timer Play Button */}
      {showPlayButton && (
        <button
          onClick={startNextTimer}
          className="hidden md:flex md:absolute md:-right-12 md:top-1/2 md:-translate-y-1/2 w-8 h-8 rounded-full
                     bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white
                     flex items-center justify-center shadow-lg hover:shadow-xl
                     transition-all duration-200 hover:scale-110 animate-pulse"
          title={`Start ${isBreak ? 'Break' : 'Study'} Timer`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-[100]">
          <div className="relative rounded-xl p-4
                         bg-[var(--background)]/95 backdrop-blur-md
                         shadow-[0_4px_12px_rgba(0,0,0,0.7)]
                         overflow-hidden">
            <div className="space-y-3 min-w-[220px]">
              <div className="text-center">
                <h3 className="text-[var(--foreground)] font-semibold text-sm">Pomodoro Controls</h3>
              </div>

              {/* Quick Controls */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleTimer}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[#00E5FF]/20 text-[#00E5FF]
                           text-xs hover:bg-[#00E5FF]/30 transition-colors border border-[#00E5FF]/30"
                >
                  {isRunning ? (
                    <>
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                      Play
                    </>
                  )}
                </button>

                <button
                  onClick={resetTimer}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[var(--background)]/60 text-[var(--foreground)]
                           text-xs hover:bg-[var(--background)]/80 transition-colors border border-[var(--accent-cyan)]/20"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </button>
              </div>

              <button
                onClick={() => {
                  setIsBreak(!isBreak);
                  setTimeLeft(isBreak ? studyTime * 60 : breakTime * 60);
                  setIsRunning(false);
                }}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]
                         text-xs hover:bg-[var(--accent-pink)]/30 transition-colors border border-[var(--accent-pink)]/30"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {isBreak ? 'Start Study' : 'Take Break'}
              </button>

              {/* Time Settings */}
              <div className="border-t border-[var(--accent-cyan)]/20 pt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-[var(--foreground)]/70 mb-1">Study (min)</label>
                    <input
                      type="number"
                      value={studyTime}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 25));
                        setStudyTime(val);
                        if (!isBreak && !isRunning) setTimeLeft(val * 60);
                      }}
                      className="w-full px-2 py-1 rounded text-xs bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20
                               text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]
                               transition-colors"
                      min="1"
                      max="60"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-[var(--foreground)]/70 mb-1">Break (min)</label>
                    <input
                      type="number"
                      value={breakTime}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(30, parseInt(e.target.value) || 5));
                        setBreakTime(val);
                      }}
                      className="w-full px-2 py-1 rounded text-xs bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20
                               text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]
                               transition-colors"
                      min="1"
                      max="30"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1 rounded text-xs bg-[var(--background)]/60 text-[var(--foreground)]/70
                           hover:bg-[var(--background)]/80 hover:text-[var(--foreground)] transition-colors border border-[var(--accent-cyan)]/20"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  uiElements?: Array<{
    type: 'button' | 'file_upload';
    id: string;
    label?: string;
    action?: string;
    params?: Record<string, string>;
    message?: string;
  }>;
  isLoading?: boolean; // For showing loading spinner
  hidden?: boolean; // For messages that should be in context but not displayed
};

type ChatHistory = {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
};

// File upload component
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
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 011.414-1.414L8.5 11.086l6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Started Exam Analysis
        </div>
      )}
    </div>
  );
}

function ChatDropdown({ fullscreen = false }: { fullscreen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(fullscreen);
  const [showFullChat, setShowFullChat] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'ready' | 'processing' | 'success'>>({});
  const [fetchingContext, setFetchingContext] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 480, h: 460 });
  const [resizing, setResizing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageContentRef = useRef<string>('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatDropdownRef = useRef<HTMLDivElement>(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const lastSavedRef = useRef<string>('');
  const isLoadingFromHistoryRef = useRef<boolean>(false);
  const pendingWelcomeMessageRef = useRef<{ welcomeMessage: string; userMessage: string } | null>(null);

  // Don't render anything in fullscreen mode (handled elsewhere)
  if (fullscreen) {
    return null;
  }

  // Load chat history from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('chatHistory');
      if (stored) {
        setChatHistory(JSON.parse(stored));
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handleOpenChat = () => {
      setOpen(true);
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
      });
    };

    const handleToggleChat = () => {
      setOpen(prev => {
        const newState = !prev;
        if (newState) {
          requestAnimationFrame(() => {
            chatInputRef.current?.focus();
          });
        }
        return newState;
      });
    };

    const handleOpenChatWithMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { welcomeMessage, welcomeName, userMessage } = customEvent.detail || {};
      
      if (welcomeMessage && userMessage) {
        // Set messages with welcome message and user message
        setMessages([
          { role: 'assistant', content: welcomeMessage },
          { role: 'user', content: userMessage }
        ]);
        setOpen(true);
        // Store for processing in next effect
        pendingWelcomeMessageRef.current = { welcomeMessage, userMessage };
      } else {
        setOpen(true);
      }
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
      });
    };

    document.addEventListener('synapse:open-chat', handleOpenChat as EventListener);
    document.addEventListener('synapse:toggle-chat', handleToggleChat as EventListener);
    document.addEventListener('synapse:open-chat-with-message', handleOpenChatWithMessage as EventListener);
    return () => {
      document.removeEventListener('synapse:open-chat', handleOpenChat as EventListener);
      document.removeEventListener('synapse:toggle-chat', handleToggleChat as EventListener);
      document.removeEventListener('synapse:open-chat-with-message', handleOpenChatWithMessage as EventListener);
    };
  }, []); // Remove 'open' from dependencies to prevent re-registration

  // ESC key handler - always active when chat is open
  useEffect(() => {
    if (!open) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    // Use capture phase to catch ESC before other handlers
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [open]);

  // Global keyboard listener to open chat when typing starts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore special keys and shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Escape' || e.key === 'Tab') {
        return;
      }

      // Check if user is already in a text input (but allow if it's our chat input)
      const activeElement = document.activeElement;
      const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      );

      // If already in a text input that's NOT our chat input, don't do anything
      if (isTextInput && activeElement !== chatInputRef.current) {
        return;
      }

      // If it's a printable character, show pill under header (not full chat)
      if (e.key.length === 1 && !e.key.match(/[^\x20-\x7E]/)) {
        if (!open && !showFullChat) {
          setOpen(true);
          setShowFullChat(false); // Show pill, not full chat
          requestAnimationFrame(() => {
            chatInputRef.current?.focus();
            // Set the typed character in the input
            if (chatInputRef.current) {
              chatInputRef.current.value = e.key;
              setInput(e.key);
            }
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Save chat to history when a conversation is complete (not during streaming)
  useEffect(() => {
    // Don't save if we're loading from history
    if (isLoadingFromHistoryRef.current) {
      isLoadingFromHistoryRef.current = false;
      const messagesKey = JSON.stringify(messages);
      lastSavedRef.current = messagesKey;
      return;
    }

    if (messages.length > 0 && !sending && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content) {
      const messagesKey = JSON.stringify(messages);
      if (messagesKey === lastSavedRef.current) return;
      const now = Date.now();
      if (currentChatId) {
        const updated = chatHistory.map(c => c.id === currentChatId ? { ...c, messages: [...messages], timestamp: now } : c);
        setChatHistory(updated);
        lastSavedRef.current = messagesKey;
        try { localStorage.setItem('chatHistory', JSON.stringify(updated)); } catch {}
      } else {
        const firstUserMessage = messages.find(m => m.role === 'user');
        const title = firstUserMessage ? (firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')) : 'Conversation';
        const newChat: ChatHistory = { id: now.toString(), title, messages: [...messages], timestamp: now };
        const updated = [newChat, ...chatHistory].slice(0, 50);
        setChatHistory(updated);
        setCurrentChatId(newChat.id);
        lastSavedRef.current = messagesKey;
        try { localStorage.setItem('chatHistory', JSON.stringify(updated)); } catch {}
      }
    }
  }, [messages, sending, chatHistory, currentChatId]);

  function startNewChat() {
    setMessages([]);
    setInput("");
    lastSavedRef.current = '';
    setCurrentChatId(null);
  }

  function loadChat(chat: ChatHistory) {
    isLoadingFromHistoryRef.current = true;
    setMessages(chat.messages);
    setCurrentChatId(chat.id);
  }

  function deleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = chatHistory.filter(c => c.id !== id);
    setChatHistory(updated);
    try {
      localStorage.setItem('chatHistory', JSON.stringify(updated));
    } catch {}
  }

  // Track message content changes for streaming and new messages
  useEffect(() => {
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const currentContent = lastMessage?.content || '';
    if (currentContent !== lastMessageContentRef.current) {
      lastMessageContentRef.current = currentContent;
      setScrollTrigger(prev => prev + 1);
    }
  }, [messages.length]);
  
  // Also poll during streaming to catch content updates
  useEffect(() => {
    if (!open || !sending) return;
    
    const interval = setInterval(() => {
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const currentContent = lastMessage?.content || '';
      if (currentContent !== lastMessageContentRef.current) {
        lastMessageContentRef.current = currentContent;
        setScrollTrigger(prev => prev + 1);
      }
    }, 100); // Check every 100ms during streaming
    
    return () => clearInterval(interval);
  }, [open, sending, messages.length]);

  // Function to compress course/subject data for context (including exam snipe)
  async function getCompressedCourseContext(): Promise<string> {
    if (typeof window === 'undefined') return '';
    try {
      const subjectsRaw = localStorage.getItem('atomicSubjects');
      if (!subjectsRaw) return '';
      
      const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
      const contextParts: string[] = [];
      
      // Fetch exam snipe history
      let examSnipeData: any[] = [];
      try {
        const examRes = await fetch('/api/exam-snipe/history', { credentials: 'include' });
        const examJson = await examRes.json().catch(() => ({}));
        if (examJson?.ok && Array.isArray(examJson.history)) {
          examSnipeData = examJson.history;
        }
      } catch {}
      
      for (const subject of subjects) {
        if (subject.slug === 'quicklearn') continue;
        
        const subjectDataRaw = localStorage.getItem(`atomicSubjectData:${subject.slug}`);
        const courseInfo: string[] = [];
        
        // Course name, slug, and description - IMPORTANT: slug is needed for navigation
        courseInfo.push(`Course: ${subject.name} (slug: ${subject.slug})`);
        
        if (subjectDataRaw) {
          try {
            const subjectData = JSON.parse(subjectDataRaw);
            if (subjectData.course_context) {
              courseInfo.push(`Description: ${subjectData.course_context.slice(0, 200)}`);
            }
            if (subjectData.course_quick_summary) {
              courseInfo.push(`Summary: ${subjectData.course_quick_summary.slice(0, 200)}`);
            }
            
            // Topics list - use same logic as course page
            let topicNames: string[] = [];
            // Prefer new topics format
            if (subjectData.topics && Array.isArray(subjectData.topics) && subjectData.topics.length > 0) {
              topicNames = subjectData.topics.map((t: any) => {
                if (typeof t === 'string') return t;
                return t.name || String(t);
              });
            } else if (subjectData.tree?.topics && Array.isArray(subjectData.tree.topics)) {
              // Legacy fallback: extract from tree.topics
              topicNames = subjectData.tree.topics.map((t: any) => {
                if (typeof t === 'string') return t;
                return t.name || String(t);
              });
            }
            
            if (topicNames.length > 0) {
              // Remove duplicates and limit to what's actually displayed
              const uniqueTopics = Array.from(new Set(topicNames)).slice(0, 50);
              courseInfo.push(`Topics (${uniqueTopics.length}): ${uniqueTopics.join(', ')}`);
            }
          } catch {}
        }
        
        // Check for matching exam snipe data
        const matchingExamSnipe = examSnipeData.find((exam: any) => exam.slug === subject.slug);
        if (matchingExamSnipe && matchingExamSnipe.results) {
          const results = matchingExamSnipe.results;
          const examInfo: string[] = [];
          
          examInfo.push(`EXAM SNIPE RESULTS:`);
          if (results.totalExams) {
            examInfo.push(`Total exams analyzed: ${results.totalExams}`);
          }
          if (results.gradeInfo) {
            examInfo.push(`Grade info: ${results.gradeInfo.slice(0, 150)}`);
          }
          if (results.patternAnalysis) {
            examInfo.push(`Pattern: ${results.patternAnalysis.slice(0, 200)}`);
          }
          
          // Study order (concepts in priority order)
          if (results.concepts && Array.isArray(results.concepts) && results.concepts.length > 0) {
            const studyOrder = results.concepts.map((c: any, idx: number) => {
              const name = c.name || `Concept ${idx + 1}`;
              const desc = c.description ? ` (${c.description.slice(0, 80)})` : '';
              return `${idx + 1}. ${name}${desc}`;
            }).slice(0, 15).join('\n');
            examInfo.push(`STUDY ORDER (priority):\n${studyOrder}`);
          }
          
          // Common questions (top 5)
          if (results.commonQuestions && Array.isArray(results.commonQuestions) && results.commonQuestions.length > 0) {
            const topQuestions = results.commonQuestions.slice(0, 5).map((q: any) => {
              const question = q.question || '';
              const count = q.examCount || 0;
              const points = q.averagePoints || 0;
              return `- "${question.slice(0, 100)}" (appears in ${count} exams, avg ${points} pts)`;
            }).join('\n');
            examInfo.push(`Common questions:\n${topQuestions}`);
          }
          
          if (examInfo.length > 0) {
            courseInfo.push(examInfo.join('\n'));
          }
        }
        
        if (courseInfo.length > 0) {
          contextParts.push(courseInfo.join('\n'));
        }
      }
      
      return contextParts.join('\n\n');
    } catch {
      return '';
    }
  }

  // Parse UI elements and actions from Chad's messages
  function parseUIElementsAndActions(content: string): { cleanedContent: string; uiElements: ChatMessage['uiElements']; actions: Array<{ name: string; params: Record<string, string> }> } {
    const actionRegex = /ACTION:(\w+)(?:\|([^|]+(?:\|[^|]+)*))?/g;
    const buttonRegex = /BUTTON:(\w+)(?:\|([^|]+(?:\|[^|]+)*))?/g;
    const fileUploadRegex = /FILE_UPLOAD:(\w+)(?:\|([^|]+(?:\|[^|]+)*))?/g;
    
    const uiElements: ChatMessage['uiElements'] = [];
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
            // For parameters that can contain spaces (topic, name, syllabus, message, label, buttonLabel), keep the full value
            // For other parameters, stop at whitespace to prevent issues when action is in the middle of text
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel'];
            if (!spaceAllowedParams.includes(key)) {
              // Clean value: remove any trailing text after whitespace/newline
              // This prevents issues when action is in the middle of a sentence
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
        action, // Store action for the generate button
        params: {
          ...Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'message' && k !== 'action' && k !== 'buttonLabel')),
          buttonLabel // Include buttonLabel in params so FileUploadArea can access it
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
            // For parameters that can contain spaces (topic, name, syllabus, message, etc.), keep the full value
            // For other parameters, stop at whitespace to prevent issues when action is in the middle of text
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel'];
            if (!spaceAllowedParams.includes(key)) {
              // Clean value: remove any trailing text after whitespace/newline
              // This prevents issues when action is in the middle of a sentence
              const spaceIndex = value.search(/[\s\n\r]/);
              if (spaceIndex > 0) {
                value = value.slice(0, spaceIndex);
              }
            }
            // For slug parameters, ensure they're clean (only alphanumeric, hyphens, underscores)
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
  
  // Execute actions
  function executeActions(actions: Array<{ name: string; params: Record<string, string> }>) {
    actions.forEach(action => {
      if (action.name === 'create_course') {
        const name = action.params.name || 'New Course';
        const syllabus = action.params.syllabus || '';
        document.dispatchEvent(new CustomEvent('synapse:create-course', { detail: { name, syllabus } }));
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
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.trim().replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            // Use router.push for client-side navigation (no full page reload)
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
      } else if (action.name === 'navigate_topic') {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        if (slug && topic && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug && topic) {
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
          }
        }
      } else if (action.name === 'navigate_lesson') {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        const lessonIndex = action.params.lessonIndex;
        if (slug && topic && lessonIndex !== undefined && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug && topic) {
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lessonIndex}`);
          }
        }
      } else if (action.name === 'open_flashcards') {
        let slug = action.params.slug?.trim();
        if (slug && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            // Store flashcard open intent in sessionStorage
            sessionStorage.setItem('__pendingFlashcardOpen', slug);
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}`);
          }
        }
      } else if (action.name === 'open_lesson_flashcards') {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        const lessonIndex = action.params.lessonIndex;
        if (slug && topic && lessonIndex !== undefined && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug && topic) {
            // Navigate to lesson page first, then trigger flashcard modal
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lessonIndex}`);
            // Dispatch event to open lesson flashcards modal
            setTimeout(() => {
              document.dispatchEvent(new CustomEvent('synapse:open-lesson-flashcards', { detail: { slug, topic, lessonIndex } }));
            }, 500);
          }
        }
      } else if (action.name === 'request_files') {
        const message = action.params.message || 'Please upload the files I need.';
        alert(message);
      } else if (action.name === 'start_exam_snipe') {
        // Navigate to exam snipe page
        router.push('/exam-snipe');
      } else if (action.name === 'generate_course') {
        // Open course creation modal
        document.dispatchEvent(new CustomEvent('synapse:open-course-modal'));
      } else if (action.name === 'create_course_from_text') {
        // Create course from text description
        const description = action.params.description || '';
        const courseName = action.params.name || '';
        if (!description.trim()) {
          setMessages((m) => [...m, { role: 'assistant', content: 'Please provide a description of the course you want to create.' }]);
          return;
        }
        // Show loading message
        setMessages((m) => [...m, { role: 'assistant', content: '', isLoading: true }]);
        // Call API to generate course from text
        (async () => {
          try {
            const res = await fetch('/api/course-from-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ description, courseName }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json?.ok) {
              // Remove loading message
              setMessages((m) => {
                const copy = [...m];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                  copy.pop();
                }
                return copy;
              });
              // Create course with the generated context
              const finalName = json.courseName || courseName || 'New Course';
              const courseContext = json.courseContext || description;
              // Create empty files array and use the generated context as syllabus
              document.dispatchEvent(new CustomEvent('synapse:create-course-with-text', { 
                detail: { 
                  name: finalName, 
                  syllabus: courseContext,
                  topics: json.topics || []
                } 
              }));
            } else {
              // Remove loading message and show error
              setMessages((m) => {
                const copy = [...m];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                  copy.pop();
                }
                copy.push({ role: 'assistant', content: `Failed to create course: ${json?.error || 'Unknown error'}` });
                return copy;
              });
            }
          } catch (err: any) {
            setMessages((m) => {
              const copy = [...m];
              const lastIdx = copy.length - 1;
              if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                copy.pop();
              }
              copy.push({ role: 'assistant', content: `Error creating course: ${err?.message || 'Unknown error'}` });
              return copy;
            });
          }
        })();
      } else if (action.name === 'set_exam_date') {
        let slug = action.params.slug?.trim();
        const dateStr = action.params.date?.trim();
        const examName = action.params.name?.trim();
        if (slug && dateStr && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
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
          if (slug && dateStr) {
            // Validate date format (YYYY-MM-DD)
            const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateMatch) {
              try {
                // Import loadSubjectData and saveSubjectData from storage utils
                const { loadSubjectData, saveSubjectData } = require('@/utils/storage');
                const data = loadSubjectData(slug);
                if (data) {
                  // Replace all existing exam dates with the new one (overwrite behavior)
                  data.examDates = [{ date: dateStr, name: examName }];
                  saveSubjectData(slug, data);
                  // Trigger a custom event to refresh the UI
                  window.dispatchEvent(new CustomEvent('synapse:exam-date-updated', { detail: { slug } }));
                }
              } catch (err) {
                console.error('Failed to set exam date:', err);
              }
            }
          }
        }
      } else if (action.name === 'fetch_practice_logs') {
        let slug = action.params.slug?.trim();
        const originalInput = slug;
        if (slug && typeof window !== 'undefined') {
          // Try to resolve course name to slug
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
          if (slug) {
            // Show loading spinner
            setFetchingContext(true);
            setMessages((m) => [...m, { role: 'assistant', content: '', isLoading: true }]);
            
            // Fetch practice logs
            (async () => {
              try {
                const PRACTICE_LOG_PREFIX = "atomicPracticeLog:";
                const practiceLogKey = `${PRACTICE_LOG_PREFIX}${slug}`;
                const stored = localStorage.getItem(practiceLogKey);
                
                if (stored) {
                  try {
                    const practiceLog = JSON.parse(stored);
                    if (Array.isArray(practiceLog) && practiceLog.length > 0) {
                      // Format practice log summary
                      const topicStats: Record<string, { total: number; avgGrade: number; entries: any[] }> = {};
                      
                      practiceLog.forEach((entry: any) => {
                        const topic = entry.topic || "General";
                        if (!topicStats[topic]) {
                          topicStats[topic] = { total: 0, avgGrade: 0, entries: [] };
                        }
                        topicStats[topic].total += 1;
                        topicStats[topic].entries.push(entry);
                      });
                      
                      // Calculate averages
                      Object.keys(topicStats).forEach(topic => {
                        const stats = topicStats[topic];
                        const totalGrade = stats.entries.reduce((sum, e) => sum + (e.grade || e.rating || 0), 0);
                        stats.avgGrade = stats.total > 0 ? totalGrade / stats.total : 0;
                      });
                      
                      const contextData: string[] = [];
                      contextData.push(`PRACTICE LOG DATA FOR ${originalInput.toUpperCase()}:`);
                      contextData.push(`Total practice entries: ${practiceLog.length}`);
                      contextData.push('');
                      
                      // Group by topic
                      Object.entries(topicStats)
                        .sort(([, a], [, b]) => b.total - a.total)
                        .forEach(([topic, stats]) => {
                          contextData.push(`${topic}:`);
                          contextData.push(`  - Questions practiced: ${stats.total}`);
                          contextData.push(`  - Average grade: ${stats.avgGrade.toFixed(1)}/10`);
                          contextData.push('');
                        });
                      
                      // Recent entries (last 10)
                      const recentEntries = practiceLog
                        .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
                        .slice(0, 10);
                      
                      if (recentEntries.length > 0) {
                        contextData.push('RECENT PRACTICE SESSIONS:');
                        recentEntries.forEach((entry: any, idx: number) => {
                          const date = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown date';
                          const topic = entry.topic || 'General';
                          const grade = entry.grade || entry.rating || 0;
                          contextData.push(`${idx + 1}. [${date}] ${topic} - Grade: ${grade}/10`);
                          if (entry.question) {
                            const qPreview = entry.question.replace(/◊/g, '').replace(/<[^>]*>/g, '').slice(0, 80);
                            contextData.push(`   Q: ${qPreview}${qPreview.length >= 80 ? '...' : ''}`);
                          }
                        });
                      }
                      
                      const contextText = contextData.join('\n');
                      
                      // Remove loading message and add context as system message
                      setMessages((m) => {
                        const copy = [...m];
                        const lastIdx = copy.length - 1;
                        if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                          copy.pop();
                        }
                        const systemEntry: ChatMessage = { role: 'system', content: contextText };
                        const updated: ChatMessage[] = [...copy, systemEntry];
                        
                        // Trigger Chad's response without adding a visible user message
                        // Use a hidden trigger message that won't be displayed
                        const triggerEntry: ChatMessage = { role: 'user', content: 'What did you find?', hidden: true };
                        const messagesWithTrigger: ChatMessage[] = [...updated, triggerEntry];
                        setTimeout(() => {
                          sendMessageWithExistingMessages(messagesWithTrigger);
                        }, 100);
                        
                        return updated;
                      });
                    } else {
                      // No practice logs
                      setMessages((m) => {
                        const copy = [...m];
                        const lastIdx = copy.length - 1;
                        if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                          copy.pop();
                        }
                        copy.push({ role: 'assistant', content: `No practice logs found for "${originalInput}". Start practicing this course to generate logs.` });
                        return copy;
                      });
                    }
                  } catch (err) {
                    console.error('Failed to parse practice logs:', err);
                    setMessages((m) => {
                      const copy = [...m];
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      copy.push({ role: 'assistant', content: 'Failed to parse practice logs.' });
                      return copy;
                    });
                  }
                } else {
                  // No practice logs found
                  setMessages((m) => {
                    const copy = [...m];
                    const lastIdx = copy.length - 1;
                    if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                      copy.pop();
                    }
                    copy.push({ role: 'assistant', content: `No practice logs found for "${originalInput}". Start practicing this course to generate logs.` });
                    return copy;
                  });
                }
              } catch (err) {
                console.error('Failed to fetch practice logs:', err);
                setMessages((m) => {
                  const copy = [...m];
                  const lastIdx = copy.length - 1;
                  if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                    copy.pop();
                  }
                  copy.push({ role: 'assistant', content: 'Error fetching practice logs.' });
                  return copy;
                });
              } finally {
                setFetchingContext(false);
              }
            })();
          }
        }
      } else if (action.name === 'fetch_exam_snipe_data') {
        let slug = action.params.slug?.trim();
        const originalInput = slug; // Store original input for name matching
        if (slug && typeof window !== 'undefined') {
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
            setMessages((m) => [...m, { role: 'assistant', content: '', isLoading: true }]);
            
            // Fetch exam snipe data
            (async () => {
              try {
                const examRes = await fetch('/api/exam-snipe/history', { credentials: 'include' });
                const examJson = await examRes.json().catch(() => ({}));
                
                if (examJson?.ok && Array.isArray(examJson.history)) {
                  // First, try to match by course name (case-insensitive, partial match)
                  // This is more reliable since exam snipe data might have different slugs
                  let matchingExamSnipe = examJson.history.find((exam: any) => {
                    const examCourseName = (exam.courseName || '').toLowerCase().trim();
                    const inputName = originalInput.toLowerCase().trim();
                    return examCourseName === inputName || 
                           examCourseName.includes(inputName) || 
                           inputName.includes(examCourseName);
                  });
                  
                  // If not found by name, try by slug
                  if (!matchingExamSnipe && cleanedSlug) {
                    matchingExamSnipe = examJson.history.find((exam: any) => {
                      const examSlug = (exam.slug || '').toLowerCase().trim();
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
                        const desc = c.description ? ` - ${c.description}` : '';
                        return `${idx + 1}. ${name}${desc}`;
                      }).join('\n');
                      contextData.push(`STUDY ORDER (priority, all concepts):\n${studyOrder}`);
                    }
                    
                    // All common questions
                    if (results.commonQuestions && Array.isArray(results.commonQuestions) && results.commonQuestions.length > 0) {
                      const allQuestions = results.commonQuestions.map((q: any, idx: number) => {
                        const question = q.question || '';
                        const count = q.examCount || 0;
                        const points = q.averagePoints || 0;
                        return `${idx + 1}. "${question}" (appears in ${count} exams, avg ${points} pts)`;
                      }).join('\n');
                      contextData.push(`ALL COMMON QUESTIONS:\n${allQuestions}`);
                    }
                    
                    const contextText = contextData.join('\n\n');
                    
                    // Remove loading message and add context as system message
                    setMessages((m) => {
                      const copy = [...m];
                      // Remove the loading message
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      // Add context as system message (hidden from user, but included in API context)
                      const systemEntry: ChatMessage = { role: 'system', content: contextText };
                      const updated: ChatMessage[] = [...copy, systemEntry];
                      
                      // Trigger Chad's response without adding a visible user message
                      // Use a hidden trigger message that won't be displayed
                      const triggerEntry: ChatMessage = { role: 'user', content: 'What did you find?', hidden: true };
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
                      copy.push({ role: 'assistant', content: `No exam snipe data found for "${originalInput}". You may need to run Exam Snipe first for this course.` });
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
                    copy.push({ role: 'assistant', content: 'Failed to fetch exam snipe data.' });
                    return copy;
                  });
                }
              } catch (err) {
                console.error('Failed to fetch exam snipe data:', err);
                setMessages((m) => {
                  const copy = [...m];
                  const lastIdx = copy.length - 1;
                  if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                    copy.pop();
                  }
                  copy.push({ role: 'assistant', content: 'Error fetching exam snipe data.' });
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
  }
  
  // Handle button click
  function handleButtonClick(action: string | undefined, params: Record<string, string> | undefined, uploadId?: string) {
    if (uploadId && uploadedFiles[uploadId] && uploadedFiles[uploadId].length > 0) {
      // If button is associated with file upload, process the files
      const files = uploadedFiles[uploadId];
      if (uploadId) {
        setUploadStatus(prev => ({ ...prev, [uploadId]: 'processing' }));
      }
      if (action === 'start_exam_snipe') {
        // Navigate to exam snipe with files
        router.push('/exam-snipe');
        // Store files temporarily for exam snipe page to pick up
        (window as any).__pendingExamFiles = files;
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
      } else if (action === 'generate_course' || action === 'create_course') {
        // Create course with files - auto-create, don't open modal
        const name = params?.name || 'New Course';
        const syllabus = params?.syllabus || '';
        document.dispatchEvent(new CustomEvent('synapse:create-course-with-files', { detail: { files, name, syllabus } }));
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
      }
      // Always clear files after processing so the upload area resets
      setUploadedFiles(prev => {
        if (!prev[uploadId] || prev[uploadId].length === 0) return prev;
        return { ...prev, [uploadId]: [] };
      });
    } else if (action) {
      // For course creation actions without files, don't open modal - just do nothing or show error
      if (action === 'generate_course' || action === 'create_course') {
        // Don't open modal - user needs to upload files first
        return;
      }
      // Execute other actions normally
      executeActions([{ name: action, params: params || {} }]);
    }
  }
  
  // Handle file upload
  function handleFileUpload(uploadId: string, files: File[]) {
    setUploadedFiles(prev => ({ ...prev, [uploadId]: files }));
    setUploadStatus(prev => ({ ...prev, [uploadId]: files.length > 0 ? 'ready' : 'idle' }));
  }

  function resetFileUploadState(uiElements?: ChatMessage['uiElements']) {
    if (!uiElements || uiElements.length === 0) return;
    const fileUploadIds = uiElements
      .filter((ui) => ui.type === 'file_upload')
      .map((ui) => ui.id)
      .filter(Boolean);
    if (fileUploadIds.length === 0) return;

    setUploadedFiles((prev) => {
      let changed = false;
      const next = { ...prev };

      fileUploadIds.forEach((id) => {
        if (!id) return;
        if (!next[id] || next[id].length > 0) {
          next[id] = [];
          changed = true;
        }
      });

      // Remove any previously stored uploads that are no longer rendered
      Object.keys(next).forEach((id) => {
        if (!fileUploadIds.includes(id) && next[id] && next[id].length === 0 && prev[id] === next[id]) {
          // No change needed; keep empty entries for other active uploaders
        }
      });

      return changed ? next : prev;
    });
    setUploadStatus((prev) => {
      let changed = false;
      const next = { ...prev };
      fileUploadIds.forEach((id) => {
        if (!id) return;
        if (next[id] !== 'idle') {
          next[id] = 'idle';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }

  async function sendMessageWithExistingMessages(existingMessages: ChatMessage[]) {
    if (sending) return;
    try {
      setSending(true);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: true } }));
      const courseContext = await getCompressedCourseContext();
      
      // Gather page context (lesson content or visible text)
      let pageContext = '';
      try {
        const el = document.querySelector('.lesson-content');
        pageContext = el ? (el as HTMLElement).innerText : document.body.innerText;
        pageContext = pageContext.slice(0, 8000);
      } catch {}
      
      // Extract system messages (context data) from existing messages
      const systemMessages = existingMessages.filter(m => m.role === 'system').map(m => m.content);
      const systemContext = systemMessages.join('\n\n---\n\n');
      
      // Combine contexts (system context first, then course context, then page context)
      const fullContext = [systemContext, courseContext, pageContext].filter(Boolean).join('\n\n---\n\n').slice(0, 12000);
      
      // Filter out system messages and loading messages from messages sent to API (they're in context now)
      // Hidden messages are still sent to API (they trigger responses) but won't be displayed
      const messagesForAPI = existingMessages.filter(m => m.role !== 'system' && !m.isLoading);
      
      // Prepare placeholder for streaming
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      const idx = messagesForAPI.length; // assistant index (excluding system messages)
      let accumulatedContent = '';
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: fullContext,
          messages: messagesForAPI,
          path: typeof window !== 'undefined' ? window.location.pathname : ''
        })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      const executedActions = new Set<string>(); // Track executed actions to avoid duplicates
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // After streaming completes, parse UI elements and actions for final cleanup
            if (accumulatedContent) {
              const { cleanedContent, uiElements, actions } = parseUIElementsAndActions(accumulatedContent);
              resetFileUploadState(uiElements);
              // Only show message if there's actual content (not just actions)
              const finalContent = cleanedContent.trim();
              if (finalContent) {
                // Update message with cleaned content and UI elements
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: finalContent, uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined } as ChatMessage;
                  return copy;
                });
                // Execute actions AFTER message is displayed (with a small delay to ensure message renders)
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              } else {
                // No content - remove the empty message
                setMessages((m) => {
                  const copy = [...m];
                  copy.pop();
                  return copy;
                });
                // Still execute actions even if no message
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              }
            } else {
              // If no content was accumulated, remove the empty message
              setMessages((m) => {
                const copy = [...m];
                copy.pop(); // Remove the last empty assistant message
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
                // Parse actions but DON'T execute them during streaming - wait until stream completes
                // This prevents page navigation from interrupting the message stream
                const { cleanedContent: streamCleanedContent } = parseUIElementsAndActions(accumulatedContent);
                // Show cleaned content during streaming (actions removed)
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: streamCleanedContent } as any;
                  return copy;
                });
              } else if (obj.type === 'error') {
                throw new Error(obj.error || 'Streaming error');
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete chunks
              if (parseError instanceof SyntaxError) {
                // This is expected for incomplete JSON chunks, continue
              } else {
                throw parseError;
              }
            }
          });
        }
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages((m) => [...m, { role: 'assistant', content: 'Error: ' + (e?.message || 'Failed to send. Please try again.') }]);
    } finally {
      setSending(false);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: false } }));
    }
  }

  // Handle pending welcome message
  useEffect(() => {
    if (pendingWelcomeMessageRef.current && open && !sending) {
      const { welcomeMessage, userMessage } = pendingWelcomeMessageRef.current;
      pendingWelcomeMessageRef.current = null;
      
      // Send the message with existing messages
      setTimeout(() => {
        sendMessageWithExistingMessages([
          { role: 'assistant', content: welcomeMessage },
          { role: 'user', content: userMessage }
        ]);
      }, 100);
    }
  }, [open, sending]);

  // Auto-scroll to bottom when messages change (especially during streaming)
  useEffect(() => {
    if (!open || !messagesEndRef.current) return;
    
    // Always scroll when messages length changes or when sending state changes
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }, [messages.length, sending, open, scrollTrigger]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setShowFullChat(true); // Open full chat when sending a message
    try {
      setSending(true);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: true } }));
      const courseContext = await getCompressedCourseContext();
      
      // Gather page context (lesson content or visible text)
      let pageContext = '';
      try {
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const isSurgeLearnPhase = pathname.includes('/surge');
        
        // Check for Surge learn phase lesson content
        if (isSurgeLearnPhase) {
          // Try to find the Surge lesson card
          const surgeLessonCard = document.querySelector('.surge-lesson-card, [data-topic]');
          const lessonContentDiv = document.querySelector('.lesson-content');
          
          if (surgeLessonCard) {
            // Extract structured lesson information
            const currentTopic = surgeLessonCard.getAttribute('data-topic') || '';
            const partIndex = surgeLessonCard.getAttribute('data-part-index') || '';
            const totalParts = surgeLessonCard.getAttribute('data-total-parts') || '';
            
            // Get lesson header
            const headerEl = surgeLessonCard.querySelector('h2');
            const header = headerEl?.textContent?.trim() || '';
            
            // Get lesson content
            const contentEl = lessonContentDiv || surgeLessonCard.querySelector('.lesson-content') || surgeLessonCard;
            const content = (contentEl as HTMLElement)?.innerText || contentEl?.textContent || '';
            
            // Build structured context for Chad
            const surgeContext: string[] = [];
            surgeContext.push('=== CURRENT SURGE LEARN PHASE CONTENT ===');
            if (currentTopic) {
              surgeContext.push(`Topic Being Learned: ${currentTopic}`);
            }
            if (header) {
              surgeContext.push(`Current Lesson Part: ${header}`);
            }
            if (partIndex && totalParts) {
              surgeContext.push(`Progress: Part ${parseInt(partIndex) + 1} of ${totalParts}`);
            }
            surgeContext.push('');
            surgeContext.push('LESSON CONTENT:');
            surgeContext.push(content);
            surgeContext.push('=== END SURGE CONTENT ===');
            
            pageContext = surgeContext.join('\n\n');
          } else {
            // Fallback: try to get any visible lesson text from the page
            const allText = document.body.innerText;
            if (allText) {
              pageContext = `=== SURGE LEARN PHASE ===\n${allText}`;
            }
          }
        } else {
          // For other pages, use existing logic
          const el = document.querySelector('.lesson-content');
          pageContext = el ? (el as HTMLElement).innerText : document.body.innerText;
        }
        
        // Limit size but allow more for Surge content
        pageContext = pageContext.slice(0, 12000);
      } catch {}
      
      // Extract system messages (context data) from messages
      const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content);
      const systemContext = systemMessages.join('\n\n---\n\n');
      
      // Combine contexts (system context first, then course context, then page context)
      const fullContext = [systemContext, courseContext, pageContext].filter(Boolean).join('\n\n---\n\n').slice(0, 12000);
      
      // Filter out system messages from messages sent to API (they're in context now)
      const messagesForAPI = messages.filter(m => m.role !== 'system' && !m.isLoading);
      
      // Prepare placeholder for streaming
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      const idx = messagesForAPI.length + 1; // assistant index (excluding system messages)
      let accumulatedContent = '';
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: fullContext,
          messages: [...messagesForAPI, { role: 'user', content: text }],
          path: typeof window !== 'undefined' ? window.location.pathname : ''
        })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      const executedActions = new Set<string>(); // Track executed actions to avoid duplicates
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // After streaming completes, parse UI elements and actions for final cleanup
            if (accumulatedContent) {
              const { cleanedContent, uiElements, actions } = parseUIElementsAndActions(accumulatedContent);
              resetFileUploadState(uiElements);
              // Only show message if there's actual content (not just actions)
              const finalContent = cleanedContent.trim();
              if (finalContent) {
                // Update message with cleaned content and UI elements
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: finalContent, uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined } as ChatMessage;
                  return copy;
                });
                // Execute actions AFTER message is displayed (with a small delay to ensure message renders)
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              } else {
                // No content - remove the empty message
                setMessages((m) => {
                  const copy = [...m];
                  copy.pop();
                  return copy;
                });
                // Still execute actions even if no message
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              }
            } else {
              // If no content was accumulated, remove the empty message
              setMessages((m) => {
                const copy = [...m];
                copy.pop(); // Remove the last empty assistant message
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
                // Parse actions but DON'T execute them during streaming - wait until stream completes
                // This prevents page navigation from interrupting the message stream
                const { cleanedContent: streamCleanedContent } = parseUIElementsAndActions(accumulatedContent);
                // Show cleaned content during streaming (actions removed)
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: streamCleanedContent } as any;
                  return copy;
                });
              } else if (obj.type === 'error') {
                throw new Error(obj.error || 'Streaming error');
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete chunks
              if (parseError instanceof SyntaxError) {
                // This is expected for incomplete JSON chunks, continue
              } else {
                throw parseError;
              }
            }
          });
        }
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages((m) => [...m, { role: 'assistant', content: 'Error: ' + (e?.message || 'Failed to send. Please try again.') }]);
    } finally {
      setSending(false);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: false } }));
    }
  }

  // Auto-scroll to bottom when messages change (especially during streaming)
  useEffect(() => {
    if (!open || !messagesEndRef.current) return;
    
    // Always scroll when messages length changes, content changes, or when sending state changes
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }, [messages.length, sending, open, scrollTrigger]);

  // Also poll during streaming to catch content updates
  useEffect(() => {
    if (!open || !sending) return;
    
    const interval = setInterval(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 100); // Check every 100ms during streaming
    
    return () => clearInterval(interval);
  }, [open, sending]);

  // Prevent body scroll when chat is open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (open) {
      // Save current scroll position
      const scrollY = window.scrollY;
      // Disable body scroll
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore body scroll
        const scrollY = document.body.style.top;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      };
    }
  }, [open]);

  // Click outside to close chat - but NOT when clicking the toggle button
  useEffect(() => {
    if (!open && !showFullChat) return;
    
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element;
      // Don't close if clicking the chat pill, full chat dropdown, or toggle button
      if (
        target.closest('[data-chat-pill]') ||
        target.closest('[data-chat-input]') ||
        target.closest('button[data-chat-toggle]') ||
        target.closest('[data-chat-dropdown]')
      ) {
        return;
      }
      // Close if clicking outside
      setOpen(false);
      setShowFullChat(false);
    }
    
    // Use a small delay to let button clicks process first
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [open, showFullChat]);

  // Resize handlers (bottom-left grip)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing || !start) return;
      const dx = e.clientX - start.x; // moving right is positive
      const dy = e.clientY - start.y; // moving down is positive
      // Anchored to right edge; dragging bottom-left: decrease x to grow width
      setSize({ w: Math.max(420, start.w - dx), h: Math.max(320, start.h + dy) });
    }
    function onUp() { setResizing(false); setStart(null); }
    if (resizing) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, start]);

  // Render chat content (shared between fullscreen and dropdown)
  const renderChatContent = () => (
    <>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 p-4">
        {messages.length === 0 && (
          <div className="text-xs text-[var(--foreground)]/60">Ask a question about this page. I'll use the current page content as context.</div>
        )}
        {messages.map((m, i) => {
          // Skip system messages and hidden messages in display (they're context only)
          if (m.role === 'system' || m.hidden) return null;
          
          // Show loading spinner for loading messages
          if (m.isLoading) {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[80%]">
                  <div className="text-[10px] text-[var(--foreground)]/60 mb-1 ml-1">Chad</div>
                  <div className="rounded-xl bg-[var(--background)]/80 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--foreground)]/10 flex items-center gap-2">
                    <GlowSpinner size={16} ariaLabel="Loading" idSuffix={`chat-loading-${i}`} />
                    <span className="text-xs text-[var(--foreground)]/60">Getting info...</span>
                  </div>
                </div>
              </div>
            );
          }
          
          return (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[80%]">
              <div className="text-[10px] text-[var(--foreground)]/60 mb-1 ml-1">{m.role === 'user' ? 'You' : 'Chad'}</div>
              <div className={m.role === 'user' ? 'rounded-xl bg-[var(--accent-cyan)]/20 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--accent-cyan)]/30' : 'rounded-xl bg-[var(--background)]/80 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--foreground)]/10'}>
              {m.role === 'assistant' ? (
                <>
                  <LessonBody body={sanitizeLessonBody(String(m.content || ''))} />
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
                          // Extract button label from params if provided
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
                <span>{m.content}</span>
              )}
              </div>
            </div>
          </div>
        );
        })}
        {/* Scroll target for auto-scroll */}
        <div ref={messagesEndRef} />
      </div>
      {/* Input area */}
      <div className="border-t border-[var(--foreground)]/10 p-4 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && !sending) {
              sendMessage();
            }
          }}
          className="flex gap-2"
        >
          <input
            ref={chatInputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]/30"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white font-medium hover:opacity-95 disabled:opacity-50 transition-opacity"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );

  // In fullscreen mode, always show the chat content without the button
  if (fullscreen) {
    return (
      <div className="h-full flex flex-col">
        {renderChatContent()}
      </div>
    );
  }

  return (
    <>
      {/* Chat pill under header - appears when typing */}
      {typeof document !== 'undefined' && open && !showFullChat ? createPortal(
        <div
          style={{
            position: 'fixed',
            top: 'calc(3.5rem + max(3px, calc(env(safe-area-inset-top, 0px) / 2)) + 1.5rem)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9998,
            pointerEvents: 'auto',
            opacity: 1,
            transition: 'opacity 0.2s ease-out',
          }}
        >
          <div 
            data-chat-pill
            className="flex items-center gap-3 rounded-full bg-[rgba(229,231,235,0.08)] px-5 py-3 border border-white/5"
            style={{ 
              boxShadow: 'none',
              minWidth: '400px',
              maxWidth: '700px',
            }}
          >
            <input
              ref={chatInputRef}
              data-chat-input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { 
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Chat with Chad..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/60 focus:outline-none"
              style={{ boxShadow: 'none' }}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (input.trim()) {
                  sendMessage();
                }
              }}
              disabled={sending || !input.trim()}
              className={`transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full ${input.trim() ? 'text-white/90 hover:text-white' : 'text-white/60 hover:text-white/80'}`}
              style={{ 
                boxShadow: 'none',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>,
        document.body
      ) : null}
      {/* Floating chat button in bottom right */}
      {typeof document !== 'undefined' && !showFullChat ? createPortal(
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setShowFullChat(true);
            requestAnimationFrame(() => {
              chatInputRef.current?.focus();
            });
          }}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ease-out"
          style={{ 
            background: 'rgba(229, 231, 235, 0.08)',
            boxShadow: 'none',
          }}
          aria-label="Open chat"
          title="Open chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>,
        document.body
      ) : null}
      {/* Full chat dropdown */}
      {typeof document !== 'undefined' && showFullChat ? createPortal(
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90vh',
            zoom: typeof window !== 'undefined' && window.innerWidth >= 768 && !(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) ? 1.4 : undefined,
          }}
        >
          <div 
            ref={chatDropdownRef}
            data-chat-dropdown
            className="rounded-2xl border border-white/5 flex flex-col"
            style={{ 
              boxShadow: 'none',
              background: 'rgba(15, 18, 22, 0.95)',
              height: 'min(750px, 90vh)',
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 flex-shrink-0 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">Chat</h2>
              <button
                onClick={() => {
                  setShowFullChat(false);
                  setOpen(false);
                }}
                className="text-white/60 hover:text-white/80 transition-colors !shadow-none"
                title="Close chat"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 p-4 min-h-0">
              {messages.length === 0 && (
                <div className="text-xs text-white/60">Ask a question about this page. I'll use the current page content as context.</div>
              )}
              {messages.map((m, i) => {
                if (m.role === 'system' || m.hidden) return null;
                
                if (m.isLoading) {
                  return (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[80%] inline-block px-3 py-1.5 rounded-full bg-[rgba(229,231,235,0.08)] border border-white/5">
                        <div className="text-sm text-white/90 leading-relaxed flex items-center gap-2">
                          <span className="inline-block w-2 h-2 bg-white/60 rounded-full animate-pulse"></span>
                          Thinking...
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    {m.role === 'user' ? (
                      <div className="max-w-[80%] inline-block px-3 py-1.5 rounded-2xl bg-[rgba(229,231,235,0.15)] border border-white/10">
                        <div className="text-sm text-white/90 leading-relaxed">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[80%] inline-block px-3 py-1.5 rounded-2xl bg-[rgba(229,231,235,0.08)] border border-white/5">
                        <div className="text-sm text-white/90 leading-relaxed">
                          {m.role === 'assistant' ? (
                            <>
                              <div className="chat-bubble">
                                <LessonBody body={sanitizeLessonBody(String(m.content || ''))} />
                              </div>
                            </>
                          ) : (
                            m.content
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Chat pill at bottom */}
            <div className="p-4 border-t border-white/5 flex-shrink-0">
              <div 
                data-chat-pill
                className="flex items-center gap-3 rounded-full bg-[rgba(229,231,235,0.08)] px-5 py-3 border border-white/5"
                style={{ 
                  boxShadow: 'none',
                }}
              >
                <input
                  ref={chatInputRef}
                  data-chat-input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Chat with Chad..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/60 focus:outline-none"
                  style={{ boxShadow: 'none' }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (input.trim()) {
                      sendMessage();
                    }
                  }}
                  disabled={sending || !input.trim()}
                  className={`transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full ${input.trim() ? 'text-white/90 hover:text-white' : 'text-white/60 hover:text-white/80'}`}
                  style={{ 
                    boxShadow: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

type Subject = { name: string; slug: string };

function getSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("atomicSubjects");
    return raw ? (JSON.parse(raw) as Subject[]) : [];
  } catch {
    return [];
  }
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const pathname = usePathname();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [subscriptionLevel, setSubscriptionLevel] = useState<string>("Free");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uiZoom, setUiZoom] = useState<number>(1.4);
  const [isIOSStandalone, setIsIOSStandalone] = useState<boolean>(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [surgeLogModalOpen, setSurgeLogModalOpen] = useState(false);
  const [surgeLogRefreshKey, setSurgeLogRefreshKey] = useState(0); // Force re-render when data changes
  const [surgeLogData, setSurgeLogData] = useState<any[]>([]); // Store surge log data in state
  const [expandedSurgeTopics, setExpandedSurgeTopics] = useState<Set<string>>(new Set());
  const [expandedSurgeQuestionTypes, setExpandedSurgeQuestionTypes] = useState<Set<string>>(new Set());
  const [expandedSurgeQuestions, setExpandedSurgeQuestions] = useState<Set<string>>(new Set());
  const [editingDate, setEditingDate] = useState<{ sessionId: string; type: 'topic' | 'question'; questionId?: string } | null>(null);
  const [editingDateValue, setEditingDateValue] = useState<string>("");
  const infoMarkdown = `
  # Welcome to Synapse
  
  Synapse turns your course materials into an adaptive learning system.
  
  ## What it does
  - Reads and analyzes **uploaded files** — lecture slides, old exams, syllabuses, or notes.
  - **Extracts core topics and concepts** that define each course.
  - Builds **structured lessons** that teach every concept from the ground up.
  - Adds **context-aware explanations** — click on any word or formula to get a clear, relevant definition.
  - Generates **interactive quizzes** at the end of each lesson for active recall and mastery.
  - Supports **multiple languages**, following the language used in your materials.
  - Provides **PDF export** and **spaced repetition** scheduling for long-term retention.
  
  ## How to use it
  1. **Upload files** on the home page to create a new course.
  2. Synapse automatically extracts and organizes the main topics.
  3. **Open a topic** to generate a full AI-driven lesson.
  4. **Click any word or paragraph** to get instant, context-aware help.
  5. **Take the quiz** at the end of each lesson to test your understanding.
  6. Revisit topics through the **review planner** to keep knowledge fresh.
  
  Synapse helps you learn smarter — not longer.
  `.trim();

  useEffect(() => {
    setSubjects(getSubjects());
    try {
      const raw = localStorage.getItem("atomicTheme");
      if (raw) {
        const t = JSON.parse(raw);
        const root = document.documentElement;
        root.style.setProperty("--background", t.background || "#1a1d23");
        root.style.setProperty("--foreground", t.foreground || "#E5E7EB");
        root.style.setProperty("--accent-cyan", t.accentCyan || "#00E5FF");
        root.style.setProperty("--accent-pink", t.accentPink || "#FF2D96");
        root.style.setProperty("--accent-grad", `linear-gradient(90deg, ${t.accentCyan || '#00E5FF'}, ${t.accentPink || '#FF2D96'})`);
      }
    } catch {}

    // Load initial theme mode
    try {
      const raw = localStorage.getItem("atomicTheme");
      if (raw) {
        const t = JSON.parse(raw);
        console.log('Loading theme from localStorage:', t);
        if (t.isLightMode) {
          console.log('Applying light mode');
          document.documentElement.classList.add('light-mode');
        } else {
          console.log('Applying dark mode');
          document.documentElement.classList.remove('light-mode');
        }
      }
    } catch (e) {
      console.error('Error loading theme:', e);
    }
  }, [pathname]);

  // Listen for chat sending state changes
  useEffect(() => {
    const handleChatSending = (e: Event) => {
      // Chat sending state is handled internally by ChatDropdown
      // No need to track it here
    };

    document.addEventListener('synapse:chat-sending', handleChatSending as EventListener);
    return () => {
      document.removeEventListener('synapse:chat-sending', handleChatSending as EventListener);
    };
  }, []);

  // Avoid CSS zoom on iOS PWA (breaks input focus and text selection)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && isStandalone) {
      setUiZoom(1);
      setIsIOSStandalone(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateLayout = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      setIsMobile(mobile);

      if (isIOSStandalone) {
        setUiZoom(1);
        return;
      }

      if (mobile) {
        setUiZoom(1);
      } else if (width < 1280) {
        setUiZoom(1.2);
      } else {
        setUiZoom(1.35);
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [isIOSStandalone]);

  // Load surge log data when modal opens or refresh key changes
  useEffect(() => {
    if (!surgeLogModalOpen) {
      setSurgeLogData([]);
      return;
    }

    const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
    if (!slugMatch) {
      setSurgeLogData([]);
      return;
    }
    const slug = slugMatch[1];

    try {
      const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
      if (stored) {
        const data = JSON.parse(stored);
        const surgeLog = data?.surgeLog || [];
        console.log("SurgeLog loaded into state:", {
          entryCount: surgeLog.length,
          timestamps: surgeLog.map((e: any) => ({
            sessionId: e.sessionId,
            timestamp: e.timestamp,
            date: new Date(e.timestamp).toISOString()
          }))
        });
        setSurgeLogData(surgeLog);
      } else {
        setSurgeLogData([]);
      }
    } catch (e) {
      console.error("Failed to load surge log:", e);
      setSurgeLogData([]);
    }
  }, [surgeLogModalOpen, surgeLogRefreshKey, pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsOpen && !(event.target as Element).closest('.settings-modal')) {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  // Determine auth state (used to hide chrome on login page and show Logout)
  useEffect(() => {
    (async () => {
      try {
        const me = await fetch("/api/me").then(r => r.json().catch(() => ({})));
        setIsAuthenticated(!!me?.user);
        if (me?.user?.subscriptionLevel) {
          setSubscriptionLevel(me.user.subscriptionLevel);
        } else {
          setSubscriptionLevel("Free");
        }
      } catch {
        setIsAuthenticated(false);
        setSubscriptionLevel("Free");
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClick = (event: MouseEvent | TouchEvent) => {
      if (!mobileMenuRef.current) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (!mobileMenuRef.current.contains(target)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [mobileMenuOpen]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    try {
      // Clear client cache of user data
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k === "atomicSubjects" || k.startsWith("atomicSubjectData:"))) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch {}
    // Redirect to login page with full reload
    window.location.href = "/";
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((err) => {
        console.error("Error attempting to exit fullscreen:", err);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const crumbs = useMemo(() => {
    const parts = (pathname || "/").split("/").filter(Boolean);
    const items: { label: string; href: string }[] = [];
    const idxSubjects = parts.indexOf("subjects");
    const idxNode = parts.indexOf("node");
    const idxLesson = parts.indexOf("lesson");

    // Subject
    if (idxSubjects >= 0 && parts[idxSubjects + 1]) {
      const slug = parts[idxSubjects + 1];
      const subj = subjects.find((s) => s.slug === slug);
      items.push({ label: subj?.name || decodeURIComponent(slug), href: `/subjects/${slug}` });
    }
    // Topic
    if (idxSubjects >= 0 && idxNode >= 0 && parts[idxSubjects + 1] && parts[idxNode + 1]) {
      const slug = parts[idxSubjects + 1];
      const topic = decodeURIComponent(parts[idxNode + 1]);
      items.push({ label: topic, href: `/subjects/${slug}/node/${encodeURIComponent(topic)}` });
    }
    // Lesson
    if (idxSubjects >= 0 && idxNode >= 0 && idxLesson >= 0 && parts[idxSubjects + 1] && parts[idxNode + 1] && parts[idxLesson + 1]) {
      const slug = parts[idxSubjects + 1];
      const topic = decodeURIComponent(parts[idxNode + 1]);
      const lidx = parts[idxLesson + 1];
      const label = `Lesson ${isNaN(Number(lidx)) ? lidx : Number(lidx) + 1}`;
      items.push({ label, href: `/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lidx}` });
    }
    return items;
  }, [pathname, subjects]);

  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  return (
    <>
      {/* Loading Screen - show immediately when authenticated, or while checking auth (assumes will be authenticated after login) */}
      {isLoading && (!authChecked || isAuthenticated) && <LoadingScreen onComplete={handleLoadingComplete} />}
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]" style={!isIOSStandalone && !isMobile ? { zoom: uiZoom } : undefined}>
      {/* Main content */}
      <div className="flex min-h-screen w-full flex-col">
        {authChecked && isAuthenticated && (
        <header className="sticky top-0 z-50" style={{ paddingTop: 0, backgroundColor: 'rgba(15, 18, 22, 0.92)', backdropFilter: 'blur(10px) saturate(180%)', WebkitBackdropFilter: 'blur(10px) saturate(180%)', isolation: 'isolate' }}>
          <nav className="relative flex h-14 items-center px-3 sm:px-4 gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  router.push('/');
                }}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity !shadow-none pl-0 pr-20 py-2"
              >
                <GlowSpinner size={24} ariaLabel="Synapse" idSuffix="header" />
                <div style={{ transform: "scale(1.2)", transformOrigin: "left center" }}>
                  <h1 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider relative inline-block" style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}>
                    SYNAPSE
                    <sup className="text-xs text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] absolute -top-0.5 left-full ml-1" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>(ALPHA)</sup>
                    <span className="text-[7px] text-[var(--foreground)]/40 absolute bottom-1 left-20 whitespace-nowrap" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>{APP_VERSION}</span>
                  </h1>
                </div>
              </button>
            </div>

            {/* Center: SURGE text on surge page */}
            {pathname?.includes('/surge') && (
              <div className="hidden md:flex absolute left-1/2 transform -translate-x-1/2 items-center">
                <h1 
                  className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider" 
                  style={{ 
                    fontFamily: 'var(--font-orbitron), sans-serif',
                    fontWeight: 700,
                    textShadow: '0 0 20px rgba(0, 229, 255, 0.4), 0 0 40px rgba(255, 45, 150, 0.2)',
                    letterSpacing: '0.15em'
                  }}
                >
                  SURGE
                </h1>
              </div>
            )}

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {!isMobile && (
                <>
                {/* SurgeLog button - only for Tester subscription on surge page */}
                  {subscriptionLevel === "Tester" && pathname?.includes('/surge') && (
                      <button
                        onClick={() => {
                          setSurgeLogModalOpen(true);
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }}
                        className="relative inline-flex items-center justify-center px-1.5 py-1.5
                                   focus:outline-none focus:ring-0 focus-visible:outline-none
                                   transition-all duration-300 ease-out"
                        style={{ 
                          outline: 'none', 
                          WebkitTapHighlightColor: 'transparent', 
                          transform: 'none !important',
                          borderRadius: '50%',
                          margin: 0,
                          display: 'flex',
                          height: '32px',
                          width: '32px',
                          boxShadow: 'none',
                          background: 'rgba(229, 231, 235, 0.08)',
                        }}
                        aria-label="Surge Log"
                        title="Surge Log"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                  )}
                  {/* Pomodoro Timer */}
                  <PomodoroTimer />
                </>
              )}
              <div className="hidden md:flex items-center gap-2">
                {/* Fullscreen button */}
                  <button
                    onClick={toggleFullscreen}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }}
                    className="relative inline-flex items-center justify-center px-1.5 py-1.5
                               focus:outline-none focus:ring-0 focus-visible:outline-none
                               transition-all duration-300 ease-out"
                    style={{ 
                      outline: 'none', 
                      WebkitTapHighlightColor: 'transparent', 
                      transform: 'none !important',
                      borderRadius: '50%',
                      margin: 0,
                      display: 'flex',
                      height: '32px',
                      width: '32px',
                      boxShadow: 'none',
                      background: 'rgba(229, 231, 235, 0.08)',
                    }}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullscreen ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                    )}
                  </button>
                {/* Info button */}
                  <button
                    onClick={() => setInfoOpen(true)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }}
                    className="relative inline-flex items-center justify-center px-1.5 py-1.5
                               focus:outline-none focus:ring-0 focus-visible:outline-none
                               transition-all duration-300 ease-out"
                    style={{ 
                      outline: 'none', 
                      WebkitTapHighlightColor: 'transparent', 
                      transform: 'none !important',
                      borderRadius: '50%',
                      margin: 0,
                      display: 'flex',
                      height: '32px',
                      width: '32px',
                      boxShadow: 'none',
                      background: 'rgba(229, 231, 235, 0.08)',
                    }}
                    aria-label="Info"
                    title="About this app"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M12 8.5a.75.75 0 100-1.5.75.75 0 000 1.5z" fill="currentColor"/>
                      <path d="M11.25 10.5h1.5v6h-1.5z" fill="currentColor"/>
                    </svg>
                  </button>
                {/* Settings button */}
                  <button
                    onClick={() => setSettingsOpen(true)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }}
                    className="relative inline-flex items-center justify-center px-1.5 py-1.5
                               focus:outline-none focus:ring-0 focus-visible:outline-none
                               transition-all duration-300 ease-out"
                    style={{ 
                      outline: 'none', 
                      WebkitTapHighlightColor: 'transparent', 
                      transform: 'none !important',
                      borderRadius: '50%',
                      margin: 0,
                      display: 'flex',
                      height: '32px',
                      width: '32px',
                      boxShadow: 'none',
                      background: 'rgba(229, 231, 235, 0.08)',
                    }}
                    aria-label="Settings"
                    title="Settings"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </button>
              </div>

              <div ref={mobileMenuRef} className="relative md:hidden">
                {/* Mobile menu button with gradient border */}
                <div
                  className="inline-flex rounded-xl transition-all duration-300 overflow-hidden"
                  style={{
                    padding: '1.5px',
                    background: mobileMenuOpen 
                      ? 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))'
                      : 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                    boxShadow: mobileMenuOpen
                      ? '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)'
                      : '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!mobileMenuOpen) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!mobileMenuOpen) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                    }
                  }}
                >
                  <button
                    onClick={() => setMobileMenuOpen((open) => !open)}
                    className="group relative inline-flex items-center gap-1 px-3 py-2 text-sm
                               text-white
                               transition-all duration-300 ease-out
                               bg-[var(--background)]/90 backdrop-blur-md"
                    style={{
                      borderRadius: 'calc(0.75rem - 1.5px)',
                    }}
                    aria-expanded={mobileMenuOpen}
                    aria-haspopup="true"
                  >
                    Menu
                    <svg className={`h-4 w-4 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {mobileMenuOpen && isMobile && (
                  <div 
                    className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl overflow-hidden z-50"
                    style={{
                      padding: '1.5px',
                      background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
                    }}
                  >
                    <div className="rounded-2xl bg-[var(--background)]/95 backdrop-blur-md p-3 space-y-4" style={{ borderRadius: 'calc(1rem - 1.5px)' }}>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--foreground)]/60">Tools</p>
                      <div className="mt-2 space-y-1.5">
                        <button
                          onClick={() => {
                            router.push('/exam-snipe');
                            setMobileMenuOpen(false);
                          }}
                          className="w-full rounded-lg bg-[var(--background)]/70 px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]/85 transition-colors"
                        >
                          Exam Snipe
                        </button>
                        <button
                          onClick={() => {
                            router.push('/quicklearn');
                            setMobileMenuOpen(false);
                          }}
                          className="w-full rounded-lg bg-[var(--background)]/70 px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]/85 transition-colors"
                        >
                          Quick Learn
                        </button>
                        <button
                          onClick={() => {
                            router.push('/readassist');
                            setMobileMenuOpen(false);
                          }}
                          className="w-full rounded-lg bg-[var(--background)]/70 px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]/85 transition-colors"
                        >
                          Read Assist
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[var(--foreground)]/10 pt-3">
                      <p className="text-xs uppercase tracking-wide text-[var(--foreground)]/60">Pomodoro</p>
                      <div className="mt-2">
                        <PomodoroTimer />
                      </div>
                    </div>

                    <div className="border-t border-[var(--foreground)]/10 pt-3 space-y-1.5">
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          document.dispatchEvent(new CustomEvent('synapse:open-chat'));
                        }}
                        className="w-full rounded-lg bg-gradient-to-r from-[#00E5FF]/20 to-[#FF2D96]/20 px-3 py-2 text-left text-sm text-[var(--foreground)] hover:from-[#00E5FF]/30 hover:to-[#FF2D96]/30 transition-colors"
                      >
                        Open Chat
                      </button>
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setInfoOpen(true);
                        }}
                        className="w-full rounded-lg bg-[var(--background)]/70 px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]/85 transition-colors"
                      >
                        App Info
                      </button>
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setSettingsOpen(true);
                        }}
                        className="w-full rounded-lg bg-[var(--background)]/70 px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]/85 transition-colors"
                      >
                        Settings
                      </button>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </nav>
          {/* Glowing gradient separator */}
          <div className="relative h-[2px] overflow-hidden">
            {/* Main line */}
            <div className="relative h-[2px] bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] opacity-60 z-10" />
            {/* Glow layer under the line */}
            <div className="absolute left-0 right-0 h-[4px] top-[2px] bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] opacity-90 blur-sm" />
          </div>
        </header>
        )}
        {/* Chat button positioned just below header */}
        {authChecked && isAuthenticated && !isMobile && (
          <div className="fixed left-1/2 transform -translate-x-1/2 z-40" style={{ top: 'calc(3.5rem + max(3px, calc(env(safe-area-inset-top, 0px) / 2)) - 0.2rem)' }}>
            <ChatDropdown />
          </div>
        )}
        <main className="flex-1">{children}</main>
      </div>
      <div className="settings-modal">
        <SettingsModal 
          open={settingsOpen} 
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
          isAuthenticated={isAuthenticated}
          subscriptionLevel={subscriptionLevel}
          onSubscriptionLevelChange={(level) => setSubscriptionLevel(level)}
        />
      </div>
      <Modal
        open={accountOpen}
        onClose={() => { if (!authLoading) { setAccountOpen(false); setAuthError(null); } }}
        title={authMode === "login" ? "Sign in" : "Create account"}
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="text-xs text-[var(--foreground)]/60">
              {authMode === "login" ? (
                <>No account? <button onClick={() => setAuthMode("signup")} className="underline">Sign up</button></>
              ) : (
                <>Have an account? <button onClick={() => setAuthMode("login")} className="underline">Sign in</button></>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAccountOpen(false)}
                disabled={authLoading}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm"
                style={{ backgroundColor: '#141923', color: 'white' }}
              >
                Close
              </button>
              <button
                onClick={async () => {
                  try {
                    setAuthLoading(true);
                    setAuthError(null);
                    const res = await fetch(authMode === "login" ? "/api/auth/login" : "/api/auth/signup", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username: authUsername.trim(), password: authPassword }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
                    setAccountOpen(false);
                    setAuthUsername("");
                    setAuthPassword("");
                    // Fetch user data including subscription level
                    try {
                      const me = await fetch("/api/me").then(r => r.json().catch(() => ({})));
                      setIsAuthenticated(!!me?.user);
                      if (me?.user?.subscriptionLevel) {
                        setSubscriptionLevel(me.user.subscriptionLevel);
                      } else {
                        setSubscriptionLevel("Free");
                      }
                    } catch {}
                    // Reload to pick up server-synced state
                    router.refresh();
                  } catch (e: any) {
                    setAuthError(e?.message || "Something went wrong");
                  } finally {
                    setAuthLoading(false);
                  }
                }}
                disabled={authLoading || !authUsername.trim() || authPassword.length < 6}
                className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 text-sm font-medium !text-white hover:opacity-95 disabled:opacity-60 disabled:!text-white"
                style={{ color: 'white' }}
              >
                {authLoading ? (authMode === "login" ? "Signing in..." : "Creating...") : (authMode === "login" ? "Sign in" : "Sign up")}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {authError && <div className="text-sm text-[#FFC0DA]">{authError}</div>}
          <div>
            <label className="mb-1 block text-xs text-[var(--foreground)]/70">Username</label>
            <input
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="yourname"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--foreground)]/70">Password</label>
            <input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              type="password"
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="At least 6 characters"
            />
          </div>
          <div className="text-[10px] text-[var(--foreground)]/60">
            Your data will be saved securely to your account.
          </div>
        </div>
      </Modal>
      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="About this app"
        footer={
          <div className="flex items-center justify-end">
            <button
              onClick={() => setInfoOpen(false)}
              className="inline-flex h-9 items-center rounded-full px-4 text-sm"
              style={{ backgroundColor: '#141923', color: 'white' }}
            >
              Close
            </button>
          </div>
        }
      >
        <div className="lesson-content text-sm">
          <LessonBody body={sanitizeLessonBody(infoMarkdown)} />
        </div>
      </Modal>

      {/* SurgeLog Modal */}
      {surgeLogModalOpen && (() => {
        // Extract slug from pathname
        const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
        if (!slugMatch) return null;
        const slug = slugMatch[1];
        
        // Use the surgeLogData state (loaded via useEffect)
        const surgeLog = surgeLogData;

        // Group all quiz results by topic across all sessions
        const allQuizResults: Array<{ entry: any; result: any; sessionDate: string }> = [];
        surgeLog.forEach((entry: any) => {
          if (entry.quizResults && Array.isArray(entry.quizResults) && entry.quizResults.length > 0) {
            entry.quizResults.forEach((result: any) => {
              allQuizResults.push({
                entry,
                result,
                sessionDate: new Date(entry.timestamp).toLocaleDateString(),
              });
            });
          }
        });

        // Group by topic
        const groupedByTopic: Record<string, Array<{ entry: any; result: any; sessionDate: string }>> = {};
        allQuizResults.forEach((item) => {
          const topic = item.result.topic || item.entry.newTopic || "Unknown";
          if (!groupedByTopic[topic]) {
            groupedByTopic[topic] = [];
          }
          groupedByTopic[topic].push(item);
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--foreground)]/30 bg-[var(--background)]/95 p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    Surge Log
                  </h2>
                  <p className="text-xs text-[var(--foreground)]/60">
                    Your Surge session history with quiz results. Entries persist per course.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                      if (!slugMatch) return;
                      const slug = slugMatch[1];
                      
                      if (confirm("Are you sure you want to clear all Surge logs for this course? This action cannot be undone.")) {
                        try {
                          const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                          if (stored) {
                            const data = JSON.parse(stored);
                            data.surgeLog = [];
                            localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                            
                            // Also sync to server if authenticated
                            if (isAuthenticated) {
                              try {
                                await fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ data })
                                });
                              } catch (serverError) {
                                console.warn("Failed to sync cleared surge log to server:", serverError);
                                // Continue anyway - local clear is done
                              }
                            }
                            
                            setSurgeLogModalOpen(false);
                            // Refresh the page to update the UI
                            window.location.reload();
                          }
                        } catch (e) {
                          console.error("Failed to clear surge log:", e);
                          alert("Failed to clear surge log. Check console for details.");
                        }
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    aria-label="Clear surge logs"
                  >
                    Clear Logs
                  </button>
                  <button
                    onClick={() => setSurgeLogModalOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors"
                    aria-label="Close surge log"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-4 text-sm leading-relaxed text-[var(--foreground)] space-y-2">
                {Object.keys(groupedByTopic).length > 0 ? (
                  Object.entries(groupedByTopic)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([topicName, items]) => {
                      const isExpanded = expandedSurgeTopics.has(topicName);
                      const avgGrade = items.reduce((sum, item) => sum + (item.result.grade || 0), 0) / items.length;
                      const latestItem = items.sort((a, b) => b.entry.timestamp - a.entry.timestamp)[0];

                      return (
                        <div
                          key={topicName}
                          className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/80 overflow-hidden"
                        >
                          {/* Topic Header - Clickable */}
                          <button
                            onClick={() => {
                              setExpandedSurgeTopics(prev => {
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
                                {items.length} question{items.length !== 1 ? 's' : ''}
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
                              {subscriptionLevel === "Tester" && editingDate?.sessionId === latestItem.entry.sessionId && editingDate?.type === 'topic' ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="date"
                                    value={editingDateValue}
                                    onChange={(e) => setEditingDateValue(e.target.value)}
                                    onBlur={() => {
                                      if (editingDateValue) {
                                        // Parse date string (YYYY-MM-DD) and create UTC date at midnight
                                        const [year, month, day] = editingDateValue.split('-').map(Number);
                                        const newTimestamp = new Date(Date.UTC(year, month - 1, day)).getTime();
                                        const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                                        if (slugMatch) {
                                          const slug = slugMatch[1];
                                          try {
                                            const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                                            if (stored) {
                                              const data = JSON.parse(stored);
                                              const surgeLog = data?.surgeLog || [];
                                              // Update ALL entries with this sessionId (in case there are duplicates)
                                              let updated = false;
                                              surgeLog.forEach((e: any, idx: number) => {
                                                if (e.sessionId === latestItem.entry.sessionId) {
                                                  surgeLog[idx].timestamp = newTimestamp;
                                                  updated = true;
                                                }
                                              });
                                              
                                              if (updated) {
                                                console.log("=== DATE UPDATE DEBUG START ===");
                                                console.log("Editing sessionId:", latestItem.entry.sessionId);
                                                console.log("New timestamp:", newTimestamp, "New date:", new Date(newTimestamp).toISOString());
                                                console.log("1. Before save - surgeLog entries:", JSON.stringify(surgeLog.map((e: any) => ({
                                                  sessionId: e.sessionId,
                                                  timestamp: e.timestamp,
                                                  date: new Date(e.timestamp).toISOString()
                                                })), null, 2));
                                                
                                                localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                                                
                                                // Verify the save by reading it back immediately
                                                const verify = localStorage.getItem(`atomicSubjectData:${slug}`);
                                                if (verify) {
                                                  const verifyData = JSON.parse(verify);
                                                  console.log("2. After save - localStorage contains:", JSON.stringify(verifyData?.surgeLog?.map((e: any) => ({
                                                    sessionId: e.sessionId,
                                                    timestamp: e.timestamp,
                                                    date: new Date(e.timestamp).toISOString()
                                                  })), null, 2));
                                                  
                                                  const verifyEntry = verifyData?.surgeLog?.find((e: any) => e.sessionId === latestItem.entry.sessionId);
                                                  console.log("3. Verified entry:", {
                                                    sessionId: latestItem.entry.sessionId,
                                                    newTimestamp,
                                                    newDate: new Date(newTimestamp).toISOString(),
                                                    verifiedTimestamp: verifyEntry?.timestamp,
                                                    verifiedDate: verifyEntry ? new Date(verifyEntry.timestamp).toISOString() : "not found",
                                                    match: verifyEntry?.timestamp === newTimestamp
                                                  });
                                                  
                                                  // Also check all entries to see if any were affected
                                                  const allEntries = verifyData?.surgeLog || [];
                                                  console.log("4. All entries after save:", JSON.stringify(allEntries.map((e: any, idx: number) => ({
                                                    index: idx,
                                                    sessionId: e.sessionId,
                                                    timestamp: e.timestamp,
                                                    date: new Date(e.timestamp).toISOString(),
                                                    isEdited: e.sessionId === latestItem.entry.sessionId
                                                  })), null, 2));
                                                  
                                                  // Check what getLastSurgeSession would return
                                                  const latest = allEntries.reduce((latest: any, entry: any) => {
                                                    return entry.timestamp > latest.timestamp ? entry : latest;
                                                  }, allEntries[0]);
                                                  console.log("5. What getLastSurgeSession would return:", {
                                                    sessionId: latest?.sessionId,
                                                    timestamp: latest?.timestamp,
                                                    date: latest ? new Date(latest.timestamp).toISOString() : "none",
                                                    isEdited: latest?.sessionId === latestItem.entry.sessionId
                                                  });
                                                } else {
                                                  console.error("5. Failed to read back from localStorage!");
                                                }
                                                
                                                console.log("=== DATE UPDATE DEBUG END ===");
                                                
                                                // Dispatch event to notify surge page to reload lastSurge
                                                window.dispatchEvent(new CustomEvent('surgeLogDateUpdated', { detail: { slug } }));
                                                // Force a re-render by incrementing the refresh key
                                                setSurgeLogRefreshKey(prev => prev + 1);
                                              } else {
                                                console.error("Failed to find entry with sessionId:", latestItem.entry.sessionId);
                                              }
                                            }
                                          } catch (e) {
                                            console.error("Failed to update date:", e);
                                          }
                                        }
                                        setEditingDate(null);
                                        setEditingDateValue("");
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.currentTarget.blur();
                                      } else if (e.key === "Escape") {
                                        setEditingDate(null);
                                        setEditingDateValue("");
                                      }
                                    }}
                                    className="text-xs px-2 py-1 rounded border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]"
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <div 
                                  className={`text-xs text-[var(--foreground)]/50 ${subscriptionLevel === "Tester" ? "cursor-pointer hover:text-[var(--accent-cyan)]/70 transition-colors" : ""}`}
                                  onClick={() => {
                                    if (subscriptionLevel === "Tester") {
                                      const dateValue = new Date(latestItem.entry.timestamp).toISOString().split('T')[0];
                                      setEditingDate({ sessionId: latestItem.entry.sessionId, type: 'topic' });
                                      setEditingDateValue(dateValue);
                                    }
                                  }}
                                  title={subscriptionLevel === "Tester" ? "Click to edit date" : ""}
                                >
                                  {latestItem.sessionDate}
                                </div>
                              )}
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

                          {/* Questions List - Grouped by Type */}
                          {isExpanded && (() => {
                            // Group items by question type (MC vs Harder)
                            const mcQuestions = items.filter(item => item.result.stage === "mc");
                            const harderQuestions = items.filter(item => item.result.stage === "harder");
                            
                            return (
                              <div className="border-t border-[var(--foreground)]/10 p-4 space-y-3">
                                {/* Multiple Choice Questions */}
                                {mcQuestions.length > 0 && (() => {
                                  const questionTypeKey = `${topicName}-mc`;
                                  const isTypeExpanded = expandedSurgeQuestionTypes.has(questionTypeKey);
                                  const mcAvgGrade = mcQuestions.reduce((sum, item) => sum + (item.result.grade || 0), 0) / mcQuestions.length;
                                  
                                  return (
                                    <div className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/60 overflow-hidden">
                                      <button
                                        onClick={() => {
                                          setExpandedSurgeQuestionTypes(prev => {
                                            const next = new Set(prev);
                                            if (next.has(questionTypeKey)) {
                                              next.delete(questionTypeKey);
                                            } else {
                                              next.add(questionTypeKey);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/80 transition-colors text-left"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="text-sm font-semibold text-[var(--foreground)]">
                                            Multiple Choice Questions
                                          </div>
                                          <div className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
                                            {mcQuestions.length} question{mcQuestions.length !== 1 ? 's' : ''}
                                          </div>
                                          <div className={`px-2 py-1 rounded text-xs font-bold ${
                                            mcAvgGrade >= 8 ? 'bg-green-500/20 text-green-400' :
                                            mcAvgGrade >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'
                                          }`}>
                                            Avg: {mcAvgGrade.toFixed(1)}/10
                                          </div>
                                        </div>
                                        <svg
                                          className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform ${isTypeExpanded ? 'rotate-180' : ''}`}
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                      
                                      {isTypeExpanded && (
                                        <div className="border-t border-[var(--foreground)]/10 p-3 space-y-2">
                                          {mcQuestions
                                            .sort((a, b) => b.entry.timestamp - a.entry.timestamp)
                                            .map((item, idx) => {
                                              const questionId = `${topicName}-mc-${idx}-${item.result.question}`;
                                              const isQuestionExpanded = expandedSurgeQuestions.has(questionId);
                                              const questionPreview = item.result.question
                                                ? item.result.question
                                                    .replace(/◊/g, '')
                                                    .replace(/<[^>]*>/g, '')
                                                    .replace(/\*\*/g, '')
                                                    .replace(/#{1,6}\s/g, '')
                                                    .trim()
                                                    .slice(0, 100)
                                                : 'No question recorded';
                                              
                                              return (
                                                <div
                                                  key={questionId}
                                                  className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50 overflow-hidden"
                                                >
                                                  <button
                                                    onClick={() => {
                                                      setExpandedSurgeQuestions(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(questionId)) {
                                                          next.delete(questionId);
                                                        } else {
                                                          next.add(questionId);
                                                        }
                                                        return next;
                                                      });
                                                    }}
                                                    className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/70 transition-colors text-left"
                                                  >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                      <div className={`px-2 py-1 rounded text-xs font-bold flex-shrink-0 ${
                                                        (item.result.grade || 0) >= 8 ? 'bg-green-500/20 text-green-400' :
                                                        (item.result.grade || 0) >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-red-500/20 text-red-400'
                                                      }`}>
                                                        {(item.result.grade || 0)}/10
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-[var(--foreground)]/90 truncate">
                                                          {questionPreview}
                                                          {questionPreview.length >= 100 && '...'}
                                                        </div>
                                                      </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                      {subscriptionLevel === "Tester" && editingDate?.sessionId === item.entry.sessionId && editingDate?.type === 'question' && editingDate?.questionId === questionId ? (
                                                        <div className="flex items-center gap-1">
                                                          <input
                                                            type="date"
                                                            value={editingDateValue}
                                                            onChange={(e) => setEditingDateValue(e.target.value)}
                                                            onBlur={() => {
                                                              if (editingDateValue) {
                                                                // Parse date string (YYYY-MM-DD) and create UTC date at midnight
                                        const [year, month, day] = editingDateValue.split('-').map(Number);
                                        const newTimestamp = new Date(Date.UTC(year, month - 1, day)).getTime();
                                                                const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                                                                if (slugMatch) {
                                                                  const slug = slugMatch[1];
                                                                  try {
                                                                    const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                                                                    if (stored) {
                                                                      const data = JSON.parse(stored);
                                                                      const surgeLog = data?.surgeLog || [];
                                                                      // Update ALL entries with this sessionId
                                                                      let updated = false;
                                                                      surgeLog.forEach((e: any, idx: number) => {
                                                                        if (e.sessionId === item.entry.sessionId) {
                                                                          surgeLog[idx].timestamp = newTimestamp;
                                                                          updated = true;
                                                                        }
                                                                      });
                                                                      
                                                                      if (updated) {
                                                                        localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                                                                        // Dispatch event to notify surge page to reload lastSurge
                                                                        window.dispatchEvent(new CustomEvent('surgeLogDateUpdated', { detail: { slug } }));
                                                                        // Force a re-render by incrementing the refresh key
                                                                        setSurgeLogRefreshKey(prev => prev + 1);
                                                                      }
                                                                    }
                                                                  } catch (e) {
                                                                    console.error("Failed to update date:", e);
                                                                  }
                                                                }
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            onKeyDown={(e) => {
                                                              if (e.key === "Enter") {
                                                                e.currentTarget.blur();
                                                              } else if (e.key === "Escape") {
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            className="text-xs px-2 py-1 rounded border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]"
                                                            autoFocus
                                                          />
                                                        </div>
                                                      ) : (
                                                        <div 
                                                          className={`text-xs text-[var(--foreground)]/50 ${subscriptionLevel === "Tester" ? "cursor-pointer hover:text-[var(--accent-cyan)]/70 transition-colors" : ""}`}
                                                          onClick={() => {
                                                            if (subscriptionLevel === "Tester") {
                                                              const dateValue = new Date(item.entry.timestamp).toISOString().split('T')[0];
                                                              setEditingDate({ sessionId: item.entry.sessionId, type: 'question', questionId });
                                                              setEditingDateValue(dateValue);
                                                            }
                                                          }}
                                                          title={subscriptionLevel === "Tester" ? "Click to edit date" : ""}
                                                        >
                                                          {item.sessionDate}
                                                        </div>
                                                      )}
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
                                                  
                                                  {isQuestionExpanded && (
                                                    <div className="border-t border-[var(--foreground)]/10 p-4 space-y-3">
                                                      {item.result.question && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Question
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.question)} />
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.explanation && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Explanation
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.explanation)} />
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
                                })()}
                                
                                {/* Harder/Quiz Questions */}
                                {harderQuestions.length > 0 && (() => {
                                  const questionTypeKey = `${topicName}-harder`;
                                  const isTypeExpanded = expandedSurgeQuestionTypes.has(questionTypeKey);
                                  const harderAvgGrade = harderQuestions.reduce((sum, item) => sum + (item.result.grade || 0), 0) / harderQuestions.length;
                                  
                                  return (
                                    <div className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/60 overflow-hidden">
                                      <button
                                        onClick={() => {
                                          setExpandedSurgeQuestionTypes(prev => {
                                            const next = new Set(prev);
                                            if (next.has(questionTypeKey)) {
                                              next.delete(questionTypeKey);
                                            } else {
                                              next.add(questionTypeKey);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/80 transition-colors text-left"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="text-sm font-semibold text-[var(--foreground)]">
                                            Quiz Questions
                                          </div>
                                          <div className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]">
                                            {harderQuestions.length} question{harderQuestions.length !== 1 ? 's' : ''}
                                          </div>
                                          <div className={`px-2 py-1 rounded text-xs font-bold ${
                                            harderAvgGrade >= 8 ? 'bg-green-500/20 text-green-400' :
                                            harderAvgGrade >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'
                                          }`}>
                                            Avg: {harderAvgGrade.toFixed(1)}/10
                                          </div>
                                        </div>
                                        <svg
                                          className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform ${isTypeExpanded ? 'rotate-180' : ''}`}
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                      
                                      {isTypeExpanded && (
                                        <div className="border-t border-[var(--foreground)]/10 p-3 space-y-2">
                                          {harderQuestions
                                            .sort((a, b) => b.entry.timestamp - a.entry.timestamp)
                                            .map((item, idx) => {
                                              const questionId = `${topicName}-harder-${idx}-${item.result.question}`;
                                              const isQuestionExpanded = expandedSurgeQuestions.has(questionId);
                                              const questionPreview = item.result.question
                                                ? item.result.question
                                                    .replace(/◊/g, '')
                                                    .replace(/<[^>]*>/g, '')
                                                    .replace(/\*\*/g, '')
                                                    .replace(/#{1,6}\s/g, '')
                                                    .trim()
                                                    .slice(0, 100)
                                                : 'No question recorded';
                                              
                                              return (
                                                <div
                                                  key={questionId}
                                                  className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50 overflow-hidden"
                                                >
                                                  <button
                                                    onClick={() => {
                                                      setExpandedSurgeQuestions(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(questionId)) {
                                                          next.delete(questionId);
                                                        } else {
                                                          next.add(questionId);
                                                        }
                                                        return next;
                                                      });
                                                    }}
                                                    className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/70 transition-colors text-left"
                                                  >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                      <div className={`px-2 py-1 rounded text-xs font-bold flex-shrink-0 ${
                                                        (item.result.grade || 0) >= 8 ? 'bg-green-500/20 text-green-400' :
                                                        (item.result.grade || 0) >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-red-500/20 text-red-400'
                                                      }`}>
                                                        {(item.result.grade || 0)}/10
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-[var(--foreground)]/90 truncate">
                                                          {questionPreview}
                                                          {questionPreview.length >= 100 && '...'}
                                                        </div>
                                                      </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                      {subscriptionLevel === "Tester" && editingDate?.sessionId === item.entry.sessionId && editingDate?.type === 'question' && editingDate?.questionId === questionId ? (
                                                        <div className="flex items-center gap-1">
                                                          <input
                                                            type="date"
                                                            value={editingDateValue}
                                                            onChange={(e) => setEditingDateValue(e.target.value)}
                                                            onBlur={() => {
                                                              if (editingDateValue) {
                                                                // Parse date string (YYYY-MM-DD) and create UTC date at midnight
                                        const [year, month, day] = editingDateValue.split('-').map(Number);
                                        const newTimestamp = new Date(Date.UTC(year, month - 1, day)).getTime();
                                                                const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                                                                if (slugMatch) {
                                                                  const slug = slugMatch[1];
                                                                  try {
                                                                    const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                                                                    if (stored) {
                                                                      const data = JSON.parse(stored);
                                                                      const surgeLog = data?.surgeLog || [];
                                                                      // Update ALL entries with this sessionId
                                                                      let updated = false;
                                                                      surgeLog.forEach((e: any, idx: number) => {
                                                                        if (e.sessionId === item.entry.sessionId) {
                                                                          surgeLog[idx].timestamp = newTimestamp;
                                                                          updated = true;
                                                                        }
                                                                      });
                                                                      
                                                                      if (updated) {
                                                                        localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                                                                        // Dispatch event to notify surge page to reload lastSurge
                                                                        window.dispatchEvent(new CustomEvent('surgeLogDateUpdated', { detail: { slug } }));
                                                                        // Force a re-render by incrementing the refresh key
                                                                        setSurgeLogRefreshKey(prev => prev + 1);
                                                                      }
                                                                    }
                                                                  } catch (e) {
                                                                    console.error("Failed to update date:", e);
                                                                  }
                                                                }
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            onKeyDown={(e) => {
                                                              if (e.key === "Enter") {
                                                                e.currentTarget.blur();
                                                              } else if (e.key === "Escape") {
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            className="text-xs px-2 py-1 rounded border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]"
                                                            autoFocus
                                                          />
                                                        </div>
                                                      ) : (
                                                        <div 
                                                          className={`text-xs text-[var(--foreground)]/50 ${subscriptionLevel === "Tester" ? "cursor-pointer hover:text-[var(--accent-cyan)]/70 transition-colors" : ""}`}
                                                          onClick={() => {
                                                            if (subscriptionLevel === "Tester") {
                                                              const dateValue = new Date(item.entry.timestamp).toISOString().split('T')[0];
                                                              setEditingDate({ sessionId: item.entry.sessionId, type: 'question', questionId });
                                                              setEditingDateValue(dateValue);
                                                            }
                                                          }}
                                                          title={subscriptionLevel === "Tester" ? "Click to edit date" : ""}
                                                        >
                                                          {item.sessionDate}
                                                        </div>
                                                      )}
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
                                                  
                                                  {isQuestionExpanded && (
                                                    <div className="border-t border-[var(--foreground)]/10 p-4 space-y-3">
                                                      {item.result.question && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Question
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.question)} />
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.answer && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Your Answer
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5 italic">
                                                            {item.result.answer}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.correctAnswer && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Correct Answer
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            {item.result.correctAnswer}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.explanation && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Explanation
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.explanation)} />
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.assessment && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Assessment
                                                          </div>
                                                          <div className="text-sm text-[var(--foreground)]/80">
                                                            {item.result.assessment}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.whatsGood && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            What's Good
                                                          </div>
                                                          <div className="text-sm text-green-400/80">
                                                            {item.result.whatsGood}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.whatsBad && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            What Needs Improvement
                                                          </div>
                                                          <div className="text-sm text-red-400/80">
                                                            {item.result.whatsBad}
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
                                })()}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })
                ) : (
                  <div className="text-center py-8 text-[var(--foreground)]/60">
                    <div className="text-lg mb-2">🧠</div>
                    <div className="font-medium mb-1">No Surge Data Yet</div>
                    <div className="text-sm">
                      Complete a Surge session to see your quiz results and history here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
    </>
  );
}