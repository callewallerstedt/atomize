"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export default function LarsCoach({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [sending, setSending] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 520, h: 500 });
  const [resizing, setResizing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageContentRef = useRef<string>("");
  const [scrollTrigger, setScrollTrigger] = useState(0);

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

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing || !start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setSize({ w: Math.max(420, start.w + dx), h: Math.max(320, start.h + dy) });
    }
    function onUp() {
      setResizing(false);
      setStart(null);
    }
    if (resizing) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, start]);

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000]"
      onClick={onClose}
      style={{ pointerEvents: "auto" }}
    >
      {/* Window */}
      <div
        className="fixed z-[1001] rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 bg-gradient-to-br from-[#00E5FF]/20 to-[#FF2D96]/20 backdrop-blur-md shadow-2xl p-3 flex flex-col"
        style={{
          left: "50%",
          top: "12px",
          transform: "translateX(-50%)",
          width: typeof window !== "undefined" && window.innerWidth < 640 ? "calc(100vw - 16px)" : size.w,
          height: typeof window !== "undefined" && window.innerHeight < 720 ? "75vh" : size.h
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]" />
            <div className="text-sm font-semibold">Lars</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {messages.length === 0 && (
            <div className="text-xs text-[var(--foreground)]/60">Lars will ask you a quick question about this lesson to get you explaining.</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className="max-w-[80%]">
                <div className="text-[10px] text-[var(--foreground)]/60 mb-1 ml-1">{m.role === "user" ? "You" : "Lars"}</div>
                <div className={m.role === "user" ? "rounded-xl bg-[var(--accent-cyan)]/20 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--accent-cyan)]/30" : "rounded-xl bg-[var(--background)]/80 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--foreground)]/10"}>
                  {m.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="mt-2 flex items-center gap-2 flex-shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
            placeholder="Explain it to Lars…"
            className="flex-1 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
          />
          <button
            onClick={askNewQuestion}
            disabled={sending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] hover:bg-[var(--background)]/90 disabled:opacity-60 transition-colors"
            title="Ask about something else"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
          <button
            onClick={sendMessage}
            disabled={sending}
            className="inline-flex h-9 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 text-sm font-medium !text-white hover:opacity-95 disabled:opacity-60 disabled:!text-white"
            style={{ color: "white" }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}


