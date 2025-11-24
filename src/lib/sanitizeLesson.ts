import { stripLessonMetadata } from "@/lib/lessonFormat";

const decodeEscapes = (input: string): string => {
	if (!input) return "";
	let prev = "";
	let current = input;
	let iterations = 0;
	while (current !== prev && iterations < 5) {
		prev = current;
		current = current
			.replace(/\r\n/g, "\n")
			.replace(/\\r\\n/g, "\n")
			.replace(/\\n/g, "\n");
		// Do NOT convert \t - it breaks LaTeX commands like \tan, \theta, etc.
		iterations += 1;
	}
	return current;
};

export function sanitizeLessonBody(md: string): string {
	if (!md) return "";
	const withoutMetadata = stripLessonMetadata(md);
	const decoded = decodeEscapes(withoutMetadata);
	return decoded.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
	// Do not modify \, { }, \( \), \[ \]
}

function wrapSimpleSubscripts(input: string): string {
	if (!input) return "";
	return input.replace(/\b([A-Za-z]+_[A-Za-z0-9]+)\b/g, (match, _token, offset, str) => {
		const prev = str[offset - 1];
		const next = str[offset + match.length];
		// Skip if already wrapped in $...$ or \(...\)
		if ((prev === "$" && next === "$") || prev === "\\" || next === "\\") {
			return match;
		}
		return `$${match}$`;
	});
}

export function sanitizeFlashcardContent(md: string): string {
	if (!md) return "";
	const decoded = decodeEscapes(md);
	const cleaned = decoded.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
	return wrapSimpleSubscripts(cleaned);
}
 

