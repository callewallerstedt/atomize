"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import WordPopover from "@/components/WordPopover";

export default function ReadAssistPage() {
  const router = useRouter();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [textBoxes, setTextBoxes] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popoverWord, setPopoverWord] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [simplifyingText, setSimplifyingText] = useState<string | null>(null);
  const [simplifiedResult, setSimplifiedResult] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.includes('pdf')) {
      setError('Please upload a PDF file');
      return;
    }

    setPdfFile(file);
    setLoading(true);
    setError(null);

    try {
      // Create object URL for iframe
      const url = URL.createObjectURL(file);
      setPdfUrl(url);

      // Also extract text for clickable overlay
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/extract-pdf', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.text) {
          setExtractedText(data.text);
          setNumPages(data.numPages || 1);
        }
      }
    } catch (err: any) {
      console.error('Error processing PDF:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleWordClick = (word: string, e: React.MouseEvent) => {
    if (!e.target) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopoverWord(word);
    setPopoverPos({ x: rect.left, y: rect.bottom + window.scrollY });
  };

  const handleSimplify = async () => {
    if (!simplifyingText) return;

    try {
      const res = await fetch('/api/simplify-paragraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraph: simplifyingText }),
      });

      const json = await res.json();
      if (res.ok && json.ok) {
        setSimplifiedResult(json.data.simplified);
      }
    } catch (err) {
      console.error('Failed to simplify:', err);
    }
  };

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 10) {
        setSelectedText(text);
        setSimplifyingText(text);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, []);

  return (
    <div className="min-h-screen bg-[#0F1216] text-white">
      {/* Header */}
      <div className="border-b border-[#222731] bg-[#0B0E12] px-6 py-4 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1F2E] text-[#A7AFBE] hover:bg-[#2B3140] transition-colors"
              aria-label="Back to home"
            >
              ←
            </button>
            <h1 className="text-xl font-semibold">ReadAssist</h1>
            {pdfFile && <span className="text-sm text-[#A7AFBE]">• {pdfFile.name}</span>}
          </div>
          <div className="flex items-center gap-3">
            {pdfFile && (
              <button
                onClick={() => {
                  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                  setPdfFile(null);
                  setPdfUrl(null);
                  setExtractedText('');
                  setNumPages(1);
                  setCurrentPage(1);
                  setError(null);
                  setSimplifiedResult(null);
                  setSimplifyingText(null);
                }}
                className="rounded-lg bg-[#1A1F2E] px-4 py-2 text-sm text-[#E5E7EB] hover:bg-[#2B3140] transition-colors"
              >
                Upload New PDF
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {!pdfUrl && !loading && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="rounded-2xl border-2 border-dashed border-[#222731] bg-[#0B0E12] p-12 text-center hover:border-[#00E5FF]/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="mx-auto max-w-md space-y-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] flex items-center justify-center">
                <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Upload Lecture PDF</h3>
                <p className="text-sm text-[#A7AFBE]">
                  Drop your lecture PDF here or click to browse
                </p>
              </div>
              <div className="text-xs text-[#6B7280]">
                View the full PDF with images • Click words for explanations • Select text to simplify
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500 border-opacity-30 bg-red-500 bg-opacity-10 p-4 text-center">
            <div className="text-sm text-red-200">{error}</div>
            <button
              onClick={() => {
                setError(null);
                if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                setPdfFile(null);
                setPdfUrl(null);
              }}
              className="mt-3 rounded-lg bg-[#1A1F2E] px-4 py-2 text-sm text-[#E5E7EB] hover:bg-[#2B3140]"
            >
              Try Again
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]" />
            <div className="text-sm text-[#A7AFBE]">Loading PDF...</div>
          </div>
        )}

        {pdfUrl && (
          <div className="flex gap-6">
            {/* PDF Viewer */}
            <div className="flex-1">
              <div className="rounded-xl border border-[#222731] overflow-hidden bg-white shadow-2xl">
                <iframe
                  ref={iframeRef}
                  src={pdfUrl}
                  className="w-full h-[800px]"
                  title="PDF Viewer"
                />
              </div>

              {/* Text Overlay for Interactions */}
              {extractedText && (
                <div className="mt-6 rounded-xl border border-[#222731] bg-[#0B0E12] p-6">
                  <h3 className="text-sm font-semibold text-white mb-3">📝 Extracted Text (Click words for explanations)</h3>
                  <div className="prose prose-invert max-w-none text-sm leading-relaxed">
                    {extractedText.split(/\s+/).map((word, i) => (
                      <span key={i}>
                        <span
                          onClick={(e) => handleWordClick(word, e)}
                          className="cursor-pointer hover:bg-[#00E5FF]/20 rounded px-0.5 transition-colors"
                        >
                          {word}
                        </span>
                        {' '}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Simplify Panel */}
            {simplifyingText && (
              <div className="w-96 flex-shrink-0">
                <div className="sticky top-24 rounded-xl border border-[#222731] bg-[#0B0E12] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">Selected Text</h3>
                    <button
                      onClick={() => {
                        setSimplifyingText(null);
                        setSimplifiedResult(null);
                      }}
                      className="text-[#A7AFBE] hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mb-3 rounded-lg bg-[#1A1F2E] p-3 text-xs text-[#A7AFBE] max-h-32 overflow-y-auto">
                    {simplifyingText}
                  </div>
                  {!simplifiedResult && (
                    <button
                      onClick={handleSimplify}
                      className="w-full rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                    >
                      Simplify
                    </button>
                  )}
                  {simplifiedResult && (
                    <div className="mt-3 rounded-lg bg-[#1A1F2E] p-3 text-sm text-[#E5E7EB]">
                      <div className="text-xs font-semibold text-[#00E5FF] mb-2">Simplified:</div>
                      {simplifiedResult}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {popoverWord && (
        <WordPopover
          word={popoverWord}
          position={popoverPos}
          onClose={() => setPopoverWord(null)}
        />
      )}

      {/* Instructions */}
      {pdfUrl && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-[#222731] bg-[#0B0E12]/90 backdrop-blur-sm px-6 py-3 text-xs text-[#A7AFBE] shadow-xl">
          💡 Click any word in the text below for explanation • Select text to simplify
        </div>
      )}
    </div>
  );
}
