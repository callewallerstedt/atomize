"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type UserType = "student" | "professional" | "learner" | null;
type OnboardingPath = "upload_course" | "exam_snipe" | "later";

function getViewportRect() {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 };
  }

  const vv = window.visualViewport;
  if (vv) {
    return {
      width: vv.width,
      height: vv.height,
      offsetLeft: vv.offsetLeft,
      offsetTop: vv.offsetTop,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
  };
}

export default function OnboardingModal({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: (payload: { userType: UserType; onboardingPath: OnboardingPath }) => void;
}) {
  const [selectedType, setSelectedType] = useState<UserType>(null);
  const [step, setStep] = useState<"select" | "activate">("select");
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState(() => getViewportRect());

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (open) {
      window.dispatchEvent(new CustomEvent("synapse:onboarding-open"));
      document.body.style.overflow = "hidden";
    } else {
      window.dispatchEvent(new CustomEvent("synapse:onboarding-close"));
      document.body.style.overflow = previousOverflow;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const syncViewport = () => {
      const nextViewport = getViewportRect();
      setViewport(nextViewport);
      setMousePosition((prev) => {
        if (prev.x !== 0 || prev.y !== 0) return prev;
        return {
          x: nextViewport.width / 2,
          y: nextViewport.height / 2,
        };
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const nextViewport = getViewportRect();
      setViewport(nextViewport);
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    syncViewport();
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-[9999] overflow-y-auto overscroll-contain"
      style={{
        left: `${viewport.offsetLeft}px`,
        top: `${viewport.offsetTop}px`,
        width: `${viewport.width || window.innerWidth}px`,
        height: `${viewport.height || window.innerHeight}px`,
        backgroundColor: "var(--background)",
        backgroundImage: "url(/spinner.png)",
        backgroundSize: "800px 800px",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "var(--background)",
          opacity: 0.84,
          zIndex: 0,
        }}
      />

      <div
        className="fixed pointer-events-none"
        style={{
          left: `${viewport.offsetLeft + mousePosition.x}px`,
          top: `${viewport.offsetTop + mousePosition.y}px`,
          width: "60px",
          height: "60px",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(0, 229, 255, 0.5) 0%, rgba(255, 45, 150, 0.5) 50%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(20px)",
          animation: "mouseGlow 3s ease-in-out infinite",
          mixBlendMode: "screen",
          transition: "opacity 0.3s ease-out",
          zIndex: 1,
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl items-center justify-center px-6 py-10">
        <div className="w-full flex items-center justify-center" style={{ minHeight: `${Math.max(viewport.height - 80, 0)}px` }}>
          <div className="w-full space-y-10">
            {step === "select" ? (
              <div className="space-y-12">
                <div className="text-center space-y-4">
                  <h1 className="text-5xl md:text-6xl font-bold mb-4">
                    Welcome to{" "}
                    <span
                      className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent"
                      style={{
                        backgroundSize: "200% auto",
                        animation: "gradient-shift 3s ease infinite",
                      }}
                    >
                      Synapse
                    </span>
                  </h1>
                  <p className="text-xl md:text-2xl text-[var(--foreground)]/70 font-medium">
                    First tell us who you are.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
                  {[
                    { value: "student" as const, label: "Student" },
                    { value: "professional" as const, label: "Professional" },
                    { value: "learner" as const, label: "Lifelong Learner" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedType(option.value);
                        setStep("activate");
                      }}
                      className="pill-button w-full inline-flex h-20 items-center justify-center rounded-2xl px-8 text-lg font-semibold border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-all hover:scale-[1.02]"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="text-center space-y-4">
                  <h2 className="text-4xl md:text-5xl font-bold text-[var(--foreground)]">
                    Start with{" "}
                    <span
                      className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent"
                      style={{
                        backgroundSize: "200% auto",
                        animation: "gradient-shift 3s ease infinite",
                      }}
                    >
                      Synapse
                    </span>
                  </h2>
                  <p className="text-lg md:text-xl text-[var(--foreground)]/80 leading-relaxed max-w-3xl mx-auto">
                    Best launch flow: organize your course, analyze old exams, then practice smarter. Pick your starting point.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button
                    onClick={() => onComplete({ userType: selectedType, onboardingPath: "upload_course" })}
                    className="rounded-3xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/85 p-8 text-left hover:border-[var(--accent-cyan)]/50 hover:bg-[var(--background)] transition-all"
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-cyan)]/80">
                      Primary Path
                    </div>
                    <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">Upload your course</div>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]/75">
                      Upload notes, slides, and old exams. Synapse will build a cleaner topic map, generate lessons, and prepare the course for Practice and Surge.
                    </p>
                  </button>

                  <button
                    onClick={() => onComplete({ userType: selectedType, onboardingPath: "exam_snipe" })}
                    className="rounded-3xl border border-[var(--accent-pink)]/25 bg-[var(--background)]/80 p-8 text-left hover:border-[var(--accent-pink)]/45 hover:bg-[var(--background)] transition-all"
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-pink)]/80">
                      Strong Secondary
                    </div>
                    <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">Run Exam Snipe</div>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]/75">
                      Start from old exams if that is what you have. Synapse will surface repeated concepts, common question patterns, and the highest-value study areas first.
                    </p>
                  </button>
                </div>

                <div className="rounded-3xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 p-6 text-sm text-[var(--foreground)]/75">
                  <div className="font-semibold text-[var(--foreground)]">After setup</div>
                  <p className="mt-2">
                    Use Practice for topic-focused drills. Use Surge when you want guided active recall and exam-focused repetition.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => setStep("select")}
                      className="inline-flex h-10 items-center rounded-full border border-[var(--foreground)]/15 px-5 text-sm text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/5 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => onComplete({ userType: selectedType, onboardingPath: "later" })}
                      className="inline-flex h-10 items-center rounded-full border border-[var(--foreground)]/15 px-5 text-sm text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/5 transition-colors"
                    >
                      Explore dashboard first
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
