"use client";

import { useEffect, useMemo, useRef, useState, use, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import GlowSpinner from "@/components/GlowSpinner";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import { extractQuizSection } from "@/lib/lessonFormat";
import WordPopover from "@/components/WordPopover";
import VideoModal from "@/components/VideoModal";
import { ensureClosedMarkdownFences } from "@/lib/markdownFences";
import {
  loadSubjectData,
  StoredSubjectData,
  getLastSurgeSession,
  getSurgeLog,
  addSurgeLogEntryAsync,
  updateOrAddSurgeLogEntryAsync,
  saveSubjectDataAsync,
  SurgeLogEntry,
} from "@/utils/storage";
import { buildQuizJsonInstruction } from "@/utils/surgeQuizPrompts";

type SurgeQuizQuestion = {
  id: string;
  question: string;
  type: "mc" | "short";
  stage: "mc" | "harder" | "review";
  options?: string[];
  correctOption?: string;
  explanation?: string;
  modelAnswer?: string;
};

type SurgeQuizResponse = {
  answer: string;
  isCorrect: boolean | null;
  correctAnswer?: string;
  explanation?: string;
  modelAnswer?: string;
  stage: "mc" | "harder" | "review";
  score: number;
  submittedAt: number;
  assessment?: string;
  whatsGood?: string;
  whatsBad?: string;
  enhancedExplanation?: string;
  checked?: boolean;
};

function createQuizQuestionId(prefix: string, question: string) {
  let hash = 0;
  for (let i = 0; i < question.length; i++) {
    hash = (hash << 5) - hash + question.charCodeAt(i);
    hash |= 0;
  }
  return `${prefix}-${Math.abs(hash)}`;
}

function stableTextHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function extractSurgeQuizQuestionsFromText(text: string): SurgeQuizQuestion[] {
  const questions: SurgeQuizQuestion[] = [];
  const seen = new Set<string>();
  const pushUnique = (question: SurgeQuizQuestion) => {
    if (!question.id) return;
    if (seen.has(question.id)) return;
    seen.add(question.id);
    questions.push(question);
  };

  const blockRegex = /◊(MC|SA):([\s\S]*?)◊/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const typeTag = match[1].toUpperCase();
    const body = match[2].trim();
    if (!body) continue;

    if (typeTag === "MC") {
      const segments = body.split("||").map((s) => s.trim()).filter(Boolean);
      if (segments.length === 0) continue;
      const questionAndOptions = segments[0];
      const correctSegment = segments.find((s) => s.toUpperCase().startsWith("CORRECT"));
      const explanationSegment = segments.find((s) => s.toUpperCase().startsWith("EXPLANATION"));
      const correctLetter = correctSegment?.split(":")[1]?.trim().charAt(0).toUpperCase() || "";
      const explanation = explanationSegment?.split(":").slice(1).join(":").trim() || "";
      const firstOptionIdx = questionAndOptions.indexOf("A)");
      const questionText =
        firstOptionIdx >= 0
          ? questionAndOptions.slice(0, firstOptionIdx).trim()
          : questionAndOptions.trim();
      if (!questionText) continue;

      const optionMatches = Array.from(
        questionAndOptions.matchAll(/([A-D])\)\s*([^A-D]+?)(?=\s*[A-D]\)|$)/g)
      );
      const options = optionMatches.map((opt) => opt[2].trim()).filter(Boolean);
      if (options.length === 0) continue;
      const id = createQuizQuestionId("mc", questionText);

      pushUnique({
        id,
        question: questionText,
        type: "mc",
        stage: "mc",
        options: options.slice(0, 4),
        correctOption: correctLetter || undefined,
        explanation,
      });
    } else if (typeTag === "SA") {
      const segments = body.split("||").map((s) => s.trim()).filter(Boolean);
      if (segments.length === 0) continue;
      const questionText = segments[0];
      const modelSegment = segments.find((s) => s.toUpperCase().startsWith("MODEL_ANSWER"));
      const explanationSegment = segments.find((s) => s.toUpperCase().startsWith("EXPLANATION"));
      if (!questionText) continue;
      const modelAnswer = modelSegment?.split(":").slice(1).join(":").trim() || "";
      const explanation = explanationSegment?.split(":").slice(1).join(":").trim() || "";
      const id = createQuizQuestionId("sa", questionText);

      pushUnique({
        id,
        question: questionText,
        type: "short",
        stage: "harder",
        modelAnswer,
        explanation,
      });
    }
  }

  // Attempt to parse JSON payloads embedded in the text
  const jsonQuestions = extractQuizQuestionsFromJson(text);
  jsonQuestions.forEach(pushUnique);

  return questions;
}

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  hidden?: boolean;
  isLoading?: boolean;
  autoGenerated?: boolean; // For auto-triggered messages that shouldn't be shown
};

type ParsedAction = {
  name: string;
  params: Record<string, string>;
};

type PracticeLogEntry = {
  id: string;
  timestamp: number;
  topic: string;
  question: string;
  answer: string;
  assessment: string;
  grade: number;
};

type SurgePhase = "repeat" | "learn" | "quiz" | "complete";

const PRACTICE_LOG_PREFIX = "atomicPracticeLog:";

const TOPIC_SUGGESTION_TARGET = 4;
const MIN_TOPIC_SUGGESTIONS = TOPIC_SUGGESTION_TARGET;

// Removed page splitting - lessons are now displayed as single continuous documents

function extractTopicSuggestions(text: string, requiredCount = TOPIC_SUGGESTION_TARGET): string[] {
  const uniqueTopics: string[] = [];
  const normalizedSeen = new Set<string>();

  const recordTopic = (raw?: string | null) => {
    if (!raw) return false;
    let topic = raw
      .replace(/^[-•]\s*/, "")
      .replace(/[`*"_]/g, "")
      .trim();
    if (!topic) return false;
    topic = topic.replace(/^[0-9]+\.\s*/, "").trim();
    if (!topic) return false;

    // Normalize for duplicate detection (preserve original topic text)
    const normalized = topic.toLowerCase()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim();
    
    if (!normalized || normalizedSeen.has(normalized)) {
      return false;
    }
    
    normalizedSeen.add(normalized);
    uniqueTopics.push(topic);
    return true;
  };

  // Quick check - if text doesn't contain TOPIC_SUGGESTION, skip parsing
  if (!text.includes('TOPIC') && !text.includes('SUGGESTION')) {
    return [];
  }

  // Extract topics - match topics that have newlines OR are at the end of string
  // This handles both complete topics (with newlines) and the last topic (might not have newline)
  // Make regex flexible to handle variations: TOPIC_SUGGESTION, TOPIC SUGGESTION, TOPIC-SUGGESTION
  // And handle both : and - as separators
  const suggestionRegex = /TOPIC[_\s-]*SUGGESTION\s*[:\-]\s*([^\r\n]+?)(?:\r?\n|$)/gi;
  const matches = Array.from(text.matchAll(suggestionRegex));
  
  // Process all matches, but only take unique topics up to requiredCount
  for (const match of matches) {
    const topicText = match[1];
    // Only process if it's a valid topic (not empty, not just whitespace)
    if (topicText && topicText.trim()) {
      const added = recordTopic(topicText);
      if (added && uniqueTopics.length >= requiredCount) {
        break;
      }
    }
  }

  const finalTopics = uniqueTopics.slice(0, requiredCount);
  
  // Only log when we actually find topics (not on every tiny chunk)
  if (finalTopics.length >= requiredCount) {
    console.log("✅ TOPIC SUGGESTIONS EXTRACTION COMPLETE:", {
      found: finalTopics.length,
      topics: finalTopics
    });
  }

  return finalTopics;
}

function sanitizeJsonPayload(raw: string): string {
  let str = raw.trim();
  if (!str) return "";
  if (str.startsWith("```")) {
    const firstBrace = str.indexOf("{");
    const lastBrace = str.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      str = str.slice(firstBrace, lastBrace + 1);
    }
  }
  const firstBrace = str.indexOf("{");
  const lastBrace = str.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    let jsonStr = str.slice(firstBrace, lastBrace + 1);
    // Remove trailing commas before closing brackets/braces (common JSON parsing issue)
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    // Fix invalid single backslash escape sequences that break JSON.parse,
    // e.g. "\_" or "\ " from markdown. Only keep valid JSON escapes.
    jsonStr = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return jsonStr;
  }
  return str;
}

function extractQuizQuestionsFromJson(raw: string): SurgeQuizQuestion[] {
  const cleaned = sanitizeJsonPayload(raw);
  if (!cleaned) {
    console.error("extractQuizQuestionsFromJson: cleaned payload is empty");
    return [];
  }
  let json: any;
  try {
    json = JSON.parse(cleaned);
  } catch (parseError) {
    console.error("extractQuizQuestionsFromJson: JSON parse error", parseError);
    return [];
  }
  const results: SurgeQuizQuestion[] = [];
  const mcArray: any[] = Array.isArray(json?.mc)
    ? json.mc
    : Array.isArray(json?.questions)
    ? json.questions
    : [];
  
  if (mcArray.length === 0) {
    console.warn("extractQuizQuestionsFromJson: No MC questions found in JSON", { 
      hasMc: !!json?.mc, 
      hasQuestions: !!json?.questions,
      jsonKeys: Object.keys(json || {})
    });
  }
  
  mcArray.forEach((item, idx) => {
    const question = (item?.question ?? "").toString().trim();
    const optionsRaw: any[] = Array.isArray(item?.options) ? item.options : [];
    const options = optionsRaw.map((opt) => {
      let text = (opt ?? "").toString().trim();
      // Remove letter prefixes like "A) ", "B) ", "AA) ", "BB) ", etc. if they exist
      // Matches any combination of letters followed by ) and optional whitespace
      text = text.replace(/^[A-Z]+\s*\)\s*/i, "");
      // Also remove if it's just a single letter followed by period or colon
      text = text.replace(/^[A-Z]\s*[\.:]\s*/i, "");
      return text;
    }).filter(Boolean).slice(0, 4);
    
    const correctOptionRaw = (item?.correctOption ?? item?.correct ?? item?.answer ?? "").toString().trim();
    const correctOption = correctOptionRaw ? correctOptionRaw.charAt(0).toUpperCase() : "";
    const explanation = (item?.explanation ?? "").toString().trim();
    
    if (!question) {
      console.warn(`extractQuizQuestionsFromJson: Question ${idx} has no question text`);
      return;
    }
    if (options.length < 2) {
      console.warn(`extractQuizQuestionsFromJson: Question ${idx} has insufficient options`, { 
        optionsCount: options.length, 
        optionsRawCount: optionsRaw.length,
        question: question.substring(0, 50)
      });
      return;
    }
    if (!correctOption) {
      console.warn(`extractQuizQuestionsFromJson: Question ${idx} has no correct option`, { 
        correctOptionRaw,
        question: question.substring(0, 50)
      });
      return;
    }
    
    results.push({
      id: createQuizQuestionId("mc", question + idx),
      question,
      type: "mc",
      stage: "mc",
      options,
      correctOption,
      explanation,
    });
  });
  const shortArray: any[] = Array.isArray(json?.short) ? json.short : [];
  shortArray.forEach((item, idx) => {
    const question = (item?.question ?? "").toString().trim();
    const modelAnswer = (item?.modelAnswer ?? item?.answer ?? "").toString().trim();
    const explanation = (item?.explanation ?? "").toString().trim();
    if (!question || !modelAnswer) {
      return;
    }
    results.push({
      id: createQuizQuestionId("sa", question + idx),
      question,
      type: "short",
      stage: "harder",
      modelAnswer,
      explanation,
    });
  });
  return results;
}

function parseQuizJson(raw: string, stage: "mc" | "harder"): SurgeQuizQuestion[] {
  const questions = extractQuizQuestionsFromJson(raw);
  if (!questions.length) {
    console.error("Surge quiz JSON parse failed; raw payload:", raw?.slice?.(0, 4000) ?? raw);
    // Try to parse and see what we got
    try {
      const cleaned = sanitizeJsonPayload(raw);
      if (cleaned) {
        const json = JSON.parse(cleaned);
        console.error("Parsed JSON structure:", {
          hasMc: !!json?.mc,
          mcLength: Array.isArray(json?.mc) ? json.mc.length : 0,
          hasQuestions: !!json?.questions,
          questionsLength: Array.isArray(json?.questions) ? json.questions.length : 0,
          keys: Object.keys(json || {}),
          firstMcItem: Array.isArray(json?.mc) && json.mc.length > 0 ? {
            hasQuestion: !!json.mc[0]?.question,
            hasOptions: !!json.mc[0]?.options,
            optionsLength: Array.isArray(json.mc[0]?.options) ? json.mc[0].options.length : 0,
            hasCorrectOption: !!json.mc[0]?.correctOption,
            correctOption: json.mc[0]?.correctOption
          } : null
        });
      }
    } catch (e) {
      console.error("Failed to parse JSON for debugging:", e);
    }
    throw new Error("Empty quiz payload");
  }
  
  // Filter by stage
  let filtered = questions.filter((q) => q.stage === stage);
  
  // If we requested MC but got no MC questions, check if we got short questions
  // In this case, we'll use them as harder questions instead (since short questions are harder)
  if (stage === "mc" && filtered.length === 0) {
    const shortQuestions = questions.filter((q) => q.type === "short" || q.stage === "harder");
    if (shortQuestions.length > 0) {
      console.warn("Received short answer questions when MC was requested. Using them as harder questions instead.");
      // Return them as harder questions - the caller can handle this
      return shortQuestions;
    }
  }
  
  // If we requested harder but got MC questions, that's fine - just return what we got
  if (stage === "harder" && filtered.length === 0) {
    const mcQuestions = questions.filter((q) => q.type === "mc" || q.stage === "mc");
    if (mcQuestions.length > 0) {
      console.warn("Received MC questions when harder was requested. Using them anyway.");
      return mcQuestions;
    }
  }
  
  return filtered;
}

