"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import { LessonHighlight } from "@/utils/storage";
import { HIGHLIGHT_COLORS } from "@/components/HighlightToolbar";

interface HighlightsModalProps {
  open: boolean;
  onClose: () => void;
  highlights: LessonHighlight[];
  onSave: (highlight: LessonHighlight) => void;
  onDelete: (highlightId: string) => void;
  lessonTitle?: string;
  // For course-wide view
  allHighlights?: Array<{
    highlight: LessonHighlight;
    topicName: string;
    lessonTitle: string;
    lessonIndex: number;
  }>;
  isCourseView?: boolean;
  onNavigateToLesson?: (topicName: string, lessonIndex: number) => void;
}

export default function HighlightsModal({
  open,
  onClose,
  highlights,
  onSave,
  onDelete,
  lessonTitle,
  allHighlights,
  isCourseView = false,
  onNavigateToLesson,
}: HighlightsModalProps) {
  const [editingHighlight, setEditingHighlight] = useState<LessonHighlight | null>(null);
  const [editColor, setEditColor] = useState<string>("");
  const [editNote, setEditNote] = useState<string>("");

  const displayHighlights = isCourseView ? allHighlights : highlights.map(h => ({
    highlight: h,
    topicName: "",
    lessonTitle: lessonTitle || "",
    lessonIndex: 0,
  }));

  const handleEdit = (highlight: LessonHighlight) => {
    setEditingHighlight(highlight);
    setEditColor(highlight.color);
    setEditNote(highlight.note || "");
  };

  const handleSaveEdit = () => {
    if (!editingHighlight) return;
    const updated: LessonHighlight = {
      ...editingHighlight,
      color: editColor,
      note: editNote || undefined,
      updatedAt: Date.now(),
    };
    onSave(updated);
    setEditingHighlight(null);
  };

  const handleCancelEdit = () => {
    setEditingHighlight(null);
    setEditColor("");
    setEditNote("");
  };

  if (!displayHighlights || displayHighlights.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title={isCourseView ? "All Course Highlights" : "Lesson Highlights"}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--foreground)]/10 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[var(--foreground)]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--foreground)]/60 mb-2">No highlights yet</p>
          <p className="text-xs text-[var(--foreground)]/40">
            Select text in the lesson and click "Highlight" to create one
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCourseView ? `All Course Highlights (${displayHighlights.length})` : `Lesson Highlights (${highlights.length})`}
      className="!max-w-2xl"
    >
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {displayHighlights.map(({ highlight, topicName, lessonTitle: hlLessonTitle, lessonIndex }) => (
          <div
            key={highlight.id}
            className="rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)]/50 overflow-hidden"
          >
            {editingHighlight?.id === highlight.id ? (
              // Edit mode
              <div className="p-4 space-y-4">
                <div
                  className="text-sm text-[var(--foreground)]/90 p-2 rounded-lg"
                  style={{ backgroundColor: editColor + "30" }}
                >
                  "{highlight.text}"
                </div>
                
                {/* Color selection */}
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60 mb-2">Color</p>
                  <div className="flex gap-2">
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setEditColor(color.value)}
                        className={`w-7 h-7 rounded-full transition-all duration-150 ${
                          editColor === color.value
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
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60 mb-2">Note</p>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Add a note..."
                    className="w-full h-20 px-3 py-2 rounded-lg bg-[var(--foreground)]/5 border border-[var(--foreground)]/10 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/50"
                  />
                </div>
                
                {/* Action buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => {
                      onDelete(highlight.id);
                      setEditingHighlight(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Delete
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white synapse-style hover:opacity-90 transition-opacity"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // View mode
              <div className="p-4">
                {isCourseView && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-[var(--foreground)]/50">
                    <span className="font-medium">{topicName}</span>
                    <span>•</span>
                    <span>{hlLessonTitle}</span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                    style={{ backgroundColor: highlight.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm text-[var(--foreground)]/90 mb-2"
                      style={{ backgroundColor: highlight.color + "25", padding: "4px 8px", borderRadius: "6px", display: "inline" }}
                    >
                      "{highlight.text}"
                    </p>
                    {highlight.note && (
                      <p className="text-xs text-[var(--foreground)]/60 mt-2 flex items-start gap-1.5">
                        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        {highlight.note}
                      </p>
                    )}
                    {highlight.elaboration && (
                      <div className="mt-3 pt-3 border-t border-[var(--foreground)]/10">
                        <p className="text-xs font-medium text-[var(--accent-pink)] mb-2 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          AI Elaboration
                        </p>
                        <div className="text-xs text-[var(--foreground)]/70 lesson-content prose-sm">
                          <LessonBody body={sanitizeLessonBody(highlight.elaboration)} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(highlight)}
                      className="p-1.5 rounded-lg text-[var(--foreground)]/40 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
                      title="Edit highlight"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {isCourseView && onNavigateToLesson && (
                      <button
                        onClick={() => {
                          onClose();
                          onNavigateToLesson(topicName, lessonIndex);
                        }}
                        className="p-1.5 rounded-lg text-[var(--foreground)]/40 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
                        title="Go to lesson"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}



