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
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  loading: boolean;
  error: string | null;
  content: string;
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

  const finalX = Math.max(12, Math.min(x, window.innerWidth - 380));
  const finalY = Math.max(12, y);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={ref}
        className="fixed z-50 w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/95 backdrop-blur-sm p-4 text-[var(--foreground)] shadow-2xl pointer-events-auto"
        style={{
          left: `${finalX}px`,
          top: `${finalY}px`
        }}
      >
        {loading ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
            Generating explanation…
          </div>
        ) : error ? (
          <div className="text-sm text-[#FFC0DA]">{error}</div>
        ) : (
          <div className="lesson-content text-sm">
            <LessonBody body={sanitizeLessonBody(String(content || ""))} />
          </div>
        )}
      </div>
    </div>
  );
}


