"use client";

type TreeNode = {
  name: string;
  subtopics?: TreeNode[];
};

type TreeProps = {
  data: { subject: string; topics: TreeNode[] };
  hrefBase: string;
  onGenerate?: (name: string, path: string[]) => void;
  generatedNames?: string[]; // hide generate if present
  generatingNames?: string[]; // show generating state
};

export default function Tree({ data, hrefBase, onGenerate, generatedNames = [], generatingNames = [] }: TreeProps) {
  return (
    <div className="relative">
      <div className="mb-4 text-center text-sm text-[#9AA3B2]">Extracted topics</div>
      <div className="rounded-2xl border border-[#222731] bg-[#0B0E12] p-4">
        <Node name={data.subject} childrenNodes={data.topics} depth={0} hrefBase={hrefBase} path={[]} onGenerate={onGenerate} generatedNames={generatedNames} generatingNames={generatingNames} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { useState } from "react";

function Node({ name, childrenNodes, depth, hrefBase, path, onGenerate, generatedNames = [], generatingNames = [] }: { name: string; childrenNodes?: TreeNode[]; depth: number; hrefBase: string; path: string[]; onGenerate?: (name: string, path: string[]) => void; generatedNames?: string[]; generatingNames?: string[] }) {
  const hasChildren = (childrenNodes?.length || 0) > 0;
  const isRoot = depth === 0;
  const topicKey = name; // flat uniqueness by name
  const isGenerated = generatedNames.includes(topicKey);
  const isGenerating = generatingNames.includes(topicKey);
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-[#0F141D]">
        <div className="flex items-center gap-2">
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[#2B3140] text-[10px] text-[#9AA3B2]"
              aria-label={expanded ? "Collapse" : "Expand"}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? "▾" : "▸"}
            </button>
          )}
          {isRoot ? (
            <div className={`text-sm font-semibold text-white`}>{name}</div>
          ) : (
            <Link
              href={`${hrefBase}/${encodeURIComponent(name)}`}
              className={`text-sm text-[#E5E7EB] hover:underline`}
              title="Open topic"
            >
              {name}
            </Link>
          )}
        </div>
        {!isRoot && (
          <div className="flex items-center gap-2">
            {onGenerate && !isGenerated && (
              <button
                onClick={(e) => { e.stopPropagation(); onGenerate(name, path); }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-white shadow hover:opacity-95 bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]"
                title="Generate AI for this topic"
                aria-label="Generate AI"
              >
                {isGenerating ? ' ' : ''}
              </button>
            )}
            {isGenerating && (
              <span className="inline-flex items-center gap-2 rounded-full border border-[#2B3140] bg-[#0F141D] px-2 py-0.5 text-[11px] text-[#9AA3B2]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]" /> Generating…
              </span>
            )}
            {onGenerate && isGenerated && !isGenerating && (
              <span className="inline-flex items-center gap-2 rounded-full border border-[#2B3140] bg-[#0F141D] px-2 py-0.5 text-[11px] text-[#A7AFBE]">Ready</span>
            )}
          </div>
        )}
      </div>
      {hasChildren && expanded ? (
        <ul className="relative ml-6 mt-3 space-y-3 border-l border-[#2B3140] pl-6">
          {childrenNodes!.map((c, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-6 top-3 h-px w-6 bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]" />
              <Node name={c.name} childrenNodes={c.subtopics} depth={depth + 1} hrefBase={hrefBase} path={[...path, name]} onGenerate={onGenerate} generatedNames={generatedNames} generatingNames={generatingNames} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}


