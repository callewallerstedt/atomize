"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsModal from "@/components/SettingsModal";

// Loading Screen Component
function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [showSubtitle, setShowSubtitle] = useState(false);
  const fullText = 'SYNAPSE';

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

        {/* Studying Optimized subtitle */}
        {showSubtitle && (
          <div className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider font-mono animate-fade-in">
            Studying Optimized
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
        className="relative inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 min-w-[100px]
                   text-white bg-[var(--background)]/90 backdrop-blur-md
                   border-0 outline-none focus:outline-none
                   before:absolute before:inset-0 before:rounded-lg
                   before:bg-gradient-to-r before:from-[#00E5FF] before:via-[#FF2D96] before:to-[#00E5FF]
                   before:bg-[length:200%_200%] before:animate-[gradient-shift_15s_ease-in-out_infinite]
                   before:p-[1px] before:content-['']
                   after:absolute after:inset-[1px] after:rounded-lg
                   after:bg-[var(--background)]/95 after:backdrop-blur-md
                   shadow-[0_0_8px_rgba(0,229,255,0.3)]
                   hover:shadow-[0_0_12px_rgba(0,229,255,0.4),0_0_18px_rgba(255,45,150,0.2)]
                   hover:before:bg-[length:250%_250%]
                   active:shadow-[0_0_4px_rgba(0,229,255,0.5),inset_0_0_8px_rgba(0,229,255,0.2)]
                   transition-all duration-300 ease-out
                   overflow-hidden"
      >
        <div className="flex items-center gap-1.5">
          <span className="relative z-10 font-mono text-xl font-bold leading-none">
            {formatTime(timeLeft)}
          </span>
          <span className="relative z-10 text-xs opacity-75">
            {isBreak ? 'BREAK' : 'STUDY'}
          </span>
        </div>
        <svg
          className={`relative z-10 h-3 w-3 transition-transform duration-200 ${showSettings ? 'rotate-180' : ''}`}
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
                         border border-transparent
                         before:absolute before:inset-0 before:rounded-xl
                         before:bg-gradient-to-r before:from-[#00E5FF] before:via-[#FF2D96] before:to-[#00E5FF]
                         before:bg-[length:200%_200%] before:animate-[gradient-shift_15s_ease-in-out_infinite]
                         before:p-[1px] before:content-['']
                         after:absolute after:inset-[1px] after:rounded-xl
                         after:bg-[var(--background)]/98 after:backdrop-blur-md
                         shadow-[0_0_10px_rgba(0,229,255,0.3)]
                         overflow-hidden">
            <div className="relative z-10 space-y-3 min-w-[220px]">
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSubjects(getSubjects());
    try {
      const raw = localStorage.getItem("atomicTheme");
      if (raw) {
        const t = JSON.parse(raw);
        const root = document.documentElement;
        root.style.setProperty("--background", t.background || "#0F1216");
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
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]" style={{ zoom: 1.4 }}>
      {/* Main content */}
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70 bg-[var(--background)]">
          <nav className="relative flex h-14 items-center px-4">
            {/* Left side buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="relative inline-flex items-center rounded-xl px-4 py-2
                           text-white bg-[var(--background)]/90 backdrop-blur-md
                           border-0 outline-none focus:outline-none
                           before:absolute before:inset-0 before:rounded-xl
                           before:bg-gradient-to-r before:from-[#00E5FF] before:via-[#FF2D96] before:to-[#00E5FF]
                           before:bg-[length:200%_200%] before:animate-[gradient-shift_15s_ease-in-out_infinite]
                           before:p-[1px] before:content-['']
                           after:absolute after:inset-[1px] after:rounded-xl
                           after:bg-[var(--background)]/95 after:backdrop-blur-md
                           shadow-[0_0_8px_rgba(0,229,255,0.3)]
                           hover:shadow-[0_0_12px_rgba(0,229,255,0.4),0_0_18px_rgba(255,45,150,0.2)]
                           hover:before:bg-[length:250%_250%]
                           active:shadow-[0_0_4px_rgba(0,229,255,0.5),inset_0_0_8px_rgba(0,229,255,0.2)]
                           transition-all duration-200 ease-out
                           overflow-hidden"
              >
                <span className="relative z-10">Home</span>
              </button>
              <button
                onClick={() => router.push('/exam-snipe')}
                className="relative inline-flex items-center rounded-xl px-4 py-2
                           text-white bg-[var(--background)]/90 backdrop-blur-md
                           border-0 outline-none focus:outline-none
                           before:absolute before:inset-0 before:rounded-xl
                           before:bg-gradient-to-r before:from-[#FF2D96] before:via-[#00E5FF] before:to-[#FF2D96]
                           before:bg-[length:200%_200%] before:animate-[gradient-shift_15s_ease-in-out_infinite]
                           before:p-[1px] before:content-['']
                           after:absolute after:inset-[1px] after:rounded-xl
                           after:bg-[var(--background)]/95 after:backdrop-blur-md
                           shadow-[0_0_8px_rgba(255,45,150,0.3)]
                           hover:shadow-[0_0_12px_rgba(255,45,150,0.4),0_0_18px_rgba(0,229,255,0.2)]
                           hover:before:bg-[length:250%_250%]
                           active:shadow-[0_0_4px_rgba(255,45,150,0.5),inset_0_0_8px_rgba(255,45,150,0.2)]
                           transition-all duration-200 ease-out
                           overflow-hidden"
              >
                <span className="relative z-10">Exam Snipe</span>
              </button>
            </div>

            {/* Absolutely centered Pomodoro Timer */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <PomodoroTimer />
            </div>

            {/* Right side - Settings */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full
                           text-white bg-[var(--background)]/90 backdrop-blur-md
                           border-0 outline-none focus:outline-none
                           before:absolute before:inset-0 before:rounded-full
                           before:bg-gradient-to-r before:from-[#00E5FF] before:via-[#FF2D96] before:to-[#00E5FF]
                           before:bg-[length:200%_200%] before:animate-[gradient-shift_15s_ease-in-out_infinite]
                           before:p-[1px] before:content-['']
                           after:absolute after:inset-[1px] after:rounded-full
                           after:bg-[var(--background)]/95 after:backdrop-blur-md
                           shadow-[0_0_8px_rgba(0,229,255,0.3)]
                           hover:shadow-[0_0_12px_rgba(0,229,255,0.4),0_0_18px_rgba(255,45,150,0.2)]
                           hover:before:bg-[length:250%_250%]
                           active:shadow-[0_0_4px_rgba(0,229,255,0.5),inset_0_0_8px_rgba(0,229,255,0.2)]
                           transition-all duration-200 ease-out
                           overflow-hidden"
                aria-label="Settings"
                title="Settings"
              >
                {/* Settings icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90 relative z-10">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
    </>
  );
}


