"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import HighlightToolbar, { HIGHLIGHT_COLORS } from "./HighlightToolbar";
import { LessonHighlight } from "@/utils/storage";

interface TextHighlighterProps {
  children: React.ReactNode;
  highlights: LessonHighlight[];
  lessonBody: string;
  onSaveHighlight: (highlight: LessonHighlight) => void;
  onDeleteHighlight: (highlightId: string) => void;
  onElaborate: (text: string, lessonBody: string) => Promise<string>;
  disabled?: boolean;
}

// Helper to generate unique IDs
function generateHighlightId(): string {
  return `hl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to find text offset in the lesson body
function findTextOffset(lessonBody: string, selectedText: string, approximatePosition: number): { start: number; end: number } | null {
  // Search near the approximate position first
  const searchRadius = 500;
  const searchStart = Math.max(0, approximatePosition - searchRadius);
  const searchEnd = Math.min(lessonBody.length, approximatePosition + searchRadius);
  const searchArea = lessonBody.slice(searchStart, searchEnd);
  
  const idx = searchArea.indexOf(selectedText);
  if (idx !== -1) {
    return {
      start: searchStart + idx,
      end: searchStart + idx + selectedText.length,
    };
  }
  
  // Fallback: search entire body
  const fullIdx = lessonBody.indexOf(selectedText);
  if (fullIdx !== -1) {
    return {
      start: fullIdx,
      end: fullIdx + selectedText.length,
    };
  }
  
  return null;
}

export default function TextHighlighter({
  children,
  highlights,
  lessonBody,
  onSaveHighlight,
  onDeleteHighlight,
  onElaborate,
  disabled = false,
}: TextHighlighterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<LessonHighlight | null>(null);
  const [elaborationLoading, setElaborationLoading] = useState(false);
  const [currentElaboration, setCurrentElaboration] = useState<string>("");
  const mouseDownTime = useRef<number>(0);
  const mouseDownPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle mouse down to track selection start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownTime.current = Date.now();
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle text selection on mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    
    // Calculate if this was a drag selection or just a click
    const timeDiff = Date.now() - mouseDownTime.current;
    const distMoved = Math.sqrt(
      Math.pow(e.clientX - mouseDownPos.current.x, 2) +
      Math.pow(e.clientY - mouseDownPos.current.y, 2)
    );
    
    // If it was a quick click with minimal movement, let word click handle it
    // Only trigger highlight on actual drag selection
    if (timeDiff < 200 && distMoved < 10) {
      return;
    }
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const text = selection.toString().trim();
    
    // Only show toolbar for selections longer than a single word (roughly)
    // This prevents conflicts with the word click feature
    if (text.length < 4 || !text.includes(" ")) {
      // Very short selection or single word - let word click handle it
      return;
    }
    
    // Check if selection is within our container
    const range = selection.getRangeAt(0);
    if (!containerRef.current?.contains(range.commonAncestorContainer)) {
      return;
    }
    
    // Find the offset in the lesson body
    const rect = range.getBoundingClientRect();
    const approximatePosition = 0; // We'll search the whole body
    const offset = findTextOffset(lessonBody, text, approximatePosition);
    
    if (!offset) {
      console.warn("Could not find text offset for selection:", text);
      return;
    }
    
    // Check if this selection overlaps with an existing highlight
    const existingHighlight = highlights.find(
      (h) =>
        (offset.start >= h.startOffset && offset.start < h.endOffset) ||
        (offset.end > h.startOffset && offset.end <= h.endOffset) ||
        (offset.start <= h.startOffset && offset.end >= h.endOffset)
    );
    
    if (existingHighlight) {
      // Edit existing highlight
      setEditingHighlight(existingHighlight);
      setSelectedText(existingHighlight.text);
      setSelectedRange({ start: existingHighlight.startOffset, end: existingHighlight.endOffset });
      setCurrentElaboration(existingHighlight.elaboration || "");
    } else {
      // New highlight
      setEditingHighlight(null);
      setSelectedText(text);
      setSelectedRange(offset);
      setCurrentElaboration("");
    }
    
    // Position toolbar below the selection
    setToolbarPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
    setShowToolbar(true);
    
    // Clear the selection visually to show our highlight instead
    // selection.removeAllRanges();
  }, [disabled, lessonBody, highlights]);

  // Handle clicking on existing highlights
  const handleHighlightClick = useCallback((e: React.MouseEvent, highlight: LessonHighlight) => {
    e.preventDefault();
    e.stopPropagation();
    
    setEditingHighlight(highlight);
    setSelectedText(highlight.text);
    setSelectedRange({ start: highlight.startOffset, end: highlight.endOffset });
    setCurrentElaboration(highlight.elaboration || "");
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setToolbarPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
    setShowToolbar(true);
  }, []);

  // Handle saving highlight
  const handleSave = useCallback((color: string, note: string) => {
    if (!selectedRange) return;
    
    const highlight: LessonHighlight = {
      id: editingHighlight?.id || generateHighlightId(),
      text: selectedText,
      color,
      note: note || undefined,
      elaboration: currentElaboration || editingHighlight?.elaboration,
      startOffset: selectedRange.start,
      endOffset: selectedRange.end,
      createdAt: editingHighlight?.createdAt || Date.now(),
      updatedAt: editingHighlight ? Date.now() : undefined,
    };
    
    onSaveHighlight(highlight);
    closeToolbar();
  }, [selectedRange, selectedText, editingHighlight, currentElaboration, onSaveHighlight]);

  // Handle deleting highlight
  const handleDelete = useCallback(() => {
    if (editingHighlight) {
      onDeleteHighlight(editingHighlight.id);
    }
    closeToolbar();
  }, [editingHighlight, onDeleteHighlight]);

  // Handle elaborate request
  const handleElaborate = useCallback(async () => {
    if (!selectedText) return;
    
    setElaborationLoading(true);
    try {
      const elaboration = await onElaborate(selectedText, lessonBody);
      setCurrentElaboration(elaboration);
    } catch (err) {
      console.error("Failed to elaborate:", err);
    } finally {
      setElaborationLoading(false);
    }
  }, [selectedText, lessonBody, onElaborate]);

  // Close toolbar
  const closeToolbar = useCallback(() => {
    setShowToolbar(false);
    setSelectedText("");
    setSelectedRange(null);
    setEditingHighlight(null);
    setCurrentElaboration("");
    setElaborationLoading(false);
    
    // Clear any remaining selection
    window.getSelection()?.removeAllRanges();
  }, []);

  // Render content with highlights applied
  const renderHighlightedContent = () => {
    if (highlights.length === 0) {
      return children;
    }

    // We'll use CSS to apply highlight styles via data attributes
    // The actual highlight rendering happens through the CSS
    return (
      <div className="highlight-container">
        {children}
        {/* Render highlight overlays using marks */}
        <style jsx>{`
          .highlight-container :global(mark[data-highlight-id]) {
            cursor: pointer;
            border-radius: 2px;
            padding: 0 2px;
            margin: 0 -2px;
            transition: filter 150ms ease;
          }
          .highlight-container :global(mark[data-highlight-id]:hover) {
            filter: brightness(1.1);
          }
        `}</style>
      </div>
    );
  };

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className="text-highlighter-container relative"
      >
        {renderHighlightedContent()}
      </div>
      
      {showToolbar && (
        <HighlightToolbar
          selectedText={selectedText}
          position={toolbarPosition}
          onSave={handleSave}
          onDelete={editingHighlight ? handleDelete : undefined}
          onElaborate={handleElaborate}
          onClose={closeToolbar}
          initialColor={editingHighlight?.color || HIGHLIGHT_COLORS[0].value}
          initialNote={editingHighlight?.note || ""}
          isEditing={!!editingHighlight}
          elaboration={currentElaboration}
          elaborationLoading={elaborationLoading}
        />
      )}
    </>
  );
}

// Utility component to render text with highlight marks
export function HighlightedText({
  text,
  highlights,
  onHighlightClick,
}: {
  text: string;
  highlights: LessonHighlight[];
  onHighlightClick: (e: React.MouseEvent, highlight: LessonHighlight) => void;
}) {
  if (!highlights.length) {
    return <>{text}</>;
  }

  // Sort highlights by start offset
  const sortedHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
  
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  sortedHighlights.forEach((highlight, index) => {
    // Add text before this highlight
    if (highlight.startOffset > lastEnd) {
      parts.push(
        <span key={`text-${index}`}>
          {text.slice(lastEnd, highlight.startOffset)}
        </span>
      );
    }

    // Add the highlighted text
    parts.push(
      <mark
        key={`highlight-${highlight.id}`}
        data-highlight-id={highlight.id}
        className="cursor-pointer rounded-sm px-0.5 -mx-0.5 transition-all duration-150 hover:brightness-110"
        style={{ backgroundColor: highlight.color + "50" }}
        onClick={(e) => onHighlightClick(e, highlight)}
        title={highlight.note || "Click to edit highlight"}
      >
        {text.slice(highlight.startOffset, highlight.endOffset)}
      </mark>
    );

    lastEnd = highlight.endOffset;
  });

  // Add remaining text
  if (lastEnd < text.length) {
    parts.push(
      <span key="text-end">
        {text.slice(lastEnd)}
      </span>
    );
  }

  return <>{parts}</>;
}

