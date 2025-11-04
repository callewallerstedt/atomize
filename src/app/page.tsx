"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CourseCreateModal from "@/components/CourseCreateModal";
import { saveSubjectData, StoredSubjectData, loadSubjectData } from "@/utils/storage";

type Subject = { name: string; slug: string };

function readSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("atomicSubjects");
    return raw ? (JSON.parse(raw) as Subject[]) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [preparingSlug, setPreparingSlug] = useState<string | null>(null);
  const [quickLearnOpen, setQuickLearnOpen] = useState(false);
  const [quickLearnQuery, setQuickLearnQuery] = useState("");
  const [quickLearnLoading, setQuickLearnLoading] = useState(false);
  useEffect(() => {
    setSubjects(readSubjects());
  }, []);

  async function handleQuickLearn() {
    try {
      setQuickLearnLoading(true);

      const res = await fetch('/api/quick-learn-general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: quickLearnQuery,
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);

      // Create a temporary subject for the quick learn lesson
      const tempSubjectSlug = `quick-learn-${Date.now()}`;
      const tempSubjectData: StoredSubjectData = {
        subject: "Quick Learn",
        course_context: "",
        combinedText: "",
        topics: [],
        nodes: {
          [quickLearnQuery]: {
            overview: `Quick lesson on: ${quickLearnQuery}`,
            symbols: [],
            lessonsMeta: [{ type: "Quick Learn", title: quickLearnQuery }],
            lessons: [{
              title: quickLearnQuery,
              body: json.data.body,
              quiz: json.data.quiz || []
            }],
            rawLessonJson: [json.raw || JSON.stringify(json.data)]
          }
        },
        files: [],
        progress: {},
      };

      saveSubjectData(tempSubjectSlug, tempSubjectData);

      // Close modal and navigate to the lesson
      setQuickLearnOpen(false);
      router.push(`/subjects/${tempSubjectSlug}/node/${encodeURIComponent(quickLearnQuery)}`);
    } catch (err: any) {
      alert(err?.message || "Failed to generate quick learn lesson");
    } finally {
      setQuickLearnLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0F1216] px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Your subjects</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/exam-snipe')}
            className="inline-flex h-10 items-center rounded-full border border-[#FF2D96] bg-[#FF2D96]/10 px-4 text-sm font-medium text-[#FF2D96] hover:bg-[#FF2D96]/20 transition-colors"
          >
            🎯 Exam Snipe
          </button>
          <button
            onClick={() => router.push('/readassist')}
            className="inline-flex h-10 items-center rounded-full border border-[#00E5FF] bg-[#00E5FF]/10 px-4 text-sm font-medium text-[#00E5FF] hover:bg-[#00E5FF]/20 transition-colors"
          >
            📄 ReadAssist
          </button>
          <button
            onClick={() => { setQuickLearnQuery(""); setQuickLearnOpen(true); }}
            className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 text-sm font-medium text-white hover:opacity-95"
          >
            Quick Learn
          </button>
          <button onClick={() => setCreateOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white hover:opacity-95" aria-label="Add course">+</button>
        </div>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((s) => (
          <div
            key={s.slug}
            className="relative cursor-pointer rounded-2xl border border-[#222731] bg-[#0B0E12] p-5 text-white hover:bg-gradient-to-r hover:from-[#00E5FF]/10 hover:to-[#FF2D96]/10 transition-colors"
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/subjects/${s.slug}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(`/subjects/${s.slug}`);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-base font-semibold">{s.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpenFor((cur) => (cur === s.slug ? null : s.slug)); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#222731] bg-[#121721] text-[#A7AFBE] hover:bg-[#1B2030]"
                aria-label="More actions"
                title="More actions"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="5" cy="12" r="2" fill="#A7AFBE"/>
                  <circle cx="12" cy="12" r="2" fill="#A7AFBE"/>
                  <circle cx="19" cy="12" r="2" fill="#A7AFBE"/>
                </svg>
              </button>
            </div>
            
            {preparingSlug === s.slug && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#2B3140] bg-[#0F141D]/90 px-3 py-1 text-[12px] text-white shadow-lg">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> Preparing…
                </div>
              </div>
            )}
            {menuOpenFor === s.slug && (
              <div className="absolute right-3 top-12 z-50 w-40 rounded-xl border border-[#222731] bg-[#0B0E12] p-1 shadow-xl">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenFor(null);
                    const name = window.prompt("Rename course", s.name) || s.name;
                    const next = subjects.map((t) => (t.slug === s.slug ? { ...t, name } : t));
                    localStorage.setItem("atomicSubjects", JSON.stringify(next));
                    setSubjects(next);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#E5E7EB] hover:bg-[#121821]"
                >
                  Rename
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const ok = window.confirm("Delete this subject and all saved data?");
                    if (!ok) return;
                    const next = subjects.filter((t) => t.slug !== s.slug);
                    localStorage.setItem("atomicSubjects", JSON.stringify(next));
                    try { localStorage.removeItem("atomicSubjectData:" + s.slug); } catch {}
                    setSubjects(next);
                    setMenuOpenFor(null);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#FFC0DA] hover:bg-[#20141A]"
                >
                  Delete
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    try {
                      const raw = localStorage.getItem("atomicSubjectData:" + s.slug);
                      const blob = new Blob([raw || "{}"], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${s.slug}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {}
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#E5E7EB] hover:bg-[#121821]"
                >
                  Export
                </button>
              </div>
            )}
          </div>
        ))}
        {subjects.length === 0 && (
          <div className="col-span-full rounded-2xl border border-[#222731] bg-[#0B0E12] p-6 text-center text-sm text-[#A7AFBE]">
            No subjects yet. Click “+ New subject” to create one.
          </div>
        )}
      </div>
      <CourseCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, syllabus, files) => {
          (async () => {
            setCreateOpen(false);
            try {
              const slugBase = name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "subject";
              const list = readSubjects();
              let unique = slugBase; let n = 1; const set = new Set(list.map((s) => s.slug));
              while (set.has(unique)) { n++; unique = `${slugBase}-${n}`; }
              const next = [...list, { name, slug: unique }];
              localStorage.setItem("atomicSubjects", JSON.stringify(next));
              setSubjects(next);
              setPreparingSlug(unique);

              // Save only file names and types (avoid large base64 in localStorage)
              const storedFiles = files.map((f) => ({ name: f.name, type: f.type }));

              // Gather light text from text-like files for summary/context
              const textParts: string[] = [];
              for (const f of files) {
                const lower = f.name.toLowerCase();
                if (f.type.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
                  try {
                    const t = await f.text();
                    if (t) textParts.push(`--- ${f.name} ---\n${t}`);
                  } catch {}
                }
              }
              const combinedText = textParts.join("\n\n");

              const initData: StoredSubjectData = { subject: name, files: storedFiles, combinedText, tree: null, topics: [], nodes: {}, progress: {}, course_context: syllabus };
              saveSubjectData(unique, initData);

              // Upload original files to OpenAI and store file IDs for later use
              let fileIds: string[] = [];
              try {
                const uploadForm = new FormData();
                files.forEach((f) => uploadForm.append('files', f));
                const upRes = await fetch('/api/upload-course-files', { method: 'POST', body: uploadForm });
                const upJson = await upRes.json().catch(() => ({}));
                if (upRes.ok && upJson?.ok && Array.isArray(upJson.fileIds)) {
                  fileIds = upJson.fileIds;
                  const data = loadSubjectData(unique) as StoredSubjectData | null;
                  if (data) {
                    data.course_file_ids = fileIds;
                    saveSubjectData(unique, data);
                  }
                }
              } catch {}

              // Generate comprehensive course summary using uploaded files
              const res = await fetch('/api/course-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  subject: name,
                  syllabus,
                  text: combinedText,
                  fileIds: fileIds // Pass file IDs so AI can analyze actual course materials
                })
              });
              if (res.ok) {
                const json = await res.json().catch(() => ({}));
                if (json?.ok && json.course_context) {
                  const data = loadSubjectData(unique) as StoredSubjectData | null;
                  if (data) {
                    data.course_context = json.course_context;
                    saveSubjectData(unique, data);
                  }
                }
              }

              setPreparingSlug(null);
              // Removed auto-navigation - user can click on the course card manually
            } finally {
              setPreparingSlug(null);
            }
          })();
        }}
      />

      {/* Quick Learn Modal */}
      {quickLearnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#222731] bg-[#0B0E12] p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Learn</h3>
            <div className="mb-4">
              <label className="mb-2 block text-xs text-[#A7AFBE]">What do you want to learn?</label>
              <textarea
                value={quickLearnQuery}
                onChange={(e) => { if (!e.target) return; setQuickLearnQuery(e.target.value); }}
                className="w-full rounded-xl border border-[#222731] bg-[#0F141D] px-3 py-2 text-sm text-[#E5E7EB] placeholder:text-[#6B7280] focus:outline-none resize-none"
                placeholder="e.g. How does machine learning work? Or paste a question from your textbook..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setQuickLearnOpen(false)}
                className="rounded-lg border border-[#222731] bg-[#0F141D] px-4 py-2 text-sm text-[#E5E7EB] hover:bg-[#1B2030]"
                disabled={quickLearnLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleQuickLearn}
                disabled={!quickLearnQuery.trim() || quickLearnLoading}
                className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
              >
                {quickLearnLoading ? "Generating..." : "Generate Lesson"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
