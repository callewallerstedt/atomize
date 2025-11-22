import { LessonMetadata, LessonMetadataQuizItem } from "@/types/lesson";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BOM = /^\uFEFF/;
const METADATA_REGEX = /^\s*```json\s*\r?\n([\s\S]*?)```/i;
const RESERVED_KEYS = new Set([
	"title",
	"summary",
	"bulletSummary",
	"objectives",
	"tags",
	"keyTakeaways",
	"sections",
	"readingTimeMinutes",
	"quiz",
]);

const sanitizeText = (value: unknown): string => {
	if (typeof value !== "string") return "";
	return value.replace(CONTROL_CHARS, "").replace(BOM, "").trim();
};

const sanitizeStringArray = (value: unknown): string[] | undefined => {
	if (!Array.isArray(value)) return undefined;
	const cleaned = value.map(sanitizeText).filter(Boolean);
	return cleaned.length ? cleaned : undefined;
};

const sanitizeNumber = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
};

const sanitizeUnknown = (value: unknown): unknown => {
	if (typeof value === "string") {
		const cleaned = sanitizeText(value);
		return cleaned.length ? cleaned : undefined;
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === "boolean" || value === null) {
		return value;
	}
	if (Array.isArray(value)) {
		const cleaned = value
			.map(sanitizeUnknown)
			.filter((item) => item !== undefined);
		return cleaned.length ? cleaned : undefined;
	}
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value)) {
			const sanitized = sanitizeUnknown(val);
			if (sanitized !== undefined) {
				out[String(key)] = sanitized;
			}
		}
		return Object.keys(out).length ? out : undefined;
	}
	return undefined;
};

const sanitizeQuizItems = (value: unknown): LessonMetadataQuizItem[] | undefined => {
	if (!Array.isArray(value)) return undefined;
	const items: LessonMetadataQuizItem[] = [];
	for (const entry of value) {
		if (entry == null) continue;
		if (typeof entry === "string") {
			const question = sanitizeText(entry);
			if (question) items.push({ question });
			continue;
		}
		if (typeof entry === "object") {
			const obj = entry as Record<string, unknown>;
			const question =
				sanitizeText(obj.question) ||
				sanitizeText(obj.prompt) ||
				sanitizeText(obj.q);
			if (!question) continue;
			const quizItem: LessonMetadataQuizItem = { question };
			const answer = sanitizeText(obj.answer);
			if (answer) quizItem.answer = answer;
			const explanation = sanitizeText(obj.explanation);
			if (explanation) quizItem.explanation = explanation;
			const difficulty = sanitizeText(obj.difficulty);
			if (difficulty) quizItem.difficulty = difficulty;
			const id = sanitizeText(obj.id);
			if (id) quizItem.id = id;
			items.push(quizItem);
		}
	}
	return items.length ? items : undefined;
};

const sanitizeMetadataObject = (raw: unknown): LessonMetadata | null => {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;
	const metadata: LessonMetadata = {};

	const title = sanitizeText(source.title);
	if (title) metadata.title = title;
	const summary = sanitizeText(source.summary);
	if (summary) metadata.summary = summary;
	const bulletSummary = sanitizeStringArray(source.bulletSummary);
	if (bulletSummary) metadata.bulletSummary = bulletSummary;
	const objectives = sanitizeStringArray(source.objectives);
	if (objectives) metadata.objectives = objectives;
	const tags = sanitizeStringArray(source.tags);
	if (tags) metadata.tags = tags;
	const keyTakeaways = sanitizeStringArray(source.keyTakeaways);
	if (keyTakeaways) metadata.keyTakeaways = keyTakeaways;
	const sections = sanitizeStringArray(source.sections);
	if (sections) metadata.sections = sections;

	const readingTime = sanitizeNumber(source.readingTimeMinutes);
	if (readingTime !== undefined) {
		const rounded = Math.max(1, Math.round(readingTime));
		metadata.readingTimeMinutes = rounded;
	}

	const quiz = sanitizeQuizItems(source.quiz);
	if (quiz) metadata.quiz = quiz;

	for (const [key, value] of Object.entries(source)) {
		if (RESERVED_KEYS.has(key)) continue;
		const sanitized = sanitizeUnknown(value);
		if (sanitized !== undefined) {
			metadata[key] = sanitized;
		}
	}

	return Object.keys(metadata).length ? metadata : null;
};

