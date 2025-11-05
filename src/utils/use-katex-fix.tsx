import { useState, useEffect } from "react";
import { fixKaTeXErrors } from "@/utils/katex-fix";

/**
 * Hook that fixes KaTeX errors in text using AI
 * Returns the fixed text and loading state
 */
export function useFixedKaTeX(originalText: string): { fixedText: string; isFixing: boolean } {
  const [fixedText, setFixedText] = useState(originalText);
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fixText() {
      setIsFixing(true);
      try {
        const fixed = await fixKaTeXErrors(originalText);
        if (!cancelled) {
          setFixedText(fixed);
        }
      } catch (error) {
        console.error('Failed to fix KaTeX:', error);
        if (!cancelled) {
          setFixedText(originalText);
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
  }, [originalText]);

  return { fixedText, isFixing };
}

