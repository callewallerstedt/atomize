"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [preparingSlug, setPreparingSlug] = useState<string | null>(null);
  const [quickLearnOpen, setQuickLearnOpen] = useState(false);
  const [quickLearnQuery, setQuickLearnQuery] = useState("");
  const [quickLearnLoading, setQuickLearnLoading] = useState(false);
  const [filesModalOpen, setFilesModalOpen] = useState<string | null>(null);
  const [isIOSStandalone, setIsIOSStandalone] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    setIsIOSStandalone(isIOS && isStandalone);
  }, []);
  const searchParams = useSearchParams();
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    setSubjects(readSubjects());
  }, []);

  useEffect(() => {
    if (searchParams.get("quickLesson") === "1") {
      setQuickLearnQuery("");
      setQuickLearnOpen(true);
    }
  }, [searchParams]);

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
        subject: "Quick Lesson",
        course_context: "",
        combinedText: "",
        topics: [],
        nodes: {
          [quickLearnQuery]: {
            overview: `Quick lesson on: ${quickLearnQuery}`,
            symbols: [],
            lessonsMeta: [{ type: "Quick Lesson", title: quickLearnQuery }],
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
      router.replace('/');
      router.push(`/subjects/${tempSubjectSlug}/node/${encodeURIComponent(quickLearnQuery)}`);
    } catch (err: any) {
      alert(err?.message || "Failed to generate quick learn lesson");
    } finally {
      setQuickLearnLoading(false);
    }
  }

  const renameSubject = (slug: string, newName: string) => {
    if (!newName.trim()) return;
    const list = readSubjects();
    const updated = list.map((s) => (s.slug === slug ? { ...s, name: newName } : s));
    localStorage.setItem("atomicSubjects", JSON.stringify(updated));
    setSubjects(updated);

    const data = loadSubjectData(slug) as StoredSubjectData | null;
    if (data) {
      data.subject = newName;
      saveSubjectData(slug, data);
    }
  };

  const createCourse = async (name: string, syllabus: string, files: File[]) => {
    let effectiveName = name;
    let contextSource: string | null = null;
    try {
      const slugBase = effectiveName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "subject";
      const list = readSubjects();
      let unique = slugBase; let n = 1; const set = new Set(list.map((s) => s.slug));
      while (set.has(unique)) { n++; unique = `${slugBase}-${n}`; }

      const next = [...list, { name: effectiveName, slug: unique }];
      localStorage.setItem("atomicSubjects", JSON.stringify(next));
      setSubjects(next);
      setPreparingSlug(unique);

      const storedFiles = files.map((f) => ({ name: f.name, type: f.type }));

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

      const initData: StoredSubjectData = { subject: effectiveName, files: storedFiles, combinedText, tree: null, topics: [], nodes: {}, progress: {}, course_context: syllabus };
      saveSubjectData(unique, initData);

      let documents: Array<{ name: string; text: string }> = [];
      try {
        const uploadForm = new FormData();
        files.forEach((f) => uploadForm.append('files', f));
        const upRes = await fetch('/api/upload-course-files', { method: 'POST', body: uploadForm });
        const upJson = await upRes.json().catch(() => ({}));
        if (upRes.ok && upJson?.ok && Array.isArray(upJson.docs)) {
          documents = upJson.docs;
        }
      } catch {}

      try {
        const summaryRes = await fetch('/api/course-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: effectiveName,
            syllabus,
            text: combinedText,
            documents,
          }),
        });
        if (summaryRes.ok) {
          const json = await summaryRes.json().catch(() => ({}));
          if (json?.ok && json.course_context) {
            const data = loadSubjectData(unique) as StoredSubjectData | null;
            if (data) {
              data.course_context = json.course_context;
              saveSubjectData(unique, data);
            }
            contextSource = json.course_context;
          }
        }
      } catch {}

      if (!contextSource) {
        const latestData = loadSubjectData(unique) as StoredSubjectData | null;
        contextSource = latestData?.course_context || combinedText;
      }

      try {
        if (contextSource) {
          const renameRes = await fetch('/api/course-detect-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: contextSource, fallbackTitle: effectiveName }),
          });
          if (renameRes.ok) {
            const renameJson = await renameRes.json().catch(() => ({}));
            if (renameJson?.ok && renameJson.name && renameJson.name !== effectiveName) {
              effectiveName = renameJson.name;
              renameSubject(unique, effectiveName);
            }
          }
        }
      } catch {}

      // Remove preparing only after naming step is complete
      setPreparingSlug(null);

      // Kick off quick summary in the background (non-blocking)
      (async () => {
        try {
          const data = loadSubjectData(unique) as StoredSubjectData | null;
          const quickContext = data?.course_context || contextSource || combinedText;
          if (!quickContext) return;
          const quickRes = await fetch('/api/course-quick-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: quickContext }),
          });
          if (!quickRes.ok) return;
          const quickJson = await quickRes.json().catch(() => ({}));
          if (quickJson?.ok && quickJson.summary) {
            const updated = loadSubjectData(unique) as StoredSubjectData | null;
            if (updated) {
              updated.course_quick_summary = quickJson.summary;
              saveSubjectData(unique, updated);
            }
          }
        } catch {}
      })();
    } catch (error) {
      setPreparingSlug(null);
      throw error;
    }
  };

  const createCourseFromFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setIsDragging(false);
    try {
      // Create with a neutral placeholder; final name will be set after AI summary
      await createCourse('New Course', "", files);
    } catch (err) {
      console.error('Failed to auto-create course', err);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Your subjects</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreateOpen(true)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-white bg-[var(--background)]/90 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.7)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)] hover:bg-[var(--background)]/95 transition-all duration-200 ease-out"
            aria-label="Add course"
          >
            <span className="text-lg leading-none">+</span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((s) => (
          <div
            key={s.slug}
            className={`relative rounded-2xl bg-[var(--background)] p-6 text-[var(--foreground)] transition-all duration-200 min-h-[80px] shadow-[0_2px_8px_rgba(0,0,0,0.7)] ${
              preparingSlug === s.slug
                ? 'cursor-not-allowed opacity-75'
                : 'cursor-pointer hover:bg-gradient-to-r hover:from-[var(--accent-cyan)]/5 hover:to-[var(--accent-pink)]/5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)]'
            }`}
            role="link"
            tabIndex={preparingSlug === s.slug ? -1 : 0}
            onClick={preparingSlug === s.slug ? undefined : () => router.push(`/subjects/${s.slug}`)}
            onKeyDown={preparingSlug === s.slug ? undefined : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(`/subjects/${s.slug}`);
              }
            }}
          >
            <div className="flex items-center justify-between gap-3 h-full">
              <span className="text-lg font-semibold flex-1 break-words whitespace-normal leading-snug">{s.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpenFor((cur) => (cur === s.slug ? null : s.slug)); }}
                disabled={preparingSlug === s.slug}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent-cyan)]/20 text-[var(--foreground)]/60 ${
                  preparingSlug === s.slug
                    ? 'bg-[var(--background)]/50 opacity-50 cursor-not-allowed'
                    : 'bg-[var(--background)]/80 hover:bg-[var(--background)] cursor-pointer'
                }`}
                aria-label="More actions"
                title="More actions"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="5" cy="12" r="2" fill="currentColor"/>
                  <circle cx="12" cy="12" r="2" fill="currentColor"/>
                  <circle cx="19" cy="12" r="2" fill="currentColor"/>
                </svg>
              </button>
            </div>
            
            {preparingSlug === s.slug && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm rounded-2xl z-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/95 px-3 py-1 text-[12px] text-[var(--foreground)] shadow-lg">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" /> Preparing…
                </div>
              </div>
            )}
            {menuOpenFor === s.slug && (
              <div className="absolute right-3 top-12 z-50 w-40 rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)] p-1">
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
                    setMenuOpenFor(null);
                    setFilesModalOpen(s.slug);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#E5E7EB] hover:bg-[#121821]"
                >
                  View Files
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
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer?.files || []);
            createCourseFromFiles(files);
          }}
          className={`relative rounded-2xl border border-dashed border-[var(--accent-cyan)]/30 bg-[var(--background)]/60 p-6 text-center text-sm transition-all duration-200 min-h-[80px] flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 shadow-[0_4px_12px_rgba(0,0,0,0.8)]'
              : 'hover:border-[var(--accent-cyan)]/50 hover:bg-[var(--background)]/70'
          }`}
        >
          <span className="text-[var(--foreground)]/70">Drop files here to auto-create a course</span>
          <span className="text-xs text-[var(--foreground)]/50">We’ll scan the files and name it for you</span>
        </div>
        {subjects.length === 0 && null}
      </div>
      <CourseCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, syllabus, files) => {
          (async () => {
            setCreateOpen(false);
            await createCourse(name, syllabus, files);
          })();
        }}
      />

      {/* Quick Lesson Modal */}
      {quickLearnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={isIOSStandalone ? "w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-6" : "w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md p-6"}>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Quick Lesson</h3>
            <div className="mb-4">
              <label className="mb-2 block text-xs text-[var(--foreground)]/70">What do you want to learn?</label>
              <textarea
                value={quickLearnQuery}
                onChange={(e) => { if (!e.target) return; setQuickLearnQuery(e.target.value); }}
                onTouchStart={(e) => {
                  // Ensure focus works on iOS PWA
                  e.currentTarget.focus();
                }}
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
                placeholder="e.g. How does machine learning work? Or paste a question from your textbook..."
                rows={4}
                tabIndex={0}
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  WebkitUserSelect: 'text',
                  WebkitTouchCallout: 'none',
                  WebkitAppearance: 'none',
                  WebkitTouchAction: 'manipulation',
                  touchAction: 'manipulation'
                }}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setQuickLearnOpen(false); router.replace('/'); }}
                className="rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/60"
                disabled={quickLearnLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleQuickLearn}
                disabled={!quickLearnQuery.trim() || quickLearnLoading}
                className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
                style={{ color: 'white' }}
              >
                {quickLearnLoading ? "Generating..." : "Generate Lesson"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Files Modal */}
      {filesModalOpen && (() => {
        const slug = filesModalOpen;
        const data = loadSubjectData(slug) as StoredSubjectData | null;
        const files = data?.files || [];
        const fileInputRef = useRef<HTMLInputElement>(null);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setFilesModalOpen(null)}>
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/95 backdrop-blur-sm p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Course Files</h3>
                <button
                  onClick={() => setFilesModalOpen(null)}
                  className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 space-y-2">
                {files.length === 0 ? (
                  <div className="text-sm text-[var(--foreground)]/70 py-6 text-center">
                    No files added yet. Click "Add Files" below to upload course materials.
                  </div>
                ) : (
                  files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20 px-4 py-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <svg className="flex-shrink-0 w-5 h-5 text-[var(--accent-cyan)]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--foreground)] truncate">{file.name}</div>
                          <div className="text-xs text-[var(--foreground)]/70">{file.type || 'Unknown type'}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (!window.confirm(`Remove "${file.name}" from this subject?`)) return;
                          const updatedFiles = files.filter((_, i) => i !== idx);
                          if (data) {
                            data.files = updatedFiles;
                            saveSubjectData(slug, data);
                            setFilesModalOpen(null);
                            setTimeout(() => setFilesModalOpen(slug), 10);
                          }
                        }}
                        className="ml-3 text-[#FF2D96] hover:text-[#FF2D96]/80 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--accent-cyan)]/20">
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = async (e) => {
                      const target = e.target as HTMLInputElement;
                      const newFiles = Array.from(target.files || []);
                      if (newFiles.length === 0) return;

                      // Add new files to the subject data
                      const storedFiles = newFiles.map((f) => ({ name: f.name, type: f.type }));
                      if (data) {
                        data.files = [...files, ...storedFiles];
                        saveSubjectData(slug, data);
                        setFilesModalOpen(null);
                        setTimeout(() => setFilesModalOpen(slug), 10);
                      }
                    };
                    input.click();
                  }}
                  className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95"
                >
                  Add Files
                </button>
                <button
                  onClick={() => setFilesModalOpen(null)}
                  className="rounded-lg border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
