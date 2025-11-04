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
      <div className="mx-auto max-w-4xl px-6 py-20">
        {!examResults ? (
          <>
            {!examAnalyzing ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
                <div className="text-center max-w-2xl">
                  <h2 className="text-3xl font-bold text-white mb-4">Exam Snipe</h2>
                  <p className="text-lg text-[#A7AFBE] leading-relaxed">
                    Upload your old exams and let AI analyze them to find the highest-value concepts to study.
                    Discover which topics appear most frequently and give you the best return on study time.
                  </p>
                  <div className="mt-6 text-sm text-[#6B7280]">
                    Perfect if you just started studying a couple days before your exams.
                  </div>
                </div>

                <div
                  className={`w-full max-w-2xl rounded-2xl border-2 border-dashed border-[#3A4454] bg-transparent text-center hover:border-[#00E5FF]/50 transition-colors cursor-pointer ${examFiles.length === 0 ? 'p-20' : 'p-8'}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
                    setExamFiles(files);
                  }}
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
                  {examFiles.length === 0 ? (
                    <div className="text-[#A7AFBE] text-lg">
                      Click here or drop all the old exams
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-[#00E5FF] font-semibold text-lg mb-4">{examFiles.length} file(s) selected</div>
                      {examFiles.map((f, i) => (
                        <div key={i} className="text-[#E5E7EB] text-sm">
                          {f.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleExamSnipe}
                  disabled={examFiles.length === 0}
                  className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Analyze
                </button>
              </div>
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
                      <div className="text-xs font-semibold text-[#A7AFBE] mb-2 text-center">Raw output:</div>
                      <div className="relative rounded-lg bg-[#0B0E12] p-4 overflow-hidden">
                        {/* Neon gradient glow border */}
                        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#00E5FF] via-[#FF2D96] to-[#00E5FF] opacity-30 blur-sm"></div>
                        <div className="absolute inset-[2px] rounded-lg bg-[#0B0E12]"></div>
                        
                        {/* Scrolling text container */}
                        <div className="relative h-32 overflow-y-auto overflow-x-hidden">
                          <div className="p-3">
                            <div className="text-sm font-mono text-[#E5E7EB] whitespace-pre-wrap break-words leading-relaxed">
                              {streamingText}
                              <span className="inline-block w-1.5 h-3 bg-[#00E5FF] animate-pulse ml-1"></span>
                            </div>
                          </div>
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
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-white">📊 Analysis Results</h2>
                <button
                  onClick={() => {
                    setExamResults(null);
                    setExamFiles([]);
                  }}
                  className="rounded-lg bg-[#1A1F2E] px-4 py-2 text-sm text-[#E5E7EB] hover:bg-[#2B3140] transition-colors"
                >
                  Analyze New Exams
                </button>
              </div>
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

