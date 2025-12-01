"use client";

import { useEffect, useRef, useState } from "react";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";

export default function LarsCoach({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageContentRef = useRef<string>("");
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-start with Lars asking the first question
  useEffect(() => {
    if (!open) return;
    if (messages.length > 0 || sending) return;
    // Kick off initial question
    void sendInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Track content changes for smooth scroll during streaming
  useEffect(() => {
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const currentContent = lastMessage?.content || "";
    if (currentContent !== lastMessageContentRef.current) {
      lastMessageContentRef.current = currentContent;
      setScrollTrigger((prev) => prev + 1);
    }
  }, [messages.length]);

  useEffect(() => {
    if (!open || !sending) return;
    const interval = setInterval(() => {
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const currentContent = lastMessage?.content || "";
      if (currentContent !== lastMessageContentRef.current) {
        lastMessageContentRef.current = currentContent;
        setScrollTrigger((prev) => prev + 1);
      }
    }, 120);
    return () => clearInterval(interval);
  }, [open, sending, messages.length]);

  useEffect(() => {
    if (!open || !messagesEndRef.current) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [messages.length, sending, open, scrollTrigger]);

  async function gatherContext(): Promise<string> {
    try {
      const el = document.querySelector(".lesson-content");
      const text = el ? (el as HTMLElement).innerText : document.body.innerText;
      return String(text || "").slice(0, 12000);
    } catch {
      return "";
    }
  }

  async function sendInitial() {
    try {
      setSending(true);
      const context = await gatherContext();
      // Placeholder for streaming assistant intro
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const idx = messages.length; // index of the assistant message we just pushed
      const res = await fetch("/api/lars/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          messages: [],
          path: typeof window !== "undefined" ? window.location.pathname : ""
        })
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          chunk.split("\n").forEach((line) => {
            if (!line.startsWith("data: ")) return;
            const payload = line.slice(6);
            if (!payload) return;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === "text") {
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: "assistant", content: (copy[idx]?.content || "") + obj.content } as any;
                  return copy;
                });
              }
            } catch {}
          });
        }
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry—couldn't start. Try again." }]);
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      setSending(true);
      const context = await gatherContext();
      // placeholder for streaming assistant follow-up
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const idx = messages.length + 1;
      const res = await fetch("/api/lars/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          messages: [...messages, { role: "user", content: text }],
          path: typeof window !== "undefined" ? window.location.pathname : ""
        })
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          chunk.split("\n").forEach((line) => {
            if (!line.startsWith("data: ")) return;
            const payload = line.slice(6);
            if (!payload) return;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === "text") {
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: "assistant", content: (copy[idx]?.content || "") + obj.content } as any;
                  return copy;
                });
              }
            } catch {}
          });
        }
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: "Error sending message." }]);
    } finally {
      setSending(false);
    }
  }

  async function askNewQuestion() {
    if (sending) return;
    // Send a message asking Lars to switch topics
    const switchMessage = "Can you ask me about something else from this lesson?";
    const updatedMessages = [...messages, { role: "user" as const, content: switchMessage }];
    setMessages(updatedMessages);
    try {
      setSending(true);
      const context = await gatherContext();
      // placeholder for streaming assistant response
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const idx = updatedMessages.length; // index of the assistant message we just pushed
      const res = await fetch("/api/lars/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          context,
          messages: updatedMessages,
          path: typeof window !== "undefined" ? window.location.pathname : ""
        })
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          chunk.split("\n").forEach((line) => {
            if (!line.startsWith("data: ")) return;
            const payload = line.slice(6);
            if (!payload) return;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === "text") {
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: "assistant", content: (copy[idx]?.content || "") + obj.content } as any;
                  return copy;
                });
              }
            } catch {}
          });
        }
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: "Error asking new question." }]);
    } finally {
      setSending(false);
    }
  }

  const appendTranscriptionText = (text: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    setInput((prev) => {
      if (!prev) return trimmed;
      const needsSpace = /\s$/.test(prev) ? '' : ' ';
      return `${prev}${needsSpace}${trimmed}`;
    });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const cleanupMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopActiveRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupMediaStream();
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    setVoiceError(null);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice-input.webm');
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Failed to transcribe audio.');
      }
      appendTranscriptionText(String(json.text || '').trim());
    } catch (err: any) {
      setVoiceError(err?.message || 'Voice transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleToggleRecording = async () => {
    if (isTranscribing) return;
    if (isRecording) {
      setIsRecording(false);
      stopActiveRecording();
      return;
    }
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setVoiceError('Voice recording is not available in this environment.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setVoiceError('Microphone recording is not supported in this browser yet.');
      return;
    }
    try {
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        cleanupMediaStream();
        setIsRecording(false);
        const chunks = audioChunksRef.current.splice(0);
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await transcribeAudio(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Microphone access failed', err);
      cleanupMediaStream();
      setIsRecording(false);
      setVoiceError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Unable to access the microphone.'
      );
    }
  };

  useEffect(() => {
    return () => {
      stopActiveRecording();
      cleanupMediaStream();
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      style={{ pointerEvents: "auto" }}
    >
      {/* Modal */}
      <div
        className="relative w-full max-w-3xl max-h-[90vh] rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md shadow-2xl flex flex-col"
        style={{
          height: typeof window !== "undefined" && window.innerHeight < 720 ? "85vh" : "80vh"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--foreground)]/10">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full synapse-style" />
            <div className="text-sm font-semibold text-[var(--foreground)]">Lars</div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="text-xs text-[var(--foreground)]/60 text-center py-4">
              Lars will ask you a quick question about this lesson to get you explaining.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {m.role === "user" ? (
                <div 
                  className="chat-bubble-user max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/10"
                >
                  <div className="text-sm text-[var(--foreground)]/90 leading-relaxed">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div 
                  className="chat-bubble-assistant max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/10"
                >
                  <div className="text-sm text-[var(--foreground)]/90 leading-relaxed">
                    <LessonBody body={sanitizeLessonBody(String(m.content || ""))} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-[var(--foreground)]/10">
          <div 
            className="chat-input-container flex items-center gap-2 px-4 py-2 border border-[var(--foreground)]/10 overflow-hidden"
            style={{ 
              boxShadow: 'none',
              borderRadius: '1.5rem',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize textarea
                if (inputRef.current) {
                  inputRef.current.style.height = 'auto';
                  inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Explain it to Lars…"
              disabled={sending}
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/60 focus:outline-none resize-none overflow-hidden"
              style={{ 
                boxShadow: 'none', 
                padding: '0.25rem 0.5rem', 
                minHeight: '1.5rem', 
                maxHeight: '120px', 
                lineHeight: '1.5rem', 
                borderRadius: '0', 
                backgroundColor: 'transparent' 
              }}
              rows={1}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleRecording}
                disabled={sending || isTranscribing}
                aria-pressed={isRecording}
                title={isRecording ? "Stop recording" : "Record voice message"}
                className={`unified-button transition-colors flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--foreground)]/10 ${
                  isRecording
                    ? 'text-[#FFB347] border-[#FFB347]/60'
                    : ''
                } disabled:opacity-50`}
                style={{ boxShadow: 'none' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15c1.66 0 3-1.34 3-3V7a3 3 0 0 0-6 0v5c0 1.66 1.34 3 3 3z" />
                  <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
                  <path d="M12 19v3" />
                </svg>
              </button>
              <button
                onClick={askNewQuestion}
                disabled={sending}
                className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full"
                style={{ boxShadow: 'none' }}
                title="Ask about something else"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border"
                style={{ boxShadow: 'none' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
          {(voiceError || isRecording || isTranscribing) && (
            <p className={`mt-2 text-[11px] ${voiceError ? 'text-[#FF8A8A]' : 'text-[var(--foreground)]/60'}`}>
              {voiceError
                ? voiceError
                : isRecording
                  ? 'Recording… tap the mic to stop.'
                  : 'Transcribing voice...'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
