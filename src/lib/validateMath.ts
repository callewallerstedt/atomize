import { isEscapedDelimiter, normalizeDisplayMath } from "@/lib/mathDelimiters";
import katex from "katex";

type CodeScanState = {
	inInlineCode: boolean;
	inlineDelimiter: string;
	inFence: boolean;
	fenceDelimiter: string;
};

const createCodeScanState = (): CodeScanState => ({
	inInlineCode: false,
	inlineDelimiter: "",
	inFence: false,
	fenceDelimiter: "",
});

const maybeConsumeCodeDelimiter = (
	text: string,
	index: number,
	state: CodeScanState,
): number | null => {
	const char = text[index];
	if (char !== "`" && char !== "~") return null;
	let count = 0;
	while (index + count < text.length && text[index + count] === char) {
		count += 1;
	}
	const delimiter = char.repeat(count);
	if (count >= 3 && !state.inInlineCode) {
		if (state.inFence && delimiter === state.fenceDelimiter) {
			state.inFence = false;
			state.fenceDelimiter = "";
		} else if (!state.inFence) {
			state.inFence = true;
			state.fenceDelimiter = delimiter;
		}
	} else if (!state.inFence) {
		if (state.inInlineCode && delimiter === state.inlineDelimiter) {
			state.inInlineCode = false;
			state.inlineDelimiter = "";
		} else if (!state.inInlineCode) {
			state.inInlineCode = true;
			state.inlineDelimiter = delimiter;
		}
	}
	return index + count;
};

const analyzeDollar = (src: string, pos: number): { canOpen: boolean; canClose: boolean } => {
	const prevChar = pos > 0 ? src.charCodeAt(pos - 1) : -1;
	const nextChar = pos + 1 < src.length ? src.charCodeAt(pos + 1) : -1;
	let canOpen = true;
	let canClose = true;
	if (prevChar === 0x20 /* space */ || prevChar === 0x09 /* tab */) {
		canClose = false;
	}
	if (nextChar === 0x20 || nextChar === 0x09) {
		canOpen = false;
	}
	if (nextChar >= 0x30 && nextChar <= 0x39) {
		canClose = false;
	}
	return { canOpen, canClose };
};

const collectInlineDollarMath = (text: string): string[] => {
	const expressions: string[] = [];
	const state = createCodeScanState();
	let i = 0;
	while (i < text.length) {
		const advanced = maybeConsumeCodeDelimiter(text, i, state);
		if (advanced !== null) {
			i = advanced;
			continue;
		}
		if (
			!state.inInlineCode &&
			!state.inFence &&
			text[i] === "$" &&
			text[i + 1] !== "$" &&
			!isEscapedDelimiter(text, i)
		) {
			const { canOpen } = analyzeDollar(text, i);
			if (!canOpen) {
				i += 1;
				continue;
			}
			let search = i + 1;
			let found = false;
			while (search < text.length) {
				if (text[search] === "$" && !isEscapedDelimiter(text, search)) {
					const { canClose } = analyzeDollar(text, search);
					if (canClose) {
						expressions.push(text.slice(i + 1, search));
						i = search + 1;
						found = true;
						break;
					}
				}
				search += 1;
			}
			if (!found) {
				i += 1;
			}
			continue;
		}
		i += 1;
	}
	return expressions;
};

const collectDisplayDollarMath = (text: string): string[] => {
	const blocks: string[] = [];
	const state = createCodeScanState();
	let i = 0;
	while (i < text.length) {
		const advanced = maybeConsumeCodeDelimiter(text, i, state);
		if (advanced !== null) {
			i = advanced;
			continue;
		}
		if (
			!state.inInlineCode &&
			!state.inFence &&
			text[i] === "$" &&
			text[i + 1] === "$" &&
			!isEscapedDelimiter(text, i)
		) {
			let search = i + 2;
			let found = false;
			while (search < text.length - 1) {
				if (text[search] === "$" && text[search + 1] === "$" && !isEscapedDelimiter(text, search)) {
					blocks.push(text.slice(i + 2, search));
					i = search + 2;
					found = true;
					break;
				}
				search += 1;
			}
			if (!found) {
				i += 2;
			}
			continue;
		}
		i += 1;
	}
	return blocks;
};

const collectInlineParenthesesMath = (text: string): string[] => {
	const expressions: string[] = [];
	const state = createCodeScanState();
	let i = 0;
	while (i < text.length) {
		const advanced = maybeConsumeCodeDelimiter(text, i, state);
		if (advanced !== null) {
			i = advanced;
			continue;
		}
		if (
			!state.inInlineCode &&
			!state.inFence &&
			text[i] === "\\" &&
			text[i + 1] === "(" &&
			!isEscapedDelimiter(text, i)
		) {
			let search = i + 2;
			let found = false;
			while (search < text.length - 1) {
				if (text[search] === "\\" && text[search + 1] === ")" && !isEscapedDelimiter(text, search)) {
					expressions.push(text.slice(i + 2, search));
					i = search + 2;
					found = true;
					break;
				}
				search += 1;
			}
			if (!found) {
				i += 2;
			}
			continue;
		}
		i += 1;
	}
	return expressions;
};

const cleanExpression = (expr: string): string => {
	return expr
		.normalize("NFC")
		.replace(/\\\p{M}*\(/gu, "(")
		.replace(/\\\p{M}*\)/gu, ")")
		.replace(/\\\p{M}*\[/gu, "[")
		.replace(/\\\p{M}*\]/gu, "]")
		.replace(/\\\s*\(/g, "(")
		.replace(/\\\s*\)/g, ")")
		.replace(/(?<!\\)\$/g, "\\$");
};

export function validateKatexBlocks(md: string): { ok: boolean; errors: string[] } {
	const normalized = normalizeDisplayMath(md || "");
	const errs: string[] = [];
	const inlineDollar = collectInlineDollarMath(normalized);
	const inlineParen = collectInlineParenthesesMath(normalized);
	const displayBlocks = collectDisplayDollarMath(normalized).map((expr) => expr.trim());

	for (const expr of [...inlineDollar, ...inlineParen]) {
		const trimmed = expr.trim();
		if (!trimmed || /^#+\s/.test(trimmed) || /\n#+\s/.test(trimmed)) continue;
		try {
			const cleaned = cleanExpression(trimmed);
			katex.renderToString(cleaned, { throwOnError: true, displayMode: false });
		} catch (e: any) {
			errs.push(`Inline math error: ${String(e?.message || e)}`);
		}
	}

	for (const expr of displayBlocks) {
		if (!expr) continue;
		try {
			const cleaned = cleanExpression(expr);
			katex.renderToString(cleaned, { throwOnError: true, displayMode: true });
		} catch (e: any) {
			errs.push(`Display math error: ${String(e?.message || e)}`);
		}
	}

	return { ok: errs.length === 0, errors: errs };
}
 

