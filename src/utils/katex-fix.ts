import katex from "katex";

// Cache for fixed LaTeX to avoid re-fixing the same content
const fixCache = new Map<string, string>();
// Cache for entire text fixes
const textFixCache = new Map<string, string>();

/**
 * Tries to parse LaTeX with KaTeX to detect errors
 * Returns { isValid: boolean, error: string | null }
 */
export function validateKaTeX(latex: string, displayMode: boolean = false): { isValid: boolean; error: string | null } {
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode });
    return { isValid: true, error: null };
  } catch (error: any) {
    return { isValid: false, error: error.message || String(error) };
  }
}

/**
 * Extracts math blocks from text and validates them
 * Returns array of { type: 'inline' | 'block', content: string, start: number, end: number, error: string | null }
 */
export function extractMathBlocks(text: string): Array<{
  type: 'inline' | 'block';
  content: string;
  start: number;
  end: number;
  error: string | null;
}> {
  const blocks: Array<{
    type: 'inline' | 'block';
    content: string;
    start: number;
    end: number;
    error: string | null;
  }> = [];

  // Find block math ($$...$$)
  const blockMathRegex = /\$\$([^$]*?)\$\$/g;
  let match;
  while ((match = blockMathRegex.exec(text)) !== null) {
    const content = match[1].trim();
    const validation = validateKaTeX(content, true);
    blocks.push({
      type: 'block',
      content,
      start: match.index,
      end: match.index + match[0].length,
      error: validation.error,
    });
  }

  // Find inline math ($...$)
  const inlineMathRegex = /\$([^$\n]+?)\$/g;
  while ((match = inlineMathRegex.exec(text)) !== null) {
    const content = match[1].trim();
    const validation = validateKaTeX(content, false);
    blocks.push({
      type: 'inline',
      content,
      start: match.index,
      end: match.index + match[0].length,
      error: validation.error,
    });
  }

  // Find block math using \\[ ... \\]
  const bracketBlockRegex = /\\\[([\s\S]*?)\\\]/g;
  while ((match = bracketBlockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    const validation = validateKaTeX(content, true);
    blocks.push({
      type: 'block',
      content,
      start: match.index,
      end: match.index + match[0].length,
      error: validation.error,
    });
  }

  // Find inline math using \\( ... \\)
  const parenInlineRegex = /\\\(([^]*?)\\\)/g;
  while ((match = parenInlineRegex.exec(text)) !== null) {
    const content = match[1].trim();
    const validation = validateKaTeX(content, false);
    blocks.push({
      type: 'inline',
      content,
      start: match.index,
      end: match.index + match[0].length,
      error: validation.error,
    });
  }

  // Sort by position
  blocks.sort((a, b) => a.start - b.start);

  return blocks;
}

/**
 * Fixes LaTeX errors using AI
 * This is async and should be called client-side
 * Uses caching to avoid re-fixing the same LaTeX
 */
export async function fixLaTeXWithAI(latex: string, errorMessage: string | null = null): Promise<string> {
  // Create cache key from latex and error message
  const cacheKey = `${latex}|${errorMessage || ''}`;
  
  // Check cache first
  if (fixCache.has(cacheKey)) {
    return fixCache.get(cacheKey)!;
  }

  try {
    const response = await fetch('/api/fix-latex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex, errorMessage }),
    });

    const data = await response.json();
    if (data.ok && data.fixed) {
      // Cache the result
      fixCache.set(cacheKey, data.fixed);
      // Limit cache size to prevent memory issues (keep last 100 entries)
      if (fixCache.size > 100) {
        const firstKey = fixCache.keys().next().value;
        if (firstKey) {
          fixCache.delete(firstKey);
        }
      }
      return data.fixed;
    }
    // Cache the original if fix failed
    fixCache.set(cacheKey, latex);
    return latex;
  } catch (error) {
    console.error('Failed to fix LaTeX:', error);
    // Cache the original on error
    fixCache.set(cacheKey, latex);
    return latex;
  }
}

/**
 * Main function: detects and fixes KaTeX errors in text
 * Returns a Promise that resolves to the fixed text
 * This processes all math blocks and fixes errors using AI
 * Uses caching to avoid re-processing the same text
 */
export async function fixKaTeXErrors(text: string): Promise<string> {
  // Check text-level cache first
  if (textFixCache.has(text)) {
    return textFixCache.get(text)!;
  }

  const mathBlocks = extractMathBlocks(text);
  const errorsToFix = mathBlocks.filter(block => block.error !== null);

  if (errorsToFix.length === 0) {
    // Cache the original text (no errors)
    textFixCache.set(text, text);
    // Limit cache size
    if (textFixCache.size > 50) {
      const firstKey = textFixCache.keys().next().value;
      if (firstKey) {
        textFixCache.delete(firstKey);
      }
    }
    return text;
  }

  // Fix errors in reverse order to preserve positions
  let fixedText = text;
  for (let i = errorsToFix.length - 1; i >= 0; i--) {
    const block = errorsToFix[i];
    const fixedContent = await fixLaTeXWithAI(block.content, block.error);
    
    // Replace the math block in the text
    const before = fixedText.substring(0, block.start);
    const after = fixedText.substring(block.end);
    const delimiter = block.type === 'block' ? '$$' : '$';
    fixedText = before + delimiter + fixedContent + delimiter + after;
  }

  // Cache the fixed text
  textFixCache.set(text, fixedText);
  // Limit cache size
  if (textFixCache.size > 50) {
    const firstKey = textFixCache.keys().next().value;
    if (firstKey) {
      textFixCache.delete(firstKey);
    }
  }

  return fixedText;
}
