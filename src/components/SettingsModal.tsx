"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

type Theme = {
  background: string;
  foreground: string;
  accentCyan: string;
  accentPink: string;
};

const DEFAULTS: Theme = {
  background: "#0F1216",
  foreground: "#E5E7EB",
  accentCyan: "#00E5FF",
  accentPink: "#FF2D96",
};

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--background", t.background);
  root.style.setProperty("--foreground", t.foreground);
  root.style.setProperty("--accent-cyan", t.accentCyan);
  root.style.setProperty("--accent-pink", t.accentPink);
  root.style.setProperty("--accent-grad", `linear-gradient(90deg, ${t.accentCyan}, ${t.accentPink})`);
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useState<Theme>(DEFAULTS);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem("atomicTheme");
      const saved = raw ? (JSON.parse(raw) as Theme) : DEFAULTS;
      setTheme({ ...DEFAULTS, ...saved });
    } catch {
      setTheme(DEFAULTS);
    }
  }, [open]);

  function save() {
    applyTheme(theme);
    localStorage.setItem("atomicTheme", JSON.stringify(theme));
    onClose();
  }

  function reset() {
    setTheme(DEFAULTS);
    applyTheme(DEFAULTS);
    localStorage.setItem("atomicTheme", JSON.stringify(DEFAULTS));
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <div className="flex items-center justify-between">
          <button onClick={reset} className="inline-flex h-9 items-center rounded-full bg-[#141923] px-4 text-sm text-[#E5E7EB] hover:bg-[#1B2030]">Reset</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="inline-flex h-9 items-center rounded-full bg-[#141923] px-4 text-sm text-[#E5E7EB] hover:bg-[#1B2030]">Cancel</button>
            <button onClick={save} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white" style={{ backgroundImage: "var(--accent-grad)" }}>Save</button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-[#A7AFBE]">Background</label>
          <input type="color" value={theme.background} onChange={(e) => { if (!e.target) return; setTheme((t) => ({ ...t, background: e.target.value })); }} className="h-10 w-full cursor-pointer rounded-xl border border-[#222731] bg-[#0F141D]" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#A7AFBE]">Foreground</label>
          <input type="color" value={theme.foreground} onChange={(e) => { if (!e.target) return; setTheme((t) => ({ ...t, foreground: e.target.value })); }} className="h-10 w-full cursor-pointer rounded-xl border border-[#222731] bg-[#0F141D]" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#A7AFBE]">Accent cyan</label>
          <input type="color" value={theme.accentCyan} onChange={(e) => { if (!e.target) return; setTheme((t) => ({ ...t, accentCyan: e.target.value })); }} className="h-10 w-full cursor-pointer rounded-xl border border-[#222731] bg-[#0F141D]" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#A7AFBE]">Accent pink</label>
          <input type="color" value={theme.accentPink} onChange={(e) => { if (!e.target) return; setTheme((t) => ({ ...t, accentPink: e.target.value })); }} className="h-10 w-full cursor-pointer rounded-xl border border-[#222731] bg-[#0F141D]" />
        </div>
      </div>
    </Modal>
  );
}





