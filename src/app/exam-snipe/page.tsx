"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveSubjectData, StoredSubjectData } from "@/utils/storage";

// PDF.js will be dynamically imported only on client-side

export default function ExamSnipePage() {
  const router = useRouter();

  // Prevent SSR to avoid PDF.js DOMMatrix issues
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#0F1216] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF] mx-auto mb-4"></div>
          <p>Loading Exam Snipe...</p>
        </div>
      </div>
    );
  }
  const [examFiles, setExamFiles] = useState<File[]>([]);
  const [examAnalyzing, setExamAnalyzing] = useState(false);
  const [examResults, setExamResults] = useState<any>(null);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [selectedSubConcept, setSelectedSubConcept] = useState<{conceptIndex: number, subConceptIndex: number} | null>(null);
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [progress, setProgress] = useState(0);
  const [streamingText, setStreamingText] = useState<string>("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [manualTexts, setManualTexts] = useState<Array<{name: string, text: string}>>([]);
  const [currentTextName, setCurrentTextName] = useState("");
  const [currentTextContent, setCurrentTextContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamContainerRef = useRef<HTMLDivElement>(null);

  // Extract text from PDF file client-side
  async function extractTextFromPdf(file: File): Promise<string> {
    try {
      // Dynamically import PDF.js only on client-side
      const pdfjsLib = await import('pdfjs-dist');

      // Configure worker only on client-side
      if (typeof window !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      }

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;

      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }

      return fullText.trim();
    } catch (error) {
      console.error(`Error extracting text from ${file.name}:`, error);
      return `Error extracting text from ${file.name}: ${error}`;
    }
  }

  // Auto-scroll to bottom when streaming text updates
  useEffect(() => {
    if (streamContainerRef.current) {
      streamContainerRef.current.scrollTop = streamContainerRef.current.scrollHeight;
    }
  }, [streamingText]);

  async function handleExamSnipe() {
    if (examFiles.length === 0) return;
    
    let animationId: number | null = null;
    let shimmerAnimation: number | null = null;

    try {
      setExamAnalyzing(true);
      setProgress(0);
      setStreamingText("");

      // Dynamic progress based on streaming data
      let streamStartTime: number | null = null;
      
      console.log('=== FRONTEND: EXTRACTING TEXT FROM FILES ===');
      console.log(`Processing ${examFiles.length} files:`);
      examFiles.forEach((file, i) => {
        console.log(`  File ${i + 1}: ${file.name} (${file.size} bytes, ${file.type})`);
      });

      // Extract text from all PDFs client-side
      console.log('Starting client-side text extraction...');
      const examTexts: Array<{name: string, text: string}> = [];

      for (let i = 0; i < examFiles.length; i++) {
        const file = examFiles[i];
        console.log(`Extracting text from ${file.name}...`);

        let extractedText = '';
        if (file.type === 'application/pdf') {
          extractedText = await extractTextFromPdf(file);
        } else if (file.type.startsWith('text/')) {
          extractedText = await file.text();
        } else {
          extractedText = `Unsupported file type: ${file.name}`;
        }

        examTexts.push({
          name: file.name,
          text: extractedText
        });

        console.log(`✓ Extracted ${extractedText.length} characters from ${file.name}`);
      }

      console.log(`=== FRONTEND: SENDING EXTRACTED TEXT ===`);
      console.log(`Sending ${examTexts.length} text entries to API...`);

      const res = await fetch('/api/exam-snipe-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examsText: examTexts }),
      });

      console.log(`Response status: ${res.status}`);
      console.log(`Response ok: ${res.ok}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Response error text:', errorText);
        throw new Error('Failed to analyze exams');
      }

      // PDF parsing complete, AI processing starting
      setProgress(20);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let chunkCount = 0;

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
                console.log('=== FRONTEND RECEIVED ===');
                console.log('Type:', parsed.type);
                if (parsed.type === 'text') {
                  console.log('Content:', parsed.content);
                  fullText += parsed.content;
                  chunkCount++;
                  setStreamingText(fullText);
                  console.log('Streaming text updated:', fullText.length, 'chars');

                  // Structured progress based on AI response phases
                  // 0-20%: PDF parsing complete
                  // 20-40%: Reading and analyzing exam content
                  // 40-60%: Identifying patterns and grade requirements
                  // 60-80%: Extracting and categorizing concepts
                  // 80-95%: Generating detailed breakdowns
                  // 95-100%: Finalizing results

                  let streamProgress = 20; // Base after parsing
                  const content = fullText.toLowerCase();

                  if (content.includes('grade') || content.includes('requirement')) {
                    streamProgress = 45; // Found grade analysis
                  } else if (content.includes('pattern') || content.includes('consistent')) {
                    streamProgress = 50; // Found pattern analysis
                  } else if (content.includes('concept') || content.includes('method')) {
                    streamProgress = 65; // Started concept extraction
                  } else if (content.includes('frequency') || content.includes('points')) {
                    streamProgress = 80; // Analyzing frequencies/points
                  } else if (content.includes('detail') || content.includes('breakdown')) {
                    streamProgress = 90; // Creating detailed breakdowns
                  } else {
                    // Incremental progress based on chunk count
                    streamProgress = Math.min(40, 20 + (chunkCount * 1.5));
                  }

                  setProgress(Math.min(95, streamProgress));

                } else if (parsed.type === 'done') {
                  console.log('Analysis complete! Data keys:', Object.keys(parsed.data || {}));
                  console.log('Concepts found:', parsed.data?.concepts?.length || 0);
                  setExamResults(parsed.data);
                  setProgress(100);
                } else if (parsed.type === 'error') {
                  console.error('AI returned error:', parsed.error);
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
      
      // Clean up animations
      if (animationId) cancelAnimationFrame(animationId);
      if (shimmerAnimation) cancelAnimationFrame(shimmerAnimation);
      setProgress(100);
    } catch (err: any) {
      console.error('Exam analysis error:', err);
      alert(err?.message || 'Failed to analyze exams');
      
      // Clean up animations on error
      if (animationId) cancelAnimationFrame(animationId);
      if (shimmerAnimation) cancelAnimationFrame(shimmerAnimation);
    } finally {
      setExamAnalyzing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-4xl px-6 py-20">
        {!examResults ? (
          <>
            {!examAnalyzing ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
                <div className="text-center max-w-2xl">
                  <h2 className="text-3xl font-bold text-[var(--foreground)] mb-4">Exam Snipe</h2>
                  <p className="text-lg text-[var(--foreground)]/70 leading-relaxed">
                    Upload your old exams and let AI analyze them to find the highest-value concepts to study.
                    Discover which topics appear most frequently and give you the best return on study time.
                  </p>
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
                    <div className="text-[var(--foreground)]/70 text-lg">
                      Click here or drop all the old exams
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-[#00E5FF] font-semibold text-lg mb-4">{examFiles.length} file(s) selected</div>
                      {examFiles.map((f, i) => (
                        <div key={i} className="text-[var(--foreground)] text-sm">
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
                    <div className="text-lg font-semibold text-[var(--foreground)] mb-1">Analyzing Exams...</div>
                    <div className="text-sm text-[var(--foreground)]/70">This can take up to 1 minute</div>
                  
                  {/* Streaming AI output */}
                  {streamingText && (
                    <div className="mt-6 w-[28rem] mx-auto">
                      <div className="text-xs font-semibold text-[var(--foreground)]/70 mb-2 text-center">AI Processing:</div>
                      <div className="relative rounded-lg overflow-hidden h-20 bg-gradient-to-b from-[var(--background)] via-[var(--background)]/80 to-[var(--background)]">
                        {/* Content */}
                        <div className="relative p-4 h-full flex flex-col justify-end">
                          <div className="text-sm font-mono whitespace-pre-wrap break-words leading-relaxed text-left">
                            {(() => {
                              const lines = streamingText.split('\n').filter(line => line.trim());
                              const recentLines = lines.slice(-3); // Show only last 3 lines

                              return recentLines.map((line, i) => {
                                const isCurrentLine = i === recentLines.length - 1;
                                // Always render gradient text
                                const gradientText = 'bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] bg-clip-text text-transparent';

                                return (
                                  <div key={i} className={gradientText}>
                                    {line}
                                    {isCurrentLine && (
                                      <span className="inline-block w-1.5 h-3 bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-pulse ml-1"></span>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                        {/* Fixed blur overlay - now blurs the TOP */}
                        <div className="absolute top-0 left-0 right-0 h-12 pointer-events-none backdrop-blur-md"></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Analysis Results Header */}
            <div className="mb-6 rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[var(--foreground)]">Analysis Results</h2>
                <button
                  onClick={() => {
                    setExamResults(null);
                    setExamFiles([]);
                  }}
                  className="rounded-lg bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80 transition-colors border border-[var(--accent-cyan)]/20"
                >
                  Analyze New Exams
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-xs text-[var(--foreground)]/70 mb-1">Exams Analyzed</div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">{examResults.totalExams}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--foreground)]/70 mb-1">Concepts Found</div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">{examResults.concepts.length}</div>
                </div>
              </div>

              {examResults.gradeInfo && (
                <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20 mb-4">
                  <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Grade Requirements</div>
                  <div className="text-sm text-[var(--foreground)]">{examResults.gradeInfo}</div>
                </div>
              )}

              {examResults.patternAnalysis && (
                <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20">
                  <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Pattern Analysis</div>
                  <div className="text-sm text-[var(--foreground)] leading-relaxed">
                    {examResults.patternAnalysis}
                  </div>
                </div>
              )}
            </div>

            {/* Results List */}
            <div className="space-y-3">
              {examResults.concepts.map((concept: any, i: number) => (
                <div key={i} className="rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 overflow-hidden">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[var(--background)]/80 transition-colors"
                    onClick={() => setExpandedConcept(expandedConcept === i ? null : i)}
                  >
                    <span className={`flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold border ${
                      i === 0 ? 'bg-[var(--background)]/80 text-[#FFD700] border-yellow-500/50' :
                      i === 1 ? 'bg-[var(--background)]/80 text-[#C0C0C0] border-gray-400/50' :
                      i === 2 ? 'bg-[var(--background)]/80 text-[#CD7F32] border-orange-500/50' :
                      'bg-[var(--background)]/80 text-[var(--foreground)]/70 border-[var(--accent-cyan)]/30'
                    }`}>
                      {i + 1}
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[var(--foreground)] text-sm">{concept.name}</div>
                      <div className="text-xs text-[var(--foreground)]/70 mt-1">
                        {concept.frequency}/{examResults.totalExams} exams • {concept.estimatedTime} study time • {concept.avgPoints}
                      </div>
                    </div>
                    
                    
                    <div className="flex-shrink-0 text-[var(--foreground)]/50">
                      {expandedConcept === i ? '▼' : '▶'}
                    </div>
                  </div>
                  
                  {expandedConcept === i && concept.details && (
                    <div className="border-t border-[var(--accent-cyan)]/20 bg-[var(--background)]/40 p-4">
                      <div className="text-xs font-semibold text-[var(--foreground)]/70 mb-3">Key Concepts to Learn:</div>
                      <div className="grid gap-3">
                        {concept.details.map((detail: any, di: number) => (
                          <div
                            key={di}
                            className="bg-[var(--background)]/50 rounded-lg p-3 border border-[var(--accent-cyan)]/20 hover:bg-[var(--background)]/70 cursor-pointer transition-colors"
                            onClick={() => setSelectedSubConcept({ conceptIndex: i, subConceptIndex: di })}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-[var(--foreground)] text-sm mb-1">{detail.name}</div>
                                <div className="text-xs text-[var(--foreground)] leading-relaxed mb-2">{detail.description}</div>
                                <div className="text-xs text-[var(--foreground)]/70 italic">
                                  Example: {detail.example}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  detail.difficulty === 'beginner' ? 'bg-green-500/20 text-green-400' :
                                  detail.difficulty === 'intermediate' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {detail.difficulty}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  detail.priority === 'high' ? 'bg-blue-500/20 text-blue-400' :
                                  detail.priority === 'medium' ? 'bg-gray-500/20 text-gray-400' :
                                  'bg-purple-500/20 text-purple-400'
                                }`}>
                                  {detail.priority} priority
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Study Strategy */}
            <div className="mt-6 rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 p-6">
              <h3 className="text-base font-semibold text-[var(--foreground)] mb-3">Study Strategy</h3>
              <p className="text-sm text-[var(--foreground)] mb-4">
                Focus on concepts that appear frequently across exams.
                These are the most important topics to master for your course.
              </p>
              <div className="text-sm text-[var(--foreground)]/70">
                <strong>Top 3 priorities:</strong> Start with concepts ranked 1-3 above.
                These appear frequently, especially in recent exams, making them the most efficient targets.
              </div>
            </div>

            {/* Footer Tips */}
            <div className="mt-4 rounded-lg bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20 p-4">
              <div className="text-xs text-[var(--foreground)]/70">
                <strong className="text-[var(--foreground)]">Pro Tips:</strong><br/>
                • Start with top-ranked concepts for maximum efficiency<br/>
                • High frequency concepts are more likely to appear again<br/>
                • Balance concept frequency with your current knowledge level
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sub-Concept Details Modal */}
      {selectedSubConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/95 backdrop-blur-sm p-6">
            {(() => {
              const concept = examResults.concepts[selectedSubConcept.conceptIndex];
              const subConcept = concept.details[selectedSubConcept.subConceptIndex];

              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">{subConcept.name}</h3>
                    <button
                      onClick={() => setSelectedSubConcept(null)}
                      className="text-[var(--foreground)]/70 hover:text-[var(--foreground)] text-xl"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        subConcept.difficulty === 'beginner' ? 'bg-green-500/20 text-green-400' :
                        subConcept.difficulty === 'intermediate' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {subConcept.difficulty}
                      </span>
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        subConcept.priority === 'high' ? 'bg-blue-500/20 text-blue-400' :
                        subConcept.priority === 'medium' ? 'bg-gray-500/20 text-gray-400' :
                        'bg-purple-500/20 text-purple-400'
                      }`}>
                        {subConcept.priority} priority
                      </span>
                    </div>

                    <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20">
                      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">What to Learn:</h4>
                      <p className="text-sm text-[var(--foreground)] leading-relaxed">{subConcept.description}</p>
                    </div>

                    <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20">
                      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">Example:</h4>
                      <p className="text-sm text-[var(--foreground)]/70 italic">{subConcept.example}</p>
                    </div>

                    <div className="rounded-lg bg-[var(--background)]/60 p-4 border border-[var(--accent-cyan)]/20">
                      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">Technical Components:</h4>
                      <div className="space-y-3">
                        <div className="text-sm text-[var(--foreground)] leading-relaxed">
                          {subConcept.description}
                        </div>

                        <div>
                          <div className="text-xs font-medium text-[var(--foreground)]/70 mb-2">Key Skills to Master:</div>
                          <div className="flex flex-wrap gap-1">
                            {(subConcept.components || 'implementation, application, problem-solving').split(', ').map((component: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-[#00E5FF]/10 border border-[#00E5FF]/30 rounded text-xs text-[#00E5FF] font-medium"
                              >
                                {component.trim()}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Difficulty/Priority already shown in header, avoid duplication */}

                        {subConcept.learning_objectives && (
                          <div>
                            <div className="text-xs font-medium text-[#FFD700] mb-2">Learning Objectives:</div>
                            <ul className="text-xs text-[var(--foreground)] space-y-1 list-disc list-inside">
                              {subConcept.learning_objectives.split(', ').map((objective: string, idx: number) => (
                                <li key={idx}>{objective}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {subConcept.common_pitfalls && (
                          <div>
                            <div className="text-xs font-medium text-[#FF6B6B] mb-2">Common Pitfalls:</div>
                            <ul className="text-xs text-[var(--foreground)] space-y-1 list-disc list-inside">
                              {subConcept.common_pitfalls.split(', ').map((pitfall: string, idx: number) => (
                                <li key={idx}>{pitfall}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="text-xs text-[var(--foreground)]/70">
                          Exam frequency: appeared in {examResults.totalExams} exam(s)
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--accent-cyan)]/20">
                      <button
                        onClick={() => setSelectedSubConcept(null)}
                        className="rounded-lg border border-[var(--accent-cyan)]/20 bg-[var(--background)]/60 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/80"
                      >
                        Close
                      </button>
                      <button
                        disabled={generatingLesson}
                        onClick={async () => {
                          if (!selectedSubConcept) return;
                          try {
                            setGeneratingLesson(true);
                            const concept = examResults.concepts[selectedSubConcept.conceptIndex];
                            const sub = concept.details[selectedSubConcept.subConceptIndex];

                            const res = await fetch('/api/exam-generate-lesson', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                conceptName: concept.name,
                                subConceptName: sub.name,
                                description: sub.description,
                                example: sub.example,
                                components: sub.components,
                                learning_objectives: sub.learning_objectives,
                                common_pitfalls: sub.common_pitfalls,
                              })
                            });

                            const json = await res.json();
                            if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to generate lesson');

                            // Create temporary subject and navigate to familiar lesson page
                            const slug = `exam-lesson-${Date.now()}`;
                            const topic = sub.name;
                            const data: StoredSubjectData = {
                              subject: 'Exam Snipe Lessons',
                              course_context: '',
                              combinedText: '',
                              topics: [],
                              nodes: {
                                [topic]: {
                                  overview: `Lesson generated from Exam Snipe analysis for: ${topic}`,
                                  symbols: [],
                                  lessonsMeta: [{ type: 'Generated Lesson', title: topic }],
                                  lessons: [{ title: topic, body: json.data.body || '', quiz: json.data.quiz || [] }],
                                  rawLessonJson: [JSON.stringify(json.data)]
                                }
                              },
                              files: [],
                              progress: {},
                            };

                            saveSubjectData(slug, data);
                            setSelectedSubConcept(null);
                            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
                          } catch (e: any) {
                            alert(e?.message || 'Failed to generate lesson');
                          } finally {
                            setGeneratingLesson(false);
                          }
                        }}
                        className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
                      >
                        {generatingLesson ? 'Generating…' : 'Start Learning'}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

