"use client";

import { useEffect } from "react";

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  headerRight,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerRight?: React.ReactNode;
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
  const isIOSStandalone =
    typeof window !== "undefined" &&
    /iPad|iPhone|iPod/i.test(navigator.userAgent) &&
    (((window.navigator as any).standalone === true) ||
      window.matchMedia("(display-mode: standalone)").matches);

  const contentClass = isIOSStandalone
    ? "w-full max-w-lg rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)] p-5 text-[var(--foreground)] shadow-2xl flex flex-col"
    : "w-full max-w-lg rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md p-5 text-[var(--foreground)] shadow-2xl flex flex-col";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 flex min-h-full items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div
          className={`${contentClass} max-h-[calc(100vh-4rem)] my-auto`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {(title || headerRight) ? (
            <div className="mb-3 text-base font-semibold shrink-0 flex items-center justify-between gap-4">
              {title ? <div>{title}</div> : <div />}
              {headerRight ? <div className="flex-shrink-0">{headerRight}</div> : null}
            </div>
          ) : null}
          <div className="text-sm flex-1 min-h-0 overflow-y-auto pb-2">{children}</div>
          {footer ? <div className="mt-4 shrink-0 pb-2">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}



