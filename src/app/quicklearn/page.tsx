"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadSubjectData, StoredSubjectData, saveSubjectDataAsync } from "@/utils/storage";
import Link from "next/link";
import GlowSpinner from "@/components/GlowSpinner";

export default function QuickLearnPage() {
  const router = useRouter();
  const [quickLearnData, setQuickLearnData] = useState<StoredSubjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickLearnQuery, setQuickLearnQuery] = useState("");
  const [quickLearnLoading, setQuickLearnLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      // Load from local storage first
      let data = loadSubjectData("quicklearn");
      
      // If authenticated, try to load from server
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        const meJson = await meRes.json().catch(() => ({}));
        if (meJson?.user) {
          const dataRes = await fetch(`/api/subject-data?slug=quicklearn`, { credentials: "include" });
          const dataJson = await dataRes.json().catch(() => ({}));
          if (dataRes.ok && dataJson?.data) {
            data = dataJson.data;
            // Update local storage
            localStorage.setItem("atomicSubjectData:quicklearn", JSON.stringify(data));
          }
        }
      } catch {}
      
      setQuickLearnData(data);
      setLoading(false);
    }
    
    loadData();
  }, []);

  async function handleGenerate() {
    const trimmedQuery = quickLearnQuery?.trim();
    if (!trimmedQuery || quickLearnLoading) return;
    try {
      setQuickLearnLoading(true);
      
      // Load/create quicklearn subject
      const quickLearnSlug = 'quicklearn';
      let data = loadSubjectData(quickLearnSlug) as StoredSubjectData | null;
      if (!data) {
        data = {
          subject: 'Quick Learn',
          course_context: '',
          combinedText: '',
          topics: [],
          nodes: {},
          files: [],
          progress: {},
        };
      }
      if (!data.nodes) data.nodes = {} as any;

      const lessonTitle: string = trimmedQuery;
      
      // Use the same streaming endpoint as Surge and normal lessons
      // For Quick Learn, only topic is required - endpoint handles the rest
      const streamRes = await fetch('/api/node-lesson/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Quick Learn',
          topic: trimmedQuery,
        })
      });
      
      if (!streamRes.ok) {
        const errorJson = await streamRes.json().catch(() => ({}));
        throw new Error(errorJson?.error || `Server error (${streamRes.status})`);
      }

      const reader = streamRes.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = "";

      // Stream the lesson body
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
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            } else if (parsed.type === "done") {
              // Streaming complete
            }
          } catch (err) {
            if (!(err instanceof SyntaxError)) {
              throw err;
            }
          }
        }
      }

      if (!accumulated.trim()) {
        throw new Error("Lesson generation returned empty content");
      }

      // Generate quiz questions separately using the original endpoint
      let quiz: any[] = [];
      try {
        const quizRes = await fetch('/api/quick-learn-general', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmedQuery })
        });
        const quizJson = await quizRes.json().catch(() => ({}));
        if (quizRes.ok && quizJson?.ok && Array.isArray(quizJson.data?.quiz)) {
          quiz = quizJson.data.quiz.map((q: any) => ({
            question: String(q.question || ""),
            answer: q.answer ? String(q.answer) : undefined,
          }));
        }
      } catch (quizErr) {
        console.warn("Failed to generate quiz, continuing without quiz:", quizErr);
      }

      // Save the lesson
      data.nodes[lessonTitle] = {
        overview: `Quick lesson on: ${trimmedQuery}`,
        symbols: [],
        lessonsMeta: [{ type: 'Quick Learn', title: lessonTitle }],
        lessons: [{
          title: lessonTitle,
          body: accumulated,
          quiz: quiz,
          metadata: null
        }],
        rawLessonJson: [JSON.stringify({ title: lessonTitle, body: accumulated, quiz })],
      } as any;

      await saveSubjectDataAsync(quickLearnSlug, data);

      // Navigate to the new lesson
      setQuickLearnQuery("");
      router.push(`/subjects/${quickLearnSlug}/node/${encodeURIComponent(lessonTitle)}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to generate quick learn lesson');
    } finally {
      setQuickLearnLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-[var(--foreground)]">
          <GlowSpinner size={120} ariaLabel="Loading quick learn" idSuffix="quicklearn-initial" />
          <div className="text-sm text-[var(--foreground)]/70">Loading quick learn…</div>
        </div>
      </div>
    );
  }

  const nodes = quickLearnData?.nodes || {};
  const nodeEntries = Object.entries(nodes);

  return (
    <div className="min-h-screen bg-[var(--background)] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Quick Learn</h1>
          <p className="text-[var(--foreground)]/70 mt-2">Generate and review stand-alone lessons without course context.</p>
        </div>

        {/* Generator card (like course UI but without context/extract) */}
        <div className="relative rounded-2xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-5 text-[var(--foreground)] shadow-[0_2px_8px_rgba(0,0,0,0.7)] mb-6 overflow-hidden">
          {quickLearnLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[var(--background)]/95 backdrop-blur-md">
              <GlowSpinner size={120} ariaLabel="Generating quick lesson" idSuffix="quicklearn-card" />
              <div className="text-sm font-medium text-[var(--foreground)]/80">Generating lesson…</div>
            </div>
          )}
          <div className="mb-3 text-sm font-medium">Create a quick lesson</div>
          <div className="flex gap-3">
            <input
              type="text"
              value={quickLearnQuery}
              onChange={(e) => setQuickLearnQuery((e.target as HTMLInputElement).value)}
              placeholder="Enter a topic to learn..."
              className="flex-1 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:outline-none focus:ring-0 focus:border-[var(--foreground)]/40"
            />
            <button
              onClick={handleGenerate}
              disabled={!quickLearnQuery.trim() || quickLearnLoading}
              className="relative inline-flex items-center justify-center rounded-full synapse-style px-4 py-2 !text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            >
              {quickLearnLoading ? 'Generating…' : 'Generate Lesson'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {nodeEntries.length === 0 && (
            <div className="text-[var(--foreground)]/60 text-sm">No quick learn lessons yet. Generate your first one above.</div>
          )}
          {nodeEntries.map(([nodeName, nodeContent]) => {
            const content = typeof nodeContent === "string" ? null : nodeContent;
            if (!content || !content.lessons || content.lessons.length === 0) return null;

            const firstLesson = content.lessons[0];
            if (!firstLesson) return null;

            return (
              <Link
                key={nodeName}
                href={`/subjects/quicklearn/node/${encodeURIComponent(nodeName)}`}
                className="block rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-4 hover:bg-[var(--background)]/80 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
                      {firstLesson.title || nodeName}
                    </h3>
                    {content.overview && (
                      <p className="text-sm text-[var(--foreground)]/70 line-clamp-2">{content.overview}</p>
                    )}
                    {firstLesson.quiz && firstLesson.quiz.length > 0 && (
                      <p className="text-xs text-[var(--foreground)]/60 mt-2">
                        {firstLesson.quiz.length} {firstLesson.quiz.length === 1 ? "question" : "questions"}
                      </p>
                    )}
                  </div>
                  <svg
                    className="h-5 w-5 text-[var(--foreground)]/40 ml-4 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
