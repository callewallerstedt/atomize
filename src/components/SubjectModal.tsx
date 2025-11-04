"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";

export type Subject = {
  name: string;
  slug: string;
};

export default function SubjectModal({
  open,
  mode,
  initialSubject,
  existingSubjects,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialSubject?: Subject | null;
  existingSubjects: Subject[];
  onCancel: () => void;
  onSubmit: (subject: Subject) => void;
}) {
  const [name, setName] = useState<string>(initialSubject?.name ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(initialSubject?.name ?? "");
  }, [initialSubject]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function slugify(value: string): string {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    return base || "subject";
  }

  function uniqueSlug(base: string): string {
    const existingSlugs = new Set(existingSubjects.map((s) => s.slug));
    let candidate = base;
    let i = 1;
    while (existingSlugs.has(candidate)) {
      i += 1;
      candidate = `${base}-${i}`;
    }
    return candidate;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base = slugify(name);
    const slug = initialSubject?.slug ?? uniqueSlug(base);
    onSubmit({ name: name.trim() || "Untitled", slug });
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={mode === "create" ? "Create subject" : "Edit subject"}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-full bg-[#141923] px-4 text-sm text-[#E5E7EB] hover:bg-[#1B2030]"
          >
            Cancel
          </button>
          <button
            form="subject-form"
            type="submit"
            className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white"
            style={{ backgroundImage: "var(--accent-grad)" }}
          >
            {mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      }
    >
      <form id="subject-form" onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="subject-name" className="mb-1 block text-xs text-[#A7AFBE]">
            Name
          </label>
          <input
            id="subject-name"
            ref={inputRef}
            value={name}
            onChange={(e) => { if (!e.target) return; setName(e.target.value); }}
            placeholder="e.g., Calculus I"
            className="w-full rounded-xl border border-[#222731] bg-[#0F141D] px-3 py-2 text-sm text-[#E5E7EB] placeholder:text-[#6B7280] focus:border-[#2F86F6] focus:outline-none"
          />
        </div>
      </form>
    </Modal>
  );
}