function buildSurgeContext(
  slug: string,
  data: StoredSubjectData | null,
  practiceLog: PracticeLogEntry[],
  lastSurge: SurgeLogEntry | null,
  examSnipeData: string | null,
  phase: SurgePhase,
  currentTopic: string
): string {
  const courseLanguageName =
    data?.course_language_name ||
    (data?.course_language_code
      ? data.course_language_code.toUpperCase()
      : null);

  const lines: string[] = [];
  const courseName = data?.subject || slug;

  lines.push(`SURGE MODE ACTIVE FOR COURSE "${courseName}" (slug: ${slug})`);
  lines.push("");
  
  if (phase === "repeat") {
    lines.push("CURRENT PHASE: REPEAT - Testing understanding of previously learned topics");
    lines.push("");
    if (lastSurge) {
      lines.push("TOPICS FROM LAST SURGE SESSION:");
      const topicsToRepeat = [
        ...lastSurge.repeatedTopics.map(rt => rt.topic),
        lastSurge.newTopic
      ];
      topicsToRepeat.forEach(topic => {
        lines.push(`• ${topic}`);
      });
      lines.push("");
      lines.push("INSTRUCTIONS:");
      lines.push("- Generate focused quiz questions (at least 3 per topic) that test the most fundamental and important parts");
      lines.push("- Questions must be DIFFERENT from previous questions asked about these topics");
      lines.push("- Focus on understanding and implementation of core concepts");
      lines.push("- Test the most important aspects that the user needs to remember");
    } else {
      lines.push("FIRST SURGE SESSION - No previous topics to repeat");
      lines.push("Skip to LEARN phase or ask general course overview questions");
    }
  } else if (phase === "learn") {
    lines.push("CURRENT PHASE: LEARN - Suggesting and teaching a new topic");
    lines.push("");
    if (!currentTopic) {
      lines.push("INITIAL STEP - TOPIC SELECTION:");
      lines.push("- CRITICAL: You MUST use the COURSE CONTEXT section below (course files, course summary, available topics)");
      lines.push("- Analyze what topics have been covered in previous Surge sessions");
      lines.push("- Check exam snipe analysis for high-priority concepts FROM THIS COURSE");
      lines.push("- Review course material topics from the COURSE CONTEXT section");
      lines.push("- Suggest exactly 4 topics that would provide maximum study value FOR THIS SPECIFIC COURSE");
      lines.push("- Prioritize: (1) Exam snipe concepts not yet covered, (2) Course topics not yet learned");
      lines.push("- CRITICAL: Use the exact concept names from EXAM SNIPE ANALYSIS or the course topics list. Do NOT output broad categories (e.g., 'Machine Learning overview'). Pick actionable, exam-ready topics (e.g., 'Naiv Bayesiansk Klassificering').");
      lines.push("- ALL topic suggestions MUST be relevant to this course and based on the course context provided");
      if (courseLanguageName) {
        lines.push(`- LANGUAGE REQUIREMENT: Output all topic names exactly as they appear in ${courseLanguageName} (the course language). Do NOT translate them into any other language.`);
      }
      lines.push("");
      lines.push("CRITICAL OUTPUT REQUIREMENTS:");
      lines.push("- You MUST return four distinct topics. Invent closely-related subtopics if needed to ensure there are four.");
      lines.push("- Your ENTIRE response must be EXACTLY these 4 lines (copy this format exactly):");
      lines.push("TOPIC_SUGGESTION: Topic Name 1");
      lines.push("TOPIC_SUGGESTION: Topic Name 2");
      lines.push("TOPIC_SUGGESTION: Topic Name 3");
      lines.push("TOPIC_SUGGESTION: Topic Name 4");
      lines.push("");
      lines.push("ABSOLUTE RULES:");
      lines.push("- If you can only find 3 concepts, split the most important one into two high-value subtopics so you still output 4 lines.");
      lines.push("- DO NOT use dashes, bullets, or any other formatting");
      lines.push("- DO NOT write ANY text before the first TOPIC_SUGGESTION line");
      lines.push("- DO NOT write ANY text after the last TOPIC_SUGGESTION line");
      lines.push("- DO NOT write introductions, explanations, questions, or commentary");
      lines.push("- DO NOT say 'here are the topics' or 'I suggest' or anything similar");
      lines.push("- START your response immediately with 'TOPIC_SUGGESTION:' (no spaces before it)");
      lines.push("- Each line must start with 'TOPIC_SUGGESTION: ' followed by the topic name");
      lines.push("- Use exactly this format: 'TOPIC_SUGGESTION: [topic name]' on each line");
      lines.push("- NO dashes, NO bullets, NO markdown formatting - just the 4 TOPIC_SUGGESTION lines");
      lines.push("- If you write anything other than the 4 TOPIC_SUGGESTION lines, it will break the system");
    } else {
      // LEARN phase teaching prompt (Surge) – use same prompt as normal lessons
      lines.push("You produce ONE comprehensive GitHub Flavored Markdown lesson that teaches the assigned topic from zero knowledge to problem-solving ability.");
      lines.push("");
      lines.push("LENGTH:");
      lines.push("- Minimum 3000 words of prose (explanations only). Target 4000–6000 if needed for full understanding.");
      lines.push("- Do not count code blocks, LaTeX delimiters, JSON, or formatting.");
      lines.push("- No filler. Use real explanatory depth.");
      lines.push("");
      lines.push("OUTPUT:");
      lines.push("- Output a single Markdown document only.");
      lines.push("- Do NOT include any JSON metadata block.");
      lines.push("- Just write the lesson content directly in Markdown.");
      lines.push("");
      lines.push("MARKDOWN RULES:");
      lines.push("- Use headings: #, ##, ### only.");
      lines.push("- Use blank lines around headings, lists, tables, code fences, and display math.");
      lines.push("- Tables must use pipe-syntax.");
      lines.push("- Code fences must specify language and be runnable.");
      lines.push("- Math uses inline $...$ and display \\[ ... \\]. No environments (align etc.).");
      lines.push("- No links, images, Mermaid, or HTML.");
      lines.push("");
      lines.push("PEDAGOGY:");
      lines.push("- Assume zero prior knowledge. Define all symbols and notation when first used.");
      lines.push("- Structure adaptively depending on the topic. No rigid template.");
      lines.push("- Build from intuition → formal definitions → deeper understanding → applications.");
      lines.push("- Include multiple worked examples if they genuinely help the topic. Each example must be complete and step-by-step.");
      lines.push("");
      lines.push("SYMBOL TABLE:");
      lines.push("- At the very bottom, create a small Markdown table listing symbols, notations, or short concepts ONLY if the lesson introduced non-obvious symbols that students must keep track of.");
      lines.push("");
      lines.push("SCOPE:");
      lines.push("- CRITICAL: Focus EXCLUSIVELY on the assigned topic. Do NOT teach other topics, even if they are related.");
      lines.push("- Do NOT introduce concepts from other topics in the course unless they are absolutely prerequisite and already covered.");
      lines.push("- If the topic is part of a larger subject, teach ONLY this specific topic in depth. Reference other topics only if necessary for context, but do not teach them.");
      lines.push("- If course_context mentions a specific practice question, emphasize the method relevant to that question while still covering the full topic.");
      lines.push("- Every example, explanation, and concept must directly relate to the assigned topic.");
      lines.push("");
      lines.push("LANGUAGE:");
      if (courseLanguageName) {
        lines.push(`- Write all metadata and prose in ${courseLanguageName}.`);
      } else {
        lines.push("- Write all metadata and prose in English.");
      }
      lines.push("");
      lines.push("FINAL RULE:");
      lines.push("- If the prose is under 3000 words when finished, extend explanations or add more depth until requirements are satisfied.");
      lines.push("");
      lines.push("SURGE MODE ACTIVE FOR COURSE \"" + courseName + "\"");
      lines.push("CURRENT PHASE: LEARN");
      lines.push("TEACHING TOPIC: " + currentTopic);
      lines.push("");
      lines.push("Use:");
      lines.push("• COURSE CONTEXT");
      lines.push("• COURSE FILES (first 20k chars)");
      lines.push("• AVAILABLE TOPICS");
      lines.push("• EXAM SNIPE ANALYSIS");
      lines.push("• PAST SURGE SESSIONS");
    }
  } else if (phase === "quiz") {
    lines.push("CURRENT PHASE: QUIZ - Testing the new topic");
    lines.push("");
    lines.push("INSTRUCTIONS FOR QUIZ GENERATION:");
    lines.push("- Generate exactly 5 multiple choice questions first (progressing from easy to hard, focusing on understanding and implementation)");
    lines.push("- Format each MC question EXACTLY as: ◊MC: Question text? A) Option 1 B) Option 2 C) Option 3 D) Option 4 || CORRECT: <letter> || EXPLANATION: <short explanation>◊");
    lines.push("- CORRECT must be the letter (A, B, C, D) for the right option, EXPLANATION must describe why it is correct");
    lines.push("- After 5 MC questions are answered, generate 4 harder questions (short answer or explanation)");
    lines.push("- Format each harder question EXACTLY as: ◊SA: Question text? || MODEL_ANSWER: <ideal answer> || EXPLANATION: <reasoning and steps>◊");
    lines.push("- MODEL_ANSWER should be a concise but complete solution; EXPLANATION should walk through the reasoning");
    lines.push("- Questions should test understanding of the topic just taught");
    lines.push("- Use ◊ delimiters for ALL questions");
  }

  lines.push("");
  lines.push("COURSE CONTEXT:");
  if (data?.course_context) {
    lines.push(data.course_context);
  } else {
    lines.push("No course summary available.");
  }
  lines.push("");
  lines.push("COURSE FILES (first 20k chars):");
  if (data?.combinedText) {
    lines.push(data.combinedText.slice(0, 20000));
    if (data.combinedText.length > 20000) {
      lines.push("");
      lines.push(`[Note: Course files content truncated. Total length: ${data.combinedText.length} chars]`);
    }
  } else {
    lines.push("No course files available.");
  }
  lines.push("");
  lines.push("AVAILABLE TOPICS:");
  if (data?.topics && data.topics.length > 0) {
    data.topics.forEach(topic => {
      lines.push(`• ${topic.name}${topic.summary ? ` - ${topic.summary}` : ""}`);
    });
  } else {
    lines.push("No topics available.");
  }
  lines.push("");
  lines.push("EXAM SNIPE ANALYSIS:");
  if (examSnipeData) {
    lines.push(examSnipeData);
  } else {
    lines.push("No exam snipe analysis available.");
  }
  lines.push("");
  lines.push("PAST SURGE SESSIONS:");
  if (lastSurge) {
    lines.push(lastSurge.summary);
  }
  if (practiceLog.length > 0) {
    lines.push("");
    lines.push("Practice log (last 20 entries):");
    practiceLog.slice(-20).forEach(entry => {
      lines.push(`[${entry.topic}] Q: ${entry.question} | A: ${entry.answer} | Grade: ${entry.grade}/10`);
    });
  }
  if (!lastSurge && practiceLog.length === 0) {
    lines.push("No past Surge sessions available.");
  }

  lines.push("");
  return lines.join("\n");
}

