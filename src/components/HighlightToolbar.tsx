"use client";

import { useState, useRef, useEffect } from "react";

export type HighlightColor = {
  name: string;
  value: string;
  bgClass: string;
};

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: "Yellow", value: "#FBBF24", bgClass: "bg-yellow-400/40" },
  { name: "Cyan", value: "#22D3EE", bgClass: "bg-cyan-400/40" },
  { name: "Pink", value: "#F472B6", bgClass: "bg-pink-400/40" },
  { name: "Green", value: "#4ADE80", bgClass: "bg-green-400/40" },
  { name: "Purple", value: "#A78BFA", bgClass: "bg-violet-400/40" },
  { name: "Orange", value: "#FB923C", bgClass: "bg-orange-400/40" },
];

interface HighlightToolbarProps {
  open: boolean;
  selectedText: string;
  onSave: (color: string, note: string) => void;
  onDelete?: () => void;
  onClose: () => void;
  initialColor?: string;
  initialNote?: string;
  isEditing?: boolean;
}

export default function HighlightToolbar({
  open,
  selectedText,
  onSave,
  onDelete,
  onClose,
  initialColor = HIGHLIGHT_COLORS[0].value,
  initialNote = "",
  isEditing = false,
}: HighlightToolbarProps) {
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [note, setNote] = useState(initialNote);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens with new values
  useEffect(() => {
    if (open) {
      setSelectedColor(initialColor);
      setNote(initialNote);
    }
  }, [open, initialColor, initialNote]);

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={contentRef}
          className="w-full max-w-md rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/98 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with selected text preview */}
          <div className="px-5 pt-5 pb-4 border-b border-[var(--foreground)]/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[var(--accent-cyan)]">
                {isEditing ? "Edit Highlight" : "Create Highlight"}
              </span>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--foreground)]/50 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div
              className="text-sm text-[var(--foreground)]/80 line-clamp-3 px-3 py-2 rounded-lg"
              style={{ backgroundColor: selectedColor + "30" }}
            >
              "{selectedText}"
            </div>
          </div>

          {/* Color selection */}
          <div className="px-5 py-4 border-b border-[var(--foreground)]/10">
            <p className="text-xs font-medium text-[var(--foreground)]/60 mb-3">Highlight Color</p>
            <div className="flex gap-3">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setSelectedColor(color.value)}
                  className={`w-9 h-9 rounded-full transition-all duration-150 ${
                    selectedColor === color.value
                      ? "ring-2 ring-offset-2 ring-offset-[var(--background)] ring-[var(--accent-cyan)] scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Note input */}
          <div className="px-5 py-4 border-b border-[var(--foreground)]/10">
            <p className="text-xs font-medium text-[var(--foreground)]/60 mb-2">Note (optional)</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this highlight..."
              className="w-full h-20 px-3 py-2 rounded-lg bg-[var(--foreground)]/5 border border-[var(--foreground)]/10 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50 focus:border-transparent"
            />
          </div>

          {/* Action buttons */}
          <div className="px-5 py-4 flex items-center gap-3">
            {isEditing && onDelete && (
              <button
                onClick={onDelete}
                className="h-10 px-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
            
            <button
              onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-[var(--foreground)]/20 text-[var(--foreground)]/70 text-sm font-medium hover:bg-[var(--foreground)]/10 transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={() => onSave(selectedColor, note)}
              className="flex-1 h-10 rounded-lg synapse-style text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {isEditing ? "Update" : "Save Highlight"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
