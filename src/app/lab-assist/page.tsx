"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import GlowSpinner from "@/components/GlowSpinner";

export default function LabAssistPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: File[]) => {
    // Filter for PDF and DOCX only
    const validFiles = files.filter(f => {
      const lower = f.name.toLowerCase();
      return lower.endsWith('.pdf') || lower.endsWith('.docx');
    });

    if (validFiles.length === 0) {
      setError('Please upload PDF or DOCX files only');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      validFiles.forEach(file => {
        formData.append('files', file);
      });

      const res = await fetch('/api/lab-assist', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Server error (${res.status})`);
      }

      // Navigate to the step viewer with the lab data
      const labId = json.lab?.id;
      if (labId) {
        // Store lab data in sessionStorage temporarily
        sessionStorage.setItem(`lab-assist-${labId}`, JSON.stringify(json.lab));
        router.push(`/lab-assist/${labId}`);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      console.error('Failed to process lab files:', err);
      setError(err?.message || 'Failed to process lab files. Please try again.');
      setUploading(false);
    }
  };

  // Check for pending files from homepage
  useEffect(() => {
    const pendingFiles = (window as any).__pendingLabFiles;
    if (pendingFiles && Array.isArray(pendingFiles) && pendingFiles.length > 0) {
      // Clear the pending files
      delete (window as any).__pendingLabFiles;
      // Process them
      handleFiles(pendingFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">Lab Assist</h1>
          <p className="text-sm text-[var(--foreground)]/70">
            Upload a lab PDF or DOCX and get clean, numbered steps with no fluff
          </p>
        </div>

        {/* Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 cursor-pointer ${
            isDragging
              ? 'border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/5'
              : 'border-[var(--foreground)]/25 hover:border-[var(--foreground)]/35'
          } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center justify-center gap-4">
              <GlowSpinner size={80} ariaLabel="Processing lab files" idSuffix="lab-assist-upload" />
              <p className="text-sm text-[var(--foreground)]/70">Processing lab files...</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-4">
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-[var(--foreground)]/50"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="space-y-2">
                  <p className="text-base font-medium text-[var(--foreground)]">
                    Drop lab files here or click to browse
                  </p>
                  <p className="text-sm text-[var(--foreground)]/60">
                    PDF or DOCX files only
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />

        {/* Error Message */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={() => router.push('/')}
          disabled={uploading}
          className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/50 px-4 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--background)]/70 transition-colors disabled:opacity-50"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

