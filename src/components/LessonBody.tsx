"use client";

import { isEscapedDelimiter } from "@/lib/mathDelimiters";
import MarkdownIt from "markdown-it";
import type { PluginSimple } from "markdown-it";
import mdAnchor from "markdown-it-anchor";
import mdKatex from "@iktakahiro/markdown-it-katex";
import "katex/dist/katex.min.css";

// Restores JSON-escaped Markdown for rendering (single pass), only outside fenced code blocks.
function restoreForRender(md: string): string {
	if (!md) return "";

	let out = "";
	let i = 0;
	let inFence = false;

	while (i < md.length) {
		if (md.startsWith("```", i)) {
			inFence = !inFence;
			out += "```";
			i += 3;
			if (inFence) {
				while (i < md.length && md[i] !== "\n") out += md[i++];
				if (i < md.length && md[i] === "\n") out += md[i++];
			}
			continue;
		}

		if (inFence) {
			out += md[i++];
			continue;
		}

		// Outside fences only: unescape CRLF, LF, and backslashes
		if (md.startsWith("\\\\r\\\\n", i)) {
			out += "\n";
			i += 5;
		} else if (md.startsWith("\\\\n", i)) {
			out += "\n";
			i += 3;
		} else if (md.startsWith("\\\\", i)) {
			out += "\\";
			i += 2;
		} else {
			out += md[i++];
		}
	}

	return out;
}

// Inline \( ... \)
const bracketMathInline: PluginSimple = (mdInstance) => {
	mdInstance.inline.ruler.before("escape", "math_inline_parentheses", (state, silent) => {
		const start = state.pos;
		if (state.src.charCodeAt(start) !== 0x5c || state.src.charCodeAt(start + 1) !== 0x28) return false; // "\("
		if (isEscapedDelimiter(state.src, start)) return false;
		let pos = start + 2;
		while (pos < state.posMax) {
			if (state.src.charCodeAt(pos) === 0x5c && state.src.charCodeAt(pos + 1) === 0x29) { // "\)"
				if (!isEscapedDelimiter(state.src, pos)) {
					if (!silent) {
						const token = state.push("math_inline", "math", 0);
						token.markup = "\\(";
						token.content = state.src.slice(start + 2, pos);
					}
					state.pos = pos + 2;
					return true;
				}
			}
			pos += 1;
		}
		return false;
	});
};

// Block \[ ... \]
const bracketMathBlock: PluginSimple = (mdInstance) => {
	mdInstance.block.ruler.before("fence", "math_block_brackets", (state, startLine, endLine, silent) => {
		const startPos = state.bMarks[startLine] + state.tShift[startLine];
		const maxPos = state.eMarks[startLine];
		const src = state.src;

		// Line must start with "\["
		if (startPos + 2 > maxPos || src.charCodeAt(startPos) !== 0x5c || src.charCodeAt(startPos + 1) !== 0x5b) {
			return false;
		}
		if (silent) return true;

		// Find closing "\]"
		let line = startLine;
		let pos = startPos + 2;
		while (line < endLine) {
			const lineStart = line === startLine ? pos : state.bMarks[line];
			const lineEnd = state.eMarks[line];
			const slice = src.slice(lineStart, lineEnd);
			const closeIdx = slice.indexOf("\\]");
			if (closeIdx !== -1) {
				const content =
					src.slice(startPos + 2, lineStart + closeIdx); // between \[ and \]

				const token = state.push("math_block", "math", 0);
				token.block = true;
				token.content = content;
				token.map = [startLine, line + 1];

				state.line = line + 1;
				return true;
			}
			line += 1;
		}
		return false; // no closing
	});
};

const md = new MarkdownIt({
	html: true,       // you allow <details> elsewhere; keep true if needed
	breaks: false,
	linkify: true,
})
	.use(mdAnchor as any, { permalink: false })
	.use(mdKatex as any, { throwOnError: false, errorColor: "#cc0000" }) // removed invalid "delimiters"
	.use(bracketMathInline)
	.use(bracketMathBlock);

export function LessonBody({ body }: { body: string }) {
	const prepared = restoreForRender(body ?? "");
	const html = md.render(prepared);
	return <div className="lesson-content prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
