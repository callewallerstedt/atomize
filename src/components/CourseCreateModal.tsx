"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";

export default function CourseCreateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, syllabus: string, files: File[]) => void }) {
  const [name, setName] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), syllabus, files);
    // Reset form
    setName("");
    setSyllabus("");
    setFiles([]);
    setIsDragging(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add course"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="inline-flex h-9 items-center rounded-full bg-[#141923] px-4 text-sm text-[#E5E7EB] hover:bg-[#1B2030]">Cancel</button>
          <button onClick={(e) => submit(e as any)} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white" style={{ backgroundImage: "var(--accent-grad)" }}>Create</button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-[#A7AFBE]">Course name</label>
          <input value={name} onChange={(e) => { if (!e.target) return; setName(e.target.value); }} className="w-full rounded-xl border border-[#222731] bg-[#0F141D] px-3 py-2 text-sm text-[#E5E7EB] placeholder:text-[#6B7280] focus:outline-none" placeholder="e.g., Concurrent Programming" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#A7AFBE]">Syllabus (optional)</label>
          <textarea value={syllabus} onChange={(e) => { if (!e.target) return; setSyllabus(e.target.value); }} rows={5} className="w-full resize-y rounded-xl border border-[#222731] bg-[#0F141D] px-3 py-2 text-sm text-[#E5E7EB] placeholder:text-[#6B7280] focus:outline-none" placeholder="Paste syllabus or course description..." />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#A7AFBE]">Upload files (optional)</label>
          <div
            className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
              isDragging ? 'border-accent bg-accent/10' : 'border-[#222731] hover:border-[#2B3140]'
            }`}
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
              setIsDragging(false);
              const droppedFiles = Array.from(e.dataTransfer.files);
              console.log('Files dropped:', droppedFiles);
              setFiles((prev) => [...prev, ...droppedFiles]);
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="text-sm text-[#9AA3B2]">
                {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Drop files here or click to browse'}
              </div>
              <button
                type="button"
                onClick={() => {
                  console.log('Choose files button clicked, fileInputRef:', fileInputRef.current);
                  fileInputRef.current?.click();
                }}
                className="inline-flex h-9 items-center rounded-full border border-[#222731] px-4 text-sm text-[#E5E7EB] hover:bg-[#1B2030]"
              >
                Choose files
              </button>
              {files.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto w-full">
                  <div className="text-xs text-[#9AA3B2] space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="truncate">{f.name}</span>
                        <button
                          onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                          className="ml-2 text-[#FFC0DA] hover:text-[#FF6B9D]"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              if (!e.target?.files) return;
              const selectedFiles = Array.from(e.target.files);
              console.log('Files selected:', selectedFiles);
              setFiles((prev) => [...prev, ...selectedFiles]);
              // Reset the input value so the same file can be selected again
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>
      </form>
    </Modal>
  );
}


