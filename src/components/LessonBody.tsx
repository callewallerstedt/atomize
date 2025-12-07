"use client";

import React from "react";
import { isEscapedDelimiter } from "@/lib/mathDelimiters";
import { ensureClosedMarkdownFences } from "@/lib/markdownFences";
import MarkdownIt from "markdown-it";
import type { PluginSimple } from "markdown-it";
import mdAnchor from "markdown-it-anchor";
import mdKatex from "@iktakahiro/markdown-it-katex";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Highlight, themes } from "prism-react-renderer";
// Import Prism language definitions to enable syntax highlighting
// We'll load languages dynamically to avoid SSR issues
// Use dynamic import to ensure Prism is available
let Prism: any = null;
if (typeof window !== 'undefined') {
	try {
		Prism = require("prismjs");
	} catch (e) {
		console.warn("Failed to load Prism:", e);
	}
}

// Lazy load language components only on client side
let languagesLoaded = false;
function loadPrismLanguages() {
	if (typeof window === 'undefined' || languagesLoaded) return;
	
	// Ensure Prism is available - load it if not already loaded
	if (!Prism) {
		try {
			Prism = require("prismjs");
		} catch (e) {
			console.warn("Failed to load Prism:", e);
			return;
		}
	}
	
	// Ensure Prism.languages exists
	if (!Prism.languages) {
		console.warn("Prism.languages not available, skipping language loading");
		return;
	}
	
	try {
		// Load common languages - wrap each in try-catch to continue if one fails
		const languagesToLoad = [
			"prismjs/components/prism-javascript",
			"prismjs/components/prism-typescript",
			"prismjs/components/prism-python",
			"prismjs/components/prism-ruby",
			"prismjs/components/prism-bash",
			"prismjs/components/prism-yaml",
			"prismjs/components/prism-markdown",
			"prismjs/components/prism-cpp",
			"prismjs/components/prism-csharp",
			"prismjs/components/prism-fsharp",
			"prismjs/components/prism-erlang",
			"prismjs/components/prism-go",
			"prismjs/components/prism-rust",
			"prismjs/components/prism-java",
			"prismjs/components/prism-php",
			"prismjs/components/prism-swift",
			"prismjs/components/prism-kotlin",
			"prismjs/components/prism-scala",
			"prismjs/components/prism-clojure",
			"prismjs/components/prism-haskell",
			"prismjs/components/prism-ocaml",
			"prismjs/components/prism-r",
			"prismjs/components/prism-matlab",
			"prismjs/components/prism-sql",
			"prismjs/components/prism-markup",
			"prismjs/components/prism-css",
			"prismjs/components/prism-json",
			"prismjs/components/prism-docker",
			"prismjs/components/prism-lua",
			"prismjs/components/prism-perl",
			"prismjs/components/prism-powershell",
			"prismjs/components/prism-elixir",
			"prismjs/components/prism-prolog",
			"prismjs/components/prism-scheme",
			"prismjs/components/prism-lisp",
			"prismjs/components/prism-fortran",
			"prismjs/components/prism-vhdl",
			"prismjs/components/prism-verilog",
			"prismjs/components/prism-toml",
			"prismjs/components/prism-ini",
			"prismjs/components/prism-graphql",
			"prismjs/components/prism-diff",
		];
		
		// Load each language individually, catching errors per language
		for (const langPath of languagesToLoad) {
			try {
				require(langPath);
			} catch (langError) {
				// Silently skip languages that fail to load
				// Don't log to avoid console spam
			}
		}
		
		languagesLoaded = true;
	} catch (e) {
		// Silently fail if languages can't be loaded
		console.warn("Failed to load some Prism languages:", e);
	}
}

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

// Arrow Block →→ (synapse-style arrow)
const arrowBlock: PluginSimple = (mdInstance) => {
	mdInstance.block.ruler.before("fence", "arrow_block", (state, startLine, endLine, silent) => {
		const startPos = state.bMarks[startLine] + state.tShift[startLine];
		const maxPos = state.eMarks[startLine];
		const src = state.src;

		// Line must contain only "→→" (optionally with whitespace)
		const lineContent = src.slice(startPos, maxPos).trim();
		if (lineContent !== "→→") {
			return false;
		}
		if (silent) return true;

		const token = state.push("arrow_block", "div", 0);
		token.block = true;
		token.map = [startLine, startLine + 1];
		state.line = startLine + 1;
		return true;
	});
};

