"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function TestPDFPage() {
  const router = useRouter();
  const [testResult, setTestResult] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTestPDF = async (file: File) => {
    setTesting(true);
    setTestResult("Testing PDF extraction with pdf-parse (server-side)...\n\n");

    try {
      setTestResult(prev => prev + `File: ${file.name}\n`);
      setTestResult(prev => prev + `Size: ${file.size} bytes\n\n`);
      
      setTestResult(prev => prev + "Sending to server for extraction...\n");
      
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/test-pdf-parse', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (!data.ok) {
        setTestResult(prev => prev + `\n✗ ERROR: ${data.error}\n`);
        if (data.stack) {
          setTestResult(prev => prev + `Stack: ${data.stack}\n`);
        }
        return;
      }
      
      setTestResult(prev => prev + `✓ PDF parsed successfully!\n\n`);
      setTestResult(prev => prev + `Number of pages: ${data.numPages}\n`);
      setTestResult(prev => prev + `Total text length: ${data.textLength} characters\n\n`);
      
      if (data.text && data.text.length > 0) {
        setTestResult(prev => prev + `✓ SUCCESS! Extracted text:\n\n`);
        setTestResult(prev => prev + `First 2000 characters:\n${data.text.substring(0, 2000)}...\n\n`);
        setTestResult(prev => prev + `Last 500 characters:\n...${data.text.substring(data.text.length - 500)}\n`);
      } else {
        setTestResult(prev => prev + `⚠ WARNING: No text extracted (might be an image-based PDF)\n`);
      }
      
    } catch (err: any) {
      setTestResult(prev => prev + `\n✗ ERROR: ${err.message}\n`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1216] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1F2E] text-[#A7AFBE] hover:bg-[#2B3140]"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold">PDF Parsing Test</h1>
        </div>

        <div className="mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleTestPDF(file);
            }}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={testing}
            className="synapse-style rounded-lg px-6 py-3 text-white font-medium hover:opacity-95 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Upload PDF to Test"}
          </button>
        </div>

        {testResult && (
          <div className="rounded-xl border border-[#2B3140] bg-[#1A1F2E] p-4">
            <pre className="text-xs text-[#E5E7EB] whitespace-pre-wrap font-mono">
              {testResult}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

