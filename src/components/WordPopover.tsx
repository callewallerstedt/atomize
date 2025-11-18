"use client";

import { useEffect, useRef } from "react";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";

export default function WordPopover({
  open,
  x,
  y,
  loading,
  error,
  content,
  word,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  loading: boolean;
  error: string | null;
  content: string;
  word?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDoc(e: MouseEvent) {
      if (!ref.current || !e.target) return;
      // Don't close while loading - wait for content to load first
      if (loading) {
        console.log('Ignoring click while loading');
        return;
      }
      const containsTarget = ref.current.contains(e.target as Node);
      console.log('Click detected:', { containsTarget, loading, target: e.target });
      if (!containsTarget) {
        console.log('Closing popover due to outside click');
        onClose();
      }
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.addEventListener("mousedown", onDoc);
      return () => {
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("mousedown", onDoc);
      };
    }
  }, [open, onClose]);

  if (!open || x === 0 || y === 0) return null;

  // Center horizontally, position at bottom
  const popoverWidth = 504; // Match lesson page width
  const popoverMaxHeight = 400; // Estimate max height
  const bottomMargin = 16; // Match lesson page margin
  
  // Center horizontally using 50% + translateX(-50%)
  // This ensures it's always centered regardless of screen size
  const finalX = '50%';
  
  // If y is near bottom (targeting bottom position), use bottom CSS property instead
  // Check if y is within 100px of bottom (indicating we want bottom positioning)
  const isBottomPosition = y > window.innerHeight - 100;
  
  // Calculate position - if targeting bottom, position from bottom, otherwise from top
  const finalY = isBottomPosition 
    ? undefined // Will use bottom CSS property
    : Math.max(12, y);
  
  const finalBottom = isBottomPosition ? bottomMargin : undefined;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={ref}
        className="fixed z-50 w-[504px] max-w-[calc(100vw-24px)] max-h-[400px] overflow-y-auto rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/95 backdrop-blur-sm p-4 text-[var(--foreground)] shadow-2xl pointer-events-auto"
        style={{
          left: finalX,
          ...(finalY !== undefined ? { top: `${finalY}px` } : {}),
          ...(finalBottom !== undefined ? { bottom: `${finalBottom}px` } : {}),
          transform: 'translateX(-50%)', // Center horizontally
        }}
      >
        {loading ? (
          <div className="flex items-center gap-3 text-xl">
            <span className="h-4 w-4 animate-pulse rounded-full bg-accent" />
            {word ? `Generating explanation for "${word}"…` : 'Generating explanation…'}
          </div>
        ) : error ? (
          <div className="text-xl text-[#FFC0DA]">{error}</div>
        ) : (
          <div className="space-y-3">
            {word && (
              <div className="text-xl font-semibold text-[var(--accent-cyan)]">
                "{word}"
              </div>
            )}
            <div className="lesson-content text-xl max-h-64 overflow-y-auto leading-relaxed">
              <LessonBody body={sanitizeLessonBody(String(content || ""))} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