// Practice Problem Container :::practice-problem ... :::
const practiceProblemContainer: PluginSimple = (mdInstance) => {
	mdInstance.block.ruler.before("fence", "practice_problem", (state, startLine, endLine, silent) => {
		const startPos = state.bMarks[startLine] + state.tShift[startLine];
		const maxPos = state.eMarks[startLine];
		const src = state.src;

		// Line must start with ":::practice-problem" (optionally followed by whitespace)
		const marker = ":::practice-problem";
		if (startPos + marker.length > maxPos || src.slice(startPos, startPos + marker.length) !== marker) {
			return false;
		}
		if (silent) return true;

		// Find closing ":::" on its own line
		let line = startLine + 1;
		while (line < endLine) {
			const lineStart = state.bMarks[line];
			const lineEnd = state.eMarks[line];
			const slice = src.slice(lineStart, lineEnd).trim();
			if (slice === ":::") {
				// Open token
				const token = state.push("practice_problem_open", "div", 1);
				token.markup = ":::";
				token.map = [startLine, line + 1];
				token.info = "practice-problem";

				// Tokenize the content between markers (from line after opening to line before closing)
				const oldParent = state.parentType;
				const oldLineMax = state.lineMax;
				state.parentType = "practice_problem" as any;
				state.lineMax = line;
				state.md.block.tokenize(state, startLine + 1, line);
				state.parentType = oldParent;
				state.lineMax = oldLineMax;

				// Close token
				state.push("practice_problem_close", "div", -1);
				state.line = line + 1;
				return true;
			}
			line += 1;
		}
		return false; // no closing
	});

	// Renderer for practice problem
	mdInstance.renderer.rules.practice_problem_open = () => {
		return '<div class="practice-problem-container">';
	};
	mdInstance.renderer.rules.practice_problem_close = () => {
		return '</div>';
	};
};

const md = new MarkdownIt({
	html: true,       // you allow <details> elsewhere; keep true if needed
	breaks: false,
	linkify: true,
})
	.use(mdAnchor as any, { permalink: false })
	.use(bracketMathInline)
	.use(bracketMathBlock)
	.use(mdKatex as any, { throwOnError: false, errorColor: "#cc0000" })
	.use(arrowBlock)
	.use(practiceProblemContainer);

// Add custom renderers for bracket math tokens
md.renderer.rules.math_inline = (tokens, idx) => {
	const token = tokens[idx];
	try {
		return katex.renderToString(token.content, { throwOnError: false, displayMode: false });
	} catch (e) {
		return `<span class="math-error">\\(${token.content}\\)</span>`;
	}
};

md.renderer.rules.math_block = (tokens, idx) => {
	const token = tokens[idx];
	try {
		return `<div class="katex-display">${katex.renderToString(token.content, { throwOnError: false, displayMode: true })}</div>`;
	} catch (e) {
		return `<div class="math-error">\\[${token.content}\\]</div>`;
	}
};

// Renderer for arrow block - returns placeholder that we'll replace with React component
md.renderer.rules.arrow_block = () => {
	return '<div class="synapse-arrow-placeholder"></div>';
};

