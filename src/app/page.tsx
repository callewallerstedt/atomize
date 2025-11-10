"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GlowSpinner from "@/components/GlowSpinner";
import CourseCreateModal from "@/components/CourseCreateModal";
import LoginPage from "@/components/LoginPage";
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
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Check authentication and sync subjects from server
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then(async (data) => {
        const authenticated = !!data?.user;
        setIsAuthenticated(authenticated);
        setCheckingAuth(false);
        
        // If authenticated, load subjects from server
        if (authenticated) {
          try {
            const subjectsRes = await fetch("/api/subjects", { credentials: "include" });
            const subjectsJson = await subjectsRes.json().catch(() => ({}));
              if (subjectsRes.ok && Array.isArray(subjectsJson?.subjects)) {
              // Filter out quicklearn from homepage
              const filteredSubjects = subjectsJson.subjects.filter((s: Subject) => s.slug !== "quicklearn");
              // Update localStorage with server subjects
              localStorage.setItem("atomicSubjects", JSON.stringify(subjectsJson.subjects));
              setSubjects(filteredSubjects);
              
              // Also sync subject data from server
              for (const subject of subjectsJson.subjects) {
                try {
                  const dataRes = await fetch(`/api/subject-data?slug=${encodeURIComponent(subject.slug)}`, { credentials: "include" });
                  const dataJson = await dataRes.json().catch(() => ({}));
                  if (dataRes.ok && dataJson?.data) {
                    localStorage.setItem(`atomicSubjectData:${subject.slug}`, JSON.stringify(dataJson.data));
                  }
                } catch {}
              }
            }
          } catch {}
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        setCheckingAuth(false);
      });
  }, []);

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
    const allSubjects = readSubjects();
    // Filter out quicklearn from homepage
    const filteredSubjects = allSubjects.filter((s) => s.slug !== "quicklearn");
    setSubjects(filteredSubjects);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpenFor) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-menu-dropdown]') && !target.closest('[data-menu-button]')) {
        setMenuOpenFor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenFor]);

  useEffect(() => {
    if (searchParams.get("quickLesson") === "1") {
      setQuickLearnQuery("");
      setQuickLearnOpen(true);
    }
  }, [searchParams]);

  // Show login page if not authenticated
  // Don't show spinner while checking auth - let Shell's LoadingScreen handle it
  if (checkingAuth) {
    return null; // Return null to let Shell render and show LoadingScreen
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

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

      // Load or create the quicklearn subject
      const quickLearnSlug = "quicklearn";
      let quickLearnData = loadSubjectData(quickLearnSlug) as StoredSubjectData | null;
      
      if (!quickLearnData) {
        quickLearnData = {
          subject: "Quick Learn",
        course_context: "",
        combinedText: "",
        topics: [],
          nodes: {},
          files: [],
          progress: {},
        };
      }

      // Ensure nodes object exists
      if (!quickLearnData.nodes) {
        quickLearnData.nodes = {};
      }

      // Add the new quick learn lesson
      const lessonTitle = json.data.title || quickLearnQuery;
      quickLearnData.nodes[lessonTitle] = {
            overview: `Quick lesson on: ${quickLearnQuery}`,
            symbols: [],
        lessonsMeta: [{ type: "Quick Lesson", title: lessonTitle }],
            lessons: [{
          title: lessonTitle,
              body: json.data.body,
              quiz: json.data.quiz || []
            }],
            rawLessonJson: [json.raw || JSON.stringify(json.data)]
      };

      // Save to server (await to ensure it's saved)
      const { saveSubjectDataAsync } = await import("@/utils/storage");
      await saveSubjectDataAsync(quickLearnSlug, quickLearnData);

      // Close modal and navigate to the lesson
      setQuickLearnOpen(false);
      router.replace('/');
      router.push(`/subjects/${quickLearnSlug}/node/${encodeURIComponent(lessonTitle)}`);
    } catch (err: any) {
      alert(err?.message || "Failed to generate quick learn lesson");
    } finally {
      setQuickLearnLoading(false);
    }
  }

  const renameSubject = async (slug: string, newName: string) => {
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

    // Sync to server if authenticated
    try {
      const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
      if (me?.user) {
        await fetch("/api/subjects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ slug, name: newName }),
        }).catch(() => {});
      }
    } catch {}
  };

  const createCourse = async (name: string, syllabus: string, files: File[], preferredLanguage?: string) => {
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
      // Persist subject to server if logged in
      try {
        const me = await fetch("/api/me").then(r => r.json().catch(() => ({})));
        if (me?.user) {
          await fetch("/api/subjects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: effectiveName, slug: unique }),
          }).catch(() => {});
        }
      } catch {}

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

      const initData: StoredSubjectData = { subject: effectiveName, files: storedFiles, combinedText, tree: null, topics: [], nodes: {}, progress: {}, course_context: syllabus, course_language_name: preferredLanguage || undefined };
      saveSubjectData(unique, initData);

      let documents: Array<{ name: string; text: string }> = [];
      try {
        // Upload files one-by-one to avoid exceeding Vercel request size limits
        for (const file of files) {
          const form = new FormData();
          form.append('files', file);
          const res = await fetch('/api/upload-course-files', { method: 'POST', body: form });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json?.ok && Array.isArray(json.docs)) {
            // Append any returned docs (server may return an array even for single file)
            documents.push(...json.docs);
          }
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
            preferredLanguage: preferredLanguage || undefined,
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
            body: JSON.stringify({ context: contextSource, fallbackTitle: effectiveName, preferredLanguage: preferredLanguage || undefined }),
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
            body: JSON.stringify({ context: quickContext, preferredLanguage: preferredLanguage || undefined }),
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
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] px-6 pt-10 pb-4">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Your subjects</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreateOpen(true)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--foreground)] bg-[var(--background)]/90 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.7)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.8)] hover:bg-[var(--background)]/95 transition-all duration-200 ease-out"
            aria-label="Add course"
          >
            <span className="text-lg leading-none text-[var(--foreground)]">+</span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.filter((s) => s.slug !== "quicklearn").map((s) => (
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
            <div className="flex items-center gap-3 h-full">
              <span className="text-lg font-semibold flex-1 break-words whitespace-normal leading-snug pr-8">{s.name}</span>
            </div>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpenFor((cur) => (cur === s.slug ? null : s.slug)); }}
                disabled={preparingSlug === s.slug}
              data-menu-button
              className={`absolute top-3 right-3 inline-flex items-center justify-center text-[var(--foreground)]/60 hover:text-[var(--foreground)]/80 transition-colors !shadow-none ${
                  preparingSlug === s.slug
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
                }`}
                aria-label="More actions"
                title="More actions"
              >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="5" cy="12" r="2" fill="currentColor"/>
                  <circle cx="12" cy="12" r="2" fill="currentColor"/>
                  <circle cx="19" cy="12" r="2" fill="currentColor"/>
                </svg>
              </button>
            
            {preparingSlug === s.slug && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm rounded-2xl z-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/20 bg-[var(--background)]/95 px-3 py-1 text-[12px] text-[var(--foreground)] shadow-lg">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent-cyan)]" /> Preparing…
                </div>
              </div>
            )}
            {menuOpenFor === s.slug && (
              <div data-menu-dropdown className="absolute right-3 top-12 z-50 w-40 rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/95 backdrop-blur-md shadow-lg p-2 space-y-2">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMenuOpenFor(null);
                    const name = window.prompt("Rename course", s.name) || s.name;
                    if (name !== s.name) {
                      await renameSubject(s.slug, name);
                    }
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = window.confirm("Delete this subject and all saved data?");
                    if (!ok) return;
                    
                    // Delete from server if authenticated
                    try {
                      const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json().catch(() => ({})));
                      if (me?.user) {
                        await fetch(`/api/subjects?slug=${encodeURIComponent(s.slug)}`, {
                          method: "DELETE",
                          credentials: "include",
                        }).catch(() => {});
                      }
                    } catch {}
                    
                    // Delete from local storage
                    const next = subjects.filter((t) => t.slug !== s.slug);
                    localStorage.setItem("atomicSubjects", JSON.stringify(next));
                    try { localStorage.removeItem("atomicSubjectData:" + s.slug); } catch {}
                    setSubjects(next);
                    setMenuOpenFor(null);
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[#FFC0DA] hover:bg-[#FF2D96]/20 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenFor(null);
                    setFilesModalOpen(s.slug);
                  }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
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
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
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

      {/* Note from developer */}
      <div className="mx-auto mt-8 w-full max-w-5xl relative">
        {/* Animated gradient glow shadow behind the box */}
        <div className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-[var(--accent-cyan)]/60 via-[var(--accent-pink)]/60 to-[var(--accent-cyan)]/60 bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] blur-xl -z-10 pointer-events-none" />
        {/* Dark box on top */}
        <div className="relative rounded-2xl bg-[var(--background)] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.7)] z-0">
          <div className="text-sm text-[var(--foreground)] leading-relaxed space-y-2">
            <p className="font-semibold">Hallo, Det som funkar är:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>lägga till kurser här.</li>
              <li>quick learn sidan.</li>
              <li>efter att du genererat en lektion så kan du klicka på valfritt ord för att få en förklaring.</li>
              <li>Chatta med Lars är liksom meningen att du ska behöva förklara för honom</li>
            </ul>
            <p className="mt-3">mycket skit som inte funkar men aja</p>
            <p className="mt-2">tack, adios</p>
          </div>
        </div>
      </div>

      <CourseCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, syllabus, files, preferredLanguage) => {
          (async () => {
            setCreateOpen(false);
            await createCourse(name, syllabus, files, preferredLanguage);
          })();
        }}
      />

      {/* Quick Lesson Modal */}
      {quickLearnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={isIOSStandalone ? "relative w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-6" : "relative w-full max-w-md rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md p-6"}>
            {quickLearnLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[var(--background)]/95 backdrop-blur-md">
                <GlowSpinner size={120} ariaLabel="Generating quick lesson" idSuffix="home-quicklesson" />
                <div className="text-sm font-medium text-[var(--foreground)]/80">Generating lesson…</div>
              </div>
            )}
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
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none resize-none -webkit-user-select-text -webkit-touch-callout-none -webkit-appearance-none"
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