export default function SurgePage() {
  // In Next.js 16, useParams may return a Promise - unwrap it with use()
  // Store params in a variable first to avoid enumeration issues
  const paramsPromiseOrValue = useParams<{ slug: string }>();
  // If it's a Promise, unwrap it; otherwise use directly
  const params = paramsPromiseOrValue && typeof paramsPromiseOrValue === 'object' && 'then' in paramsPromiseOrValue
    ? use(paramsPromiseOrValue as unknown as Promise<{ slug: string }>)
    : (paramsPromiseOrValue as { slug: string } | undefined);
  const slug = params?.slug ?? "";
  const router = useRouter();

  const [data, setData] = useState<StoredSubjectData | null>(null);
  const [practiceLog, setPracticeLog] = useState<PracticeLogEntry[]>([]);
  const [examSnipeData, setExamSnipeData] = useState<string | null>(null);
  const [lastSurge, setLastSurge] = useState<SurgeLogEntry | null>(null);
  const [phase, setPhase] = useState<SurgePhase>("repeat");
  const [currentTopic, setCurrentTopic] = useState<string>("");
  const [isMounted, setIsMounted] = useState(false);
  // Try to resume existing in-progress session, or create new one
  const [sessionId] = useState<string>(() => {
    // Check if there's an in-progress session we should resume
    try {
      const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
      if (stored) {
        const data = JSON.parse(stored);
        const surgeLog = data?.surgeLog || [];
        // Find the most recent in-progress session (has "(In Progress)" in summary)
        const inProgress = surgeLog
          .filter((e: any) => e.summary && e.summary.includes("(In Progress)"))
          .sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
        if (inProgress) {
          console.log("Resuming existing in-progress session:", {
            sessionId: inProgress.sessionId,
            timestamp: inProgress.timestamp,
            date: new Date(inProgress.timestamp).toISOString()
          });
          return inProgress.sessionId;
        }
      }
    } catch (e) {
      console.error("Failed to check for existing session:", e);
    }
    // Create new session
    const newId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    console.log("Creating new session:", newId);
    return newId;
  });
  
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<ChatMessage[]>([]);
  const [surgeContext, setSurgeContext] = useState<string>("");
  const harderQuestionsRequested = useRef(false);
  const lastSavedQuizCount = useRef(0);
  const [sessionData, setSessionData] = useState<{
    repeatedTopics: Array<{
      topic: string;
      questions: Array<{ question: string; answer: string; grade: number }>;
      averageScore: number;
    }>;
    newTopic: string;
    newTopicLesson: string;
    quizResults: Array<{
      question: string;
      answer: string;
      grade: number;
      topic: string;
      correctAnswer?: string;
      explanation?: string;
      stage?: "mc" | "harder" | "review";
      modelAnswer?: string;
    }>;
    quizStageTransitions: Array<{ from: string; to: string; timestamp: number; topic: string }>;
    mcStageCompletedAt?: number;
  }>({
    repeatedTopics: [],
    newTopic: "",
    newTopicLesson: "",
    quizResults: [],
    quizStageTransitions: [],
  });
  const lastPersistedLessonSignatureRef = useRef<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [lastAssistantMessage, setLastAssistantMessage] = useState<string>("");
  
  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<SurgeQuizQuestion[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState<number>(0);
  const [shortAnswer, setShortAnswer] = useState<string>("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizFailureMessage, setQuizFailureMessage] = useState<string | null>(null);
  const [quizInfoMessage, setQuizInfoMessage] = useState<string | null>(null);
  const [quizResponses, setQuizResponses] = useState<Record<string, SurgeQuizResponse>>({});
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  
  const applyQuizQuestions = (
    newQuestions: SurgeQuizQuestion[],
    stage: "mc" | "harder" | "review",
    replace = false
  ): boolean => {
    if (!newQuestions.length) return false;
    
    // Add topic to each question if not already present
    const topicName = currentTopic || sessionData.newTopic || data?.subject || "Unknown Topic";
    const questionsWithTopic = newQuestions.map(q => ({
      ...q,
      topic: (q as any).topic || topicName,
    }));
    
    let added = false;
    let insertionIndex: number | null = null;
    let resetToFirstMc = false;
    let jumpToHarder = false;

    setQuizQuestions((prev) => {
      const prevLength = prev.length;
      if (stage === "mc" && (replace || prev.length === 0)) {
        added = true;
        insertionIndex = 0;
        resetToFirstMc = true;
        return questionsWithTopic;
      }
      const existingIds = new Set(prev.map((q) => q.id));
      const additions = questionsWithTopic.filter((q) => !existingIds.has(q.id));
      if (!additions.length) {
        added = prev.some((q) => q.stage === stage);
        return prev;
      }
      const hadStageQuestions = prev.some((q) => q.stage === stage);
      insertionIndex = prev.length;
      added = true;
      if (stage === "harder" && !hadStageQuestions) {
        jumpToHarder = true;
      }
      return [...prev, ...additions];
    });

    if (added) {
      setQuizLoading(false);
      setQuizInfoMessage(null);
      setQuizFailureMessage(null);
      setSending(false);
      if (stage === "harder") {
        harderQuestionsRequested.current = false;
      }
      if (stage === "harder" && jumpToHarder && insertionIndex !== null) {
        setCurrentQuizIndex(insertionIndex);
        setShortAnswer("");
      } else if (stage === "mc" && resetToFirstMc) {
        setCurrentQuizIndex(0);
        setShortAnswer("");
      }
    }

    return added;
  };

  // Word popover state
  const [explanationPosition, setExplanationPosition] = useState({ x: 0, y: 0 });
  const [explanationWord, setExplanationWord] = useState<string>("");
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [explanationContent, setExplanationContent] = useState<string>("");
  const [hoverWordRects, setHoverWordRects] = useState<Array<{ left: number; top: number; width: number; height: number }>>([]);
  const [isScrolling, setIsScrolling] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [showTopicSelection, setShowTopicSelection] = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const topicSuggestionTriggered = useRef(false);
  const userSetPhaseRef = useRef(false); // Track if user has manually set the phase
  const initialPhaseSetRef = useRef(false); // Track if initial phase has been set to prevent override
  const [dataLoaded, setDataLoaded] = useState(false);
  const [examSnipeLoaded, setExamSnipeLoaded] = useState(false);
  const [showLessonCard, setShowLessonCard] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  const scrollLessonToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
    requestAnimationFrame(() => {
      const lessonContent = document.querySelector(".surge-lesson-card .lesson-content");
      if (lessonContent instanceof HTMLElement) {
        try {
          lessonContent.scrollTo({ top: 0, behavior: "smooth" });
        } catch {
          lessonContent.scrollTop = 0;
        }
      }
    });
  }, []);

  // Scroll to top when part changes (but don't sync ref - ref is source of truth)
  // REMOVED: Auto-scrolling interferes with user navigation during streaming
  // useEffect(() => {
  //   // Scroll to top of lesson content when part changes
  //   if (showLessonCard && lessonParts.length > 0) {
  //     const lessonContent = document.querySelector('.lesson-content');
  //     if (lessonContent) {
  //       lessonContent.scrollTop = 0;
  //     }
  //   }
  // }, [currentPartIndex, showLessonCard, lessonParts.length]);

  // Load course data, practice logs, exam snipe, and last surge
  useEffect(() => {
    const loaded = loadSubjectData(slug);
    setData(loaded);
    setDataLoaded(true);

    // Load practice logs
    try {
      const logRaw = localStorage.getItem(`${PRACTICE_LOG_PREFIX}${slug}`);
      if (logRaw) {
        const logs = JSON.parse(logRaw) as PracticeLogEntry[];
        setPracticeLog(logs);
      }
    } catch (e) {
      console.warn("Failed to load practice logs:", e);
    }

    // Load exam snipe data
    (async () => {
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        const meJson = await meRes.json().catch(() => ({}));
        if (meJson?.user) {
          // Try fetching by subjectSlug first
          const examRes = await fetch(`/api/exam-snipe/history?subjectSlug=${encodeURIComponent(slug)}`, {
            credentials: "include",
          });
          const examJson = await examRes.json().catch(() => ({}));
          if (examRes.ok) {
            // If we got a list, find the most recent one
            if (examJson?.history && Array.isArray(examJson.history) && examJson.history.length > 0) {
              const mostRecent = examJson.history[0];
              if (mostRecent?.results) {
                setExamSnipeData(JSON.stringify(mostRecent.results, null, 2));
              }
            } else if (examJson?.record?.results) {
              // Single record response
              setExamSnipeData(JSON.stringify(examJson.record.results, null, 2));
            }
          }
        }
        setExamSnipeLoaded(true);
      } catch (e) {
        console.warn("Failed to load exam snipe:", e);
        setExamSnipeLoaded(true); // Mark as loaded even if failed (no exam snipe available)
      }
    })();

    // Load last surge session
    const last = getLastSurgeSession(slug);
    const allEntries = (() => {
      try {
        const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
        if (stored) {
          const data = JSON.parse(stored);
          return (data?.surgeLog || []).map((e: any) => ({
            sessionId: e.sessionId,
            timestamp: e.timestamp,
            date: new Date(e.timestamp).toISOString()
          }));
        }
      } catch {}
      return [];
    })();
    
    console.log("=== LOADED LAST SURGE DEBUG ===");
    console.log("Selected lastSurge:", {
      sessionId: last?.sessionId,
      timestamp: last?.timestamp,
      date: last ? new Date(last.timestamp).toISOString() : "none"
    });
    console.log("All entries in localStorage:", JSON.stringify(allEntries, null, 2));
    console.log("=== LOADED LAST SURGE DEBUG END ===");
    setLastSurge(last);

    // Reset user-set phase flag when slug changes (new course)
    userSetPhaseRef.current = false;
    initialPhaseSetRef.current = false;

    // Always start with review phase
    let initialPhase: "learn" | "repeat" = "repeat";
    
    // Calculate today's date in UTC for logging purposes
    const today = new Date();
    const todayYear = today.getUTCFullYear();
    const todayMonth = today.getUTCMonth();
    const todayDay = today.getUTCDate();
    const todayDateUTC = new Date(Date.UTC(todayYear, todayMonth, todayDay));
    
    // Also check the last session for logging purposes
    if (last) {
      const lastDate = new Date(last.timestamp);
      const lastYear = lastDate.getUTCFullYear();
      const lastMonth = lastDate.getUTCMonth();
      const lastDay = lastDate.getUTCDate();
      const lastDateUTC = new Date(Date.UTC(lastYear, lastMonth, lastDay));
      const daysDiff = Math.floor((todayDateUTC.getTime() - lastDateUTC.getTime()) / (1000 * 60 * 60 * 24));
      
      // Get all surge log entries for logging
      const allSurgeLogs = getSurgeLog(slug);
      
      console.log("Phase determination:", {
        hasLast: !!last,
        lastSessionId: last.sessionId,
        lastTimestamp: last.timestamp,
        lastDate: new Date(last.timestamp).toISOString(),
        daysDiff,
        initialPhase,
        allEntries: allSurgeLogs.map(e => ({
          sessionId: e.sessionId,
          timestamp: e.timestamp,
          date: new Date(e.timestamp).toISOString(),
          daysDiff: Math.floor((todayDateUTC.getTime() - new Date(Date.UTC(
            new Date(e.timestamp).getUTCFullYear(),
            new Date(e.timestamp).getUTCMonth(),
            new Date(e.timestamp).getUTCDate()
          )).getTime()) / (1000 * 60 * 60 * 24))
        }))
      });
    }
    
    // Mark that initial phase has been set BEFORE setting the phase
    // This prevents the second useEffect from overriding it
    initialPhaseSetRef.current = true;
    
    // Set phase after ref is set
    setPhase(initialPhase);
    
    // Debug logging with more details
    if (last) {
      const lastDate = new Date(last.timestamp);
      const today = new Date();
      
      // Use UTC dates for calculation (same as above)
      const lastYear = lastDate.getUTCFullYear();
      const lastMonth = lastDate.getUTCMonth();
      const lastDay = lastDate.getUTCDate();
      
      const todayYear = today.getUTCFullYear();
      const todayMonth = today.getUTCMonth();
      const todayDay = today.getUTCDate();
      
      const lastDateUTC = new Date(Date.UTC(lastYear, lastMonth, lastDay));
      const todayDateUTC = new Date(Date.UTC(todayYear, todayMonth, todayDay));
      const daysDiff = Math.floor((todayDateUTC.getTime() - lastDateUTC.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log("Initial phase determination:", {
        hasLast: !!last,
        lastTimestamp: last.timestamp,
        lastDateISO: lastDate.toISOString(),
        lastDateLocal: lastDate.toLocaleDateString(),
        lastDateUTC: lastDateUTC.toISOString(),
        todayISO: today.toISOString(),
        todayLocal: today.toLocaleDateString(),
        todayDateUTC: todayDateUTC.toISOString(),
        daysDiff,
        initialPhase,
        timestampDiff: today.getTime() - last.timestamp,
        hoursDiff: (today.getTime() - last.timestamp) / (1000 * 60 * 60)
      });
    } else {
      console.log("Initial phase determination:", {
        hasLast: false,
        initialPhase
      });
    }
  }, [slug]);

  // Listen for date updates from SurgeLog modal and reload lastSurge
  useEffect(() => {
    const handleDateUpdate = (event: CustomEvent<{ slug: string }>) => {
      if (event.detail.slug === slug) {
        // Reload lastSurge from localStorage
        const updatedLast = getLastSurgeSession(slug);
        setLastSurge(updatedLast);
      }
    };
    
    window.addEventListener('surgeLogDateUpdated', handleDateUpdate as EventListener);
    return () => {
      window.removeEventListener('surgeLogDateUpdated', handleDateUpdate as EventListener);
    };
  }, [slug]);

  // Re-determine phase when lastSurge changes (e.g., after date editing)
  // But only if user hasn't manually set the phase AND initial phase has been set
  const lastSurgeTimestamp = lastSurge?.timestamp ?? null;
  const conversationLength = conversation.length;
  useEffect(() => {
    // Don't auto-update phase if user has manually set it
    if (userSetPhaseRef.current) {
      return;
    }
    
    // Don't update phase until initial phase has been set (to avoid race condition)
    if (!initialPhaseSetRef.current) {
      return;
    }
    
    // Only update phase if user isn't actively learning
    // (i.e., no current topic selected or not in the middle of a lesson)
    if (currentTopic || sending || conversationLength > 1) {
      return;
    }
    
    // Check if all topics are reviewed - if so, don't reset phase
    const currentDataForReview = loadSubjectData(slug);
    const reviewedTopics = currentDataForReview?.reviewedTopics || {};
    const allSurgeLogs = getSurgeLog(slug);
    const courseName = currentDataForReview?.subject || "";
    const allTopics = new Set<string>();
    allSurgeLogs.forEach(entry => {
      if (entry.repeatedTopics && Array.isArray(entry.repeatedTopics)) {
        entry.repeatedTopics.forEach(rt => {
          if (rt?.topic && rt.topic !== courseName) {
            allTopics.add(rt.topic);
          }
        });
      }
      if (entry.newTopic && entry.newTopic !== courseName) {
        allTopics.add(entry.newTopic);
      }
      if (entry.quizResults && Array.isArray(entry.quizResults)) {
        entry.quizResults.forEach(result => {
          if (result.topic && result.topic !== courseName) {
            allTopics.add(result.topic);
          }
        });
      }
    });
    const topicsToReview = Array.from(allTopics);
    const allReviewed = topicsToReview.length > 0 && topicsToReview.every(topic => reviewedTopics[topic]);
    
    // If all topics are reviewed, don't reset phase (user can manually navigate)
    if (allReviewed) {
      return;
    }
    
    if (lastSurge) {
      const lastDate = new Date(lastSurge.timestamp);
      const today = new Date();
      const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const daysDiff = Math.floor((todayDay.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));
      
      // Update phase based on date difference
      if (daysDiff < 1) {
        // Date is today - should be in learn phase
        if (phase === "repeat") {
          setPhase("learn");
        }
      } else {
        // Date is yesterday or earlier - should be in repeat phase
        if (phase === "learn") {
          setPhase("repeat");
        }
      }
    } else {
      // No lastSurge - stay in repeat phase to show introduction
      // Don't automatically switch to learn phase
      // The introduction will be shown when there are no topics to review
    }
  }, [lastSurgeTimestamp, phase, currentTopic, sending, conversationLength, slug]); // Use stable extracted values

  // Build context when phase or data changes
  useEffect(() => {
    const context = buildSurgeContext(slug, data, practiceLog, lastSurge, examSnipeData || null, phase, currentTopic || "");
    setSurgeContext(context);
  }, [slug, data, practiceLog, lastSurge, examSnipeData, phase, currentTopic]);

  // Save session incrementally when quiz results change or when entering quiz phase
  const quizResultsCount = sessionData.quizResults.length;
  const quizQuestionsCount = quizQuestions.length;
  
  useEffect(() => {
    if (phase === "quiz" && quizResultsCount > 0 && quizResultsCount !== lastSavedQuizCount.current) {
      // Save session after each question is answered (backup - main save happens in recordQuizAnswer)
      lastSavedQuizCount.current = quizResultsCount;
      saveCurrentSession(false);
    } else if (phase === "quiz" && quizResultsCount === 0 && quizQuestionsCount > 0 && lastSavedQuizCount.current === 0) {
      // Save initial session entry when quiz starts
      saveCurrentSession(false);
    }
  }, [phase, quizResultsCount, quizQuestionsCount]);

  // Initialize conversation with Chad greeting
  useEffect(() => {
    if (surgeContext && conversation.length === 0) {
      const greeting = phase === "repeat"
        ? "" // Don't show greeting in conversation - we'll show it in the UI instead
        : phase === "learn" && !currentTopic
        ? ""
        : phase === "learn" && currentTopic
        ? "" // Don't show "Generating lesson..." - go straight to "Chad is thinking..."
        : phase === "quiz"
        ? ""
        : "Time to quiz what you just learned!";
      
      // If in learn phase without a topic, wait for data to load before triggering
      if (phase === "learn" && !currentTopic && surgeContext && !topicSuggestionTriggered.current) {
        // Wait for data and exam snipe to be loaded before triggering
        if (dataLoaded && examSnipeLoaded) {
          topicSuggestionTriggered.current = true;
          // Don't add greeting, go straight to analysis
          setConversation([]);
          conversationRef.current = [];
          setTimeout(() => {
            // Automatically trigger Chad to analyze and suggest topics (no user message shown)
            // Send empty conversation so Chad starts immediately
            sendMessageWithExistingMessages([]);
          }, 300);
        }
      } else if (phase === "learn" && currentTopic) {
        // When topic is selected, don't add greeting - go straight to "Chad is thinking..."
        setConversation([]);
        conversationRef.current = [];
      } else if (greeting) {
        // Only add greeting for other phases
        setConversation([
          {
            role: "assistant",
            content: greeting,
          },
        ]);
        conversationRef.current = [
          {
            role: "assistant",
            content: greeting,
          },
        ];
      }
      
      // Reset trigger when phase changes or topic is selected
      if (phase !== "learn" || currentTopic) {
        topicSuggestionTriggered.current = false;
      }
    }
  }, [surgeContext, phase, lastSurge, currentTopic, dataLoaded, examSnipeLoaded]);

  // Track if user clicked Start button for review
  const reviewStartRequested = useRef(false);
  
  // Ensure we're mounted before rendering client-only content
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Trigger quiz generation when quiz phase starts (but only if user clicked Start)
  useEffect(() => {
    if (
      phase === "repeat" &&
      quizQuestions.length === 0 &&
      !quizLoading &&
      !sending &&
      reviewStartRequested.current
    ) {
      // Reset the flag immediately to prevent re-triggering
      reviewStartRequested.current = false;
      
      // Get all surge log entries and extract all unique topics
      const allSurgeLogs = getSurgeLog(slug);
      
      if (allSurgeLogs.length === 0) {
        return; // No surge logs, don't generate questions
      }
      
      // Get the course/subject name to filter it out
      const courseName = data?.subject || "";
      
      // Extract all unique topics from all surge log entries
      const allTopics = new Set<string>();
      allSurgeLogs.forEach(entry => {
        // Add topics from repeatedTopics
        if (entry.repeatedTopics && Array.isArray(entry.repeatedTopics)) {
          entry.repeatedTopics.forEach(rt => {
            if (rt?.topic && rt.topic !== courseName) {
              allTopics.add(rt.topic);
            }
          });
        }
        // Add newTopic (but not if it's the course name)
        if (entry.newTopic && entry.newTopic !== courseName) {
          allTopics.add(entry.newTopic);
        }
        // Add topics from quizResults (but not if it's the course name)
        if (entry.quizResults && Array.isArray(entry.quizResults)) {
          entry.quizResults.forEach(result => {
            if (result.topic && result.topic !== courseName) {
              allTopics.add(result.topic);
            }
          });
        }
      });
      
      const topicsToReview = Array.from(allTopics);
      
      // Only generate review questions if there are topics to review
      if (topicsToReview.length > 0) {
        setQuizQuestions([]);
        setQuizResponses({});
        setCurrentQuizIndex(0);
        setShortAnswer("");
        harderQuestionsRequested.current = false;
        requestReviewQuestions();
      }
    } else if (
      phase === "quiz" &&
      quizQuestions.length === 0 &&
      !quizLoading &&
      !sending
    ) {
      setQuizQuestions([]);
      setQuizResponses({});
      setCurrentQuizIndex(0);
      setShortAnswer("");
      harderQuestionsRequested.current = false;
      requestQuizQuestions("mc");
    }
  }, [phase, quizQuestions.length, quizLoading, sending, lastSurge, slug]);

  const getAnsweredCount = (stage: "mc" | "harder" | "review") => {
    return Object.entries(quizResponses).reduce((count, [id]) => {
      const question = quizQuestions.find((q) => q.id === id);
      return question && question.stage === stage ? count + 1 : count;
    }, 0);
  };

  const buildLessonPayload = () => {
    const recordedLesson = sessionData.newTopicLesson?.trim();
    if (recordedLesson) return recordedLesson;

    if (lastAssistantMessage.trim().length > 0) {
      return lastAssistantMessage;
    }

    const lastAssistant = [...conversationRef.current].reverse().find((msg) => msg.role === "assistant");
    return lastAssistant?.content || "";
  };

  async function requestReviewQuestions() {
    // Prevent multiple simultaneous calls
    if (quizLoading) {
      console.log("Review questions already being generated, skipping duplicate call");
      return;
    }
    
    setQuizLoading(true);
    setQuizFailureMessage(null);
    setQuizInfoMessage("Chad is preparing review questions...");
    setError(null);
    
    try {
      const courseName = data?.subject || slug;
      
      // Get all surge log entries and extract all unique topics
      const allSurgeLogs = getSurgeLog(slug);
      
      if (allSurgeLogs.length === 0) {
        setQuizLoading(false);
        setQuizInfoMessage(null);
        return;
      }
      
      // Extract all unique topics from all surge log entries
      const allTopics = new Set<string>();
      allSurgeLogs.forEach(entry => {
        // Add topics from repeatedTopics
        if (entry.repeatedTopics && Array.isArray(entry.repeatedTopics)) {
          entry.repeatedTopics.forEach(rt => {
            if (rt?.topic && rt.topic !== courseName) {
              allTopics.add(rt.topic);
            }
          });
        }
        // Add newTopic (but not if it's the course name)
        if (entry.newTopic && entry.newTopic !== courseName) {
          allTopics.add(entry.newTopic);
        }
        // Add topics from quizResults (but not if it's the course name)
        if (entry.quizResults && Array.isArray(entry.quizResults)) {
          entry.quizResults.forEach(result => {
            if (result.topic && result.topic !== courseName) {
              allTopics.add(result.topic);
            }
          });
        }
      });
      
      // Filter out already reviewed topics
      const currentDataForQuestions = loadSubjectData(slug);
      const reviewedTopicsForQuestions = currentDataForQuestions?.reviewedTopics || {};
      const topicsToReview = Array.from(allTopics).filter(topic => !reviewedTopicsForQuestions[topic]);
      
      // If no topics to review, don't try to generate questions
      if (topicsToReview.length === 0) {
        setQuizLoading(false);
        setQuizInfoMessage(null);
        return;
      }

      // Get all previous questions from all surge logs to avoid duplicates
      const previousQuestions: string[] = [];
      allSurgeLogs.forEach(entry => {
        if (entry.quizResults && Array.isArray(entry.quizResults)) {
          entry.quizResults.forEach(result => {
            if (result.question) {
              previousQuestions.push(result.question);
            }
          });
        }
      });

      // Generate questions for each topic: 2 MC + 2 harder questions per topic
      const allReviewQuestions: SurgeQuizQuestion[] = [];
      
      for (const topic of topicsToReview) {
        // Get lesson content for this specific topic from any surge log entry
        let topicLesson = "";
        for (const entry of allSurgeLogs) {
          if (entry.newTopic === topic && entry.newTopicLesson) {
            topicLesson = entry.newTopicLesson;
            break;
          }
        }
        
        // Ensure we have context - build it if missing
        const contextToUse = surgeContext || buildSurgeContext(slug, data, practiceLog, lastSurge, examSnipeData || null, "repeat", topic);
        
        // Generate 2 MC questions for this topic
        const mcRes = await fetch("/api/surge-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "mc",
            courseName: courseName || slug,
            topicName: topic || "Unknown Topic",
            context: contextToUse || "",
            lessonContent: topicLesson,
            mcQuestions: previousQuestions.join("\n"), // Pass previous questions to avoid duplicates
            debugInstruction: `Generate EXACTLY 2 multiple-choice questions about "${topic}" for spaced repetition review. These questions must:
- Test active recall of fundamental concepts from this topic
- Be COMPLETELY DIFFERENT from all previous questions (check: ${previousQuestions.length} previous questions)
- Focus on deep understanding, not just memorization
- Help reinforce key concepts through active recall
- Be suitable for spaced repetition practice
- CRITICAL: All incorrect options (distractors) must be plausible with minor details wrong, not obviously wrong. Use common misconceptions or subtle errors that require careful understanding to identify.`,
          }),
        });
        
        if (!mcRes.ok) {
          const errorText = await mcRes.text();
          throw new Error(errorText || "Failed to generate MC review questions");
        }
        
        const mcPayload = await mcRes.json();
        console.log("MC response payload:", { ok: mcPayload?.ok, hasRaw: !!mcPayload?.raw, stage: mcPayload?.stage, rawLength: mcPayload?.raw?.length });
        const mcRaw = mcPayload?.raw || "";
        if (!mcRaw) {
          console.error("No raw data in MC response, payload:", mcPayload);
          throw new Error("No raw data in MC response");
        }
        console.log("MC raw data (first 500 chars):", mcRaw.substring(0, 500));
        const mcQuestions = parseQuizJson(mcRaw, "mc");
        console.log("Parsed MC questions:", mcQuestions.length, mcQuestions.map(q => ({ id: q.id, question: q.question.substring(0, 50), type: q.type, stage: q.stage, hasOptions: !!q.options })));
        
        // Filter out duplicates from MC questions
        const uniqueMcQuestions = mcQuestions.filter(q => {
          const qLower = q.question.toLowerCase().trim();
          return !previousQuestions.some(pq => {
            const pqLower = pq.toLowerCase().trim();
            // More thorough duplicate check - check if questions are too similar
            const qWords = qLower.split(/\s+/).slice(0, 10).join(" ");
            const pqWords = pqLower.split(/\s+/).slice(0, 10).join(" ");
            return pqLower.includes(qWords) || qLower.includes(pqWords) || 
                   qLower.slice(0, 50) === pqLower.slice(0, 50);
          });
        });
        
        // Take exactly 2 MC questions and assign topic
        const mcToAdd = uniqueMcQuestions.slice(0, 2).map(q => ({
          ...q,
          topic: topic,
        }));
        allReviewQuestions.push(...mcToAdd);
        
        // Update previous questions list with the MC questions we just added
        const updatedPreviousQuestions = [...previousQuestions, ...mcToAdd.map(q => q.question)];
        
        // Generate 2 harder questions for this topic
        const harderRes = await fetch("/api/surge-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "harder",
            courseName: courseName || slug,
            topicName: topic || "Unknown Topic",
            context: contextToUse || "",
            lessonContent: topicLesson,
            mcQuestions: updatedPreviousQuestions.join("\n"), // Pass all previous questions including new MC
            debugInstruction: `Generate EXACTLY 2 short-answer quiz questions about "${topic}" for spaced repetition review. These questions must:
- Test active recall through deeper thinking and application
- Be COMPLETELY DIFFERENT from all previous questions (check: ${updatedPreviousQuestions.length} previous questions)
- Require the user to actively recall and explain concepts, not just recognize them
- Focus on understanding, application, and critical thinking
- Help reinforce key concepts through active recall and spaced repetition
- Be suitable for spaced repetition practice that promotes deep learning`,
          }),
        });
        
        if (!harderRes.ok) {
          const errorText = await harderRes.text();
          throw new Error(errorText || "Failed to generate harder review questions");
        }
        
        const harderPayload = await harderRes.json();
        console.log("Harder response payload:", { ok: harderPayload?.ok, hasRaw: !!harderPayload?.raw, stage: harderPayload?.stage, rawLength: harderPayload?.raw?.length });
        const harderRaw = harderPayload?.raw || "";
        if (!harderRaw) {
          console.error("No raw data in harder response, payload:", harderPayload);
          throw new Error("No raw data in harder response");
        }
        console.log("Harder raw data (first 500 chars):", harderRaw.substring(0, 500));
        const harderQuestions = parseQuizJson(harderRaw, "harder");
        console.log("Parsed harder questions:", harderQuestions.length, harderQuestions.map(q => ({ id: q.id, question: q.question.substring(0, 50), type: q.type, stage: q.stage, hasModelAnswer: !!q.modelAnswer })));
        
        // Filter out duplicates from harder questions
        const uniqueHarderQuestions = harderQuestions.filter(q => {
          const qLower = q.question.toLowerCase().trim();
          return !updatedPreviousQuestions.some(pq => {
            const pqLower = pq.toLowerCase().trim();
            // More thorough duplicate check
            const qWords = qLower.split(/\s+/).slice(0, 10).join(" ");
            const pqWords = pqLower.split(/\s+/).slice(0, 10).join(" ");
            return pqLower.includes(qWords) || qLower.includes(pqWords) || 
                   qLower.slice(0, 50) === pqLower.slice(0, 50);
          });
        });
        
        // Take exactly 2 harder questions and assign topic
        const harderToAdd = uniqueHarderQuestions.slice(0, 2).map(q => ({
          ...q,
          topic: topic,
        }));
        allReviewQuestions.push(...harderToAdd);
        
        // Update previous questions for next topic
        previousQuestions.push(...mcToAdd.map(q => q.question), ...harderToAdd.map(q => q.question));
      }
      
      // Mix questions: 2 MC, then 2 harder per topic
      // Shuffle the topics themselves for variety
      const shuffledTopics = [...topicsToReview].sort(() => Math.random() - 0.5);
      const finalQuestions: SurgeQuizQuestion[] = [];
      for (const topic of shuffledTopics) {
        // Filter by topic and type (not stage, since we'll set stage to "review" later)
        const topicMc = allReviewQuestions.filter(q => (q as any).topic === topic && q.type === "mc").slice(0, 2);
        const topicHarder = allReviewQuestions.filter(q => (q as any).topic === topic && q.type === "short").slice(0, 2);
        // Add 2 MC, then 2 harder for this topic
        finalQuestions.push(...topicMc, ...topicHarder);
      }
      
      // If we didn't get enough questions, use what we have
      if (finalQuestions.length === 0) {
        finalQuestions.push(...allReviewQuestions);
      }

      if (finalQuestions.length === 0) {
        throw new Error("No review questions generated");
      }

      // Set as review questions - keep their original type but mark stage as review
      // This allows the UI to display them correctly (MC vs short answer)
      console.log("Review questions generated:", {
        totalQuestions: finalQuestions.length,
        mcCount: finalQuestions.filter(q => q.type === "mc").length,
        shortCount: finalQuestions.filter(q => q.type === "short").length,
        topics: [...new Set(finalQuestions.map(q => (q as any).topic))]
      });
      
      // Set as review questions - keep their original type but mark stage as review
      // This allows the UI to display them correctly (MC vs short answer)
      const reviewQuestions = finalQuestions.map(q => ({ 
        ...q, 
        stage: "review" as const,
        // Keep the original type (mc or short) for proper display
        type: q.type, // mc or short
      }));
      
      setQuizQuestions(reviewQuestions);
      setCurrentQuizIndex(0);
      setQuizLoading(false);
      setQuizInfoMessage(null);
      
      // Reset the flag to prevent re-triggering
      reviewStartRequested.current = false;
      
      console.log("Review questions set in state:", reviewQuestions.length);
    } catch (err: any) {
      console.error("Failed to fetch review questions:", err);
      setError(err?.message || "Chad couldn't generate the review questions. Please try again.");
      setQuizFailureMessage("Chad couldn't generate the review. Try again?");
      setQuizLoading(false);
      setQuizInfoMessage(null);
      
      // Reset the flag even on error to allow retry
      reviewStartRequested.current = false;
    }
  }

  async function requestQuizQuestions(stage: "mc" | "harder", debugInstruction?: string) {
    if (quizLoading) return;
    const topicName = currentTopic || sessionData.newTopic || data?.subject || slug;
    const courseName = data?.subject || slug;
    let actualStage: "mc" | "harder" = stage;
    harderQuestionsRequested.current = stage === "harder";
    setQuizLoading(true);
    setQuizFailureMessage(null);
    setQuizInfoMessage(null);
    setError(null);

    // Build MC questions context for harder questions
    const mcQuestionsContext = stage === "harder" 
      ? quizQuestions
          .filter((q) => q.stage === "mc")
          .map((q, idx) => {
            const options = q.options?.map((opt, optIdx) => 
              `${String.fromCharCode(65 + optIdx)}) ${opt}`
            ).join(" ") || "";
            return `${idx + 1}. ${q.question} ${options} (Correct: ${q.correctOption})`;
          })
          .join("\n")
      : "";

    try {
      const res = await fetch("/api/surge-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          courseName,
          topicName,
          context: surgeContext,
          lessonContent: buildLessonPayload(),
          mcQuestions: mcQuestionsContext,
          debugInstruction,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to generate quiz");
      }
      const payload = await res.json();
      const raw = payload?.raw || "";
      let newQuestions = parseQuizJson(raw, stage);
      
      // If we requested MC but got short/harder questions, use them as harder questions
      if (stage === "mc" && newQuestions.length > 0 && (newQuestions[0]?.type === "short" || newQuestions[0]?.stage === "harder")) {
        console.log("Received short answer questions when MC was requested. Using them as harder questions.");
        actualStage = "harder";
        // Update the stage on all questions
        newQuestions = newQuestions.map(q => ({ ...q, stage: "harder" }));
        harderQuestionsRequested.current = true;
      }
      
      if (!newQuestions.length) {
        throw new Error("No quiz questions returned");
      }
      const applied = applyQuizQuestions(newQuestions, actualStage, actualStage === "mc");
      if (!applied) {
        console.warn("Quiz questions response contained no new items; using existing set.");
      }
      if (actualStage === "harder" && !sessionData.mcStageCompletedAt) {
        recordQuizStageTransition("mc", "harder");
      }
    } catch (err: any) {
      console.error("Failed to fetch quiz questions:", err);
      setError(err?.message || "Chad couldn't generate the quiz questions. Please try again.");
      setQuizFailureMessage("Chad couldn't generate the quiz. Try again?");
    } finally {
      if (actualStage === "harder") {
        harderQuestionsRequested.current = false;
      }
      setQuizLoading(false);
      setQuizInfoMessage(null);
    }
  }

  const evaluateShortAnswer = (userAnswer: string, modelAnswer: string) => {
    const cleanTokens = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3);
    const modelTokens = cleanTokens(modelAnswer);
    const userTokens = cleanTokens(userAnswer);
    if (modelTokens.length === 0) {
      const baseScore = userTokens.length > 0 ? 7 : 0;
      return { score: baseScore, isCorrect: userTokens.length > 0 ? null : false };
    }
    const uniqueModel = Array.from(new Set(modelTokens));
    const matches = userTokens.filter((token) => uniqueModel.includes(token));
    const ratio = matches.length / uniqueModel.length;
    // Softer grading: boost partially correct answers and lower correctness threshold
    const boosted = Math.max(ratio, ratio * 0.6 + 0.2); // gentle uplift for partial overlap
    const score = Math.max(0, Math.min(10, Math.round(boosted * 10)));
    return { score, isCorrect: ratio >= 0.55 };
  };

  const recordQuizStageTransition = (from: "mc" | "harder", to: "mc" | "harder") => {
    setSessionData((prev) => ({
      ...prev,
      quizStageTransitions: [
        ...prev.quizStageTransitions,
        { from, to, timestamp: Date.now(), topic: currentTopic || prev.newTopic },
      ],
      mcStageCompletedAt: from === "mc" && to === "harder" ? Date.now() : prev.mcStageCompletedAt,
    }));
  };

  const recordQuizAnswer = (
    question: SurgeQuizQuestion,
    userAnswer: string,
    score: number,
    isCorrect: boolean | null,
    assessmentData?: {
      assessment?: string;
      whatsGood?: string;
      whatsBad?: string;
      enhancedExplanation?: string;
      checked?: boolean;
    }
  ) => {
    // Always update quizResponses - either create new or update existing
    setQuizResponses((prev) => {
      const existing = prev[question.id];
      return {
        ...prev,
        [question.id]: {
          ...existing,
          answer: userAnswer,
          isCorrect,
          correctAnswer: question.correctOption,
          explanation: question.explanation,
          modelAnswer: question.modelAnswer,
          stage: question.stage,
          score,
          submittedAt: existing?.submittedAt ?? Date.now(),
          ...assessmentData,
        },
      };
    });
    
    // Skip logging for review questions - they're just for practice, not for tracking
    if (question.stage === "review") {
      return true;
    }
    
    // Always update sessionData quizResults and save immediately
    let updatedSessionData: typeof sessionData;
    setSessionData((prev) => {
      const existingIndex = prev.quizResults.findIndex(
        (result) => result.question === question.question && result.stage === question.stage
      );
      // Determine topic - use question topic if available, otherwise currentTopic, otherwise newTopic, otherwise fallback
      const questionTopic = (question as any).topic || currentTopic || prev.newTopic || data?.subject || "Unknown Topic";
      const newEntry = {
        question: question.question,
        answer: userAnswer,
        grade: score,
        topic: questionTopic,
        // Only include correctAnswer for harder questions, not MC
        ...(question.stage === "harder" ? { correctAnswer: question.correctOption } : {}),
        explanation: assessmentData?.enhancedExplanation || question.explanation || question.modelAnswer,
        stage: question.stage,
        modelAnswer: question.modelAnswer,
      };

      console.log("Recording quiz answer:", {
        question: question.question,
        answer: userAnswer,
        grade: score,
        topic: currentTopic || prev.newTopic,
        stage: question.stage,
        hasAssessment: !!assessmentData,
        existingIndex,
      });

      if (existingIndex !== -1) {
        const updatedResults = [...prev.quizResults];
        updatedResults[existingIndex] = newEntry;
        console.log("Updated existing quiz result at index", existingIndex);
        updatedSessionData = {
          ...prev,
          quizResults: updatedResults,
        };
        return updatedSessionData;
      }

      console.log("Added new quiz result. Total quiz results:", prev.quizResults.length + 1);
      updatedSessionData = {
        ...prev,
        quizResults: [...prev.quizResults, newEntry],
      };
      return updatedSessionData;
    });
    
    // Save session immediately with the updated data
    saveCurrentSession(false, updatedSessionData!);
    
    return true;
  };

  const requestHarderQuestions = () => {
    if (harderQuestionsRequested.current || quizLoading) return;
    harderQuestionsRequested.current = true;
    requestQuizQuestions("harder");
  };

  const handleMCOptionSelect = (optionLetter: string) => {
    const currentQ = quizQuestions[currentQuizIndex];
    if (!currentQ || currentQ.type !== "mc") return;
    const normalized = optionLetter.trim().charAt(0).toUpperCase();
    const correct = currentQ.correctOption?.trim().charAt(0).toUpperCase() || "";
    const isCorrect = correct ? normalized === correct : null;
    const score = isCorrect === null ? 0 : isCorrect ? 10 : 0;
    
    // Record the answer - this updates quizResponses state immediately
    const recorded = recordQuizAnswer(currentQ, normalized, score, isCorrect);
    if (!recorded) {
      console.error("Failed to record MC answer");
      return;
    }
    
    // Note: setQuizResponses in recordQuizAnswer will trigger a re-render
    // The button should become enabled after React re-renders with the updated state

    // Only trigger harder questions for regular MC questions, not review questions
    if (currentQ.stage === "review") {
      return; // Review questions don't trigger harder questions generation
    }

    // Don't auto-advance to harder questions; user will trigger next
    const totalMc = quizQuestions.filter((q) => q.stage === "mc").length;
    const answeredMc = getAnsweredCount("mc") + 1;
    if (answeredMc >= totalMc) {
      if (!quizQuestions.some((q) => q.stage === "harder")) {
        // Prepare harder questions in background, but do not jump stage
        requestHarderQuestions();
      } else {
        setQuizLoading(false);
      }
    }
  };

  const handleCheckAnswer = async () => {
    const currentQ = quizQuestions[currentQuizIndex];
    if (!currentQ || currentQ.type !== "short") return;
    if (quizResponses[currentQ.id]?.checked) return;
    const userAnswer = shortAnswer.trim();
    if (!userAnswer) return;

    setCheckingAnswer(true);
    try {
      const res = await fetch("/api/surge-quiz-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQ.question,
          answer: userAnswer,
          modelAnswer: currentQ.modelAnswer || "",
          explanation: currentQ.explanation || "",
          topic: currentTopic || sessionData.newTopic || "",
          lessonContent: buildLessonPayload(),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to check answer");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to check answer");
      }

      // Record the answer with assessment data
      const isCorrect = data.grade >= 8;
      const recorded = recordQuizAnswer(
        currentQ,
        userAnswer,
        data.grade,
        isCorrect,
        {
          assessment: data.assessment,
          whatsGood: data.whatsGood,
          whatsBad: data.whatsBad,
          enhancedExplanation: data.enhancedExplanation,
          checked: true,
        }
      );

      if (!recorded) {
        throw new Error("Failed to record answer");
      }
    } catch (err: any) {
      console.error("Failed to check answer:", err);
      setError(err?.message || "Failed to check answer. Please try again.");
    } finally {
      setCheckingAnswer(false);
    }
  };

  const handleDebugQuizStart = () => {
    const topicName = "Erlang Messaging"; // Set explicit topic for debug quiz
    // Set the topic so it gets saved correctly
    if (!currentTopic) {
      setCurrentTopic(topicName);
    }
    // Update session data with the topic
    setSessionData(prev => ({
      ...prev,
      newTopic: topicName,
    }));
    if (phase !== "quiz") {
      setPhase("quiz");
    }
    setConversation([]);
    conversationRef.current = [];
    setCurrentQuestion("");
    setShowLessonCard(false);
    setShowTopicSelection(false);
    setShowCustomInput(false);
    setQuizQuestions([]);
    setQuizResponses({});
    setCurrentQuizIndex(0);
    setShortAnswer("");
    harderQuestionsRequested.current = false;
    requestQuizQuestions(
      "mc",
      "Focus all questions on Erlang messaging patterns, mailbox semantics, and message-passing guarantees."
    );
  };

  const handleNextQuestion = () => {
    const currentQ = quizQuestions[currentQuizIndex];
    if (!currentQ) return;
    const response = quizResponses[currentQ.id];
    if (!response) return;

    // Handle review questions completion
    if (currentQ.stage === "review") {
      const reviewQuestions = quizQuestions.filter((q) => q.stage === "review");
      const currentReviewIndex = reviewQuestions.findIndex((q) => q.id === currentQ.id);
      const isLastReview = currentReviewIndex === reviewQuestions.length - 1;
      
      if (isLastReview) {
        // Review complete - save reviewed topics and transition to learn phase
        const reviewedTopicsSet = new Set<string>();
        reviewQuestions.forEach(q => {
          const topic = (q as any).topic;
          if (topic) {
            reviewedTopicsSet.add(topic);
          }
        });
        
        // Save reviewed topics to subject data
        if (reviewedTopicsSet.size > 0) {
          const currentData = loadSubjectData(slug);
          if (currentData) {
            const reviewedTopics = currentData.reviewedTopics || {};
            const now = Date.now();
            reviewedTopicsSet.forEach(topic => {
              reviewedTopics[topic] = now;
            });
            currentData.reviewedTopics = reviewedTopics;
            saveSubjectDataAsync(slug, currentData).catch(err => {
              console.error("Failed to save reviewed topics:", err);
            });
          }
        }
        
        setPhase("learn");
        setQuizQuestions([]);
        setQuizResponses({});
        setCurrentQuizIndex(0);
        setShortAnswer("");
        return;
      }
      
      // Move to next review question
      const nextReviewIdx = quizQuestions.findIndex(
        (q, idx) => idx > currentQuizIndex && q.stage === "review"
      );
      if (nextReviewIdx !== -1) {
        setCurrentQuizIndex(nextReviewIdx);
        setShortAnswer("");
      }
      return;
    }

    if (currentQ.stage === "mc") {
      const mcQuestions = quizQuestions.filter((q) => q.stage === "mc");
      const currentMcIndex = mcQuestions.findIndex((q) => q.id === currentQ.id);
      const isLastMc = currentMcIndex === mcQuestions.length - 1;
      
      const nextMcIdx = quizQuestions.findIndex(
        (q, idx) => idx > currentQuizIndex && q.stage === "mc"
      );
      if (nextMcIdx !== -1) {
        setCurrentQuizIndex(nextMcIdx);
        setShortAnswer("");
        // If we're moving to the last MC question (question 5), trigger harder questions generation
        const nextQ = quizQuestions[nextMcIdx];
        const nextMcIndex = mcQuestions.findIndex((q) => q.id === nextQ.id);
        if (nextMcIndex === mcQuestions.length - 1) {
          const hasHarder = quizQuestions.some((q) => q.stage === "harder");
          if (!hasHarder && !harderQuestionsRequested.current && !quizLoading) {
            requestHarderQuestions();
          }
        }
        return;
      }
      const hasHarder = quizQuestions.some((q) => q.stage === "harder");
      if (hasHarder) {
        const firstHarderIdx = quizQuestions.findIndex((q) => q.stage === "harder");
        if (firstHarderIdx !== -1) {
          recordQuizStageTransition("mc", "harder");
          setCurrentQuizIndex(firstHarderIdx);
          setShortAnswer("");
          setQuizLoading(false);
        }
      } else {
        requestHarderQuestions();
      }
      return;
    }

    const nextHarderIdx = quizQuestions.findIndex(
      (q, idx) => idx > currentQuizIndex && q.stage === "harder"
    );
    if (nextHarderIdx !== -1) {
      setCurrentQuizIndex(nextHarderIdx);
      setShortAnswer("");
    } else {
      setPhase("complete");
      saveSession();
    }
  };

  useEffect(() => {
    if (phase !== "quiz") return;
    const totalMc = quizQuestions.filter((q) => q.stage === "mc").length;
    if (totalMc === 0) return;
    if (getAnsweredCount("mc") < totalMc) return;
    if (!quizQuestions.some((q) => q.stage === "harder")) {
      requestHarderQuestions();
    }
  }, [phase, quizQuestions, quizResponses]);

  const callPracticeLogger = async (question: string, answer: string) => {
    if (!question || !answer) return null;

    try {
      const response = await fetch('/api/practice-logger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
          courseSlug: slug,
          existingLogs: practiceLog,
        }),
      });

      if (!response.ok) {
        console.error('Failed to log practice session:', response.statusText);
        return null;
      }

      const result = await response.json();
      
      if (result.skipped) {
        console.log("⏭️ Practice log skipped:", result.reason);
        return null;
      }
      
      if (result.success && result.logEntry) {
        const logEntry: PracticeLogEntry = result.logEntry;
        
        // Update practice log state
        setPracticeLog((prev) => {
          const next = [...prev, logEntry];
          try {
            localStorage.setItem(`${PRACTICE_LOG_PREFIX}${slug}`, JSON.stringify(next));
          } catch (error) {
            console.warn("Failed to persist practice log:", error);
          }
          return next;
        });

        // Update session data based on phase
        if (phase === "repeat") {
          setSessionData((prev) => {
            const topics = [...prev.repeatedTopics];
            const topicIndex = topics.findIndex(t => t.topic === logEntry.topic);
            const questionData = { question: logEntry.question, answer: logEntry.answer, grade: logEntry.grade };
            
            if (topicIndex >= 0) {
              topics[topicIndex].questions.push(questionData);
              const grades = topics[topicIndex].questions.map(q => q.grade);
              topics[topicIndex].averageScore = grades.reduce((a, b) => a + b, 0) / grades.length;
            } else {
              topics.push({
                topic: logEntry.topic,
                questions: [questionData],
                averageScore: logEntry.grade,
              });
            }
            return { ...prev, repeatedTopics: topics };
          });
        }

        return logEntry;
      }
    } catch (error) {
      console.error('Error calling practice logger:', error);
    }
    return null;
  };

  const sendMessage = async (message: string) => {
    if (sending || !message.trim()) return;

    const userMessage: ChatMessage = { role: "user", content: message.trim() };
    const newConversation = [...conversation, userMessage];
    setConversation(newConversation);
    conversationRef.current = newConversation;

    // If there's a current question and we're in repeat phase, log the answer
    if (currentQuestion && phase === "repeat") {
      await callPracticeLogger(currentQuestion, message.trim());
      setCurrentQuestion(""); // Clear after logging
    }

    await sendMessageWithExistingMessages(newConversation);
  };

  const sendMessageWithContext = async (messages: ChatMessage[], contextOverride?: string, topicOverride?: string, systemMessages?: ChatMessage[]) => {
    if (sending) return;

    const contextToUse = contextOverride || surgeContext;
    const topicToCheck = topicOverride !== undefined ? topicOverride : (currentTopic || "");

    // If messages is empty and we're in learn phase without topic, send a system message
    // to trigger topic suggestions with full context
    // BUT if we have a currentTopic, we're teaching, not suggesting
    let historyForApi: ChatMessage[];
    if (systemMessages && systemMessages.length > 0) {
      // Use system messages directly (for topic selection - no user message shown)
      historyForApi = systemMessages;
    } else if (messages.length === 0 && phase === "learn" && !topicToCheck) {
      historyForApi = [{
        role: "system" as const,
        content:
          "You must output exactly 4 topic suggestions. If you can only find 3, split the most valuable concept into two actionable subtopics so there are still 4 lines.\n" +
          "Format:\n" +
          "TOPIC_SUGGESTION: Topic Name 1\n" +
          "TOPIC_SUGGESTION: Topic Name 2\n" +
          "TOPIC_SUGGESTION: Topic Name 3\n" +
          "TOPIC_SUGGESTION: Topic Name 4\n\n" +
          "Do not write anything else. No explanations, no introductions, no dashes, no bullets. Just those 4 lines starting with TOPIC_SUGGESTION."
      }];
    } else if (messages.length > 0 && messages[messages.length - 1]?.role === "user") {
      historyForApi = messages.slice(0, -1); // Remove last user message, it will be in the conversation
    } else {
      historyForApi = messages;
    }

    try {
      setSending(true);
      setError(null);

      // If using system messages (topic selection), don't initialize conversation
      // We'll show "Chad is thinking..." and only show buttons when done
      if (systemMessages && systemMessages.length > 0) {
      setConversation([]);
      conversationRef.current = [];
      setSuggestedTopics([]);
      setShowTopicSelection(false);
      }

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: contextToUse,
          messages: historyForApi.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          path: `/subjects/${slug}/surge`,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let finalActions: ParsedAction[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        const chunk = decoder.decode(value, { stream: true });
        chunk.split("\n").forEach((line) => {
          if (!line.startsWith("data: ")) return;
          const payload = line.slice(6);
          if (!payload) return;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "text") {
              accumulated += parsed.content;
              
              // During topic suggestion phase, don't update conversation state
              // Parse topics during streaming and show as soon as we have all 4 complete
              const isTopicSuggestionPhase = phase === "learn" && !topicToCheck && !currentTopic;
              
              // Always parse topic suggestions during topic suggestion phase (even if not updating conversation)
              if (isTopicSuggestionPhase) {
                // Parse topics from accumulated text during streaming
                const topics = extractTopicSuggestions(accumulated, TOPIC_SUGGESTION_TARGET);
                
                // As soon as we have all 4 complete topics, show them immediately
                if (topics.length >= MIN_TOPIC_SUGGESTIONS && !showTopicSelection) {
                  console.log("✅ Found all topics during streaming, showing immediately:", topics);
                  setSuggestedTopics(topics);
                  setShowTopicSelection(true);
                  setConversation([]);
                  conversationRef.current = [];
                  setSending(false);
                }
              } else {
                // Normal streaming - update conversation
                setConversation((prev) => {
                  const updated = [...prev];
                  if (updated[updated.length - 1]?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1],
                      content: accumulated,
                    };
                  } else {
                    updated.push({ role: "assistant", content: accumulated });
                  }
                  conversationRef.current = updated;
                
                  // Extract quiz questions during quiz phase
                  const fullMessage = updated[updated.length - 1]?.content || "";
                  if (phase === "quiz") {
                    const parsedQuestions = extractSurgeQuizQuestionsFromText(fullMessage);
                    const mcQuestions = parsedQuestions.filter((q) => q.stage === "mc");
                    const harderQuestions = parsedQuestions.filter((q) => q.stage === "harder");
                    let added = false;
                    if (mcQuestions.length) {
                      added = applyQuizQuestions(mcQuestions, "mc") || added;
                    }
                    if (harderQuestions.length) {
                      const harderAdded = applyQuizQuestions(harderQuestions, "harder");
                      if (harderAdded && !sessionData.mcStageCompletedAt) {
                        recordQuizStageTransition("mc", "harder");
                      }
                      added = harderAdded || added;
                    }
                    if (added) {
                      return updated;
                    }
                  } else {
                    // Extract current question from assistant message (wrapped in ◊) for other phases
                    const questionMatch = fullMessage.match(/◊([^◊]+)◊/);
                    if (questionMatch) {
                      setCurrentQuestion(questionMatch[1].trim());
                    }
                  }
                
                // Capture lesson content during learn phase and parse into parts
                // Check both currentTopic state and conversation for topic selection
                // Also check if this is a lesson generation message (contains "Generate a comprehensive lesson")
                const isLessonGeneration = conversationRef.current.some(msg => 
                  msg.role === "user" && msg.content.includes("Generate a comprehensive lesson")
                );
                const topicFromMessage = isLessonGeneration 
                  ? conversationRef.current.find(msg => msg.role === "user" && msg.content.includes("Generate a comprehensive lesson"))
                    ?.content.match(/Generate a comprehensive lesson on "(.+?)"/)?.[1] || ""
                  : "";
                const activeTopic = currentTopic || topicFromMessage;
                
                if (phase === "learn" && activeTopic && fullMessage.length > 20) {
                  
                  // Update currentTopic if it's not set (fix stale closure issue)
                  if (!currentTopic && activeTopic) {
                    setCurrentTopic(activeTopic);
                  }
                  
                  setSessionData(prev => ({
                    ...prev,
                    newTopicLesson: fullMessage,
                  }));
                  
                  // Show lesson card when we have content (no page splitting)
                  if (fullMessage.length > 100) {
                    setShowLessonCard(true);
                  }
                }
                
                  setLastAssistantMessage(fullMessage);
                  return updated;
                });
              }
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            } else if (parsed.type === "done") {
              // Log the complete response from Chad, especially for topic suggestions
              const isTopicSuggestionPhase = phase === "learn" && !topicToCheck && !currentTopic;
              if (isTopicSuggestionPhase) {
                console.log("🎯 STREAMING COMPLETE - Full response from Chad for topic suggestions:", {
                  accumulatedLength: accumulated.length,
                  fullText: accumulated,
                  hasTopicSuggestions: /TOPIC[_\s-]*SUGGESTION/i.test(accumulated),
                  lineCount: accumulated.split('\n').length
                });
              }
              
              // Finalize accumulated content
              setConversation((prev) => {
                const updated = [...prev];
                if (updated[updated.length - 1]?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: accumulated,
                  };
                }
                conversationRef.current = updated;
                
                // Final parse of quiz questions after streaming is complete
                if (phase === "quiz") {
                  const parsedQuestions = extractSurgeQuizQuestionsFromText(accumulated);
                  const mcQuestions = parsedQuestions.filter((q) => q.stage === "mc");
                  const harderQuestions = parsedQuestions.filter((q) => q.stage === "harder");
                  let added = false;
                  if (mcQuestions.length) {
                    added = applyQuizQuestions(mcQuestions, "mc") || added;
                  }
                  if (harderQuestions.length) {
                    const harderAdded = applyQuizQuestions(harderQuestions, "harder");
                    if (harderAdded && !sessionData.mcStageCompletedAt) {
                      recordQuizStageTransition("mc", "harder");
                    }
                    added = harderAdded || added;
                  }
                  if (!added) {
                    setQuizLoading(false);
                    setSending(false);
                  }
                }
                
                // Final parse - just ensure lesson card is shown
                if (phase === "learn" && currentTopic && accumulated.length > 100) {
                  setShowLessonCard(true);
                }
                
                return updated;
              });

              if (phase === "learn" && !currentTopic && !showTopicSelection) {
                console.log("🏁 Final parse after streaming complete:", {
                  accumulatedLength: accumulated.length,
                  fullAccumulated: accumulated.substring(0, 500) // First 500 chars for debugging
                });
                const finalTopics = extractTopicSuggestions(accumulated, TOPIC_SUGGESTION_TARGET);
                console.log("🏁 Final topics parsed:", {
                  topicsCount: finalTopics.length,
                  topics: finalTopics,
                  meetsMinimum: finalTopics.length >= MIN_TOPIC_SUGGESTIONS
                });
                
                // Always stop the spinner, even if we don't have enough topics
                setSending(false);
                
                if (finalTopics.length >= MIN_TOPIC_SUGGESTIONS) {
                  console.log("✅ Setting final topic suggestions in UI:", finalTopics);
                  setSuggestedTopics(finalTopics);
                  setShowTopicSelection(true);
                  setConversation([]);
                  conversationRef.current = [];
                } else if (finalTopics.length > 0) {
                  // If we have some topics but not enough, still show them
                  console.log("⚠️ Only found", finalTopics.length, "topics, but showing them anyway");
                  setSuggestedTopics(finalTopics);
                  setShowTopicSelection(true);
                  setConversation([]);
                  conversationRef.current = [];
                } else {
                  console.warn("⚠️ No topics found in response:", {
                    found: finalTopics.length,
                    required: MIN_TOPIC_SUGGESTIONS,
                    accumulatedPreview: accumulated.substring(0, 200)
                  });
                }
              }
            }
          } catch (err) {
            if (!(err instanceof SyntaxError)) {
              throw err;
            }
          }
        });
      }

      // Process actions (if any)
      for (const action of finalActions) {
        // Actions are handled, but practice logging is done via API call in sendMessage
      }
    } catch (err: any) {
      setError(err?.message || "Failed to send message");
      console.error("Chat error:", err);
    } finally {
      setSending(false);
      // Also stop quiz loading when sending is done (in case questions weren't parsed)
      if (phase === "quiz") {
        setQuizLoading(false);
      }
    }
  };

  // Wrapper function for backward compatibility
  const sendMessageWithExistingMessages = async (messages: ChatMessage[]) => {
    return sendMessageWithContext(messages);
  };

  const handleTopicSelect = async (topic: string) => {
    setCurrentTopic(topic);
    setSessionData(prev => ({ ...prev, newTopic: topic }));
    setShowTopicSelection(false);
    setSuggestedTopics([]);
    setConversation([]);
    conversationRef.current = [];
    setCurrentQuestion("");
    setShowLessonCard(false);
    // Reset trigger so we can send a new message
    topicSuggestionTriggered.current = false;
    
    // Use the same endpoint as normal lessons for consistency
    try {
      setSending(true);
      setError(null);
      
      // Initialize conversation state for streaming
      setConversation([{ role: "assistant", content: "" }]);
      conversationRef.current = [{ role: "assistant", content: "" }];
      setShowLessonCard(false);
      
      const res = await fetch("/api/node-lesson/stream", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: data?.subject || slug,
          topic: topic,
          course_context: data?.course_context || "",
          combinedText: data?.combinedText || "",
          topicSummary: "", // Surge doesn't use topic summaries
          lessonsMeta: [{ type: "Full Lesson", title: topic }], // Single full lesson
          lessonIndex: 0,
          previousLessons: [],
          generatedLessons: [],
          otherLessonsMeta: [],
          courseTopics: [], // Not needed for Surge
          languageName: data?.course_language_name || "",
        })
      });
      
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson?.error || `Server error (${res.status})`);
      }
      
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      
      const decoder = new TextDecoder();
      let accumulated = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "text") {
              accumulated += parsed.content;
              
              // Update conversation state
              setConversation([{ role: "assistant", content: accumulated }]);
              conversationRef.current = [{ role: "assistant", content: accumulated }];
              
              // Update lesson card state
              if (accumulated.length > 100) {
                setShowLessonCard(true);
              }
              
              // Update session data
              setSessionData(prev => ({
                ...prev,
                newTopicLesson: accumulated,
              }));
            } else if (parsed.type === "done") {
              setSending(false);
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Streaming error");
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e);
          }
        }
      }
      
      setSending(false);
    } catch (err: any) {
      console.error("Error generating lesson:", err);
      setError(err?.message || "Failed to generate lesson");
      setSending(false);
    }
  };

  const handleCustomTopicSubmit = () => {
    if (customTopicInput.trim()) {
      handleTopicSelect(customTopicInput.trim());
      setCustomTopicInput("");
      setShowCustomInput(false);
    }
  };

  // Removed keyboard navigation for lesson parts - lessons are now single continuous documents

  // Hide hover effect and cursor on scroll (but not during lesson/quiz generation)
  useEffect(() => {
    if (!showLessonCard && phase !== "learn") return;

    function handleScroll() {
      // Don't hide cursor if content is being generated/streamed
      if (sending || quizLoading) {
        return;
      }

      // Clear hover effect immediately
      setHoverWordRects([]);
      setIsScrolling(true);
      setCursorHidden(true);

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Reset scrolling state after scroll ends (but keep cursor hidden until mouse moves)
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    }

    function handleMouseMove() {
      // Show cursor again when mouse moves after scrolling
      setCursorHidden(false);
    }

    // Listen to scroll events on the lesson content container and window
    const lessonContent = document.querySelector('.lesson-content');
    if (lessonContent) {
      lessonContent.addEventListener('scroll', handleScroll, { passive: true });
      lessonContent.addEventListener('mousemove', handleMouseMove, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('wheel', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      if (lessonContent) {
        lessonContent.removeEventListener('scroll', handleScroll);
        lessonContent.removeEventListener('mousemove', handleMouseMove);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wheel', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [showLessonCard, phase, sending, quizLoading]);

  const handlePhaseTransition = () => {
    if (phase === "repeat") {
      setPhase("learn");
      setCurrentTopic("");
      setSuggestedTopics([]);
      setShowTopicSelection(false);
      setShowCustomInput(false);
      setConversation([]);
      conversationRef.current = [];
      setCurrentQuestion("");
      topicSuggestionTriggered.current = false;
    } else if (phase === "learn") {
      setPhase("quiz");
      setConversation([]);
      conversationRef.current = [];
      setCurrentQuestion("");
    } else if (phase === "quiz") {
      setPhase("complete");
      saveSession();
    }
  };

  const saveCurrentSession = async (isComplete = false, overrideSessionData?: typeof sessionData) => {
    try {
      const dataToSave = overrideSessionData || sessionData;
      
      // Generate summary for next session
      const repeatedTopicsList = dataToSave.repeatedTopics.length > 0
        ? dataToSave.repeatedTopics.map(rt => `${rt.topic} (avg: ${rt.averageScore.toFixed(1)}/10)`).join(", ")
        : "No previous topics";
      const quizAvg = dataToSave.quizResults.length > 0
        ? (dataToSave.quizResults.reduce((a, b) => a + b.grade, 0) / dataToSave.quizResults.length).toFixed(1)
        : "N/A";
      const stageNote = dataToSave.mcStageCompletedAt
        ? " MC quiz completed before moving to harder questions."
        : "";
      const statusLabel = isComplete ? "" : " (In Progress)";
      const summary = `Last Surge session reviewed: ${repeatedTopicsList}. New topic introduced: ${currentTopic || dataToSave.newTopic}. Quiz results: ${dataToSave.quizResults.length} questions with average score ${quizAvg}/10.` + stageNote;

      // CRITICAL: Load fresh data ONCE from localStorage to get the latest edited timestamps
      // This ensures we don't overwrite dates that were edited in the modal
      const currentData = loadSubjectData(slug);
      
      // Check if this session already exists and get its timestamp (may have been edited)
      let existingTimestamp: number | null = null;
      if (currentData?.surgeLog) {
        const existingEntry = currentData.surgeLog.find(e => e.sessionId === sessionId);
        if (existingEntry) {
          existingTimestamp = existingEntry.timestamp;
          console.log("Found existing entry for current session:", {
            sessionId,
            existingTimestamp,
            existingDate: new Date(existingTimestamp).toISOString(),
            willPreserve: true
          });
        }
      }
      
      const entry: SurgeLogEntry = {
        sessionId,
        timestamp: existingTimestamp || Date.now(), // Use existing timestamp if available (may have been edited)
        repeatedTopics: dataToSave.repeatedTopics,
        newTopic: currentTopic || dataToSave.newTopic,
        newTopicLesson: dataToSave.newTopicLesson || lastAssistantMessage,
        quizResults: dataToSave.quizResults,
        quizStageTransitions: dataToSave.quizStageTransitions,
        mcStageCompletedAt: dataToSave.mcStageCompletedAt,
        summary: summary + statusLabel,
      };

      console.log("Saving surge session entry:", {
        sessionId: entry.sessionId,
        timestamp: entry.timestamp,
        timestampDate: new Date(entry.timestamp).toISOString(),
        newTopic: entry.newTopic,
        quizResultsCount: entry.quizResults.length,
        isComplete,
      });

      if (currentData) {
        if (!currentData.surgeLog) {
          currentData.surgeLog = [];
        }
        
        // CRITICAL: Before modifying, preserve ALL other entries' timestamps
        // Store original timestamps for all entries to prevent accidental overwrites
        // This Map will be used to restore any timestamps that get accidentally changed
        const originalTimestamps = new Map<string, number>();
        currentData.surgeLog.forEach((e: any) => {
          originalTimestamps.set(e.sessionId, e.timestamp);
        });
        
        console.log("=== SAVE SESSION - PRESERVING TIMESTAMPS ===");
        console.log("Original timestamps map:", Array.from(originalTimestamps.entries()).map(([id, ts]) => ({
          sessionId: id,
          timestamp: ts,
          date: new Date(ts).toISOString()
        })));
        
        // Find existing session with same sessionId
        const existingIndex = currentData.surgeLog.findIndex(e => e.sessionId === sessionId);
        
        console.log("=== SAVE SESSION DEBUG START ===");
        console.log("Current sessionId:", sessionId);
        console.log("All existing entries before save:", JSON.stringify(currentData.surgeLog.map((e: any, idx: number) => ({
          index: idx,
          sessionId: e.sessionId,
          timestamp: e.timestamp,
          date: new Date(e.timestamp).toISOString(),
          isCurrentSession: e.sessionId === sessionId
        })), null, 2));
        
        // CRITICAL: FIRST, restore ALL other entries' timestamps BEFORE we modify anything
        // This must happen FIRST to prevent any accidental overwrites
        console.log("=== STEP 1: RESTORING ALL OTHER ENTRIES' TIMESTAMPS (BEFORE UPDATE) ===");
        currentData.surgeLog.forEach((e: any, idx: number) => {
          if (e.sessionId !== sessionId && originalTimestamps.has(e.sessionId)) {
            const originalTimestamp = originalTimestamps.get(e.sessionId)!;
            const currentTimestamp = currentData.surgeLog![idx].timestamp;
            if (currentTimestamp !== originalTimestamp) {
              console.warn(`⚠️ RESTORING timestamp for entry ${e.sessionId} from ${currentTimestamp} (${new Date(currentTimestamp).toISOString()}) to ${originalTimestamp} (${new Date(originalTimestamp).toISOString()})`);
            }
            // Force restore
            currentData.surgeLog![idx] = {
              ...currentData.surgeLog![idx],
              timestamp: originalTimestamp
            };
          }
        });
        
        // NOW update the current session
        if (existingIndex !== -1) {
          // Update existing session - preserve the existing timestamp (may have been edited by user)
          const existingEntry = currentData.surgeLog[existingIndex];
          console.log("=== STEP 2: UPDATING EXISTING SESSION at index", existingIndex, "===");
          console.log("Existing entry before update:", {
            sessionId: existingEntry.sessionId,
            timestamp: existingEntry.timestamp,
            date: new Date(existingEntry.timestamp).toISOString()
          });
          console.log("New entry data (will be merged):", {
            sessionId: entry.sessionId,
            timestamp: entry.timestamp,
            date: new Date(entry.timestamp).toISOString(),
            quizResultsCount: entry.quizResults.length
          });
          
          // CRITICAL: Use the existing entry's timestamp, not the new entry's timestamp
          currentData.surgeLog[existingIndex] = {
            ...entry,
            timestamp: existingEntry.timestamp, // Preserve the original/edited timestamp
          };
          
          console.log("After merge - entry at index", existingIndex, ":", {
            sessionId: currentData.surgeLog[existingIndex].sessionId,
            timestamp: currentData.surgeLog[existingIndex].timestamp,
            date: new Date(currentData.surgeLog[existingIndex].timestamp).toISOString(),
            preserved: currentData.surgeLog[existingIndex].timestamp === existingEntry.timestamp
          });
        } else {
          // Add new session
          console.log("=== STEP 2: ADDING NEW SESSION ===");
          console.log("New entry:", {
            sessionId: entry.sessionId,
            timestamp: entry.timestamp,
            date: new Date(entry.timestamp).toISOString()
          });
          currentData.surgeLog.push(entry);
        }
        
        // CRITICAL: FINAL check - restore ALL other entries' timestamps one more time
        // This is a safety net to catch any overwrites that might have happened
        console.log("=== STEP 3: FINAL TIMESTAMP RESTORATION CHECK ===");
        let anyRestored = false;
        currentData.surgeLog.forEach((e: any, idx: number) => {
          if (e.sessionId !== sessionId && originalTimestamps.has(e.sessionId)) {
            const originalTimestamp = originalTimestamps.get(e.sessionId)!;
            const currentTimestamp = currentData.surgeLog![idx].timestamp;
            if (currentTimestamp !== originalTimestamp) {
              console.error(`❌ ERROR: Entry ${e.sessionId} timestamp was changed! Restoring from ${currentTimestamp} (${new Date(currentTimestamp).toISOString()}) to ${originalTimestamp} (${new Date(originalTimestamp).toISOString()})`);
              currentData.surgeLog![idx] = {
                ...currentData.surgeLog![idx],
                timestamp: originalTimestamp
              };
              anyRestored = true;
            }
          }
        });
        if (!anyRestored) {
          console.log("✓ All timestamps preserved correctly");
        }
        console.log("=== FINAL TIMESTAMP CHECK COMPLETE ===");
        
        console.log("After timestamp restoration:", JSON.stringify(currentData.surgeLog.map((e: any) => ({
          sessionId: e.sessionId,
          timestamp: e.timestamp,
          date: new Date(e.timestamp).toISOString(),
          wasRestored: e.sessionId !== sessionId && originalTimestamps.has(e.sessionId)
        })), null, 2));
        
        console.log("All entries in memory after update and timestamp preservation (before save):", JSON.stringify(currentData.surgeLog.map((e: any, idx: number) => ({
          index: idx,
          sessionId: e.sessionId,
          timestamp: e.timestamp,
          date: new Date(e.timestamp).toISOString(),
          wasPreserved: e.sessionId !== sessionId && originalTimestamps.has(e.sessionId)
        })), null, 2));
        console.log("=== SAVE SESSION DEBUG END ===");
        
        // Keep only last 50 sessions
        if (currentData.surgeLog.length > 50) {
          currentData.surgeLog = currentData.surgeLog.slice(-50);
        }
        
        console.log("=== BEFORE SAVING TO STORAGE ===");
        console.log("Data to save - all surgeLog entries:", JSON.stringify(currentData.surgeLog.map((e: any, idx: number) => ({
          index: idx,
          sessionId: e.sessionId,
          timestamp: e.timestamp,
          date: new Date(e.timestamp).toISOString()
        })), null, 2));
        
        await saveSubjectDataAsync(slug, currentData);
        
        // CRITICAL: Verify the save immediately after
        const verifyAfterSave = loadSubjectData(slug);
        if (verifyAfterSave?.surgeLog) {
          console.log("=== AFTER SAVING TO STORAGE - VERIFICATION ===");
          console.log("All entries after save:", JSON.stringify(verifyAfterSave.surgeLog.map((e: any, idx: number) => ({
            index: idx,
            sessionId: e.sessionId,
            timestamp: e.timestamp,
            date: new Date(e.timestamp).toISOString(),
            isCurrentSession: e.sessionId === sessionId
          })), null, 2));
          
          // Check if any timestamps were lost
          const editedEntry = verifyAfterSave.surgeLog.find((e: any) => e.sessionId === sessionId);
          if (editedEntry) {
            console.log("Current session entry after save:", {
              sessionId: editedEntry.sessionId,
              timestamp: editedEntry.timestamp,
              date: new Date(editedEntry.timestamp).toISOString(),
              expectedTimestamp: existingIndex !== -1 ? originalTimestamps.get(sessionId) : entry.timestamp,
              match: editedEntry.timestamp === (existingIndex !== -1 ? originalTimestamps.get(sessionId) : entry.timestamp)
            });
          }
          
          // Check all other entries to see if their timestamps were preserved
          verifyAfterSave.surgeLog.forEach((e: any) => {
            if (e.sessionId !== sessionId && originalTimestamps.has(e.sessionId)) {
              const original = originalTimestamps.get(e.sessionId)!;
              if (e.timestamp !== original) {
                console.error(`ERROR: Entry ${e.sessionId} timestamp was changed from ${original} (${new Date(original).toISOString()}) to ${e.timestamp} (${new Date(e.timestamp).toISOString()})`);
              } else {
                console.log(`✓ Entry ${e.sessionId} timestamp preserved: ${e.timestamp} (${new Date(e.timestamp).toISOString()})`);
              }
            }
          });
          console.log("=== VERIFICATION END ===");
        }
      } else {
        // No existing data, create new
        const newData: StoredSubjectData = {
          subject: slug,
          files: [],
          combinedText: "",
          nodes: {},
          surgeLog: [entry],
          examDates: [],
        };
        await saveSubjectDataAsync(slug, newData);
        console.log("Created new subject data with surge session");
      }
    } catch (e) {
      console.error("Failed to save surge session:", e);
    }
  };

  const saveSession = async () => {
    await saveCurrentSession(true);
  };

  const persistSurgeLessonToCourse = useCallback(
    async (lessonContent: string, topicName: string) => {
      const trimmedLesson = lessonContent?.trim();
      if (!trimmedLesson || !topicName) return;

      const signature = `${sessionId}:${topicName}:${trimmedLesson.length}:${stableTextHash(trimmedLesson)}`;
      if (lastPersistedLessonSignatureRef.current === signature) {
        return;
      }

      let currentData = loadSubjectData(slug);
      if (!currentData) {
        currentData = {
          subject: slug,
          files: [],
          combinedText: "",
          nodes: {},
          topics: [],
          tree: { subject: slug, topics: [] },
        };
      } else {
        currentData = { ...currentData };
      }

      const nodesCopy: Record<string, any> = { ...(currentData.nodes || {}) };
      const existingNode = nodesCopy[topicName];
      const normalizedNode =
        existingNode && typeof existingNode === "object"
          ? {
              ...existingNode,
              lessons: Array.isArray(existingNode.lessons) ? [...existingNode.lessons] : [],
              lessonsMeta: Array.isArray(existingNode.lessonsMeta) ? [...existingNode.lessonsMeta] : [],
            }
          : {
              overview: "",
              symbols: [],
              lessons: [],
              lessonsMeta: [],
            };

      const existingIndex = Array.isArray(normalizedNode.lessons)
        ? normalizedNode.lessons.findIndex((lesson: any) => lesson?.surgeSessionId === sessionId)
        : -1;

      const timestamp = Date.now();
      const lessonTitle =
        (existingIndex !== -1 && normalizedNode.lessons?.[existingIndex]?.title) || `${topicName} (Surge Lesson)`;

      const previousLesson = existingIndex !== -1 ? normalizedNode.lessons[existingIndex] : null;
      const baseLesson = {
        ...(previousLesson || {}),
        title: lessonTitle,
        body: trimmedLesson,
        quiz: Array.isArray(previousLesson?.quiz) ? previousLesson?.quiz : [],
        flashcards: previousLesson?.flashcards,
        metadata: previousLesson?.metadata,
        origin: "surge" as const,
        surgeSessionId: sessionId,
        createdAt: previousLesson?.createdAt || timestamp,
        updatedAt: timestamp,
      };

      if (existingIndex !== -1 && Array.isArray(normalizedNode.lessons)) {
        normalizedNode.lessons[existingIndex] = baseLesson;
        if (Array.isArray(normalizedNode.lessonsMeta)) {
          normalizedNode.lessonsMeta[existingIndex] = {
            type: "Surge Lesson",
            title: lessonTitle,
          };
        } else {
          normalizedNode.lessonsMeta = [];
          normalizedNode.lessonsMeta[existingIndex] = { type: "Surge Lesson", title: lessonTitle };
        }
      } else {
        normalizedNode.lessons = Array.isArray(normalizedNode.lessons) ? [...normalizedNode.lessons, baseLesson] : [baseLesson];
        normalizedNode.lessonsMeta = Array.isArray(normalizedNode.lessonsMeta)
          ? [...normalizedNode.lessonsMeta, { type: "Surge Lesson", title: lessonTitle }]
          : [{ type: "Surge Lesson", title: lessonTitle }];
      }

      nodesCopy[topicName] = normalizedNode;

      let topicsList = Array.isArray(currentData.topics) ? [...currentData.topics] : [];
      if (!topicsList.some((t) => t.name === topicName)) {
        topicsList.push({ name: topicName, summary: "" });
      }

      const treeTopics = currentData.tree?.topics ? [...currentData.tree.topics] : [];
      if (!treeTopics.some((t: any) => t.name === topicName)) {
        treeTopics.push({ name: topicName, subtopics: [] });
      }
      const tree = {
        subject: currentData.tree?.subject || currentData.subject || slug,
        topics: treeTopics,
      };

      const progress = { ...(currentData.progress || {}) };
      const existingProgress = progress[topicName] || { totalLessons: 0, completedLessons: 0 };
      progress[topicName] = {
        ...existingProgress,
        totalLessons: Array.isArray(normalizedNode.lessons) ? normalizedNode.lessons.length : existingProgress.totalLessons,
        completedLessons: Math.min(existingProgress.completedLessons || 0, Array.isArray(normalizedNode.lessons) ? normalizedNode.lessons.length : existingProgress.totalLessons),
      };

      const updatedData: StoredSubjectData = {
        ...currentData,
        subject: currentData.subject || slug,
        nodes: nodesCopy,
        topics: topicsList,
        tree,
        progress,
      };

      await saveSubjectDataAsync(slug, updatedData);
      setData(updatedData);
      lastPersistedLessonSignatureRef.current = signature;
      console.log("Saved Surge lesson to course content", { topicName, sessionId });
    },
    [sessionId, slug, setData]
  );

  const activeSurgeTopic = currentTopic || sessionData.newTopic;
  const surgeLessonContent = sessionData.newTopicLesson;

  useEffect(() => {
    if (!surgeLessonContent || !activeSurgeTopic) return;
    const trimmed = surgeLessonContent.trim();
    if (trimmed.length < 200) return;
    persistSurgeLessonToCourse(trimmed, activeSurgeTopic);
  }, [surgeLessonContent, activeSurgeTopic, persistSurgeLessonToCourse]);

  const [inputValue, setInputValue] = useState("");

  // Word click handler (copied from lesson page)
  async function onWordClick(word: string, parentText: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.target) return;

    // Position at middle bottom of screen
    // x is the horizontal center, y will be adjusted by WordPopover to stay on screen
    const x = window.innerWidth / 2;
    const y = window.innerHeight - 20; // Target: 20px from bottom (WordPopover will adjust if needed)

    setExplanationPosition({ x, y });
    setExplanationWord(word);
    setShowExplanation(true);
    setExplanationLoading(true);
    setExplanationError(null);
    setExplanationContent("");

    try {
      const idx = parentText.indexOf(word);
      const localContext = idx >= 0 ? parentText.slice(Math.max(0, idx - 120), Math.min(parentText.length, idx + word.length + 120)) : parentText.slice(0, 240);
      const res = await fetch("/api/quick-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: data?.subject || slug,
          topic: currentTopic || sessionData.newTopic || "",
          word,
          localContext,
          courseTopics: data?.topics?.map(t => t.name) || [],
          languageName: data?.course_language_name || ""
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Server error (${res.status})`);
      setExplanationContent(json.content || "");
    } catch (err: any) {
      setExplanationError(err?.message || "Failed to explain");
    } finally {
      setExplanationLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 relative">
        {/* Centered glow behind the surge box */}
        <div 
          className="absolute inset-0 -z-10 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.15), rgba(255, 45, 150, 0.15))',
            filter: 'blur(40px)',
            left: '50%',
            right: 'auto',
            width: '100%',
            maxWidth: '100%',
            transform: 'translateX(-50%)',
          }}
        />
        <div className="mb-6">

          {/* Phase Indicator */}
          <div className="mb-4">
            <div className="flex items-baseline text-xs mb-2 relative" style={{ lineHeight: '1.25rem', height: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  if (phase !== "repeat") {
                    // Check surge logs and log what we find
                    const allSurgeLogs = getSurgeLog(slug);
                    const lastSurgeCheck = getLastSurgeSession(slug);
                    
                    console.log("=== REVIEW BUTTON CLICKED ===");
                    console.log("Total surge log entries:", allSurgeLogs.length);
                    console.log("All surge log entries:", allSurgeLogs);
                    console.log("Last surge session:", lastSurgeCheck);
                    
                    // Extract all unique topics from all surge log entries
                    const allTopics = new Set<string>();
                    const topicsBySource: { repeatedTopics: string[]; newTopics: string[]; quizResults: string[] } = {
                      repeatedTopics: [],
                      newTopics: [],
                      quizResults: []
                    };
                    
                    allSurgeLogs.forEach((entry, idx) => {
                      console.log(`\nEntry ${idx + 1}:`, {
                        timestamp: new Date(entry.timestamp).toLocaleDateString(),
                        repeatedTopics: entry.repeatedTopics?.map(rt => rt?.topic).filter(Boolean) || [],
                        newTopic: entry.newTopic || "",
                        quizResultsTopics: entry.quizResults?.map(r => r.topic).filter(Boolean) || [],
                        quizResultsCount: entry.quizResults?.length || 0
                      });
                      
                      // Add topics from repeatedTopics
                      if (entry.repeatedTopics && Array.isArray(entry.repeatedTopics)) {
                        entry.repeatedTopics.forEach(rt => {
                          if (rt?.topic) {
                            allTopics.add(rt.topic);
                            topicsBySource.repeatedTopics.push(rt.topic);
                          }
                        });
                      }
                      // Add newTopic
                      if (entry.newTopic) {
                        allTopics.add(entry.newTopic);
                        topicsBySource.newTopics.push(entry.newTopic);
                      }
                      // Add topics from quizResults
                      if (entry.quizResults && Array.isArray(entry.quizResults)) {
                        entry.quizResults.forEach(result => {
                          if (result.topic) {
                            allTopics.add(result.topic);
                            topicsBySource.quizResults.push(result.topic);
                          }
                        });
                      }
                    });
                    
                    const topicsToReview = Array.from(allTopics);
                    
                    console.log("\nTopics by source:");
                    console.log("  - From repeatedTopics:", [...new Set(topicsBySource.repeatedTopics)]);
                    console.log("  - From newTopics:", [...new Set(topicsBySource.newTopics)]);
                    console.log("  - From quizResults:", [...new Set(topicsBySource.quizResults)]);
                    console.log("\nTotal unique topics found:", topicsToReview.length);
                    console.log("All topics to review:", topicsToReview);
                    
                    // Check if any entry is due for review (at least 1 day old)
                    if (lastSurgeCheck) {
                      const lastDate = new Date(lastSurgeCheck.timestamp);
                      const today = new Date();
                      const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
                      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                      const daysDiff = Math.floor((todayDay.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));
                      console.log("\nLast surge date:", lastDate.toLocaleDateString());
                      console.log("Today date:", today.toLocaleDateString());
                      console.log("Days difference:", daysDiff);
                      console.log("Due for review:", daysDiff >= 1 ? "YES" : "NO");
                    }
                    
                    console.log("===========================");
                    
                    userSetPhaseRef.current = true; // Mark that user manually set the phase
                    setPhase("repeat");
                    setQuizQuestions([]);
                    setQuizResponses({});
                    setCurrentQuizIndex(0);
                    setShortAnswer("");
                    setConversation([]);
                    conversationRef.current = [];
                    setCurrentQuestion("");
                  }
                }}
                className={`absolute phase-button ${phase === "repeat" ? "text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] bg-clip-text text-transparent" : "text-[var(--foreground)]/30"} transition-opacity hover:opacity-70 cursor-pointer`}
                style={{ lineHeight: '1.25rem', left: '15%', transform: 'translateX(-50%)' }}
              >
                Review
              </button>
              <button
                type="button"
                onClick={() => {
                  if (phase !== "learn") {
                    userSetPhaseRef.current = true; // Mark that user manually set the phase
                    setPhase("learn");
                    setCurrentTopic("");
                    setSuggestedTopics([]);
                    setShowTopicSelection(false);
                    setShowCustomInput(false);
                    setConversation([]);
                    conversationRef.current = [];
                    setCurrentQuestion("");
                    topicSuggestionTriggered.current = false;
                  }
                }}
                className={`absolute phase-button ${phase === "learn" ? "text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] bg-clip-text text-transparent" : "text-[var(--foreground)]/30"} transition-opacity hover:opacity-70 cursor-pointer`}
                style={{ lineHeight: '1.25rem', left: '50%', transform: 'translateX(-50%)' }}
              >
                Learn
              </button>
              <button
                type="button"
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.altKey) {
                    event.preventDefault();
                    handleDebugQuizStart();
                  } else if (phase !== "quiz" && phase === "learn" && currentTopic) {
                    userSetPhaseRef.current = true; // Mark that user manually set the phase
                    setPhase("quiz");
                    setConversation([]);
                    conversationRef.current = [];
                    setCurrentQuestion("");
                  }
                }}
                className={`absolute phase-button ${phase === "quiz" ? "text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] bg-clip-text text-transparent" : "text-[var(--foreground)]/30"} transition-opacity hover:opacity-70 cursor-pointer`}
                style={{ lineHeight: '1.25rem', left: '85%', transform: 'translateX(-50%)' }}
                title="Hold Alt/Ctrl (or Cmd) while clicking to run the Erlang quiz debug"
              >
                Quiz
              </button>
            </div>
            <div className="flex-1 h-2 rounded-full mt-1 chat-input-container">
              <div 
                className={`h-full rounded-full transition-all ${phase === "repeat" || phase === "learn" || phase === "quiz" || phase === "complete" ? "bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)]" : ""}`} 
                style={{ width: phase === "repeat" ? "15%" : phase === "learn" ? "50%" : phase === "quiz" ? "85%" : "100%" }} 
              />
            </div>
          </div>

          <div className="text-sm text-[var(--foreground)]/70">
            {phase === "complete" && "Session complete! Great work!"}
          </div>
        </div>

        {phase === "complete" ? (
          <div className="rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 p-6 text-center">
            <div className="text-lg font-semibold text-[var(--foreground)] mb-2">
              🎉 Surge Complete!
            </div>
            <div className="text-sm text-[var(--foreground)]/70 mb-4">
              You've reviewed {sessionData.repeatedTopics.length} topic(s) and learned {sessionData.newTopic || currentTopic}
            </div>
            <button
              onClick={() => router.push(`/subjects/${slug}/surge`)}
              className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/30 text-[var(--foreground)] transition-colors"
            >
              Start Another Surge
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Review Page - Show when in repeat phase and no questions yet */}
            {isMounted && phase === "repeat" && quizQuestions.length === 0 && !quizLoading && !quizInfoMessage && (
              <div className="w-full flex justify-center">
                <div className="w-full max-w-2xl">
                  {(() => {
                    // Get all surge log entries and extract all unique topics
                    const allSurgeLogs = getSurgeLog(slug);
                    
                    // If log is empty, show welcome message immediately
                    if (!allSurgeLogs || allSurgeLogs.length === 0) {
                      // No surge log entries - show introduction aligned with homepage styling
                      return (
                        <div className="rounded-[28px] border border-[var(--foreground)]/12 bg-[var(--background)] px-6 py-8 md:px-10 md:py-10">
                          <div className="flex flex-col gap-6">
                            <div className="text-center space-y-2">
                              <h2 className="text-2xl md:text-[32px] font-semibold leading-tight text-[var(--foreground)]">
                                Welcome to Surge
                              </h2>
                              <p className="text-sm text-[var(--foreground)]/70 max-w-2xl mx-auto">
                                Let Chad take control of your learning, and just focus on understanding.
                              </p>
                            </div>

                            <div className="flex flex-col md:flex-row gap-3">
                              {[
                                {
                                  label: "Review",
                                  icon: (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                      <path d="M21 3v5h-5" />
                                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                      <path d="M3 21v-5h5" />
                                    </svg>
                                  ),
                                },
                                {
                                  label: "Learn",
                                  icon: (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                                      <path d="M8 7h6" />
                                      <path d="M8 11h8" />
                                      <path d="M8 15h4" />
                                    </svg>
                                  ),
                                },
                                {
                                  label: "Quiz",
                                  icon: (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M9 11l3 3L22 4" />
                                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                    </svg>
                                  ),
                                },
                              ].map((item, idx) => (
                                <div
                                  key={item.label}
                                  className="flex-1 flex items-center gap-3 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 px-5 py-4 text-[var(--foreground)]/80"
                                >
                                  <div className="text-[var(--foreground)]/60 flex-shrink-0">
                                    {item.icon}
                                  </div>
                                  <div className="text-sm font-medium text-[var(--foreground)]">{item.label}</div>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-3">
                              <button
                                onClick={() => {
                                  userSetPhaseRef.current = true; // Mark that user manually set the phase
                                  setPhase("learn");
                                  setCurrentTopic("");
                                  setSuggestedTopics([]);
                                  setShowTopicSelection(false);
                                  setShowCustomInput(false);
                                  setConversation([]);
                                  conversationRef.current = [];
                                  setCurrentQuestion("");
                                  topicSuggestionTriggered.current = false;
                                  // Clear quiz state if any
                                  setQuizQuestions([]);
                                  setQuizResponses({});
                                  setCurrentQuizIndex(0);
                                  setShortAnswer("");
                                }}
                                className="inline-flex h-10 items-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors"
                              >
                                Continue
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    // Get the course/subject name to filter it out
                    const courseName = data?.subject || "";
                    
                    // Extract all unique topics from all surge log entries
                    const allTopics = new Set<string>();
                    allSurgeLogs.forEach(entry => {
                      // Add topics from repeatedTopics
                      if (entry.repeatedTopics && Array.isArray(entry.repeatedTopics)) {
                        entry.repeatedTopics.forEach(rt => {
                          if (rt?.topic && rt.topic !== courseName) {
                            allTopics.add(rt.topic);
                          }
                        });
                      }
                      // Add newTopic (but not if it's the course name)
                      if (entry.newTopic && entry.newTopic !== courseName) {
                        allTopics.add(entry.newTopic);
                      }
                      // Add topics from quizResults (but not if it's the course name)
                      if (entry.quizResults && Array.isArray(entry.quizResults)) {
                        entry.quizResults.forEach(result => {
                          if (result.topic && result.topic !== courseName) {
                            allTopics.add(result.topic);
                          }
                        });
                      }
                    });
                    
                    const topicsToReview = Array.from(allTopics);
                    
                    // If no topics found after processing, show welcome message
                    if (topicsToReview.length === 0) {
                      return (
                        <div className="rounded-[28px] border border-[var(--foreground)]/12 bg-[var(--background)] px-6 py-8 md:px-10 md:py-10">
                          <div className="flex flex-col gap-6">
                            <div className="text-center space-y-2">
                              <h2 className="text-2xl md:text-[32px] font-semibold leading-tight text-[var(--foreground)]">
                                Welcome to Surge
                              </h2>
                              <p className="text-sm text-[var(--foreground)]/70 max-w-2xl mx-auto">
                                Let Chad take control of your learning, and just focus on understanding.
                              </p>
                            </div>

                            <div className="flex flex-col md:flex-row gap-3">
                              {[
                                {
                                  label: "Review",
                                  icon: (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                      <path d="M21 3v5h-5" />
                                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                      <path d="M3 21v-5h5" />
                                    </svg>
                                  ),
                                },
                                {
                                  label: "Learn",
                                  icon: (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                                      <path d="M8 7h6" />
                                      <path d="M8 11h8" />
                                      <path d="M8 15h4" />
                                    </svg>
                                  ),
                                },
                                {
                                  label: "Quiz",
                                  icon: (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M9 11l3 3L22 4" />
                                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                    </svg>
                                  ),
                                },
                              ].map((item, idx) => (
                                <div
                                  key={item.label}
                                  className="flex-1 flex items-center gap-3 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/80 px-5 py-4 text-[var(--foreground)]/80"
                                >
                                  <div className="text-[var(--foreground)]/60 flex-shrink-0">
                                    {item.icon}
                                  </div>
                                  <div className="text-sm font-medium text-[var(--foreground)]">{item.label}</div>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-3">
                              <button
                                onClick={() => {
                                  userSetPhaseRef.current = true;
                                  setPhase("learn");
                                  setCurrentTopic("");
                                  setSuggestedTopics([]);
                                  setShowTopicSelection(false);
                                  setShowCustomInput(false);
                                  setConversation([]);
                                  conversationRef.current = [];
                                  setCurrentQuestion("");
                                  topicSuggestionTriggered.current = false;
                                  setQuizQuestions([]);
                                  setQuizResponses({});
                                  setCurrentQuizIndex(0);
                                  setShortAnswer("");
                                }}
                                className="inline-flex h-10 items-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors"
                              >
                                Continue
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    // Has topics to review
                    const currentDataForReview = loadSubjectData(slug);
                    const reviewedTopics = currentDataForReview?.reviewedTopics || {};
                    
                    // Separate topics into reviewed and not reviewed
                    const notReviewedTopics = topicsToReview.filter(topic => !reviewedTopics[topic]);
                    const reviewedTopicsList = topicsToReview.filter(topic => reviewedTopics[topic]);
                    
                    return (
                      <div className="rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 p-8">
                        <div className="text-center mb-6">
                          <div className="text-xl font-semibold text-[var(--foreground)] mb-2">
                            Let's review
                          </div>
                          <div className="text-sm text-[var(--foreground)]/70 mb-6">
                            {notReviewedTopics.length > 0 
                              ? "We'll go through focused questions on these topics:"
                              : "All topics have been reviewed. You can reset topics to review them again."}
                          </div>
                          {notReviewedTopics.length > 0 && (
                            <div className="space-y-2 mb-6">
                              {notReviewedTopics.map((topic, idx) => (
                                <div key={idx} className="text-base text-[var(--foreground)]">
                                  • {topic}
                                </div>
                              ))}
                            </div>
                          )}
                          {reviewedTopicsList.length > 0 && (
                            <div className="space-y-2 mb-6">
                              <div className="text-sm font-medium text-[var(--foreground)]/60 mb-2">
                                Already reviewed:
                              </div>
                              {reviewedTopicsList.map((topic, idx) => (
                                <div key={idx} className="flex items-center justify-center gap-2 text-base text-[var(--foreground)]/70">
                                  <span>✓ {topic}</span>
                                  <button
                                    onClick={async () => {
                                      const data = loadSubjectData(slug);
                                      if (data) {
                                        if (!data.reviewedTopics) {
                                          data.reviewedTopics = {};
                                        }
                                        delete data.reviewedTopics[topic];
                                        await saveSubjectDataAsync(slug, data);
                                        // Force re-render by toggling phase
                                        setPhase("learn");
                                        setTimeout(() => setPhase("repeat"), 50);
                                      }
                                    }}
                                    className="btn-grey text-xs px-2 py-1"
                                    title="Reset review status"
                                  >
                                    Reset
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {notReviewedTopics.length > 0 ? (
                            <button
                              onClick={async () => {
                                // Prevent multiple clicks
                                if (quizLoading || reviewStartRequested.current) {
                                  console.log("Already generating review questions, please wait...");
                                  return;
                                }
                                
                                // Set flag immediately to prevent duplicate calls
                                reviewStartRequested.current = true;
                                
                                // Reset quiz state
                                setQuizQuestions([]);
                                setQuizResponses({});
                                setCurrentQuizIndex(0);
                                setShortAnswer("");
                                harderQuestionsRequested.current = false;
                                
                                // Call the function directly - it has guards to prevent multiple calls
                                await requestReviewQuestions();
                              }}
                              className="btn-grey rounded-lg font-medium"
                              style={{ 
                                paddingLeft: '3rem',
                                paddingRight: '3rem',
                                paddingTop: '1.125rem',
                                paddingBottom: '1.125rem',
                                fontSize: '1.125rem'
                              }}
                            >
                              Start
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setPhase("learn");
                                setQuizQuestions([]);
                                setQuizResponses({});
                                setCurrentQuizIndex(0);
                                setShortAnswer("");
                                setCurrentTopic("");
                                setSuggestedTopics([]);
                                setShowTopicSelection(false);
                                setShowCustomInput(false);
                                setConversation([]);
                                conversationRef.current = [];
                                setCurrentQuestion("");
                                topicSuggestionTriggered.current = false;
                              }}
                              className="btn-grey rounded-lg font-medium"
                              style={{ 
                                paddingLeft: '3rem',
                                paddingRight: '3rem',
                                paddingTop: '1.125rem',
                                paddingBottom: '1.125rem',
                                fontSize: '1.125rem'
                              }}
                            >
                              Continue
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            
            {/* Loading state for review questions */}
            {isMounted && phase === "repeat" && quizQuestions.length === 0 && (quizLoading || quizInfoMessage) && (
              <div className="w-full flex justify-center">
                <div className="flex items-center gap-2 text-[var(--foreground)]/60">
                  <GlowSpinner size={20} inline ariaLabel="Setting up review" idSuffix="surge-review" />
                  <span className="text-sm">{quizInfoMessage || "Chad is setting up the review..."}</span>
                </div>
              </div>
            )}
            
            {/* Quiz View - Review or Regular Quiz */}
            {(phase === "quiz" || phase === "repeat") && quizQuestions.length > 0 && currentQuizIndex < quizQuestions.length ? (
              <div className="rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 p-6">
                {(() => {
                  const currentQ = quizQuestions[currentQuizIndex];
                  if (!currentQ) return null;
                  const stageQuestions = quizQuestions.filter((q) => q.stage === currentQ.stage);
                  const stageIndex = stageQuestions.findIndex((q) => q.id === currentQ.id);
                  const currentResponse = quizResponses[currentQ.id];
                  const awaitingHarder =
                    currentQ.stage === "mc" &&
                    !!currentResponse &&
                    !quizQuestions.some((q) => q.stage === "harder") &&
                    getAnsweredCount("mc") >= stageQuestions.length;
                  const nextLabel =
                    currentQ.stage === "review"
                      ? quizQuestions.findIndex((q, idx) => idx > currentQuizIndex && q.stage === "review") === -1
                        ? "Complete Review"
                        : "Next Question"
                      : currentQ.stage === "mc"
                      ? quizQuestions.some((q, idx) => idx > currentQuizIndex && q.stage === "mc")
                        ? "Next Question"
                        : quizQuestions.some((q) => q.stage === "harder")
                        ? "Start Hard Quiz"
                        : "Next Question"
                      : quizQuestions.findIndex((q, idx) => idx > currentQuizIndex && q.stage === "harder") === -1
                      ? "Finish Quiz"
                      : "Next Question";

                  const explanationBlock = () => {
                    if (!currentResponse) return null;
                    if (currentQ.type === "mc") {
                      const userIdx = currentResponse.answer
                        ? currentResponse.answer.charCodeAt(0) - 65
                        : -1;
                      const correctIdx = currentQ.correctOption
                        ? currentQ.correctOption.charCodeAt(0) - 65
                        : -1;
                      return (
                        <div className="space-y-3 rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-4">
                          <div className="text-sm font-semibold text-[var(--foreground)]">
                            {currentResponse.isCorrect === null
                              ? "Answer recorded"
                              : currentResponse.isCorrect
                              ? "Correct!"
                              : "Not quite"}
                          </div>
                          {currentQ.explanation && (
                            <div className="text-sm text-[var(--foreground)]/80">
                              <div className="font-semibold mb-1">Explanation</div>
                              <LessonBody body={sanitizeLessonBody(currentQ.explanation)} />
                            </div>
                          )}
                        </div>
                      );
                    }

                    const hasAssessment = currentResponse.checked && currentResponse.assessment;
                    
                    return (
                      <div className="space-y-4 rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-4">
                        {hasAssessment ? (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold text-[var(--foreground)]">
                                {currentResponse.isCorrect ? "Great job!" : "Review your answer"}
                              </div>
                              <div className={`text-lg font-bold ${
                                currentResponse.score >= 8 ? "text-green-500" :
                                currentResponse.score >= 6 ? "text-yellow-500" :
                                "text-red-500"
                              }`}>
                                Grade: {currentResponse.score}/10
                              </div>
                            </div>
                            
                            {currentResponse.assessment && (
                              <div className="text-sm text-[var(--foreground)]/80">
                                <div className="font-semibold mb-1">Assessment</div>
                                <div>{currentResponse.assessment}</div>
                              </div>
                            )}
                            
                            {currentResponse.whatsGood && (
                              <div className="text-sm text-[var(--foreground)]/80">
                                <div className="font-semibold mb-1 text-green-500">✓ What's Good</div>
                                <div>{currentResponse.whatsGood}</div>
                              </div>
                            )}
                            
                            {currentResponse.whatsBad && (
                              <div className="text-sm text-[var(--foreground)]/80">
                                <div className="font-semibold mb-1 text-red-500">✗ What Needs Improvement</div>
                                <div>{currentResponse.whatsBad}</div>
                              </div>
                            )}
                            
                            {currentResponse.enhancedExplanation && (
                              <div className="text-sm text-[var(--foreground)]/80 border-t border-[var(--foreground)]/10 pt-3">
                                <div className="font-semibold mb-2">Enhanced Explanation</div>
                                <LessonBody body={sanitizeLessonBody(currentResponse.enhancedExplanation)} />
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-semibold text-[var(--foreground)]">
                              {currentResponse.isCorrect === null
                                ? "Answer recorded"
                                : currentResponse.isCorrect
                                ? "Great job!"
                                : "Review the model answer"}
                            </div>
                            {currentQ.modelAnswer && (
                              <div className="text-sm text-[var(--foreground)]/80">
                                <div className="font-semibold mb-1">Model answer</div>
                                <LessonBody body={sanitizeLessonBody(currentQ.modelAnswer)} />
                              </div>
                            )}
                            {currentQ.explanation && (
                              <div className="text-sm text-[var(--foreground)]/80">
                                <div className="font-semibold mb-1">Explanation</div>
                                <LessonBody body={sanitizeLessonBody(currentQ.explanation)} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      <div className="mb-4 flex items-center justify-between">
                        <div className="text-xs text-[var(--foreground)]/50">
                          {`Question ${currentQuizIndex + 1} of ${quizQuestions.length} ${
                            currentQ.stage === "review" 
                              ? (currentQ.type === "mc" ? "(Multiple Choice)" : "(Short Answer)")
                              : currentQ.stage === "mc" 
                              ? "(Multiple Choice)" 
                              : "(Short Answer)"
                          }`}
                        </div>
                        <div className="text-xs text-[var(--foreground)]/50">
                          {currentQ.stage === "review" 
                            ? (currentQ.type === "mc" ? "Review - Multiple Choice" : "Review - Short Answer")
                            : currentQ.stage === "mc" 
                            ? "Easy Questions" 
                            : "Harder Questions"}
                        </div>
                      </div>

                    <div className="space-y-6">
                      {/* Question */}
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-[var(--foreground)]/70 uppercase tracking-wide">
                          Question
                        </div>
                        <div className="text-lg font-semibold text-[var(--foreground)]">
                          <LessonBody body={sanitizeLessonBody(currentQ.question.endsWith("?") ? currentQ.question : `${currentQ.question}?`)} />
                        </div>
                      </div>

                      {/* Answer Input */}
                      {currentQ.type === 'mc' ? (
                        <div className="space-y-3">
                          <div className="text-sm font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-3">
                            Select an answer:
                          </div>
                          <div className="space-y-2">
                            {currentQ.options?.map((option, optIdx) => {
                              const optionLetter = String.fromCharCode(65 + optIdx);
                              const response = quizResponses[currentQ.id];
                              const isAnswered = !!response?.answer;
                              const isSelected = response?.answer === optionLetter;
                              const isCorrect =
                                currentQ.correctOption &&
                                currentQ.correctOption.toUpperCase() === optionLetter;
                              
                              // Determine styling based on answer state
                              // Base styles to match btn-grey exactly
                              const baseButtonStyle: React.CSSProperties = {
                                padding: '0.75rem 1rem',
                                borderRadius: '0.5rem',
                                fontSize: 'inherit',
                                lineHeight: 'inherit',
                                boxShadow: 'none',
                                width: '100%',
                                textAlign: 'left' as const,
                              };
                              
                              let buttonStyle: React.CSSProperties = { ...baseButtonStyle };
                              let buttonClasses = "btn-grey w-full text-left rounded-lg transition-all disabled:cursor-not-allowed";
                              
                              if (isAnswered) {
                                if (isCorrect) {
                                  // Green for correct answer - override colors but keep btn-grey for size
                                  buttonStyle = {
                                    ...baseButtonStyle,
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: 'rgb(34, 197, 94)',
                                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                    color: 'var(--foreground)',
                                  };
                                  // Remove btn-grey class to allow color override
                                  buttonClasses = "w-full text-left rounded-lg transition-all disabled:cursor-not-allowed";
                                } else if (isSelected) {
                                  // Red for selected incorrect answer - override colors but keep size
                                  buttonStyle = {
                                    ...baseButtonStyle,
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: 'rgb(239, 68, 68)',
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                    color: 'var(--foreground)',
                                  };
                                  // Remove btn-grey class to allow color override
                                  buttonClasses = "w-full text-left rounded-lg transition-all disabled:cursor-not-allowed";
                                } else {
                                  // Unselected options - use btn-grey with opacity
                                  buttonStyle = {
                                    ...baseButtonStyle,
                                    opacity: 0.6,
                                  };
                                }
                              }
                              
                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => handleMCOptionSelect(optionLetter)}
                                  disabled={isAnswered}
                                  className={buttonClasses}
                                  style={buttonStyle}
                                >
                                  <span className="font-semibold mr-2">{optionLetter})</span>
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm font-medium text-[var(--foreground)]/70 uppercase tracking-wide">
                            Your answer:
                          </div>
                          <textarea
                            value={shortAnswer}
                            onChange={(e) => setShortAnswer(e.target.value)}
                            placeholder="Type your answer here..."
                            disabled={!!quizResponses[currentQ.id]?.checked}
                            className="chat-input-container w-full min-h-[120px] px-4 py-3 rounded-lg border border-[var(--foreground)]/10 bg-transparent text-[var(--foreground)] placeholder:text-[var(--foreground)]/60 focus:outline-none focus:border-[var(--foreground)]/20 resize-none disabled:opacity-70 disabled:cursor-not-allowed"
                          />
                        </div>
                      )}

                      {explanationBlock()}

                      {/* Submit / Next Buttons */}
                      <div className="flex justify-end pt-2">
                        {currentQ.type === 'mc' ? (
                          <button
                            onClick={handleNextQuestion}
                            disabled={!quizResponses[currentQ.id]?.answer || awaitingHarder || quizLoading}
                            className="btn-grey rounded-lg font-medium"
                            style={{ padding: '0.5rem 1.5rem' }}
                          >
                            {awaitingHarder ? "Generating harder questions..." : nextLabel}
                          </button>
                        ) : (
                          <button
                            onClick={quizResponses[currentQ.id]?.checked ? handleNextQuestion : handleCheckAnswer}
                            disabled={
                              quizLoading ||
                              checkingAnswer ||
                              (!quizResponses[currentQ.id]?.checked && !shortAnswer.trim())
                            }
                            className="btn-grey rounded-lg font-medium"
                            style={{ padding: '0.5rem 1.5rem' }}
                          >
                            {checkingAnswer
                              ? "Checking..."
                              : quizResponses[currentQ.id]?.checked
                              ? nextLabel
                              : shortAnswer.trim()
                              ? "Check Answer"
                              : "Enter an answer"}
                          </button>
                        )}
                      </div>
                    </div>
                    </>
                  );
                })()}
              </div>
            ) : null}

            {/* Learn Phase Topic Recommendation */}
            {phase === "learn" && showTopicSelection && suggestedTopics.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-[var(--background)]/90 p-8">
                {(() => {
                  const [recommendedTopic, ...otherTopics] = suggestedTopics;
                  return (
                    <>
                      <div className="text-sm font-semibold text-[var(--accent-cyan)] uppercase tracking-[0.2em] mb-2 text-center">
                        Chad recommends starting with
                      </div>
                      <div className="text-3xl font-bold text-center text-[var(--foreground)] mb-3">
                        {recommendedTopic}
                      </div>
                      <div className="text-sm text-[var(--foreground)]/70 text-center max-w-2xl mx-auto mb-6">
                        This topic best matches your current progress and the course priorities. Start here to get the fastest momentum, or pick another option below.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-8">
                        <button
                          onClick={() => handleTopicSelect(recommendedTopic)}
                          className="btn-grey rounded-lg font-medium"
                          style={{ 
                            paddingLeft: '3rem',
                            paddingRight: '3rem',
                            paddingTop: '1.125rem',
                            paddingBottom: '1.125rem',
                            fontSize: '1.125rem'
                          }}
                        >
                          Start
                        </button>
                      </div>
                      {otherTopics.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-[0.3em] text-center">
                            Other options
                          </div>
                          <div className="flex flex-wrap justify-center gap-2">
                            {otherTopics.map((topic, idx) => (
                              <button
                                key={`${topic}-${idx}`}
                                onClick={() => handleTopicSelect(topic)}
                                className="px-3 py-1 rounded-full bg-[rgba(229,231,235,0.08)] border border-white/5 text-xs text-white/80 hover:text-white hover:bg-[rgba(229,231,235,0.12)] transition-colors"
                                style={{ boxShadow: 'none' }}
                              >
                                {topic}
                              </button>
                            ))}
                            <button
                              onClick={() => setShowCustomInput((prev) => !prev)}
                              className="px-3 py-1 rounded-full bg-[rgba(229,231,235,0.08)] border border-white/5 text-xs text-white/80 hover:text-white hover:bg-[rgba(229,231,235,0.12)] transition-colors"
                              style={{ boxShadow: 'none' }}
                            >
                              + Custom topic
                            </button>
                          </div>
                          {showCustomInput && (
                            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                              <input
                                type="text"
                                value={customTopicInput}
                                onChange={(e) => setCustomTopicInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    handleCustomTopicSubmit();
                                  }
                                }}
                                placeholder="Enter custom topic..."
                                className="chat-input-container flex-1 min-w-[200px] rounded-lg border border-[var(--foreground)]/10 px-4 py-2 focus:outline-none focus:border-[var(--foreground)]/20 bg-transparent text-[var(--foreground)] placeholder:text-[var(--foreground)]/60"
                                style={{ boxShadow: 'none' }}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCustomTopicSubmit}
                                  disabled={!customTopicInput.trim()}
                                  className="btn-grey rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  style={{ padding: '0.5rem 1.5rem' }}
                                >
                                  Add topic
                                </button>
                                <button
                                  onClick={() => {
                                    setShowCustomInput(false);
                                    setCustomTopicInput("");
                                  }}
                                  className="btn-grey rounded-lg font-medium"
                                  style={{ padding: '0.5rem 1.5rem' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {suggestedTopics.length < TOPIC_SUGGESTION_TARGET && (
                        <div className="text-center text-xs text-[var(--foreground)]/60 mt-6">
                          Chad only surfaced {suggestedTopics.length} topics this time. You can continue with these or enter your own.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Lesson Card View */}
            {phase === "learn" && showLessonCard ? (
              <div className="space-y-4">
                {/* Find Videos button and Flashcard tip */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--foreground)]/50 italic">
                    Tip: Ask Chad to create flashcards about any lesson you are on.
                  </p>
                  <button
                    onClick={() => setVideoModalOpen(true)}
                    className="find-videos-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-all text-xs font-medium"
                    title="Find YouTube videos about this topic"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    Find Videos
                  </button>
                </div>
                <div 
                  className="rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 p-6 min-h-[500px] flex flex-col lesson-content surge-lesson-card" 
                  data-topic={currentTopic}
                >
                  {/* Lesson Content */}
                  <div 
                    className="flex-1 overflow-y-auto mb-4 lesson-content relative"
                    style={{ cursor: (isScrolling || cursorHidden) ? 'none' : (hoverWordRects.length > 0 ? 'pointer' : 'default') }}
                    onClick={(e) => {
                      try {
                        const target = e.target as HTMLElement | null;
                        if (!target) return;
                        // Ignore clicks inside links, code, pre, and KaTeX
                        if (target.closest("a, code, pre, .katex")) return;
                        const x = (e as any).clientX as number;
                        const y = (e as any).clientY as number;
                        const doc: any = document as any;
                        let range: Range | null = null;
                        if (doc.caretRangeFromPoint) {
                          range = doc.caretRangeFromPoint(x, y);
                        } else if (doc.caretPositionFromPoint) {
                          const pos = doc.caretPositionFromPoint(x, y);
                          if (pos) {
                            range = document.createRange();
                            range.setStart(pos.offsetNode, pos.offset);
                            range.collapse(true);
                          }
                        }
                        if (!range) return;
                        let node = range.startContainer;
                        if (node.nodeType !== Node.TEXT_NODE) {
                          // find nearest text node
                          const asEl = node as unknown as HTMLElement;
                          const walker = document.createTreeWalker(asEl, NodeFilter.SHOW_TEXT);
                          node = walker.nextNode() || node;
                        }
                        if (node.nodeType !== Node.TEXT_NODE) return;
                        const text = (node.textContent || "");
                        let idx = Math.max(0, Math.min(range.startOffset, text.length));
                        // expand to word boundaries
                        const isWordChar = (ch: string) => /[\p{L}\p{N}\u2019'\-]/u.test(ch);
                        let start = idx;
                        while (start > 0 && isWordChar(text[start - 1])) start--;
                        let end = idx;
                        while (end < text.length && isWordChar(text[end])) end++;
                        // Trim any trailing whitespace
                        while (end > start && /\s/.test(text[end - 1])) end--;
                        if (start === end) return;
                        
                        const word = text.slice(start, end).trim();
                        if (!word) return;
                        
                        // Create word range to check if mouse is actually over the word
                        const wordRange = document.createRange();
                        wordRange.setStart(node, start);
                        wordRange.setEnd(node, end);
                        
                        const boundingRect = wordRange.getBoundingClientRect();
                        const clientRects = wordRange.getClientRects();
                        
                        // Check if mouse is actually within the word's bounding rect
                        // This ensures we only trigger on clicks directly over the word, not just on the same line
                        let isMouseOverWord = false;
                        
                        if (boundingRect && boundingRect.width > 0 && boundingRect.height > 0) {
                          isMouseOverWord = 
                            x >= boundingRect.left && 
                            x <= boundingRect.right && 
                            y >= boundingRect.top && 
                            y <= boundingRect.bottom;
                        } else if (clientRects && clientRects.length > 0) {
                          // Check if mouse is over any of the client rects (for multi-line words)
                          for (let i = 0; i < clientRects.length; i++) {
                            const rect = clientRects[i];
                            if (rect && rect.width > 0 && rect.height > 0) {
                              if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                                isMouseOverWord = true;
                                break;
                              }
                            }
                          }
                        }
                        
                        // Only trigger word click if mouse is actually over the word
                        if (!isMouseOverWord) return;
                        
                        const container = (node.parentElement as HTMLElement | null)?.closest("p, li, td, th, blockquote, div") as HTMLElement | null;
                        const parentText = (container?.innerText || node.parentElement?.textContent || text).trim();
                        onWordClick(word, parentText, e as any);
                      } catch {}
                    }}
                    onMouseMove={(e) => {
                      try {
                        const target = e.target as HTMLElement | null;
                        if (!target) return setHoverWordRects([]);
                        if (target.closest("a, code, pre, .katex")) return setHoverWordRects([]);
                        const x = (e as any).clientX as number;
                        const y = (e as any).clientY as number;
                        
                        const doc: any = document as any;
                        let range: Range | null = null;
                        if (doc.caretRangeFromPoint) {
                          range = doc.caretRangeFromPoint(x, y);
                        } else if (doc.caretPositionFromPoint) {
                          const pos = doc.caretPositionFromPoint(x, y);
                          if (pos) {
                            range = document.createRange();
                            range.setStart(pos.offsetNode, pos.offset);
                            range.collapse(true);
                          }
                        }
                        if (!range) return setHoverWordRects([]);
                        let node = range.startContainer;
                        if (node.nodeType !== Node.TEXT_NODE) {
                          const asEl = node as unknown as HTMLElement;
                          const walker = document.createTreeWalker(asEl, NodeFilter.SHOW_TEXT);
                          node = walker.nextNode() || node;
                        }
                        if (node.nodeType !== Node.TEXT_NODE) return setHoverWordRects([]);
                        const text = (node.textContent || "");
                        let idx = Math.max(0, Math.min(range.startOffset, text.length));
                        // Word character: letters, numbers, apostrophes, hyphens
                        const isWordChar = (ch: string) => /[\p{L}\p{N}\u2019'\-]/u.test(ch);
                        // Expand backwards to find word start
                        let start = idx;
                        while (start > 0 && isWordChar(text[start - 1])) start--;
                        // Expand forwards to find word end
                        let end = idx;
                        while (end < text.length && isWordChar(text[end])) end++;
                        // Trim any trailing whitespace
                        while (end > start && /\s/.test(text[end - 1])) end--;
                        if (start === end) return setHoverWordRects([]);
                        
                        const wordRange = document.createRange();
                        wordRange.setStart(node, start);
                        wordRange.setEnd(node, end);
                        
                        // Get CSS zoom factor and compensate coordinates
                        const htmlZoom = parseFloat(window.getComputedStyle(document.documentElement).zoom || '1');
                        
                        const boundingRect = wordRange.getBoundingClientRect();
                        const clientRects = wordRange.getClientRects();
                        
                        // Check if mouse is actually within the word's bounding rect
                        // This ensures we only highlight when directly over the word, not just on the same line
                        const isMouseOverWord = boundingRect && 
                          x >= boundingRect.left && 
                          x <= boundingRect.right && 
                          y >= boundingRect.top && 
                          y <= boundingRect.bottom;
                        
                        if (boundingRect && boundingRect.width > 0 && boundingRect.height > 0 && isMouseOverWord) {
                          // Compensate for CSS zoom
                          const rect = {
                            left: boundingRect.left / htmlZoom,
                            top: boundingRect.top / htmlZoom,
                            width: boundingRect.width / htmlZoom,
                            height: boundingRect.height / htmlZoom,
                          };
                          setHoverWordRects([rect]);
                        } else {
                          // Fallback to getClientRects for multi-line words
                          if (!clientRects || clientRects.length === 0) return setHoverWordRects([]);
                          // Check if mouse is over any of the client rects
                          let isMouseOverAnyRect = false;
                          for (let i = 0; i < clientRects.length; i++) {
                            const rect = clientRects[i];
                            if (rect && rect.width > 0 && rect.height > 0) {
                              if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                                isMouseOverAnyRect = true;
                                break;
                              }
                            }
                          }
                          if (!isMouseOverAnyRect) return setHoverWordRects([]);
                          
                          const validRects: Array<{ left: number; top: number; width: number; height: number }> = [];
                          for (let i = 0; i < clientRects.length; i++) {
                            const rect = clientRects[i];
                            if (rect && rect.width > 0 && rect.height > 0) {
                              validRects.push({
                                left: rect.left / htmlZoom,
                                top: rect.top / htmlZoom,
                                width: rect.width / htmlZoom,
                                height: rect.height / htmlZoom,
                              });
                            }
                          }
                          setHoverWordRects(validRects);
                        }
                      } catch (err) {
                        setHoverWordRects([]);
                      }
                    }}
                    onMouseLeave={() => setHoverWordRects([])}
                  >
                    <LessonBody body={sanitizeLessonBody(lastAssistantMessage || conversationRef.current.find(msg => msg.role === "assistant")?.content || "")} />
                    <style jsx global>{`
                      .lesson-content p { margin: 0.45rem 0 !important; }
                      .lesson-content ul, .lesson-content ol { margin: 0.4rem 0 !important; }
                      .lesson-content h1, .lesson-content h2 { margin-top: 0.6rem !important; margin-bottom: 0.35rem !important; }
                      .lesson-content h3 { margin-top: 0.5rem !important; margin-bottom: 0.3rem !important; }
                    `}</style>
                  </div>
                  
                  {/* Start Quiz Button */}
                  <div className="flex items-center justify-center pt-4 border-t border-[var(--foreground)]/10">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!sending) {
                          handlePhaseTransition();
                        }
                      }}
                      disabled={sending}
                      className="btn-grey rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ 
                        paddingLeft: '3rem',
                        paddingRight: '3rem',
                        paddingTop: '1.125rem',
                        paddingBottom: '1.125rem',
                        fontSize: '1.125rem'
                      }}
                      aria-label="Start Quiz"
                    >
                      {sending ? "Generating..." : "Start Quiz"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
            {/* Chat Messages */}
            {phase === "learn" && !showTopicSelection && (
            <div className="space-y-4 min-h-[400px] max-h-[600px] overflow-y-auto rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)]/50 p-4">
              {conversation.filter(msg => {
                // Hide assistant messages that only contain topic suggestions (we show buttons instead)
                if (msg.role === "assistant" && phase === "learn" && !currentTopic && showTopicSelection) {
                  return false;
                }
                // Hide any assistant messages during topic selection phase (before buttons appear)
                if (msg.role === "assistant" && phase === "learn" && !currentTopic && !showTopicSelection) {
                  return false;
                }
                // Hide messages that contain "Great choice" or similar phrases
                if (msg.role === "assistant" && /great choice|excellent choice|good choice/i.test(msg.content)) {
                  return false;
                }
                // Hide lesson content when showing lesson cards OR when it contains H1 headers (lesson being generated)
                if (msg.role === "assistant" && phase === "learn" && currentTopic) {
                  // Check if message contains H1 headers (lesson content)
                  const hasH1Header = msg.content && /^#\s+/m.test(msg.content);
                  if (hasH1Header || showLessonCard) {
                    return false;
                  }
                }
                // Hide the user message that triggers lesson generation
                if (msg.role === "user" && phase === "learn" && currentTopic && msg.content.includes("Generate a comprehensive lesson")) {
                  return false;
                }
                return !msg.autoGenerated;
              }).map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-center"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-[var(--accent-cyan)]/20 text-[var(--foreground)]">
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="max-w-[90%] w-full flex justify-center">
                      <div className="w-full text-left">
                        {/* Use LessonBody for better markdown/LaTeX rendering like lesson pages */}
                        {phase === "learn" && currentTopic ? (
                          <div className="prose prose-invert max-w-none [&_*]:text-[var(--foreground)]">
                            {(() => {
                              const cleanedContent = msg.content.replace(/TOPIC_SUGGESTION:\s*/gi, '');
                              // Extract and remove quiz section from lesson body (quiz questions go to dropdown, not displayed in text)
                              const { bodyWithoutQuiz } = extractQuizSection(cleanedContent);
                              return <LessonBody body={sanitizeLessonBody(bodyWithoutQuiz || cleanedContent)} />;
                            })()}
                          </div>
                        ) : (
                          <div className="w-full text-left prose prose-invert max-w-none text-sm [&_*]:text-[var(--foreground)]">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
                              {ensureClosedMarkdownFences(
                                msg.content
                                  .replace(/\\\(/g, '$')
                                  .replace(/\\\)/g, '$')
                                  .replace(/\\\[/g, '$$')
                                  .replace(/\\\]/g, '$$')
                                  .replace(/TOPIC_SUGGESTION:\s*/gi, '')
                              )}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Show "Chad is thinking" during topic suggestion phase or when sending (but not during topic selection) */}
              {(
                (sending && !showTopicSelection) || // Show while sending (until topics are shown)
                (phase === "learn" && !currentTopic && !showTopicSelection && !sending && conversation.length === 0) // Show if waiting to start topic suggestion
              ) && (
                <div className="flex justify-center">
                  <div className="flex items-center gap-2 text-[var(--foreground)]/60">
                    <GlowSpinner size={20} inline ariaLabel="Thinking" idSuffix="surge-chat" />
                    <span className="text-sm">Chad is thinking...</span>
                  </div>
                </div>
              )}
              
            </div>
            )}
          </>
            )}

            {/* Show quiz generation status when no questions are available */}
            {phase === "quiz" && quizQuestions.length === 0 && (
              <div className="flex justify-center py-12 w-full">
                {quizLoading ? (
                  <div className="flex items-center gap-2 text-[var(--foreground)]/60">
                    <GlowSpinner size={20} inline ariaLabel="Thinking" idSuffix="surge-quiz" />
                    <span className="text-sm">
                      {quizInfoMessage || "Chad is preparing some questions..."}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center text-[var(--foreground)]/70">
                    <span className="text-sm">
                      {quizFailureMessage || "Quiz not ready yet. Want to try again?"}
                    </span>
                    <button
                      onClick={() => requestQuizQuestions("mc")}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] text-white text-sm font-medium hover:opacity-90"
                    >
                      Retry Quiz
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

          </div>
        )}
      </div>
      
      {/* Hover word rectangles overlay - rendered via portal */}
      {typeof window !== 'undefined' && hoverWordRects.length > 0 && createPortal(
        <>
          {hoverWordRects.map((rect, idx) => (
            <div
              key={idx}
              className="pointer-events-none fixed z-40"
              style={{
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                transform: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '-4px',
                  right: '-4px',
                  bottom: '-2px',
                  height: '2px',
                  background: 'linear-gradient(90deg, rgba(0,229,255,0.8), rgba(255,45,150,0.8))',
                  borderRadius: '1px',
                  WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%)',
                  maskImage: 'linear-gradient(to right, transparent 0, #000 4px, #000 calc(100% - 4px), transparent 100%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(255,45,150,0.15))',
                  borderRadius: '2px',
                }}
              />
            </div>
          ))}
        </>,
        document.body
      )}
      
      {/* Word Popover */}
      <WordPopover
        open={showExplanation}
        x={explanationPosition.x}
        y={explanationPosition.y}
        loading={explanationLoading}
        error={explanationError}
        content={explanationContent}
        word={explanationWord}
        onClose={() => {
          setShowExplanation(false);
          setExplanationWord("");
          setExplanationContent("");
          setExplanationError(null);
        }}
      />
      
      {/* Video Modal for finding YouTube videos */}
      <VideoModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        lessonTitle={currentTopic || "Topic"}
        lessonBody={lastSurge?.newTopicLesson}
        courseName={data?.subject || slug}
        courseContext={currentTopic}
        slug={slug}
        nodeName={currentTopic}
        lessonIndex={0}
      />
    </div>
  );
}