// Normalize language name for prism-react-renderer
// Prism supports many languages - this maps aliases and common variations to Prism's language names
function normalizeLanguage(lang: string): string {
	if (!lang) return 'text';
	const normalized = lang.toLowerCase().trim();
	
	// Map common aliases and variations to prism language names
	const languageMap: Record<string, string> = {
		// JavaScript/TypeScript
		'js': 'javascript',
		'jsx': 'javascript',
		'ts': 'typescript',
		'tsx': 'typescript',
		
		// Python
		'py': 'python',
		'python3': 'python',
		
		// Ruby
		'rb': 'ruby',
		
		// Shell/Bash
		'sh': 'bash',
		'zsh': 'bash',
		'fish': 'bash',
		
		// YAML
		'yml': 'yaml',
		
		// Markdown
		'md': 'markdown',
		'markdown': 'markdown',
		
		// C/C++
		'c++': 'cpp',
		'cxx': 'cpp',
		'cc': 'cpp',
		'hpp': 'cpp',
		'h++': 'cpp',
		
		// C#
		'c#': 'csharp',
		'cs': 'csharp',
		
		// F#
		'f#': 'fsharp',
		'fs': 'fsharp',
		
		// Erlang
		'erlang': 'erlang',
		'erl': 'erlang',
		
		// Go
		'go': 'go',
		'golang': 'go',
		
		// Rust
		'rs': 'rust',
		'rust': 'rust',
		
		// Java
		'java': 'java',
		
		// PHP
		'php': 'php',
		
		// Swift
		'swift': 'swift',
		
		// Kotlin
		'kt': 'kotlin',
		'kotlin': 'kotlin',
		
		// Scala
		'scala': 'scala',
		'sc': 'scala',
		
		// Clojure
		'clj': 'clojure',
		'clojure': 'clojure',
		'cljs': 'clojure',
		
		// Haskell
		'hs': 'haskell',
		'haskell': 'haskell',
		
		// OCaml
		'ml': 'ocaml',
		'mli': 'ocaml',
		'ocaml': 'ocaml',
		
		// R
		'r': 'r',
		
		// MATLAB
		'matlab': 'matlab',
		'm': 'matlab',
		
		// SQL
		'sql': 'sql',
		
		// HTML/XML
		'html': 'markup',
		'xml': 'markup',
		'svg': 'markup',
		
		// CSS
		'css': 'css',
		'scss': 'css',
		'sass': 'css',
		'less': 'css',
		
		// JSON
		'json': 'json',
		
		// Docker
		'dockerfile': 'docker',
		'docker': 'docker',
		
		// Makefile
		'makefile': 'makefile',
		'make': 'makefile',
		
		// Lua
		'lua': 'lua',
		
		// Perl
		'pl': 'perl',
		'perl': 'perl',
		
		// PowerShell
		'ps1': 'powershell',
		'powershell': 'powershell',
		'ps': 'powershell',
		
		// Elixir
		'ex': 'elixir',
		'exs': 'elixir',
		'elixir': 'elixir',
		
		// Prolog
		'prolog': 'prolog',
		
		// Scheme
		'scm': 'scheme',
		'scheme': 'scheme',
		
		// Lisp
		'lisp': 'lisp',
		'lsp': 'lisp',
		
		// Fortran
		'f90': 'fortran',
		'f95': 'fortran',
		'fortran': 'fortran',
		
		// Assembly
		'asm': 'asm6502',
		'assembly': 'asm6502',
		's': 'asm6502',
		
		// VHDL
		'vhdl': 'vhdl',
		
		// Verilog
		'v': 'verilog',
		'verilog': 'verilog',
		
		// TOML
		'toml': 'toml',
		
		// INI
		'ini': 'ini',
		'cfg': 'ini',
		'conf': 'ini',
		
		// GraphQL
		'graphql': 'graphql',
		'gql': 'graphql',
		
		// Diff
		'diff': 'diff',
		'patch': 'diff',
	};
	
	// Check if we have a mapping
	if (languageMap[normalized]) {
		return languageMap[normalized];
	}
	
	// If no mapping, try the normalized name directly
	// Prism supports many languages with their standard names
	// If the language isn't supported, it will fall back to plain text
	return normalized;
}

// Component to render synapse-style arrow
function SynapseArrow() {
	return (
		<div className="flex justify-center my-6">
			<div className="relative w-24 h-1.5 overflow-visible">
				{/* Arrow line with gradient */}
				<div 
					className="absolute inset-0 rounded-full"
					style={{
						background: 'linear-gradient(90deg, #00E5FF, #FF2D96, #00E5FF)',
						backgroundSize: '200% 100%',
						animation: 'gradient-shift 3s ease-in-out infinite',
					}}
				/>
				{/* Arrow head with gradient */}
				<div 
					className="absolute right-0 top-1/2 -translate-y-1/2"
					style={{
						width: 0,
						height: 0,
						borderLeft: '10px solid #FF2D96',
						borderTop: '6px solid transparent',
						borderBottom: '6px solid transparent',
						marginLeft: '2px',
					}}
				/>
			</div>
		</div>
	);
}

