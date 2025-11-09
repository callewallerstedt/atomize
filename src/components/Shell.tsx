"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsModal from "@/components/SettingsModal";
import Modal from "@/components/Modal";
import GlowSpinner from "@/components/GlowSpinner";

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
      <div className="logo-wrap mb-2" style={{ width: 240, aspectRatio: "1 / 1", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
    <div className="relative pomodoro-timer w-full md:w-auto">
      {/* Main Timer Display */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="relative inline-flex w-full md:w-auto items-center justify-between md:justify-center gap-1 rounded-lg px-3 py-1.5 min-w-[100px]
                   text-white bg-[var(--background)]/90 backdrop-blur-md
                   shadow-[0_2px_8px_rgba(0,0,0,0.4)]
                   hover:shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:bg-[var(--background)]/95
                   transition-all duration-300 ease-out"
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
        <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-50">
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

type ChatHistory = {
  id: string;
  title: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  timestamp: number;
};

function ChatDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 480, h: 460 });
  const [resizing, setResizing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageContentRef = useRef<string>('');
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const chatDropdownRef = useRef<HTMLDivElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const lastSavedRef = useRef<string>('');
  const isLoadingFromHistoryRef = useRef<boolean>(false);

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
        chatButtonRef.current?.focus();
      });
    };

    document.addEventListener('synapse:open-chat', handleOpenChat as EventListener);
    return () => document.removeEventListener('synapse:open-chat', handleOpenChat as EventListener);
  }, []);

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
    setShowHistory(false);
    lastSavedRef.current = '';
    setCurrentChatId(null);
  }

  function loadChat(chat: ChatHistory) {
    isLoadingFromHistoryRef.current = true;
    setMessages(chat.messages);
    setShowHistory(false);
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
    try {
      setSending(true);
      // Gather page context (lesson content or visible text)
      let context = '';
      try {
        const el = document.querySelector('.lesson-content');
        context = el ? (el as HTMLElement).innerText : document.body.innerText;
        context = context.slice(0, 12000);
      } catch {}
      // Prepare placeholder for streaming
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      const idx = messages.length + 1; // assistant index
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          messages: [...messages, { role: 'user', content: text }],
          path: typeof window !== 'undefined' ? window.location.pathname : ''
        })
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          chunk.split('\n').forEach((line) => {
            if (!line.startsWith('data: ')) return;
            const payload = line.slice(6);
            if (!payload) return;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === 'text') {
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: (copy[idx]?.content || '') + obj.content } as any;
                  return copy;
                });
              }
            } catch {}
          });
        }
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Error: ' + (e?.message || 'Failed to send') }]);
    } finally {
      setSending(false);
    }
  }

  // Auto-scroll to bottom when messages change (especially during streaming)
  useEffect(() => {
    if (!open || !messagesEndRef.current) return;
    
    // Always scroll when messages length changes or when sending state changes
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }, [messages.length, sending, open]);

  // Click outside to close chat
  useEffect(() => {
    if (!open) return;
    
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      // Check if click is outside both the chat button and dropdown
      if (
        chatDropdownRef.current &&
        chatButtonRef.current &&
        !chatDropdownRef.current.contains(target) &&
        !chatButtonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    
    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [open]);

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

  return (
    <div className="relative">
      <button
        ref={chatButtonRef}
        onClick={() => setOpen(!open)}
        onMouseDown={(e) => {
          e.preventDefault();
          e.currentTarget.blur();
        }}
        className="relative inline-flex h-10 items-center rounded-full px-3 text-sm
                   text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]
                   shadow-[0_2px_8px_rgba(0,0,0,0.7)]
                   hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)] hover:opacity-95
                   focus:outline-none focus:ring-0 focus-visible:outline-none
                   active:shadow-[0_2px_8px_rgba(0,0,0,0.7)] active:scale-[1]
                   transition-shadow duration-200 ease-out overflow-hidden"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', transform: 'none !important', color: 'white' }}
        aria-label="Chat"
        title="Chat"
      >
        <span className="relative z-10 flex items-center">
          Chat
          <svg className={`h-4 w-4 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
        </span>
      </button>
      {open && (
        <>
          <div 
            ref={chatDropdownRef}
            className="absolute right-0 mt-2 z-50 rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 bg-gradient-to-br from-[#00E5FF]/20 to-[#FF2D96]/20 backdrop-blur-md shadow-2xl p-3
                        max-md:fixed max-md:inset-4 max-md:right-4 max-md:left-4 max-md:top-4 max-md:bottom-4 max-md:mt-0 max-md:w-auto max-md:h-auto
                        md:absolute md:right-0 md:mt-2 flex flex-col" 
            style={{ 
              width: typeof window !== 'undefined' && window.innerWidth < 768 ? 'auto' : size.w, 
              height: typeof window !== 'undefined' && window.innerWidth < 768 ? 'auto' : size.h 
            }}
             onClick={(e) => e.stopPropagation()}>
          {/* Top right icons */}
          <div className="relative flex items-center gap-2 justify-end mb-2 flex-shrink-0">
            <button
              onClick={startNewChat}
              className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors !shadow-none"
              title="New chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors !shadow-none"
              title="Chat history"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h18v18H3V3z"/>
                <path d="M3 9h18M9 3v18"/>
              </svg>
            </button>
            
            {/* History panel - absolute positioned to overlay */}
            {showHistory && (
              <div className="absolute top-full right-0 mt-1 w-64 p-2 rounded-lg bg-[var(--background)]/95 bg-gradient-to-br from-[#00E5FF]/20 to-[#FF2D96]/20 backdrop-blur-md border border-[var(--foreground)]/20 z-50 max-h-64 overflow-y-auto">
                {chatHistory.length === 0 ? (
                  <div className="text-xs text-[var(--foreground)]/60 text-center py-4">No chat history</div>
                ) : (
                  <div className="space-y-1">
                    {chatHistory.map((chat) => (
                      <div
                        key={chat.id}
                        onClick={() => loadChat(chat)}
                        className="flex items-center justify-between group p-2 rounded hover:bg-[var(--background)]/80 cursor-pointer transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-[var(--foreground)] truncate">{chat.title}</div>
                          <div className="text-[10px] text-[var(--foreground)]/50">
                            {new Date(chat.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteChat(chat.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-[var(--foreground)]/50 hover:text-[var(--foreground)] transition-opacity ml-2"
                          title="Delete"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {messages.length === 0 && (
              <div className="text-xs text-[var(--foreground)]/60">Ask a question about this page. I'll use the current page content as context.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[80%]">
                  <div className="text-[10px] text-[var(--foreground)]/60 mb-1 ml-1">{m.role === 'user' ? 'You' : 'Nova'}</div>
                  <div className={m.role === 'user' ? 'rounded-xl bg-[var(--accent-cyan)]/20 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--accent-cyan)]/30' : 'rounded-xl bg-[var(--background)]/80 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--foreground)]/10'}>
                  {m.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    <span>{m.content}</span>
                  )}
                  </div>
                </div>
              </div>
            ))}
            {/* Scroll target for auto-scroll */}
            <div ref={messagesEndRef} />
          </div>
          <div className="mt-2 flex items-center gap-2 flex-shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              placeholder="Type a message..."
              className="flex-1 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={sending}
              className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 text-sm font-medium !text-white hover:opacity-95 disabled:opacity-60 disabled:!text-white"
              style={{ color: 'white' }}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
            {/* Bottom-left resize handle */}
            <div
              onMouseDown={(e) => { setResizing(true); setStart({ x: e.clientX, y: e.clientY, w: size.w, h: size.h }); }}
              title="Resize"
              className="max-md:hidden absolute left-2 bottom-2 h-3 w-3 cursor-nwse-resize opacity-0"
            />
          </div>
        </div>
        </>
      )}
    </div>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsOpen && !(event.target as Element).closest('.settings-modal')) {
        setSettingsOpen(false);
      }
      if (toolsDropdownOpen && !(event.target as Element).closest('.tools-dropdown')) {
        setToolsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen, toolsDropdownOpen]);

  useEffect(() => {
    if (isMobile) {
      setToolsDropdownOpen(false);
    }
  }, [isMobile]);

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
      } catch {
        setIsAuthenticated(false);
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
        <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70 bg-[var(--background)]" style={{ paddingTop: 'max(3px, calc(env(safe-area-inset-top, 0px) / 2))' }}>
          <nav className="relative flex h-14 items-center px-3 sm:px-4 gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity !shadow-none pl-0 py-2"
              >
                <GlowSpinner size={24} ariaLabel="Synapse" idSuffix="header" />
                <div style={{ transform: "scale(1.2)", transformOrigin: "left center" }}>
                  <h1 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider relative inline-block" style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}>
                    SYNAPSE
                    <sup className="text-xs text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] absolute -top-0.5 left-full ml-1" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>(ALPHA)</sup>
                  </h1>
                </div>
              </button>
              <div className="relative hidden md:block tools-dropdown">
                <button
                  onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                  className="relative inline-flex items-center rounded-xl px-3 py-1.5
                             text-white bg-[var(--background)]/90 backdrop-blur-md
                             shadow-[0_2px_8px_rgba(0,0,0,0.4)]
                             hover:shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:bg-[var(--background)]/95
                             transition-all duration-200 ease-out"
                >
                  <span>Tools</span>
                  <svg
                    className={`h-4 w-4 ml-1 transition-transform duration-200 ${toolsDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {toolsDropdownOpen && (
                  <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-50">
                    <div className="relative rounded-xl p-2
                                 bg-[var(--background)]/95 backdrop-blur-md
                                 shadow-[0_4px_12px_rgba(0,0,0,0.7)]
                                 overflow-hidden">
                      <div className="space-y-1 min-w-[160px]">
                        <button
                          onClick={() => {
                            router.push('/exam-snipe');
                            setToolsDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg bg-[var(--background)]/60 text-[var(--foreground)]
                                     hover:bg-[var(--background)]/80 transition-colors text-sm"
                        >
                          Exam Snipe
                        </button>
                        <button
                          onClick={() => {
                            router.push('/quicklearn');
                            setToolsDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg bg-[var(--background)]/60 text-[var(--foreground)]
                                     hover:bg-[var(--background)]/80 transition-colors text-sm"
                        >
                          Quick Learn
                        </button>
                        <button
                          onClick={() => {
                            router.push('/readassist');
                            setToolsDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg bg-[var(--background)]/60 text-[var(--foreground)]
                                     hover:bg-[var(--background)]/80 transition-colors text-sm"
                        >
                          Read Assist
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isMobile && (
              <div className="hidden md:flex flex-1 justify-center">
                <PomodoroTimer />
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <div className="hidden md:flex items-center gap-2">
                <ChatDropdown />
                <button
                  onClick={() => setInfoOpen(true)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full
                             text-white bg-[var(--background)]/90
                             shadow-[0_2px_8px_rgba(0,0,0,0.7)]
                             hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)] hover:bg-[var(--background)]/95
                             focus:outline-none focus:ring-0 focus-visible:outline-none
                             active:shadow-[0_2px_8px_rgba(0,0,0,0.7)] active:scale-[1]
                             transition-shadow duration-200 ease-out"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', transform: 'none !important' }}
                  aria-label="Info"
                  title="About this app"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M12 8.5a.75.75 0 100-1.5.75.75 0 000 1.5z" fill="currentColor"/>
                    <path d="M11.25 10.5h1.5v6h-1.5z" fill="currentColor"/>
                  </svg>
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full
                             text-white bg-[var(--background)]/90
                             shadow-[0_2px_8px_rgba(0,0,0,0.7)]
                             hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)] hover:bg-[var(--background)]/95
                             focus:outline-none focus:ring-0 focus-visible:outline-none
                             active:shadow-[0_2px_8px_rgba(0,0,0,0.7)] active:scale-[1]
                             transition-shadow duration-200 ease-out"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', transform: 'none !important' }}
                  aria-label="Settings"
                  title="Settings"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
                    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>

              <div ref={mobileMenuRef} className="relative md:hidden">
                <button
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-white bg-[var(--background)]/90 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.6)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.7)] transition-all"
                  aria-expanded={mobileMenuOpen}
                  aria-haspopup="true"
                >
                  Menu
                  <svg className={`h-4 w-4 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {mobileMenuOpen && isMobile && (
                  <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-[var(--foreground)]/10 bg-[var(--background)]/95 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.6)] p-3 space-y-4 z-50">
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
                )}
              </div>
            </div>
          </nav>
          {/* Glowing gradient separator */}
          <div className="relative h-[1px] overflow-hidden">
            {/* Main line */}
            <div className="relative h-[1px] bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] opacity-60 z-10" />
            {/* Glow layer under the line */}
            <div className="absolute left-0 right-0 h-[3px] top-[1px] bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] opacity-90 blur-sm" />
          </div>
        </header>
        )}
        <main className="flex-1">{children}</main>
      </div>
      <div className="settings-modal">
        <SettingsModal 
          open={settingsOpen} 
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
          isAuthenticated={isAuthenticated}
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
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {infoMarkdown}
          </ReactMarkdown>
        </div>
      </Modal>
    </div>
    </>
  );
}


