export const isEscapedDelimiter = (src: string, index: number): boolean => {
	let backslashCount = 0;
	let i = index - 1;
	while (i >= 0 && src[i] === "\\") {
		backslashCount += 1;
		i -= 1;
	}
	return backslashCount % 2 === 1;
};

export const findClosingDisplay = (src: string, start: number): number => {
	let pos = start;
	while (pos < src.length - 1) {
		if (src[pos] === "\\" && src[pos + 1] === "]" && !isEscapedDelimiter(src, pos)) {
			return pos;
		}
		pos += 1;
	}
	return -1;
};

export const normalizeDisplayMath = (input: string): string => {
	if (!input) return "";
	let result = "";
	let i = 0;
	let inInlineCode = false;
	let inlineDelimiter = "";
	let inFence = false;
	let fenceDelimiter = "";

	while (i < input.length) {
		const char = input[i];

		if (char === "`" || char === "~") {
			let count = 0;
			while (i + count < input.length && input[i + count] === char) {
				count += 1;
			}
			const delimiter = char.repeat(count);
			if (count >= 3 && !inInlineCode) {
				if (inFence && delimiter === fenceDelimiter) {
					inFence = false;
					fenceDelimiter = "";
				} else if (!inFence) {
					inFence = true;
					fenceDelimiter = delimiter;
				}
			} else if (!inFence) {
				if (inInlineCode && delimiter === inlineDelimiter) {
					inInlineCode = false;
					inlineDelimiter = "";
				} else if (!inInlineCode) {
					inInlineCode = true;
					inlineDelimiter = delimiter;
				}
			}
			result += delimiter;
			i += count;
			continue;
		}

		if (
			!inInlineCode &&
			!inFence &&
			char === "\\" &&
			input[i + 1] === "[" &&
			!isEscapedDelimiter(input, i)
		) {
			const closingIndex = findClosingDisplay(input, i + 2);
			if (closingIndex !== -1) {
				const blockContent = input.slice(i + 2, closingIndex);
				const trimmed = blockContent.replace(/^\s+|\s+$/g, "");
				const needsLeadingNewline = result.endsWith("\n") || result.length === 0 ? "" : "\n";
				result += `${needsLeadingNewline}$$\n${trimmed}\n$$\n`;
				i = closingIndex + 2;
				continue;
			}
		}

		result += char;
		i += 1;
	}

	return result;
};