// Component to render code blocks with syntax highlighting
function CodeBlock({ code, language }: { code: string; language: string }) {
	// Load languages on first render (client-side only)
	if (typeof window !== 'undefined') {
		loadPrismLanguages();
	}
	
	const normalizedLang = normalizeLanguage(language);
	const lines = code.split('\n');
	
	// Ensure the language is supported, fallback to text if not
	const supportedLang = (typeof window !== 'undefined' && Prism && Prism.languages && Prism.languages[normalizedLang]) ? normalizedLang : 'text';
	
	return (
		<div className="relative my-4 rounded-lg overflow-hidden border border-[#222731] bg-[#0F141D]">
			<div className="overflow-x-auto">
				<Highlight
					theme={themes.vsDark}
					code={code}
					language={supportedLang}
				>
					{({ className, style, tokens, getLineProps, getTokenProps }) => {
						// Ensure tokens array matches lines array (prism might collapse empty lines)
						const lineCount = Math.max(tokens.length, lines.length);
						
						return (
							<pre className={className} style={{ ...style, margin: 0, padding: 0, background: '#0F141D' }}>
								<div className="flex">
									{/* Line numbers - use actual line count */}
									<div className="select-none text-right pr-4 pl-4 py-4 text-[#6B7280] text-sm font-mono border-r border-[#222731]">
										{lines.map((_, i) => (
											<div 
												key={i} 
												style={{ 
													height: '1.5rem', 
													display: 'flex', 
													alignItems: 'center', 
													justifyContent: 'flex-end',
													lineHeight: '1.5rem'
												}}
											>
												{i + 1}
											</div>
										))}
									</div>
									{/* Code content */}
									<div className="flex-1 py-4 pr-4">
										{tokens.map((line, i) => {
											const lineProps = getLineProps({ line, key: i });
											// Extract key from props to avoid spreading it
											const { key: _, ...restLineProps } = lineProps;
											return (
												<div 
													key={i} 
													{...restLineProps} 
													style={{ 
														height: '1.5rem', 
														display: 'flex', 
														alignItems: 'center',
														lineHeight: '1.5rem',
														minHeight: '1.5rem',
														...restLineProps.style 
													}}
													className={restLineProps.className}
												>
												{line.length > 0 ? (
													line.map((token, key) => {
														const tokenProps = getTokenProps({ token, key });
														// Extract key from props to avoid spreading it
														const { key: _, ...restProps } = tokenProps;
														return <span key={key} {...restProps} />;
													})
												) : (
													<span>&nbsp;</span>
												)}
												</div>
											);
										})}
									</div>
								</div>
							</pre>
						);
					}}
				</Highlight>
			</div>
		</div>
	);
}

// Ensure incomplete math blocks are closed during streaming
function ensureClosedMathBlocks(md: string): string {
	if (!md) return "";
	
	// Find all complete \[ ... \] blocks first
	const mathBlockRegex = /\\\[([\s\S]*?)\\\]/g;
	const allBlocks: Array<{ start: number; end: number }> = [];
	let match;
	
	while ((match = mathBlockRegex.exec(md)) !== null) {
		allBlocks.push({
			start: match.index,
			end: match.index + match[0].length
		});
	}
	
	// Check for incomplete \[ at the end (missing closing \])
	const incompleteStart = md.lastIndexOf('\\[');
	if (incompleteStart !== -1) {
		// Check if this \[ is part of a complete block
		const isComplete = allBlocks.some(block => 
			block.start <= incompleteStart && block.end > incompleteStart
		);
		
		if (!isComplete) {
			// Check if there's a closing \] after this \[
			const afterStart = md.slice(incompleteStart + 2);
			const hasClosing = afterStart.includes('\\]');
			
			if (!hasClosing) {
				// This is an incomplete block - add temporary closing
				return md + '\\]';
			}
		}
	}
	
	// Also check for standalone [ ... ] that look like math (contain LaTeX commands)
	// This handles cases where \[ gets split and we see just [ during streaming
	// Match [ at start of line or after space, followed by content with LaTeX, ending with ]
	const standaloneMathRegex = /(^|\s)\[([^\]]*)\]/gm;
	let result = md;
	let lastIndex = 0;
	const parts: string[] = [];
	
	// Reset regex
	standaloneMathRegex.lastIndex = 0;
	
	while ((match = standaloneMathRegex.exec(md)) !== null) {
		const before = match[1]; // space or start
		const content = match[2];
		
		// Check if content contains LaTeX commands (backslash followed by letter)
		const hasLatex = /\\[a-zA-Z]/.test(content);
		
		// Check if this [ ] is not already part of a \[ \] block
		const matchStart = match.index + (before === '' ? 0 : before.length);
		const matchEnd = match.index + match[0].length;
		const isInCompleteBlock = allBlocks.some(block => 
			block.start < matchEnd && block.end > matchStart
		);
		
		// Also check if it's not already \[ or \]
		const beforeChar = matchStart > 0 ? md[matchStart - 1] : '';
		const isEscaped = beforeChar === '\\';
		
		if (hasLatex && !isInCompleteBlock && !isEscaped) {
			// This looks like a math block that lost its backslashes during streaming
			// Convert [ ... ] to \[ ... \]
			if (match.index > lastIndex) {
				parts.push(md.slice(lastIndex, matchStart));
			}
			parts.push('\\[' + content + '\\]');
			lastIndex = match.index + match[0].length;
		}
	}
	
	if (parts.length > 0) {
		// Add remaining text
		if (lastIndex < md.length) {
			parts.push(md.slice(lastIndex));
		}
		return parts.join('');
	}
	
	return md;
}

