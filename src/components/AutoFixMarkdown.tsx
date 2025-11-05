"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { fixKaTeXErrors } from "@/utils/katex-fix";

interface AutoFixMarkdownProps {
  children: string;
  [key: string]: any;
}

/**
 * Wrapper around ReactMarkdown that automatically fixes KaTeX errors using AI
 * Validates math blocks before rendering and fixes errors proactively
 * Uses caching to avoid re-fixing the same content
 */
export function AutoFixMarkdown({ children, ...props }: AutoFixMarkdownProps) {
  const [fixedText, setFixedText] = useState(children);
  const [isFixing, setIsFixing] = useState(false);
  const lastProcessedRef = useRef<string>('');

  useEffect(() => {
    // Only process if content actually changed
    if (children === lastProcessedRef.current) {
      return;
    }

    let cancelled = false;

    async function fixText() {
      setIsFixing(true);
      try {
        const fixed = await fixKaTeXErrors(children);
        if (!cancelled) {
          setFixedText(fixed);
          lastProcessedRef.current = children;
        }
      } catch (error) {
        console.error('Failed to fix KaTeX:', error);
        if (!cancelled) {
          setFixedText(children);
          lastProcessedRef.current = children;
        }
      } finally {
        if (!cancelled) {
          setIsFixing(false);
        }
      }
    }

    fixText();

    return () => {
      cancelled = true;
    };
  }, [children]);

  return (
    <>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]} 
        {...props}
      >
        {fixedText}
      </ReactMarkdown>
      {isFixing && (
        <span className="text-xs text-gray-500 opacity-50">Fixing LaTeX errors...</span>
      )}
    </>
  );
}

