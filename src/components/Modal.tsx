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
    ? "relative z-10 w-full max-w-lg rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-5 text-[var(--foreground)] shadow-2xl max-h-[90vh] flex flex-col"
    : "relative z-10 w-full max-w-lg rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md p-5 text-[var(--foreground)] shadow-2xl max-h-[90vh] flex flex-col";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={contentClass} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {title ? (
          <div className="mb-3 text-base font-semibold shrink-0">{title}</div>
        ) : null}
        <div className="text-sm flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="mt-4 shrink-0 sticky bottom-0 bg-[var(--background)]/95 backdrop-blur-md pt-3 -mx-5 px-5 border-t border-[var(--foreground)]/10">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}



