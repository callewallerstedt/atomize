"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

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
      if (!ref.current.contains(e.target as Node)) onClose();
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        ref={ref}
        className="absolute z-50 w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-[#222731] bg-[#0B0E12] p-4 text-[#E5E7EB] shadow-2xl"
        style={{ left: Math.min(Math.max(12, x), window.innerWidth - 372), top: Math.min(Math.max(12, y), window.innerHeight - 220) }}
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
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}


