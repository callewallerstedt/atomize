"use client";

import { useEffect, useRef } from "react";

interface SelectionToolbarProps {
  position: { x: number; y: number };
  onHighlight: () => void;
  onElaborate: () => void;
  onClose: () => void;
}

export default function SelectionToolbar({
  position,
  onHighlight,
  onElaborate,
  onClose,
}: SelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Position calculation - always try to center horizontally
  const getToolbarStyle = () => {
    const toolbarWidth = 180;
    const padding = 12;

    let left = position.x - toolbarWidth / 2;
    let top = position.y + 8;

    // Adjust for viewport boundaries
    if (typeof window !== "undefined") {
      if (left < padding) left = padding;
      if (left + toolbarWidth > window.innerWidth - padding) {
        left = window.innerWidth - toolbarWidth - padding;
      }
      // If too close to bottom, show above
      if (top + 50 > window.innerHeight - padding) {
        top = position.y - 50;
      }
      if (top < padding) top = padding;
    }

    return { left, top };
  };

  const style = getToolbarStyle();

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[100] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{
        left: style.left,
        top: style.top,
      }}
    >
      <div className="flex items-center gap-1 rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/98 backdrop-blur-md shadow-2xl p-1.5">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHighlight();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent-cyan)]/20 hover:text-[var(--accent-cyan)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Highlight
        </button>
        <div className="w-px h-5 bg-[var(--foreground)]/15" />
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onElaborate();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent-pink)]/20 hover:text-[var(--accent-pink)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Elaborate
        </button>
      </div>
    </div>
  );
}