export function LessonBody({ body }: { body: string }) {
	const prepared = restoreForRender(body ?? "");
	// Ensure all code fences are closed before parsing (important for streaming content)
	// This prevents markdown-it from treating everything as code when content starts with ```
	const normalized = ensureClosedMarkdownFences(prepared);
	
	// Ensure incomplete math blocks are closed during streaming
	// This prevents markdown-it from not recognizing math when \[ and \] arrive in different chunks
	const withClosedMath = ensureClosedMathBlocks(normalized);
	
	// No preprocessing - AI outputs correct format directly
	const withMathDelimiters = withClosedMath;
	
	// Extract code blocks before rendering
	// Match: ```language\ncode``` or ```\ncode``` or ```language\ncode``` (with optional newline)
	// Only match complete code blocks (must have closing ```)
	const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
	const codeBlocks: Array<{ index: number; language: string; code: string; placeholder: string }> = [];
	let match;
	let blockIndex = 0;
	
	// Find all code blocks and replace with placeholders
	// Use HTML comment placeholders that markdown-it will preserve
	// Put placeholder on its own line to ensure it's preserved
	let processed = withMathDelimiters;
	codeBlockRegex.lastIndex = 0; // Reset regex
	const matches: Array<{ match: RegExpMatchArray; placeholder: string; language: string; code: string }> = [];
	
	// First, collect all matches (use withMathDelimiters to include math conversions)
	// The regex only matches complete code blocks (with closing ```), so all matches are valid
	while ((match = codeBlockRegex.exec(withMathDelimiters)) !== null) {
		const language = match[1] || 'text';
		const code = match[2] || '';
		// Use HTML comment as placeholder, on its own line
		const placeholder = `\n<!--CODEBLOCK${blockIndex}-->\n`;
		codeBlocks.push({ index: blockIndex, language, code, placeholder: `<!--CODEBLOCK${blockIndex}-->` });
		matches.push({ match: match as RegExpMatchArray, placeholder, language, code });
		blockIndex++;
	}
	
	// Replace in reverse order to preserve indices
	for (let i = matches.length - 1; i >= 0; i--) {
		const { match, placeholder } = matches[i];
		const start = match.index!;
		const end = start + match[0].length;
		processed = processed.slice(0, start) + placeholder + processed.slice(end);
	}
	
	// Render the markdown with placeholders (math conversion already applied in withMathDelimiters)
	let html = md.render(processed);
	
	// Replace arrow placeholders with React components
	const arrowPlaceholderRegex = /<div class="synapse-arrow-placeholder"><\/div>/g;
	let arrowIndex = 0;
	const arrowPlaceholders: Array<{ index: number; placeholder: string }> = [];
	let arrowMatch;
	
	while ((arrowMatch = arrowPlaceholderRegex.exec(html)) !== null) {
		const placeholder = `<!--ARROW${arrowIndex}-->`;
		arrowPlaceholders.push({ index: arrowIndex, placeholder });
		html = html.slice(0, arrowMatch.index) + placeholder + html.slice(arrowMatch.index + arrowMatch[0].length);
		arrowIndex++;
		arrowPlaceholderRegex.lastIndex = 0; // Reset regex
	}
	
	// Replace placeholders with React components
	const parts: (string | { type: 'code'; code: string; language: string } | { type: 'arrow' })[] = [];
	let lastIndex = 0;
	
	// Process code blocks and arrow placeholders together
	const allPlaceholders: Array<{ index: number; type: 'code' | 'arrow'; placeholder: string; data?: any }> = [];
	
	for (const block of codeBlocks) {
		const placeholderIndex = html.indexOf(block.placeholder);
		if (placeholderIndex !== -1) {
			allPlaceholders.push({
				index: placeholderIndex,
				type: 'code',
				placeholder: block.placeholder,
				data: block
			});
		}
	}
	
	for (const arrow of arrowPlaceholders) {
		const placeholderIndex = html.indexOf(arrow.placeholder);
		if (placeholderIndex !== -1) {
			allPlaceholders.push({
				index: placeholderIndex,
				type: 'arrow',
				placeholder: arrow.placeholder
			});
		}
	}
	
	// Sort by index
	allPlaceholders.sort((a, b) => a.index - b.index);
	
	for (const placeholder of allPlaceholders) {
		if (placeholder.index > lastIndex) {
			parts.push(html.slice(lastIndex, placeholder.index));
		}
		
		if (placeholder.type === 'code' && placeholder.data) {
			// Decode HTML entities in code before passing to CodeBlock
			const decodedCode = placeholder.data.code
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&amp;/g, '&')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'");
			parts.push({
				type: 'code',
				code: decodedCode,
				language: placeholder.data.language
			});
		} else if (placeholder.type === 'arrow') {
			parts.push({ type: 'arrow' });
		}
		
		lastIndex = placeholder.index + placeholder.placeholder.length;
	}
	
	// Add remaining text
	if (lastIndex < html.length) {
		parts.push(html.slice(lastIndex));
	}
	
	// If no code blocks, just render normally
	if (codeBlocks.length === 0) {
		html = md.render(withMathDelimiters);
		return (
			<>
				<div className="lesson-content prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
				<style jsx global>{`
					.lesson-content .practice-problem-container {
						position: relative;
						margin: 1.5rem 0;
						padding: 1.25rem 1.5rem;
						border-radius: 0.75rem;
						border: 1.5px solid;
						background: linear-gradient(135deg, rgba(0, 229, 255, 0.08), rgba(255, 45, 150, 0.08));
						border-color: rgba(0, 229, 255, 0.3);
						box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 229, 255, 0.1) inset;
					}
					.lesson-content .practice-problem-container::before {
						content: "Practice Problem";
						display: block;
						font-size: 0.75rem;
						font-weight: 600;
						text-transform: uppercase;
						letter-spacing: 0.05em;
						color: rgba(0, 229, 255, 0.8);
						margin-bottom: 0.75rem;
						padding-bottom: 0.5rem;
						border-bottom: 1px solid rgba(0, 229, 255, 0.2);
					}
					.lesson-content .practice-problem-container p {
						margin: 0.5rem 0 !important;
					}
					.lesson-content .practice-problem-container p:first-child {
						margin-top: 0 !important;
					}
					.lesson-content .practice-problem-container p:last-child {
						margin-bottom: 0 !important;
					}
					.lesson-content .practice-problem-container ul,
					.lesson-content .practice-problem-container ol {
						margin: 0.75rem 0 !important;
					}
				`}</style>
			</>
		);
	}
	
	return (
		<>
			<div className="lesson-content prose max-w-none">
				{parts.map((part, idx) => {
					if (typeof part === 'string') {
						return <div key={idx} dangerouslySetInnerHTML={{ __html: part }} />;
					} else if (part.type === 'code') {
						return <CodeBlock key={idx} code={part.code} language={part.language} />;
					} else if (part.type === 'arrow') {
						return <SynapseArrow key={idx} />;
					}
					return null;
				})}
			</div>
			<style jsx global>{`
				.lesson-content .practice-problem-container {
					position: relative;
					margin: 1.5rem 0;
					padding: 1.25rem 1.5rem;
					border-radius: 0.75rem;
					border: 1.5px solid;
					background: linear-gradient(135deg, rgba(0, 229, 255, 0.08), rgba(255, 45, 150, 0.08));
					border-color: rgba(0, 229, 255, 0.3);
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 229, 255, 0.1) inset;
				}
				.lesson-content .practice-problem-container::before {
					content: "Practice Problem";
					display: block;
					font-size: 0.75rem;
					font-weight: 600;
					text-transform: uppercase;
					letter-spacing: 0.05em;
					color: rgba(0, 229, 255, 0.8);
					margin-bottom: 0.75rem;
					padding-bottom: 0.5rem;
					border-bottom: 1px solid rgba(0, 229, 255, 0.2);
				}
				.lesson-content .practice-problem-container p {
					margin: 0.5rem 0 !important;
				}
				.lesson-content .practice-problem-container p:first-child {
					margin-top: 0 !important;
				}
				.lesson-content .practice-problem-container p:last-child {
					margin-bottom: 0 !important;
				}
				.lesson-content .practice-problem-container ul,
				.lesson-content .practice-problem-container ol {
					margin: 0.75rem 0 !important;
				}
			`}</style>
		</>
	);
}
