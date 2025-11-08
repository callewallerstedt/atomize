"use client";

import { useEffect } from "react";

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  if (!open) return null;
  const isIOSStandalone = typeof window !== 'undefined' && (/iPad|iPhone|iPod/i.test(navigator.userAgent) && ((window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches));
  const contentClass = isIOSStandalone
    ? "relative z-10 w-full max-w-lg rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-5 text-[var(--foreground)] shadow-2xl"
    : "relative z-10 w-full max-w-lg rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md p-5 text-[var(--foreground)] shadow-2xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={contentClass} onClick={(e) => e.stopPropagation()}>
        {title ? (
          <div className="mb-3 text-base font-semibold">{title}</div>
        ) : null}
        <div className="text-sm">{children}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>
  );
}



