"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ExamSnipePage() {
  const router = useRouter();
  const [examFiles, setExamFiles] = useState<File[]>([]);
  const [examAnalyzing, setExamAnalyzing] = useState(false);
  const [examResults, setExamResults] = useState<any>(null);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [streamingText, setStreamingText] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExamSnipe() {
    if (examFiles.length === 0) return;
    
    let progressInterval: NodeJS.Timeout | null = null;
    let inchInterval: NodeJS.Timeout | null = null;
    
    try {
      setExamAnalyzing(true);
      setProgress(0);
      setStreamingText("");
      
      // Start progress bar animation - reach 95% in 35 seconds
      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            if (progressInterval) clearInterval(progressInterval);
            return 95;
          }
          return prev + (95 / 350); // 95% over 35 seconds (350 steps of 100ms)
        });
      }, 100);
      
      // After 35 seconds, inch up slowly
      const inchTimeout = setTimeout(() => {
        inchInterval = setInterval(() => {
          setProgress(prev => {
            if (prev >= 99) {
              if (inchInterval) clearInterval(inchInterval);
              return 99;
            }
            return prev + 1; // Inch up by 1% every 3 seconds
          });
        }, 3000);
      }, 35000);
      
      const formData = new FormData();
      examFiles.forEach((file) => formData.append('exams', file));
      
      const res = await fetch('/api/exam-snipe-stream', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        throw new Error('Failed to analyze exams');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                console.log('Received stream data:', parsed);
                if (parsed.type === 'text') {
                  fullText += parsed.content;
                  setStreamingText(fullText);
                  console.log('Streaming text updated:', fullText.length, 'chars');
                } else if (parsed.type === 'done') {
                  console.log('Analysis complete:', parsed.data);
                  setExamResults(parsed.data);
                } else if (parsed.type === 'error') {
                  throw new Error(parsed.error || 'Analysis failed');
                }
              } catch (e) {
                // Skip invalid JSON
                console.error('JSON parse error:', e, 'for data:', data);
              }
            }
          }
        }
      }
      
      // Clean up intervals
      if (progressInterval) clearInterval(progressInterval);
      if (inchInterval) clearInterval(inchInterval);
      clearTimeout(inchTimeout);
      setProgress(100);
    } catch (err: any) {
      console.error('Exam analysis error:', err);
      alert(err?.message || 'Failed to analyze exams');
      
      // Clean up intervals on error
      if (progressInterval) clearInterval(progressInterval);
      if (inchInterval) clearInterval(inchInterval);
    } finally {
      setExamAnalyzing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F1216] text-white">
      {/* Header */}
      <div className="border-b border-[#222731] bg-[#0B0E12] px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1F2E] text-[#A7AFBE] hover:bg-[#2B3140] transition-colors"
              aria-label="Back to home"
            >
              ←
            </button>
            <h1 className="text-xl font-semibold">🎯 Exam Snipe</h1>
          </div>
          {examResults && (
            <button
              onClick={() => {
                setExamResults(null);
                setExamFiles([]);
              }}
              className="rounded-lg bg-[#1A1F2E] px-4 py-2 text-sm text-[#E5E7EB] hover:bg-[#2B3140] transition-colors"
            >
              Analyze New Exams
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {!examResults ? (
          <>
            {!examAnalyzing ? (
              <>
                <div className="mb-8 text-center">
                  <h2 className="text-2xl font-bold text-white mb-2">Find the Highest-Value Concepts</h2>
                  <p className="text-[#A7AFBE]">Upload old exams to discover which topics give you the most points per hour of study</p>
                </div>

                <div className="mb-6">
                  <div 
                    className="rounded-xl border-2 border-dashed border-[#222731] bg-[#0B0E12] p-12 text-center hover:border-[#FF2D96]/50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setExamFiles(files);
                      }}
                      className="hidden"
                    />
                    <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] flex items-center justify-center mb-4">
                      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div className="text-lg font-semibold text-white mb-2">Click to upload old exams</div>
                    <div className="text-sm text-[#A7AFBE]">PDF files only • Multiple files supported</div>
                  </div>
                  
                  {examFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-semibold text-[#00E5FF]">{examFiles.length} file(s) selected:</div>
                      {examFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-[#E5E7EB] bg-[#1A1F2E] rounded-lg px-4 py-2">
                          <span>📄</span>
                          <span>{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={handleExamSnipe}
                    disabled={examFiles.length === 0}
                    className="inline-flex h-12 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-8 text-base font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
                  >
                    Analyze Exams
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 space-y-6">
                <div className="relative w-24 h-24">
                  {/* Spinning gradient ring */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-spin" 
                       style={{ 
                         WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)',
                         mask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)'
                       }}>
                  </div>
                </div>
                
                <div className="text-center space-y-4">
                  <div className="text-lg font-semibold text-white mb-1">
                    {progress >= 100 ? 'Worth the wait... probably 🐌' : 
                     progress >= 95 ? 'Almost there...' : 
                     'Analyzing Exams...'}
                  </div>
                  <div className="text-sm text-[#A7AFBE]">
                    {progress >= 100 ? 'Taking its sweet time, aren\'t we?' :
                     'AI is reading your PDFs and finding patterns'}
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-80 mx-auto">
                    <div className="h-2 rounded-full bg-[#1A1F2E] overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="text-xs text-[#6B7280] mt-2">{Math.round(progress)}%</div>
                  </div>
                  
                  {/* Streaming AI output */}
                  {streamingText && (
                    <div className="mt-6 w-full max-w-2xl mx-auto">
                      <div className="rounded-xl border border-[#2B3140] bg-[#1A1F2E] p-4 max-h-64 overflow-y-auto">
                        <div className="text-xs font-semibold text-[#A7AFBE] mb-2">🤖 AI is thinking...</div>
                        <div className="text-sm text-[#E5E7EB] font-mono whitespace-pre-wrap">
                          {streamingText}
                          <span className="inline-block w-2 h-4 bg-[#00E5FF] animate-pulse ml-1"></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Summary Header */}
            <div className="mb-6 rounded-xl border border-[#222731] bg-[#0B0E12] p-6">
              <h2 className="text-xl font-bold text-white mb-3">📊 Analysis Results</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs text-[#A7AFBE] mb-1">Exams Analyzed</div>
                  <div className="text-2xl font-bold text-[#00E5FF]">{examResults.totalExams}</div>
                </div>
                <div>
                  <div className="text-xs text-[#A7AFBE] mb-1">Concepts Found</div>
                  <div className="text-2xl font-bold text-[#FF2D96]">{examResults.concepts.length}</div>
                </div>
              </div>

              {examResults.gradeInfo && (
                <div className="rounded-lg bg-[#1A1F2E] p-4 border border-[#2B3140]">
                  <div className="text-sm font-semibold text-white mb-2">📈 Grade Requirements:</div>
                  <div className="text-sm text-[#E5E7EB]">{examResults.gradeInfo}</div>
                </div>
              )}
            </div>

            {/* Pattern Analysis */}
            {examResults.patternAnalysis && (
              <div className="mb-6 rounded-xl border border-[#2B3140] bg-[#1A1F2E] p-6">
                <h3 className="text-base font-semibold text-white mb-2">🔍 Pattern Analysis</h3>
                <p className="text-sm text-[#E5E7EB] leading-relaxed">
                  {examResults.patternAnalysis}
                </p>
              </div>
            )}

            {/* Study Strategy */}
            <div className="mb-6 rounded-xl border border-[#2B3140] bg-[#1A1F2E] p-6">
              <h3 className="text-base font-semibold text-white mb-2">💡 Study Strategy</h3>
              <p className="text-sm text-[#E5E7EB] mb-3">
                Focus on concepts with the highest <span className="font-semibold text-white">Points/Hour</span> ratio. 
                These give you the best return on your study time investment. Concepts appearing in early exams are boosted in priority.
              </p>
              <div className="text-sm text-[#A7AFBE]">
                <strong>Top 3 priorities:</strong> Start with concepts ranked 1-3 below. 
                These appear frequently, especially in recent exams, making them the most efficient targets.
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-3">
              {examResults.concepts.map((concept: any, i: number) => (
                <div key={i} className="rounded-xl border border-[#2B3140] bg-[#1A1F2E] overflow-hidden">
                  <div 
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[#222833] transition-colors"
                    onClick={() => setExpandedConcept(expandedConcept === i ? null : i)}
                  >
                    <span className={`flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? 'bg-[#2B3140] text-[#FFD700]' :
                      i === 1 ? 'bg-[#2B3140] text-[#C0C0C0]' :
                      i === 2 ? 'bg-[#2B3140] text-[#CD7F32]' :
                      'bg-[#2B3140] text-[#6B7280]'
                    }`}>
                      {i + 1}
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm">{concept.name}</div>
                      <div className="text-xs text-[#A7AFBE] mt-1">
                        {concept.frequency}/{examResults.totalExams} exams • {concept.estimatedTime} study time • {concept.avgPoints}
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 text-right">
                      <div className="text-lg font-bold text-white">{concept.pointsPerHour}</div>
                      <div className="text-xs text-[#A7AFBE]">pts/hr</div>
                    </div>
                    
                    <div className="flex-shrink-0 text-[#6B7280]">
                      {expandedConcept === i ? '▼' : '▶'}
                    </div>
                  </div>
                  
                  {expandedConcept === i && concept.details && (
                    <div className="border-t border-[#2B3140] bg-[#141821] p-4">
                      <div className="text-xs font-semibold text-[#A7AFBE] mb-2">Specific Questions/Topics Found:</div>
                      <ul className="space-y-2">
                        {concept.details.map((detail: any, di: number) => (
                          <li key={di} className="text-sm text-[#E5E7EB] flex items-start gap-2">
                            <span className="text-[#6B7280] mt-0.5">•</span>
                            <div className="flex-1">
                              <div>{detail.topic}</div>
                              {detail.points && (
                                <div className="text-xs text-[#A7AFBE] mt-0.5">
                                  {detail.points} • {detail.exam}
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer Tips */}
            <div className="mt-6 rounded-lg bg-[#1A1F2E] border border-[#2B3140] p-4">
              <div className="text-xs text-[#A7AFBE]">
                <strong className="text-[#E5E7EB]">💡 Pro Tips:</strong><br/>
                • Start with gold/silver/bronze ranked concepts for maximum efficiency<br/>
                • High frequency = more likely to appear again<br/>
                • Balance high Points/Hour with concepts you find challenging
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

