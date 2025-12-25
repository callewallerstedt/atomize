"use client";

import { useState, useEffect, useRef } from "react";
import Modal from "@/components/Modal";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import GlowSpinner from "@/components/GlowSpinner";

interface ElaborateModalProps {
  open: boolean;
  onClose: () => void;
  selectedText: string;
  lessonBody: string;
  subject?: string;
  topic?: string;
  languageName?: string;
}

export default function ElaborateModal({
  open,
  onClose,
  selectedText,
  lessonBody,
  subject,
  topic,
  languageName,
}: ElaborateModalProps) {
  const [elaboration, setElaboration] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);

  // Start streaming when modal opens
  useEffect(() => {
    if (open && selectedText && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startStreaming();
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [open, selectedText]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setElaboration("");
        setLoading(false);
        setError(null);
        hasStartedRef.current = false;
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  async function startStreaming() {
    setLoading(true);
    setError(null);
    setElaboration("");

    try {
      abortControllerRef.current = new AbortController();
      
      const response = await fetch("/api/elaborate-highlight/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText,
          lessonBody,
          subject,
          topic,
          languageName,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson?.error || `Server error (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (!payload) continue;
          
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "text") {
              accumulated += parsed.content;
              setElaboration(accumulated);
              setLoading(false); // Stop showing loader once content starts
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            } else if (parsed.type === "done") {
              // Streaming complete
            }
          } catch (parseErr) {
            if (!(parseErr instanceof SyntaxError)) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err?.message || "Failed to elaborate");
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI Elaboration"
      className="!max-w-2xl"
    >
      <div className="space-y-4">
        {/* Selected text preview */}
        <div className="rounded-xl border border-[var(--accent-pink)]/20 bg-[var(--accent-pink)]/5 p-4">
          <p className="text-xs font-medium text-[var(--accent-pink)] uppercase tracking-wide mb-2">
            Selected Text
          </p>
          <p className="text-sm text-[var(--foreground)]/80 italic">
            "{selectedText}"
          </p>
        </div>

        {/* Elaboration content */}
        <div className="min-h-[200px]">
          {loading && !elaboration ? (
            <div className="flex flex-col items-center justify-center py-12">
              <GlowSpinner size={48} ariaLabel="Generating elaboration" idSuffix="elaborate-modal" />
              <p className="mt-4 text-sm text-[var(--foreground)]/60">
                Generating detailed explanation...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
              <div className="text-red-400 text-sm mb-3">{error}</div>
              <button
                onClick={() => {
                  hasStartedRef.current = false;
                  startStreaming();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Again
              </button>
            </div>
          ) : elaboration ? (
            <div className="lesson-content prose max-w-none text-sm">
              <LessonBody body={sanitizeLessonBody(elaboration)} />
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}



