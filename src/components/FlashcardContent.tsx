"use client";

import React, { type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type FlashcardContentProps = {
  content: string;
};

type CodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  node?: unknown;
};

export function FlashcardContent({ content }: FlashcardContentProps) {
  if (!content?.trim()) {
    return null;
  }

  return (
    <div className="lesson-content flashcard-content prose max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 leading-relaxed" />,
          ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside mb-2" />,
          ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-inside mb-2" />,
          li: ({ node, ...props }) => <li {...props} className="mb-1" />,
          code: ({ inline, className, children, ...props }: CodeProps) =>
            inline ? (
              <code {...props} className="px-1 py-0.5 rounded bg-[var(--foreground)]/10 text-xs">
                {children}
              </code>
            ) : (
              <code {...props} className={className}>
                {children}
              </code>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}





