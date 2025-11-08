"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

type Theme = {
  background: string;
  foreground: string;
  accentCyan: string;
  accentPink: string;
  isLightMode?: boolean;
};

const DARK_DEFAULTS: Theme = {
  background: "#0F1216",
  foreground: "#E5E7EB",
  accentCyan: "#00E5FF",
  accentPink: "#FF2D96",
  isLightMode: false,
};

const LIGHT_DEFAULTS: Theme = {
  background: "#F8FAFC",
  foreground: "#1E293B",
  accentCyan: "#0EA5E9",
  accentPink: "#EC4899",
  isLightMode: true,
};

function applyTheme(t: Theme) {
  console.log('Applying theme:', t);
  const root = document.documentElement;
  root.style.setProperty("--background", t.background);
  root.style.setProperty("--foreground", t.foreground);
  root.style.setProperty("--accent-cyan", t.accentCyan);
  root.style.setProperty("--accent-pink", t.accentPink);
  root.style.setProperty("--accent-grad", `linear-gradient(90deg, ${t.accentCyan}, ${t.accentPink})`);

  // Handle light/dark mode class
  if (t.isLightMode) {
    console.log('Adding light-mode class');
    root.classList.add('light-mode');
  } else {
    console.log('Removing light-mode class');
    root.classList.remove('light-mode');
  }
}

export default function SettingsModal({ 
  open, 
  onClose, 
  onLogout,
  isAuthenticated 
}: { 
  open: boolean; 
  onClose: () => void;
  onLogout?: () => void;
  isAuthenticated?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(DARK_DEFAULTS);
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem("atomicTheme");
      const saved = raw ? (JSON.parse(raw) as Theme) : DARK_DEFAULTS;
      const mode = saved.isLightMode ?? false;
      setIsLightMode(mode);
      setTheme({ ...(mode ? LIGHT_DEFAULTS : DARK_DEFAULTS), ...saved });
    } catch {
      setTheme(DARK_DEFAULTS);
      setIsLightMode(false);
    }
  }, [open]);

  function toggleLightMode() {
    const newMode = !isLightMode;
    console.log('Toggling to:', newMode ? 'light' : 'dark');
    setIsLightMode(newMode);
    const newTheme = { ...(newMode ? LIGHT_DEFAULTS : DARK_DEFAULTS), isLightMode: newMode };
    console.log('New theme:', newTheme);
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem("atomicTheme", JSON.stringify(newTheme));
  }


  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]">Close</button>
        </div>
      }
    >
      {/* Light/Dark Mode Toggle */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--foreground)]">Theme</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleLightMode();
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isLightMode ? 'bg-[#0EA5E9]' : 'bg-[#374151]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isLightMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="mt-1 text-xs text-[#A7AFBE]">
          {isLightMode ? 'Light mode' : 'Dark mode'}
        </p>
      </div>

      {/* Logout Button */}
      {isAuthenticated && onLogout && (
        <div className="mb-6 pt-6 border-t border-[var(--foreground)]/20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLogout();
            }}
            className="w-full inline-flex h-8 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white px-3 text-xs font-medium transition-colors"
          >
            Log out
          </button>
        </div>
      )}
    </Modal>
  );
}





