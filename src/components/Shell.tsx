"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsModal from "@/components/SettingsModal";

type Subject = { name: string; slug: string };

function getSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("atomicSubjects");
    return raw ? (JSON.parse(raw) as Subject[]) : [];
  } catch {
    return [];
  }
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const pathname = usePathname();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSubjects(getSubjects());
    try {
      const raw = localStorage.getItem("atomicTheme");
      if (raw) {
        const t = JSON.parse(raw);
        const root = document.documentElement;
        root.style.setProperty("--background", t.background || "#0F1216");
        root.style.setProperty("--foreground", t.foreground || "#E5E7EB");
        root.style.setProperty("--accent-cyan", t.accentCyan || "#00E5FF");
        root.style.setProperty("--accent-pink", t.accentPink || "#FF2D96");
        root.style.setProperty("--accent-grad", `linear-gradient(90deg, ${t.accentCyan || '#00E5FF'}, ${t.accentPink || '#FF2D96'})`);
      }
    } catch {}
  }, [pathname]);

  const crumbs = useMemo(() => {
    const parts = (pathname || "/").split("/").filter(Boolean);
    const items: { label: string; href: string }[] = [];
    const idxSubjects = parts.indexOf("subjects");
    const idxNode = parts.indexOf("node");
    const idxLesson = parts.indexOf("lesson");

    // Subject
    if (idxSubjects >= 0 && parts[idxSubjects + 1]) {
      const slug = parts[idxSubjects + 1];
      const subj = subjects.find((s) => s.slug === slug);
      items.push({ label: subj?.name || decodeURIComponent(slug), href: `/subjects/${slug}` });
    }
    // Topic
    if (idxSubjects >= 0 && idxNode >= 0 && parts[idxSubjects + 1] && parts[idxNode + 1]) {
      const slug = parts[idxSubjects + 1];
      const topic = decodeURIComponent(parts[idxNode + 1]);
      items.push({ label: topic, href: `/subjects/${slug}/node/${encodeURIComponent(topic)}` });
    }
    // Lesson
    if (idxSubjects >= 0 && idxNode >= 0 && idxLesson >= 0 && parts[idxSubjects + 1] && parts[idxNode + 1] && parts[idxLesson + 1]) {
      const slug = parts[idxSubjects + 1];
      const topic = decodeURIComponent(parts[idxNode + 1]);
      const lidx = parts[idxLesson + 1];
      const label = `Lesson ${isNaN(Number(lidx)) ? lidx : Number(lidx) + 1}`;
      items.push({ label, href: `/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lidx}` });
    }
    return items;
  }, [pathname, subjects]);

  return (
    <div className="flex min-h-screen bg-[#0F1216] text-[#E5E7EB]">
      {/* Main content */}
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[#222731] bg-[#0B0E12]/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-[#0B0E12]/80">
          <nav className="flex items-center gap-2 text-sm text-[#A7AFBE]">
            <Link href="/" className="hover:text-white">Home</Link>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-[#384253]">/</span>
                <Link href={c.href} className="hover:text-white max-w-[220px] truncate">{c.label}</Link>
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="inline-flex h-9 items-center rounded-lg bg-[#1A1F2E] px-3 text-sm font-medium text-[#E5E7EB] hover:bg-[#2B3140] transition-colors"
            >
              Home
            </button>
            <button
              onClick={() => router.push('/exam-snipe')}
              className="inline-flex h-9 items-center rounded-lg bg-[#1A1F2E] px-3 text-sm font-medium text-[#E5E7EB] hover:bg-[#2B3140] transition-colors"
            >
              Exam Snipe
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#222731] text-[#E5E7EB] hover:bg-[#151922]"
              aria-label="Settings"
              title="Settings"
            >
              {/* Gear icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 4a7.96 7.96 0 00-.53-2.83l2.11-1.63-2-3.46-2.49 1A8.04 8.04 0 0014.83 3l-.38-2.65h-4.9L9.17 3A8.04 8.04 0 006.91 5.08l-2.49-1-2 3.46 2.11 1.63A7.96 7.96 0 004 12c0 .98.18 1.92.53 2.83L2.42 16.46l2 3.46 2.49-1A8.04 8.04 0 009.17 21l.38 2.65h4.9L14.83 21a8.04 8.04 0 002.26-2.08l2.49 1 2-3.46-2.11-1.63c.35-.91.53-1.85.53-2.83z" stroke="#E5E7EB" strokeWidth="1.2"/>
              </svg>
            </button>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}


