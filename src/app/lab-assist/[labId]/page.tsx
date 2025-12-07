"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import GlowSpinner from "@/components/GlowSpinner";
import { LessonBody } from "@/components/LessonBody";
import Modal from "@/components/Modal";

type Step = {
  id: string;
  index: number;
  title: string;
  mainInstruction: string;
  imageUrls: string[];
  imageLabels?: string[];
};

type LabImage = {
  label: string;
  data: string;
  contentType: string;
};

type Lab = {
  id: string;
  title: string;
  sourceFileName: string;
  originalText?: string;
  images?: LabImage[];
  steps: Step[];
};

export default function LabAssistViewerPage() {
  const router = useRouter();
  const params = useParams<{ labId: string }>();
  const labId = params.labId;

  const [lab, setLab] = useState<Lab | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [diveDeeperModalOpen, setDiveDeeperModalOpen] = useState(false);
  const [diveDeeperExplanation, setDiveDeeperExplanation] = useState<string | null>(null);
  const [diveDeeperLoading, setDiveDeeperLoading] = useState(false);

  // Define handlers before they're used in useEffect
  const handlePrevious = useCallback(() => {
    if (currentStepIndex > 0 && !isTransitioning) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStepIndex(currentStepIndex - 1);
        setTimeout(() => setIsTransitioning(false), 300);
      }, 50);
    }
  }, [currentStepIndex, isTransitioning]);

  const handleNext = useCallback(() => {
    if (lab && currentStepIndex < lab.steps.length - 1 && !isTransitioning) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStepIndex(currentStepIndex + 1);
        setTimeout(() => setIsTransitioning(false), 300);
      }, 50);
    }
  }, [lab, currentStepIndex, isTransitioning]);

  useEffect(() => {
    // Hide the main app header immediately when component mounts and keep it hidden
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('synapse:onboarding-open'));
      
      // Also set a flag to prevent scroll-based header showing
      (window as any).__labAssistActive = true;
      
      // Disable auto-open chat input on this page
      (window as any).__labAssistDisableChatAutoOpen = true;
    }

    // Keep dispatching the event periodically to ensure header stays hidden
    const interval = setInterval(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('synapse:onboarding-open'));
      }
    }, 100);

    // Cleanup: show header again when component unmounts
    return () => {
      if (typeof window !== 'undefined') {
        (window as any).__labAssistActive = false;
        (window as any).__labAssistDisableChatAutoOpen = false;
        window.dispatchEvent(new CustomEvent('synapse:onboarding-close'));
      }
      clearInterval(interval);
    };
  }, []);

  // Separate effect for keyboard shortcuts (needs lab to be loaded)
  useEffect(() => {
    if (!lab || !lab.steps) return;

    const totalSteps = lab.steps.length;

    // Keyboard shortcuts
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input/textarea
      const activeElement = document.activeElement;
      const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      );
      
      if (isTextInput) {
        return;
      }

      // Prevent space from scrolling when focused on the page
      if (e.key === ' ') {
        e.preventDefault();
        handleNext();
      }
      // Arrow keys for navigation
      else if (e.key === 'ArrowRight' && currentStepIndex < totalSteps - 1) {
        e.preventDefault();
        handleNext();
      }
      else if (e.key === 'ArrowLeft' && currentStepIndex > 0) {
        e.preventDefault();
        handlePrevious();
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [lab, currentStepIndex, handleNext, handlePrevious]);

  useEffect(() => {
    if (!labId) return;

    // Try to load from sessionStorage first
    const stored = sessionStorage.getItem(`lab-assist-${labId}`);
    if (stored) {
      try {
        const labData = JSON.parse(stored);
        setLab(labData);
        setLoading(false);
        return;
      } catch (e) {
        console.error('Failed to parse stored lab data:', e);
      }
    }

    // If not found, show error
    setLoading(false);
  }, [labId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <GlowSpinner size={120} ariaLabel="Loading lab" idSuffix="lab-assist-loading" />
      </div>
    );
  }

  if (!lab || !lab.steps || lab.steps.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-[var(--foreground)]/70">Lab not found or has no steps.</p>
          <button
            onClick={() => router.push('/lab-assist')}
            className="rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/50 px-4 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--background)]/70 transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const currentStep = lab.steps[currentStepIndex];
  const totalSteps = lab.steps.length;
  const progress = ((currentStepIndex + 1) / totalSteps) * 100;

  const handleDiveDeeper = async () => {
    if (!lab || !lab.steps || lab.steps.length === 0) return;

    setDiveDeeperModalOpen(true);
    setDiveDeeperLoading(true);
    setDiveDeeperExplanation(null);

    try {
      const currentStep = lab.steps[currentStepIndex];
      const previousStep = currentStepIndex > 0 ? lab.steps[currentStepIndex - 1] : null;
      const nextStep = currentStepIndex < lab.steps.length - 1 ? lab.steps[currentStepIndex + 1] : null;

      const response = await fetch('/api/lab-assist/dive-deeper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          labTitle: lab.title,
          sourceFileName: lab.sourceFileName,
          originalLabText: lab.originalText || '', // Include original file content
          currentStep: {
            index: currentStep.index,
            title: currentStep.title,
            mainInstruction: currentStep.mainInstruction,
          },
          previousStep: previousStep ? {
            index: previousStep.index,
            title: previousStep.title,
            mainInstruction: previousStep.mainInstruction,
          } : null,
          nextStep: nextStep ? {
            index: nextStep.index,
            title: nextStep.title,
            mainInstruction: nextStep.mainInstruction,
          } : null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to generate detailed explanation');
      }

      setDiveDeeperExplanation(data.explanation || '');
    } catch (error: any) {
      console.error('Error diving deeper:', error);
      setDiveDeeperExplanation(`Error: ${error?.message || 'Failed to generate detailed explanation'}`);
    } finally {
      setDiveDeeperLoading(false);
    }
  };


  return (
    <div 
      className="min-h-screen flex flex-col relative"
      style={{
        backgroundColor: 'var(--background)',
        backgroundImage: 'url(/spinner.png)',
        backgroundSize: '800px 800px',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Background overlay to make content readable */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundColor: 'var(--background)',
          opacity: 0.95,
          zIndex: 0,
        }}
      />
      <style jsx global>{`
        button.lab-assist-back-button,
        button.lab-assist-back-button:hover {
          box-shadow: none !important;
        }
      `}</style>
      {/* Top Bar */}
      <div className="border-b border-[var(--foreground)]/10 bg-[var(--background)]/95 backdrop-blur-sm fixed top-0 left-0 right-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Back button */}
            <button
              onClick={() => router.push('/')}
              className="lab-assist-back-button flex items-center gap-2 text-sm text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to dashboard
            </button>

            {/* Center: Lab title */}
            <div className="flex-1 text-center min-w-0">
              <h1 className="text-base font-semibold text-[var(--foreground)] truncate">
                {lab.title}
              </h1>
              <p className="text-xs text-[var(--foreground)]/50 truncate">
                {lab.sourceFileName}
              </p>
            </div>

            {/* Right: Progress */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--foreground)]/70 whitespace-nowrap">
                Step {currentStepIndex + 1} of {totalSteps}
              </span>
              <div className="w-24 h-1.5 bg-[var(--foreground)]/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 overflow-hidden" style={{ 
        position: 'fixed',
        top: '80px',
        bottom: '80px',
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem'
      }}>
        <div className="w-full max-w-3xl" style={{ position: 'relative' }}>
          {/* Previous Step Preview */}
          {currentStepIndex > 0 && (
            <div 
              onClick={handlePrevious}
              className="rounded-2xl border border-[var(--foreground)]/10 p-4 space-y-3 transition-all duration-300 cursor-pointer hover:opacity-60"
              style={{ 
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: '0.5rem',
                backgroundColor: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
                opacity: 0.4,
                transform: 'scale(0.85)',
                transformOrigin: 'bottom center',
                zIndex: 1,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[var(--foreground)]/30 uppercase tracking-wide">
                  Step {lab.steps[currentStepIndex - 1].index}
                </span>
                <h2 className="text-[10px] font-medium text-[var(--foreground)]/30 uppercase tracking-wide truncate">
                  {lab.steps[currentStepIndex - 1].title}
                </h2>
              </div>
              <div className="text-xs text-[var(--foreground)]/20" style={{ maxHeight: '4rem', overflow: 'hidden' }}>
                <LessonBody body={lab.steps[currentStepIndex - 1].mainInstruction} />
              </div>
            </div>
          )}

          {/* Current Step Card */}
          <div 
            className="rounded-2xl border border-[var(--foreground)]/10 p-6 md:p-8 space-y-6 transition-all duration-300"
            style={{ 
              position: 'relative',
              zIndex: 5,
              backgroundColor: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
              opacity: 1,
              transform: 'scale(1)',
              transformOrigin: 'center',
              width: '100%',
            }}
          >
            {/* Step Label and Title on same line with Dive Deeper button */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[var(--foreground)]/50 uppercase tracking-wide">
                  Step {currentStep.index}
                </span>
                <h2 className="text-xs font-medium text-[var(--foreground)]/50 uppercase tracking-wide">
                  {currentStep.title}
                </h2>
              </div>
              <button
                onClick={handleDiveDeeper}
                className="px-3 py-1.5 rounded-lg border border-[var(--foreground)]/20 text-xs text-[var(--foreground)]/80 hover:text-[var(--foreground)] transition-colors"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
                }}
                title="Get a more detailed explanation of this step"
              >
                Dive Deeper
              </button>
            </div>

            {/* Main Instruction - left justified and larger */}
            <div>
              <LessonBody body={currentStep.mainInstruction} />
            </div>

            {/* Images */}
            {currentStep.imageUrls && currentStep.imageUrls.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--foreground)]/80 uppercase tracking-wide">
                  Figure from original lab
                </h3>
                <div className="flex flex-wrap gap-3">
                  {currentStep.imageUrls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setExpandedImage(url)}
                      className="rounded-lg border border-[var(--foreground)]/10 overflow-hidden hover:border-[var(--foreground)]/20 transition-colors"
                    >
                      <img
                        src={url}
                        alt={`Figure ${idx + 1}`}
                        className="h-24 w-auto object-contain"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Next Step Preview */}
          {currentStepIndex < totalSteps - 1 && (
            <div 
                onClick={handleNext}
                className="rounded-2xl border border-[var(--foreground)]/10 p-4 space-y-3 transition-all duration-300 cursor-pointer hover:opacity-60"
                style={{ 
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '0.5rem',
                  backgroundColor: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
                  opacity: 0.4,
                  transform: 'scale(0.85)',
                  transformOrigin: 'top center',
                  zIndex: 1,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-[var(--foreground)]/30 uppercase tracking-wide">
                    Step {lab.steps[currentStepIndex + 1].index}
                  </span>
                  <h2 className="text-[10px] font-medium text-[var(--foreground)]/30 uppercase tracking-wide truncate">
                    {lab.steps[currentStepIndex + 1].title}
                  </h2>
                </div>
                <div className="text-xs text-[var(--foreground)]/20" style={{ maxHeight: '4rem', overflow: 'hidden' }}>
                  <LessonBody body={lab.steps[currentStepIndex + 1].mainInstruction} />
                </div>
              </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="border-t border-[var(--foreground)]/10 bg-[var(--background)]/95 backdrop-blur-sm fixed bottom-0 left-0 right-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Back button */}
            <button
              onClick={handlePrevious}
              disabled={currentStepIndex === 0}
              className="lab-assist-back-button px-4 py-2 rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/50 text-sm text-[var(--foreground)]/80 hover:bg-[var(--background)]/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>

            {/* Center: Help text */}
            <p className="text-xs text-[var(--foreground)]/40 italic">
              Press space to go to the next step
            </p>

            {/* Right: Next/Finish button */}
            <button
              onClick={handleNext}
              disabled={currentStepIndex >= totalSteps - 1}
              className="synapse-style inline-flex items-center rounded-full px-6 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ zIndex: 100, position: 'relative' }}
            >
              <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                {currentStepIndex >= totalSteps - 1 ? 'Finish' : 'Next'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="max-w-4xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedImage}
              alt="Expanded figure"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
          <button
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
              <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Dive Deeper Modal */}
      <Modal
        open={diveDeeperModalOpen}
        onClose={() => {
          setDiveDeeperModalOpen(false);
          setDiveDeeperExplanation(null);
        }}
        title="Detailed Explanation"
        className="max-w-3xl"
      >
        {diveDeeperLoading ? (
          <div className="flex items-center justify-center py-12">
            <GlowSpinner size={60} ariaLabel="Generating detailed explanation" idSuffix="dive-deeper-loading" />
          </div>
        ) : diveDeeperExplanation ? (
          <div className="lesson-content prose max-w-none">
            <LessonBody body={diveDeeperExplanation} />
          </div>
        ) : (
          <div className="text-center py-12 text-[var(--foreground)]/70">
            No explanation available
          </div>
        )}
      </Modal>
    </div>
  );
}

