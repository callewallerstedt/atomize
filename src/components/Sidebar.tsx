"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SubjectModal from "@/components/SubjectModal";

type Subject = {
  name: string;
  slug: string;
};

const SUBJECTS_KEY = "atomicSubjects";

function readSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SUBJECTS_KEY);
    return raw ? (JSON.parse(raw) as Subject[]) : [];
  } catch {
    return [];
  }
}

function writeSubjects(subjects: Subject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects));
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base || "subject";
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<Subject | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  useEffect(() => {
    setSubjects(readSubjects());
  }, []);

  const activeSlug = useMemo(() => {
    const match = pathname?.match(/\/subjects\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  function openCreate() {
    setModalMode("create");
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(subject: Subject) {
    setModalMode("edit");
    setEditing(subject);
    setModalOpen(true);
  }

  function handleSubmitModal(sub: Subject) {
    if (modalMode === "create") {
      const next = [...subjects, sub];
      writeSubjects(next);
      setSubjects(next);
      setModalOpen(false);
      router.push(`/subjects/${sub.slug}`);
      onNavigate?.();
    } else {
      const next = subjects.map((s) => (s.slug === sub.slug ? { ...s, name: sub.name } : s));
      writeSubjects(next);
      setSubjects(next);
      setModalOpen(false);
    }
  }

  function handleDeleteSubject(slug: string) {
    const ok = typeof window !== "undefined" ? window.confirm("Delete this subject and all saved data?") : false;
    if (!ok) return;
    const next = subjects.filter((s) => s.slug !== slug);
    writeSubjects(next);
    try {
      window.localStorage.removeItem("atomicSubjectData:" + slug);
    } catch {}
    setSubjects(next);
    setMenuOpenFor(null);
    if (activeSlug === slug) {
      router.push("/");
      onNavigate?.();
    }
  }

  return (
    <aside className="flex h-full w-72 flex-col bg-[#0B0E12] text-[#E5E7EB]">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-[#A7AFBE]">Subjects</div>
        <button
          onClick={openCreate}
          className="inline-flex h-8 items-center gap-2 rounded-full bg-accent px-3 text-xs font-medium text-white hover:opacity-95"
          aria-label="Add subject"
          title="Add subject"
        >
          <span className="-mb-[1px]">+</span>
          New
        </button>
      </div>
      <nav className="px-2 pb-4">
        {subjects.length === 0 ? (
          <div className="px-3 py-2 text-sm text-[#9AA3B2]">No subjects yet. Click Add.</div>
        ) : (
          <ul className="space-y-1">
            {subjects.map((s) => {
              const isActive = s.slug === activeSlug;
              const isMenuOpen = menuOpenFor === s.slug;
              return (
                <li key={s.slug} className="group relative">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/subjects/${s.slug}`}
                      onClick={() => { setMenuOpenFor(null); onNavigate?.(); }}
                      className={
                        "flex-1 rounded-xl px-3 py-2 text-sm transition " +
                        (isActive
                          ? "bg-[#151A22] text-white"
                          : "text-[#CBD2DF] hover:bg-[#10151C] hover:text-white")
                      }
                    >
                      {s.name}
                    </Link>
                    <button
                      onClick={() => setMenuOpenFor((cur) => (cur === s.slug ? null : s.slug))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#222731] bg-[#121721] text-[#A7AFBE] hover:bg-[#1B2030]"
                      aria-label="More actions"
                      title="More actions"
                    >
                      {/* Three dots icon */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="5" cy="12" r="2" fill="#A7AFBE"/>
                        <circle cx="12" cy="12" r="2" fill="#A7AFBE"/>
                        <circle cx="19" cy="12" r="2" fill="#A7AFBE"/>
                      </svg>
                    </button>
                  </div>

                  {isMenuOpen && (
                    <div className="absolute right-0 top-10 z-50 w-40 rounded-xl border border-[#222731] bg-[#0B0E12] p-1 shadow-xl">
                      <button
                        onClick={() => { setMenuOpenFor(null); openEdit(s); }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#E5E7EB] hover:bg-[#121821]"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(s.slug)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#FFC0DA] hover:bg-[#20141A]"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <SubjectModal
        open={modalOpen}
        mode={modalMode}
        initialSubject={editing}
        existingSubjects={subjects}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleSubmitModal}
      />
    </aside>
  );
}


