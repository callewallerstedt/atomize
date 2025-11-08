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

// Loading Screen Component
function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [showSubtitle, setShowSubtitle] = useState(false);
  const fullText = 'SYNAPSE';

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
    // Typewriter effect with random timing
    let currentIndex = 0;
    let typeTimeout: NodeJS.Timeout;

    const typeNextChar = () => {
      if (currentIndex < fullText.length) {
        setDisplayedText(fullText.slice(0, currentIndex + 1));
        currentIndex++;
        // Random timing between 50-120ms for more natural feel
        const randomDelay = Math.random() * 70 + 50;
        typeTimeout = setTimeout(typeNextChar, randomDelay);
      } else {
        // SYNAPSE typing complete - show subtitle immediately
        setShowSubtitle(true);
      }
    };

    // Start typing immediately
    typeTimeout = setTimeout(typeNextChar, 100);

    // Start fade-out animation 500ms before completion (2 seconds after subtitle appears)
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 2800); // Start fading at 2.8 seconds

    // Complete loading after animation
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 3300); // Show for 3.3 seconds total

    return () => {
      clearTimeout(typeTimeout);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)] transition-all duration-500 ease-out ${
      isFadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
    }`}>
      {/* Spinning gradient ring - same as Exam Snipe */}
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-spin"
             style={{
               WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)',
               mask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)'
             }}>
        </div>
      </div>

      {/* SYNAPSE text below the ring with typewriter effect */}
      <div className="mt-6 text-center space-y-2">
        <span className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider font-mono">
          {displayedText}
        </span>

        {/* Studying, Optimized. subtitle */}
        {showSubtitle && (
          <div className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider font-mono animate-fade-in">
            Studying, Optimized.
          </div>
        )}
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
      {/* Main Timer Display */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="relative inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 min-w-[100px]
                   text-white bg-[var(--background)]/90 backdrop-blur-md
                   shadow-[0_2px_8px_rgba(0,0,0,0.4)]
                   hover:shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:bg-[var(--background)]/95
                   transition-all duration-300 ease-out"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xl font-bold leading-none">
            {formatTime(timeLeft)}
          </span>
          <span className="text-xs opacity-75">
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
          className="absolute -right-12 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full
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
              className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors"
              title="New chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors"
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uiZoom, setUiZoom] = useState<number>(1.4);
  const [isIOSStandalone, setIsIOSStandalone] = useState<boolean>(false);
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
      {/* Loading Screen */}
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]" style={isIOSStandalone ? undefined : { zoom: uiZoom }}>
      {/* Main content */}
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70 bg-[var(--background)] border-b border-[#4A5568]" style={{ paddingTop: 'max(3px, calc(env(safe-area-inset-top, 0px) / 2))' }}>
          <nav className="relative flex h-14 items-center px-4">
            {/* Left side buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="relative inline-flex items-center rounded-xl px-3 py-1.5
                           text-white bg-[var(--background)]/90 backdrop-blur-md
                           shadow-[0_2px_8px_rgba(0,0,0,0.7)]
                           hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)] hover:bg-[var(--background)]/95
                           transition-all duration-200 ease-out"
              >
                <span>Home</span>
              </button>
              <div className="relative tools-dropdown">
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

                {/* Tools Dropdown */}
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
                            router.push('/?quickLesson=1');
                            setToolsDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg bg-[var(--background)]/60 text-[var(--foreground)]
                                     hover:bg-[var(--background)]/80 transition-colors text-sm"
                        >
                          Quick Lesson
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

            {/* Absolutely centered Pomodoro Timer */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <PomodoroTimer />
            </div>

            {/* Right side - Chat + Settings */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
              {/* Chat dropdown */}
              <ChatDropdown />
              {/* Info button */}
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
                {/* Settings icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <div className="settings-modal">
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
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


