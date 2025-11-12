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
 