export const extractLessonMetadata = (
	markdown: string,
	options?: { debug?: boolean }
): {
	metadata: LessonMetadata | null;
	metadataBlock: string | null;
	markdownWithoutMetadata: string;
	normalizedMarkdown: string;
} => {
	const normalizedInput =
		typeof markdown === "string" ? markdown : String(markdown ?? "");
	const normalizedMarkdown = normalizedInput.replace(BOM, "").replace(/\r\n/g, "\n");
	const match = METADATA_REGEX.exec(normalizedMarkdown);

	if (!match) {
		if (options?.debug) {
			console.log("[DEBUG] extractLessonMetadata: No metadata block found");
		}
		return {
			metadata: null,
			metadataBlock: null,
			markdownWithoutMetadata: normalizedMarkdown.trimStart(),
			normalizedMarkdown: normalizedMarkdown.trimStart(),
		};
	}

	const rawMetadata = match[1]?.trim();
	
	// Check if JSON is complete (has balanced braces) - important during streaming
	const openBraces = (rawMetadata.match(/{/g) || []).length;
	const closeBraces = (rawMetadata.match(/}/g) || []).length;
	const isComplete = openBraces === closeBraces && openBraces > 0;
	
	if (!isComplete) {
		if (options?.debug) {
			console.log("[DEBUG] extractLessonMetadata: Incomplete JSON block (streaming?), open:", openBraces, "close:", closeBraces);
			console.log("[DEBUG] extractLessonMetadata: Raw metadata (first 1000 chars):", rawMetadata?.substring(0, 1000));
		}
		return {
			metadata: null,
			metadataBlock: null,
			markdownWithoutMetadata: normalizedMarkdown.trimStart(),
			normalizedMarkdown: normalizedMarkdown.trimStart(),
		};
	}
	
	// Try to parse JSON to ensure it's valid (catches cases where braces are balanced but JSON is malformed)
	try {
		JSON.parse(rawMetadata);
	} catch (e) {
		if (options?.debug) {
			console.log("[DEBUG] extractLessonMetadata: JSON parse failed:", e);
			console.log("[DEBUG] extractLessonMetadata: Raw metadata (first 1000 chars):", rawMetadata?.substring(0, 1000));
		}
		return {
			metadata: null,
			metadataBlock: null,
			markdownWithoutMetadata: normalizedMarkdown.trimStart(),
			normalizedMarkdown: normalizedMarkdown.trimStart(),
		};
	}
	
	if (options?.debug) {
		console.log("[DEBUG] extractLessonMetadata: Raw metadata JSON (full):", rawMetadata);
	}
	
	const metadata = sanitizeMetadataObject(rawMetadata);
	
	if (options?.debug) {
		console.log("[DEBUG] extractLessonMetadata: Parsed metadata:", metadata ? {
			hasQuiz: !!metadata.quiz,
			quizLength: Array.isArray(metadata.quiz) ? metadata.quiz.length : 0,
			quizType: typeof metadata.quiz
		} : "null");
	}
	
	const markdownWithoutMetadata = normalizedMarkdown
		.slice(match[0].length)
		.replace(/^\s+/, "");

	return {
		metadata,
		metadataBlock: match[0],
		markdownWithoutMetadata,
		normalizedMarkdown: normalizedMarkdown.trimStart(),
	};
};

export const stripLessonMetadata = (markdown: string): string => {
	return extractLessonMetadata(markdown).markdownWithoutMetadata;
};

const QUIZ_SECTION_REGEX = /(^|\n)##\s+Quiz[^\n]*\n([\s\S]*?)(?=(\n##\s)|(\n<details)|$)/i;

const buildQuizFromBlock = (block: string): { question: string }[] => {
	const lines = block.split(/\n+/);
	const questions: { question: string }[] = [];
	let current: string[] = [];
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		const questionMatch = line.match(/^(?:\d+\.\s+|-+\s+)(.+)/);
		if (questionMatch) {
			if (current.length) {
				questions.push({ question: current.join("\n").trim() });
				current = [];
			}
			current.push(questionMatch[1]);
		} else if (current.length) {
			current.push(line);
		}
	}
	if (current.length) {
		questions.push({ question: current.join("\n").trim() });
	}
	return questions;
};

export const extractQuizSection = (
	markdown: string,
): { questions: { question: string }[]; bodyWithoutQuiz: string } => {
	if (!markdown) return { questions: [], bodyWithoutQuiz: "" };
	const normalized = markdown.replace(/\r\n/g, "\n");
	const match = normalized.match(QUIZ_SECTION_REGEX);
	if (!match) {
		return { questions: [], bodyWithoutQuiz: normalized };
	}
	const questions = buildQuizFromBlock(match[2] || "");
	const bodyWithoutQuiz =
		normalized.slice(0, match.index ?? 0) + normalized.slice((match.index ?? 0) + match[0].length);
	return {
		questions,
		bodyWithoutQuiz: bodyWithoutQuiz.replace(/<details[\s\S]*?<\/details>/gi, "").trim(),
	};
};

// Extract practice problems from markdown and remove them from body
export const extractPracticeProblems = (
	markdown: string,
): { problems: Array<{ problem: string; solution: string }>; bodyWithoutProblems: string } => {
	if (!markdown) return { problems: [], bodyWithoutProblems: "" };
	
	const problems: Array<{ problem: string; solution: string }> = [];
	let normalized = markdown.replace(/\r\n/g, "\n");
	
	// First, remove any explicit "Practice Problems" section from the body
	// This matches headings like "## Practice Problems" and their content until the next "##" heading or end of document
	const practiceSectionRegex = /(^|\n)##\s+Practice Problems[^\n]*\n([\s\S]*?)(?=(\n##\s)|$)/gi;
	normalized = normalized.replace(practiceSectionRegex, "$1");
	
	// Match practice problem containers: :::practice-problem ... ::: followed by solution
	// The solution is everything after ::: until the next :::practice-problem, ## heading, or end
	const practiceProblemRegex = /:::practice-problem\s*\n([\s\S]*?)\n:::\s*\n([\s\S]*?)(?=\n:::practice-problem|\n##\s|$)/gi;
	
	let match;
	let lastIndex = 0;
	const parts: string[] = [];
	
	while ((match = practiceProblemRegex.exec(normalized)) !== null) {
		const problem = match[1].trim();
		const solution = match[2].trim();
		
		if (problem) {
			problems.push({ problem, solution });
		}
		
		// Add text before this match
		if (match.index > lastIndex) {
			parts.push(normalized.slice(lastIndex, match.index));
		}
		
		lastIndex = match.index + match[0].length;
	}
	
	// Add remaining text after last match
	if (lastIndex < normalized.length) {
		parts.push(normalized.slice(lastIndex));
	}
	
	const bodyWithoutProblems = parts.join("").trim();
	
	return { problems, bodyWithoutProblems };
};