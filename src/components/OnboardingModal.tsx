"use client";

import { useState, useEffect } from "react";

type UserType = "student" | "professional" | "learner" | null;

export default function OnboardingModal({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: (userType: UserType) => void;
}) {
  const [selectedType, setSelectedType] = useState<UserType>(null);
  const [step, setStep] = useState<"select" | "explain">("select");
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Dispatch event to hide header when onboarding is open and prevent body scroll
  useEffect(() => {
    if (open) {
      window.dispatchEvent(new CustomEvent('synapse:onboarding-open'));
      // Prevent body scroll when onboarding is open
      document.body.style.overflow = 'hidden';
    } else {
      window.dispatchEvent(new CustomEvent('synapse:onboarding-close'));
      // Restore body scroll when onboarding closes
      document.body.style.overflow = '';
    }
    return () => {
      // Cleanup: restore scroll on unmount
      document.body.style.overflow = '';
    };
  }, [open]);

  // Track mouse position for glow effect
  useEffect(() => {
    if (!open) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [open]);

  const handleSelect = (type: UserType) => {
    setSelectedType(type);
    setStep("explain");
  };

  const handleFinish = () => {
    if (selectedType) {
      onComplete(selectedType);
    }
  };

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto relative"
      style={{
        backgroundColor: 'var(--background)',
        backgroundImage: 'url(/spinner.png)',
        backgroundSize: '800px 800px',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Overlay to reduce spinner opacity to 20% */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: 'var(--background)',
          opacity: 0.8,
          zIndex: 0,
        }}
      />
      
      {/* Mouse glow effect */}
      <div
        className="fixed pointer-events-none"
        style={{
          left: `${mousePosition.x}px`,
          top: `${mousePosition.y}px`,
          width: '60px',
          height: '60px',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(0, 229, 255, 0.5) 0%, rgba(255, 45, 150, 0.5) 50%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(20px)',
          animation: 'mouseGlow 3s ease-in-out infinite',
          mixBlendMode: 'screen',
          transition: 'opacity 0.3s ease-out',
          zIndex: 1,
        }}
      />

      <div className="relative z-10 w-full max-w-4xl px-6 py-12 md:py-16" style={{ position: 'relative', zIndex: 10 }}>
        {step === "select" && (
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
                Let's get you started. First, tell us who you are:
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <button
                onClick={() => handleSelect("student")}
                className="pill-button w-full inline-flex h-20 items-center justify-center rounded-2xl px-8 text-lg font-semibold border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-all hover:scale-[1.02]"
              >
                Student
              </button>
              <button
                onClick={() => handleSelect("professional")}
                className="pill-button w-full inline-flex h-20 items-center justify-center rounded-2xl px-8 text-lg font-semibold border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-all hover:scale-[1.02]"
              >
                Professional
              </button>
              <button
                onClick={() => handleSelect("learner")}
                className="pill-button w-full inline-flex h-20 items-center justify-center rounded-2xl px-8 text-lg font-semibold border border-[var(--foreground)]/10 text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/20 transition-all hover:scale-[1.02]"
              >
                Lifelong Learner
              </button>
            </div>
          </div>
        )}

        {step === "explain" && selectedType && (
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold text-[var(--foreground)]">
                What is <span
                  className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent"
                  style={{
                    backgroundSize: "200% auto",
                    animation: "gradient-shift 3s ease infinite",
                  }}
                >Synapse</span>?
              </h2>
              <p className="text-lg md:text-xl text-[var(--foreground)]/80 leading-relaxed max-w-2xl mx-auto">
                <span
                  className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent font-semibold"
                  style={{
                    backgroundSize: "200% auto",
                    animation: "gradient-shift 3s ease infinite",
                  }}
                >Synapse</span> is an AI-powered learning platform that transforms how you study. 
                It structures your course materials, generates interactive lessons, creates practice questions, 
                and builds personalized flashcards—all tailored to help you master any subject.
              </p>
            </div>

            <div className="mt-12 p-8 md:p-10 rounded-3xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 backdrop-blur-sm">
              <h3 className="text-2xl md:text-3xl font-bold text-[var(--foreground)] mb-6">
                {selectedType === "student" && "Getting Started as a Student"}
                {selectedType === "professional" && "Getting Started as a Professional"}
                {selectedType === "learner" && "Getting Started as a Learner"}
              </h3>
              
              <div className="space-y-6 text-base md:text-lg text-[var(--foreground)]/90 leading-relaxed">
                {selectedType === "student" && (
                  <>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                          Step 1: Upload Your Course Materials
                        </h4>
                        <p>
                          Drag and drop all your course files into the <strong className="text-[var(--foreground)]">auto-create box</strong> on the homepage. 
                          This includes lecture notes, slides, textbooks, assignments, and most importantly:
                        </p>
                      </div>
                      
                      <div className="pl-6 border-l-4 border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5 rounded-r-lg p-4">
                        <p className="font-semibold text-[var(--foreground)] mb-2">
                          Include Old Exams
                        </p>
                        <p>
                          Past exams are incredibly valuable. They help <span
                            className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent font-semibold"
                            style={{
                              backgroundSize: "200% auto",
                              animation: "gradient-shift 3s ease infinite",
                            }}
                          >Synapse</span> understand:
                        </p>
                        <ul className="mt-3 space-y-2 list-disc list-inside text-[var(--foreground)]/80">
                          <li>Which concepts your course emphasizes most</li>
                          <li>What types of questions you'll face on your exam</li>
                          <li>How topics are typically tested</li>
                          <li>The difficulty level and format expectations</li>
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                          Step 2: Let Synapse Work Its Magic
                        </h4>
                        <p>
                          <span
                            className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent font-semibold"
                            style={{
                              backgroundSize: "200% auto",
                              animation: "gradient-shift 3s ease infinite",
                            }}
                          >Synapse</span> will analyze all your materials, extract key topics, identify important concepts, 
                          and create a structured learning path tailored specifically to your course.
                        </p>
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                          Step 3: Start Learning
                        </h4>
                        <p>
                          Dive into interactive lessons, practice with AI-generated questions, review with flashcards, 
                          and track your progress—all in one place, perfectly organized for your course.
                        </p>
                      </div>
                    </div>
                  </>
                )}
                
                {(selectedType === "professional" || selectedType === "learner") && (
                  <>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                          Step 1: Talk to Chad
                        </h4>
                        <p>
                          On the homepage, you'll find <strong className="text-[var(--foreground)]">Chad</strong>, your AI assistant. 
                          Simply describe what you want to learn—whether it's a new skill, a professional certification, 
                          or a personal interest you're exploring.
                        </p>
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                          Step 2: Create Your Course
                        </h4>
                        <p>
                          Based on your description, <span
                            className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent font-semibold"
                            style={{
                              backgroundSize: "200% auto",
                              animation: "gradient-shift 3s ease infinite",
                            }}
                          >Synapse</span> will create a personalized course with:
                        </p>
                        <ul className="mt-3 space-y-2 list-disc list-inside text-[var(--foreground)]/80">
                          <li>Structured lessons tailored to your goals</li>
                          <li>Practice questions to test your understanding</li>
                          <li>Flashcards for efficient review</li>
                          <li>A learning path that adapts to your pace</li>
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                          Optional: Enhance with Files
                        </h4>
                        <p>
                          You can also upload documents, PDFs, or other materials to give <span
                            className="bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] bg-clip-text text-transparent font-semibold"
                            style={{
                              backgroundSize: "200% auto",
                              animation: "gradient-shift 3s ease infinite",
                            }}
                          >Synapse</span> more context and create an even more personalized learning experience.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-center mt-12">
              <button
                onClick={handleFinish}
                className="synapse-style px-8 py-4 rounded-full text-lg font-semibold !text-white transition-opacity hover:opacity-90"
              >
                <span style={{ color: '#ffffff', position: 'relative', zIndex: 101, opacity: 1, textShadow: 'none' }}>
                  Get Started →
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
