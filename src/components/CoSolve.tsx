"use client";

import React, { useRef, useState, useEffect, useCallback, useLayoutEffect, useMemo, startTransition } from "react";
import { LessonBody } from "./LessonBody";

interface Point {
  x: number;
  y: number;
  pressure: number;
}

type PointerLike = {
  clientX: number;
  clientY: number;
  pressure?: number;
  pointerType?: string;
  timeStamp?: number;
};

interface Stroke {
  points: Point[];
  color: string;
  size: number;
}

interface TextElement {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  fontSize: number;
  color: string;
}

interface PdfOverlay {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
}

interface CanvasData {
  id: string;
  name: string;
  strokes: Stroke[];
  textElements: TextElement[];
  pdfOverlays: PdfOverlay[];
  canvasBg: string;
  createdAt: string;
  updatedAt: string;
}

type CoSolveHistoryItem = {
  id: string;
  createdAt: string;
  imageData: string;
  response: string;
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageData?: string;
}

// Customizable color presets - stored in localStorage
const getInitialColors = () => {
  if (typeof window === 'undefined') return [
    { name: "White", value: "#ffffff" },
    { name: "Cyan", value: "#00E5FF" },
    { name: "Pink", value: "#FF2D96" },
    { name: "Yellow", value: "#FBBF24" },
  ];

  try {
    const saved = localStorage.getItem('cosolve-color-presets');
    return saved ? JSON.parse(saved) : [
      { name: "White", value: "#ffffff" },
      { name: "Cyan", value: "#00E5FF" },
      { name: "Pink", value: "#FF2D96" },
      { name: "Yellow", value: "#FBBF24" },
    ];
  } catch {
    return [
      { name: "White", value: "#ffffff" },
      { name: "Cyan", value: "#00E5FF" },
      { name: "Pink", value: "#FF2D96" },
      { name: "Yellow", value: "#FBBF24" },
    ];
  }
};

const saveColorPresets = (colors: Array<{ name: string; value: string }>) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('cosolve-color-presets', JSON.stringify(colors));
    } catch (e) {
    }
  }
};

// Brush size will now be controlled by a slider (1-50)
const DEFAULT_BRUSH_SIZE = 2;

const CANVAS_BACKGROUNDS = [
  { name: "Dark", value: "#1a1a1a" },
  { name: "Darker", value: "#0f0f0f" },
  { name: "Graph Dark", value: "graph-dark" },
  { name: "White", value: "#ffffff" },
  { name: "Cream", value: "#fdf6e3" },
  { name: "Graph Light", value: "graph-light" },
];

interface CoSolveProps {
  isOpen: boolean;
  onClose: () => void;
}

// Canvas storage functions
const CANVAS_STORAGE_KEY = 'cosolve-canvases';
const CURRENT_CANVAS_KEY = 'cosolve-current-canvas-id';

function loadCanvases(): CanvasData[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(CANVAS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveCanvases(canvases: CanvasData[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(canvases));
  } catch (e) {
  }
}

function getCurrentCanvasId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CURRENT_CANVAS_KEY);
}

function setCurrentCanvasId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURRENT_CANVAS_KEY, id);
}

const normalizeCanvas = (canvas: CanvasData): CanvasData => {
  const now = new Date().toISOString();
  return {
    ...canvas,
    createdAt: typeof canvas.createdAt === "string" ? canvas.createdAt : now,
    updatedAt: typeof canvas.updatedAt === "string" ? canvas.updatedAt : now,
    strokes: Array.isArray(canvas.strokes) ? canvas.strokes : [],
    textElements: Array.isArray(canvas.textElements) ? canvas.textElements : [],
    pdfOverlays: Array.isArray(canvas.pdfOverlays) ? canvas.pdfOverlays : [],
    canvasBg: typeof canvas.canvasBg === "string" ? canvas.canvasBg : CANVAS_BACKGROUNDS[0].value,
  };
};

const mergeCanvases = (local: CanvasData[], remote: CanvasData[]) => {
  const mergedMap = new Map<string, CanvasData>();
  const toSync: CanvasData[] = [];

  remote.forEach((canvas) => {
    mergedMap.set(canvas.id, normalizeCanvas(canvas));
  });

  local.forEach((canvas) => {
    const normalized = normalizeCanvas(canvas);
    const existing = mergedMap.get(normalized.id);

    if (!existing) {
      mergedMap.set(normalized.id, normalized);
      toSync.push(normalized);
      return;
    }

    const localUpdated = Date.parse(normalized.updatedAt);
    const remoteUpdated = Date.parse(existing.updatedAt);
    if (Number.isFinite(localUpdated) && Number.isFinite(remoteUpdated)) {
      if (localUpdated > remoteUpdated) {
        mergedMap.set(normalized.id, normalized);
        toSync.push(normalized);
      }
    } else if (Number.isFinite(localUpdated) && !Number.isFinite(remoteUpdated)) {
      mergedMap.set(normalized.id, normalized);
      toSync.push(normalized);
    }
  });

  const merged = Array.from(mergedMap.values()).sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return { merged, toSync };
};

export function CoSolve({ isOpen, onClose }: CoSolveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  // Canvas state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(() => getInitialColors()[0].value);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [canvasBg, setCanvasBg] = useState(CANVAS_BACKGROUNDS[0].value);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [tool, setTool] = useState<"pen" | "eraser" | "pan" | "lasso">("pen");
  const [eraserTarget, setEraserTarget] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [smoothingEnabled, setSmoothingEnabled] = useState(true);
  const [colorPresets, setColorPresets] = useState(getInitialColors);
  
  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  // Share panel state
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [textElementsClickable, setTextElementsClickable] = useState(true);
  const [debugPointerInfo, setDebugPointerInfo] = useState<{ pointerType: string; buttons: number; button: number; barrel: boolean } | null>(null);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const sharePeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const shareHandledViewersRef = useRef<Set<string>>(new Set());
  const sharePollRef = useRef<number | null>(null);
  const shareSessionIdRef = useRef<string | null>(null);
  
  // Pan and zoom state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef<{x: number, y: number} | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const activeTouchesRef = useRef<Map<number, {x: number, y: number}>>(new Map());
  const pinchRafRef = useRef<number | null>(null);
  const panOffsetRef = useRef(panOffset);
  // Pan delta tracking during panning
  const isDrawingRef = useRef(isDrawing);
  const currentStrokeRef = useRef<Stroke | null>(currentStroke);
  const toolRef = useRef(tool);
  const brushSizeRef = useRef(brushSize);
  const rafPanZoomRef = useRef<number | null>(null);
  
  // Lasso state
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [lassoSelection, setLassoSelection] = useState<{strokes: number[], bounds: {x: number, y: number, width: number, height: number}} | null>(null);
  const [showLassoMenu, setShowLassoMenu] = useState(false);
  
  // Text elements (for AI rewrite)
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const textElementsRef = useRef<TextElement[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [isResizingText, setIsResizingText] = useState(false);
  const textDragStartRef = useRef<{offsetX: number, offsetY: number} | null>(null);
  const textResizeStartRef = useRef<{x: number, y: number, screenWidth: number, screenHeight: number, startScale: number} | null>(null);
  const textInteractionRef = useRef<{ mode: "drag" | "resize" | null; pointerId: number | null; textId: string | null }>({
    mode: null,
    pointerId: null,
    textId: null,
  });
  const [pdfOverlays, setPdfOverlays] = useState<PdfOverlay[]>([]);
  const pdfOverlaysArrayRef = useRef<PdfOverlay[]>([]);
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(null);
  const [showPdfPanel, setShowPdfPanel] = useState(false);
  const pdfDragStartRef = useRef<{offsetX: number, offsetY: number} | null>(null);
  const pdfResizeStartRef = useRef<{x: number, y: number, width: number, height: number, aspect: number} | null>(null);
  const pdfInteractionRef = useRef<{ mode: "drag" | "resize" | null; pointerId: number | null; pdfId: string | null }>({
    mode: null,
    pointerId: null,
    pdfId: null,
  });
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const pdfImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pdfOverlaysRef = useRef<Map<string, PdfOverlay>>(new Map());
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const activePointerTypeRef = useRef<string | null>(null);
  const zoomRef = useRef(zoom);

  const schedulePanZoom = useCallback((nextPan: { x: number; y: number }, nextZoom: number, immediate = false, skipStateUpdate = false) => {
    // Validate pan and zoom values to prevent coordinate corruption
    const validatedPan = {
      x: Number.isFinite(nextPan.x) && Math.abs(nextPan.x) < 100000 ? nextPan.x : panOffsetRef.current.x,
      y: Number.isFinite(nextPan.y) && Math.abs(nextPan.y) < 100000 ? nextPan.y : panOffsetRef.current.y,
    };
    const validatedZoom = Number.isFinite(nextZoom) && nextZoom > 0.1 && nextZoom < 10 ? nextZoom : zoomRef.current;

    // Always update refs immediately so they're available for coordinate calculations
    panOffsetRef.current = validatedPan;
    zoomRef.current = validatedZoom;
    lastPanZoomTimeRef.current = (typeof performance !== "undefined" && performance.now)
      ? performance.now()
      : Date.now();

    if (immediate) {
      // Immediate update for critical operations
      setPanOffset(panOffsetRef.current);
      setZoom(zoomRef.current);
    } else if (skipStateUpdate) {
      // During active panning: optimized for speed - reduce update frequency
      if (rafPanZoomRef.current === null) {
        let frameCount = 0;
        const updateLoop = () => {
          frameCount++;
          const currentPan = panOffsetRef.current;
          const currentZoom = zoomRef.current;

          // Update text elements every 3 frames (less frequent for better performance)
          if (frameCount % 3 === 0) {
            textElementRefs.current.forEach((element, textId) => {
              const textEl = textElementsRef.current.find(t => t.id === textId);
              if (!textEl) return;
              const elementScale = (typeof textEl.scale === "number" && Number.isFinite(textEl.scale)) ? textEl.scale : 1;
              const safeX = Number.isFinite(textEl.x) ? textEl.x : 0;
              const safeY = Number.isFinite(textEl.y) ? textEl.y : 0;
              const screenX = safeX * currentZoom + currentPan.x;
              const screenY = safeY * currentZoom + currentPan.y;
              const compositeScale = currentZoom * elementScale;

              element.style.left = `${screenX}px`;
              element.style.top = `${screenY}px`;
              element.style.transform = `scale(${compositeScale})`;
            });

            // Update PDF overlays every 3 frames
            pdfOverlayRefs.current.forEach((element, overlayId) => {
              const overlay = pdfOverlaysArrayRef.current.find(o => o.id === overlayId);
              if (!overlay) return;
              const screenX = overlay.x * currentZoom + currentPan.x;
              const screenY = overlay.y * currentZoom + currentPan.y;
              const screenW = overlay.width * currentZoom;
              const screenH = overlay.height * currentZoom;

              element.style.left = `${screenX}px`;
              element.style.top = `${screenY}px`;
              element.style.width = `${screenW}px`;
              element.style.height = `${screenH}px`;
            });
          }

          // Redraw canvas every 2 frames (50% reduction) for better performance
          if (frameCount % 2 === 0) {
            redrawCanvas();
          }

          // Continue loop if still panning/pinching
          const stillPanning = isPanningRef.current || activeTouchesRef.current.size === 2;
          if (stillPanning) {
            rafPanZoomRef.current = window.requestAnimationFrame(updateLoop);
          } else {
            // Final state sync when panning ends
            setPanOffset({ ...panOffsetRef.current });
            setZoom(zoomRef.current);
            const finalValue = { pan: { ...panOffsetRef.current }, zoom: zoomRef.current };
            textPanZoomRef.current = finalValue;
            setTextPanZoom(finalValue);
            rafPanZoomRef.current = null;
            // Rebuild static layer for better quality after panning ends
            setTimeout(() => {
              if (!isDrawingRef.current && !isPanningRef.current && activeTouchesRef.current.size === 0) {
                const currentZoom = zoomRef.current;
                staticLayerRef.current = null;
                buildStaticLayer(currentZoom);
                // Force a canvas redraw to show the improved quality
                setTimeout(() => redrawCanvas(), 50);
              }
            }, 150);
          }
        };
        rafPanZoomRef.current = window.requestAnimationFrame(updateLoop);
      }
    } else {
      // Use RAF to throttle updates for smooth performance
      // Don't cancel pending RAF - let it batch multiple updates
      // The callback will always read the latest ref values when it executes
      if (rafPanZoomRef.current === null) {
        rafPanZoomRef.current = window.requestAnimationFrame(() => {
          rafPanZoomRef.current = null;
          // Read latest ref values (may have been updated multiple times)
          // Update both pan and zoom together - React will batch these
          setPanOffset({ ...panOffsetRef.current });
          setZoom(zoomRef.current);
          // Also redraw canvas in the same frame for smooth panning
          // Use cached static layer during panning for performance
          redrawCanvas();
        });
      }
    }
  }, []);

  // Global pointer tracking for ultra-robust drag/resize (works with pen, mouse, touch)
  const activePointerRef = useRef<number | null>(null);
  const eventSequenceRef = useRef(0);
  const lastDragStateRef = useRef({ dragging: false, resizing: false });

  // Drawing optimization refs
  const lastPointRef = useRef<Point | null>(null);
  const pendingPointsRef = useRef<Point[]>([]);
  const drawRafRef = useRef<number | null>(null);
  const supportsPointerRawUpdateRef = useRef(false);
  const rawUpdateSeenRef = useRef(false);
  const lastPanZoomTimeRef = useRef(0);
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const staticLayerBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const staticLayerScaleRef = useRef<number | null>(null);
  const staticLayerStrokeCountRef = useRef(0);
  const strokeBoundsRef = useRef<Array<{ minX: number; minY: number; maxX: number; maxY: number }>>([]);
  const prevStrokesForBoundsRef = useRef<Stroke[]>([]);

  const computeStrokeBounds = useCallback((stroke: Stroke) => {
    if (!stroke || stroke.points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const radius = Math.max(stroke.size * 0.5, stroke.size * 0.35);

    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - radius);
      minY = Math.min(minY, point.y - radius);
      maxX = Math.max(maxX, point.x + radius);
      maxY = Math.max(maxY, point.y + radius);
    }

    return { minX, minY, maxX, maxY };
  }, []);
  useEffect(() => {
    panOffsetRef.current = panOffset;
    zoomRef.current = zoom;
  }, [panOffset, zoom]);

  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  useEffect(() => {
    currentStrokeRef.current = currentStroke;
  }, [currentStroke]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    const prevStrokes = prevStrokesForBoundsRef.current;
    const prevBounds = strokeBoundsRef.current;

    if (strokes.length === 0) {
      strokeBoundsRef.current = [];
      prevStrokesForBoundsRef.current = [];
      return;
    }

    // Fast path: append-only stroke list (common case) without rescanning every point in every stroke.
    if (
      prevStrokes.length === prevBounds.length &&
      strokes.length === prevStrokes.length + 1
    ) {
      let prefixSame = true;
      for (let i = 0; i < prevStrokes.length; i++) {
        if (prevStrokes[i] !== strokes[i]) {
          prefixSame = false;
          break;
        }
      }
      if (prefixSame) {
        const lastStroke = strokes[strokes.length - 1];
        strokeBoundsRef.current = [...prevBounds, computeStrokeBounds(lastStroke)];
        prevStrokesForBoundsRef.current = strokes;
        return;
      }
    }

    strokeBoundsRef.current = strokes.map(computeStrokeBounds);
    prevStrokesForBoundsRef.current = strokes;
  }, [strokes, computeStrokeBounds]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    supportsPointerRawUpdateRef.current =
      typeof window !== "undefined" && "onpointerrawupdate" in window;
  }, []);

  useEffect(() => {
    return () => {
      if (rafPanZoomRef.current !== null) {
        cancelAnimationFrame(rafPanZoomRef.current);
        rafPanZoomRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      const interaction = textInteractionRef.current;
      if (!interaction.mode || interaction.pointerId !== e.pointerId || !interaction.textId) {
        const pdfInteraction = pdfInteractionRef.current;
        if (!pdfInteraction.mode || pdfInteraction.pointerId !== e.pointerId || !pdfInteraction.pdfId) {
          return;
        }
        const overlay = pdfOverlaysRef.current.get(pdfInteraction.pdfId);
        if (!overlay) return;

        e.stopPropagation();
        e.preventDefault();

        if (pdfInteraction.mode === "drag" && pdfDragStartRef.current) {
          const worldPoint = getWorldPointFromClient(e.clientX, e.clientY);
          const nextX = worldPoint.x - pdfDragStartRef.current.offsetX;
          const nextY = worldPoint.y - pdfDragStartRef.current.offsetY;

          if (Number.isFinite(nextX) && Number.isFinite(nextY)) {
            setPdfOverlays(prev => prev.map(p =>
              p.id === pdfInteraction.pdfId
                ? { ...p, x: nextX, y: nextY }
                : p
            ));
          }
        } else if (pdfInteraction.mode === "resize" && pdfResizeStartRef.current) {
          const zoomValue = Number.isFinite(zoomRef.current) ? zoomRef.current : 1;
          const dx = (e.clientX - pdfResizeStartRef.current.x) / Math.max(0.01, zoomValue);
          const dy = (e.clientY - pdfResizeStartRef.current.y) / Math.max(0.01, zoomValue);
          const delta = Math.max(dx, dy);
          const nextWidth = Math.max(20, pdfResizeStartRef.current.width + delta);
          const nextHeight = Math.max(20, nextWidth / pdfResizeStartRef.current.aspect);

          setPdfOverlays(prev => prev.map(p =>
            p.id === pdfInteraction.pdfId
              ? { ...p, width: nextWidth, height: nextHeight }
              : p
          ));
        }
        return;
      }

      e.stopPropagation();
      e.preventDefault();

      if (interaction.mode === "drag" && textDragStartRef.current) {
        const worldPoint = getWorldPointFromClient(e.clientX, e.clientY);
        const nextX = worldPoint.x - textDragStartRef.current.offsetX;
        const nextY = worldPoint.y - textDragStartRef.current.offsetY;

        if (Number.isFinite(nextX) && Number.isFinite(nextY)) {
          setTextElements(prev => prev.map(t =>
            t.id === interaction.textId
              ? { ...t, x: nextX, y: nextY }
              : t
          ));
        }
      } else if (interaction.mode === "resize" && textResizeStartRef.current) {
        const dx = e.clientX - textResizeStartRef.current.x;
        const dy = e.clientY - textResizeStartRef.current.y;
        const baseWidth = Math.max(1, textResizeStartRef.current.screenWidth);
        const baseHeight = Math.max(1, textResizeStartRef.current.screenHeight);
        const scaleX = (baseWidth + dx) / baseWidth;
        const scaleY = (baseHeight + dy) / baseHeight;
        const startScale = Number.isFinite(textResizeStartRef.current.startScale) ? textResizeStartRef.current.startScale : 1;
        const nextScale = Math.max(0.1, Math.min(8, startScale * Math.max(scaleX, scaleY)));

        setTextElements(prev => prev.map(t =>
          t.id === interaction.textId && textResizeStartRef.current
            ? {
                ...t,
                scale: nextScale
              }
            : t
        ));
      }
    };

    const handleGlobalPointerEnd = (e: PointerEvent) => {
      const interaction = textInteractionRef.current;
      if (interaction.pointerId !== e.pointerId) {
        const pdfInteraction = pdfInteractionRef.current;
        if (pdfInteraction.pointerId !== e.pointerId) {
          return;
        }
        pdfDragStartRef.current = null;
        pdfResizeStartRef.current = null;
        pdfInteractionRef.current = { mode: null, pointerId: null, pdfId: null };
        return;
      }

      setIsDraggingText(false);
      setIsResizingText(false);
      textDragStartRef.current = null;
      textResizeStartRef.current = null;
      activePointerRef.current = null;
      activePointerTypeRef.current = null;
      textInteractionRef.current = { mode: null, pointerId: null, textId: null };
      lastDragStateRef.current = { dragging: false, resizing: false };
    };

    document.addEventListener('pointermove', handleGlobalPointerMove, { passive: false, capture: true });
    document.addEventListener('pointerup', handleGlobalPointerEnd, { capture: true });
    document.addEventListener('pointercancel', handleGlobalPointerEnd, { capture: true });

    return () => {
      document.removeEventListener('pointermove', handleGlobalPointerMove, true);
      document.removeEventListener('pointerup', handleGlobalPointerEnd, true);
      document.removeEventListener('pointercancel', handleGlobalPointerEnd, true);
    };
  }, []); // Keep listeners always active, use refs for current state

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<CoSolveHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [includeCanvas, setIncludeCanvas] = useState(true);
  const [showHistoryInChat, setShowHistoryInChat] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  
  // Canvas management
  const [canvases, setCanvases] = useState<CanvasData[]>([]);
  const [currentCanvasId, setCurrentCanvasIdState] = useState<string | null>(null);
  const [currentCanvasName, setCurrentCanvasName] = useState("Untitled Canvas");
  const [isRenamingCanvas, setIsRenamingCanvas] = useState(false);
  const [showCanvasList, setShowCanvasList] = useState(false);

  const fetchCanvasesFromServer = async (): Promise<CanvasData[] | null> => {
    try {
      const res = await fetch("/api/cosolve/canvases", { credentials: "include" });
      if (!res.ok) return null;
      const json = await res.json().catch(() => ({}));
      if (!Array.isArray(json?.canvases)) return null;
      return json.canvases.map((canvas: CanvasData) => normalizeCanvas(canvas));
    } catch {
      return null;
    }
  };

  const syncCanvasToServer = async (canvas: CanvasData | null) => {
    if (!canvas) return;
    try {
      await fetch("/api/cosolve/canvases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvas }),
      });
    } catch {
      // ignore sync errors
    }
  };

  const syncCanvasesToServer = async (items: CanvasData[]) => {
    if (!items.length) return;
    try {
      await fetch("/api/cosolve/canvases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvases: items }),
      });
    } catch {
      // ignore sync errors
    }
  };

  const deleteCanvasFromServer = async (canvasId: string) => {
    if (!canvasId) return;
    try {
      await fetch(`/api/cosolve/canvases/${canvasId}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // ignore delete errors
    }
  };

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substring(2, 15);

  // Load canvases on mount
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      const savedCanvases = loadCanvases().map(normalizeCanvas);
      const serverCanvases = await fetchCanvasesFromServer();

      if (cancelled) return;

      if (serverCanvases) {
        const { merged, toSync } = mergeCanvases(savedCanvases, serverCanvases);
        setCanvases(merged);
        saveCanvases(merged);

        if (toSync.length > 0) {
          syncCanvasesToServer(toSync);
        }

        const lastCanvasId = getCurrentCanvasId();
        if (lastCanvasId && merged.find(c => c.id === lastCanvasId)) {
          loadCanvas(lastCanvasId, merged);
          return;
        }

        if (merged.length > 0) {
          const sorted = [...merged].sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          loadCanvas(sorted[0].id, merged);
        } else {
          createNewCanvas();
        }

        return;
      }

      setCanvases(savedCanvases);

      const lastCanvasId = getCurrentCanvasId();
      if (lastCanvasId && savedCanvases.find(c => c.id === lastCanvasId)) {
        loadCanvas(lastCanvasId, savedCanvases);
      } else if (savedCanvases.length > 0) {
        const sorted = [...savedCanvases].sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        loadCanvas(sorted[0].id, savedCanvases);
      } else {
        createNewCanvas();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const loadCanvas = (id: string, canvasList?: CanvasData[]) => {
    const list = canvasList || canvases;
    const canvas = list.find(c => c.id === id);
    if (canvas) {
      // Stop any active panning/drawing first
      if (rafPanZoomRef.current !== null) {
        cancelAnimationFrame(rafPanZoomRef.current);
        rafPanZoomRef.current = null;
      }
      setIsPanning(false);
      isPanningRef.current = false;
      setIsDrawing(false);
      isDrawingRef.current = false;
      
      // Update state
      setCurrentCanvasIdState(id);
      setCurrentCanvasName(canvas.name);
      const newStrokes = canvas.strokes || [];
      setStrokes(newStrokes);
      setTextElements(canvas.textElements || []);
      setPdfOverlays(Array.isArray(canvas.pdfOverlays) ? canvas.pdfOverlays : []);
      setSelectedPdfId(null);
      setSelectedTextId(null);
      setCanvasBg(canvas.canvasBg);
      setCurrentCanvasId(id);
      setUndoStack([]);
      const newPan = { x: 0, y: 0 };
      const newZoom = 1;
      setPanOffset(newPan);
      setZoom(newZoom);
      
      // Sync ALL refs with new canvas data
      strokesRef.current = newStrokes;
      currentStrokeRef.current = null;
      panOffsetRef.current = newPan;
      zoomRef.current = newZoom;
      textPanZoomRef.current = { pan: newPan, zoom: newZoom };
      lastPanPointRef.current = null;
      lastPinchDistRef.current = null;
      activeTouchesRef.current.clear();
      
      // Clear static layer cache (will rebuild for new canvas)
      staticLayerRef.current = null;
      staticLayerBoundsRef.current = null;
      staticLayerScaleRef.current = null;
      staticLayerStrokeCountRef.current = 0;
      
      // Force redraw with new canvas data
      requestAnimationFrame(() => {
        redrawCanvas();
      });
    }
  };

  const createNewCanvas = () => {
    const newCanvas: CanvasData = {
      id: generateId(),
      name: `Canvas ${canvases.length + 1}`,
      strokes: [],
      textElements: [],
      pdfOverlays: [],
      canvasBg: CANVAS_BACKGROUNDS[0].value,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const updated = [...canvases, newCanvas];
    setCanvases(updated);
    saveCanvases(updated);
    
    // Stop any active panning/drawing first
    if (rafPanZoomRef.current !== null) {
      cancelAnimationFrame(rafPanZoomRef.current);
      rafPanZoomRef.current = null;
    }
    setIsPanning(false);
    isPanningRef.current = false;
    setIsDrawing(false);
    isDrawingRef.current = false;
    
    // Update state
    setCurrentCanvasIdState(newCanvas.id);
    setCurrentCanvasName(newCanvas.name);
    setStrokes([]);
    setTextElements([]);
    setPdfOverlays([]);
    setSelectedPdfId(null);
    setSelectedTextId(null);
    setCanvasBg(newCanvas.canvasBg);
    setCurrentCanvasId(newCanvas.id);
    setUndoStack([]);
    const newPan = { x: 0, y: 0 };
    const newZoom = 1;
    setPanOffset(newPan);
    setZoom(newZoom);
    
    // Sync ALL refs with new canvas data
    strokesRef.current = [];
    currentStrokeRef.current = null;
    panOffsetRef.current = newPan;
    zoomRef.current = newZoom;
    textPanZoomRef.current = { pan: newPan, zoom: newZoom };
    lastPanPointRef.current = null;
    lastPinchDistRef.current = null;
    activeTouchesRef.current.clear();
    
    // Clear static layer cache
    staticLayerRef.current = null;
    staticLayerBoundsRef.current = null;
    staticLayerScaleRef.current = null;
    staticLayerStrokeCountRef.current = 0;
    
    // Force redraw with new canvas
    requestAnimationFrame(() => {
      redrawCanvas();
    });
  };

  // Autosave
  useEffect(() => {
    if (!currentCanvasId || !isOpen) return;
    
    const saveTimeout = setTimeout(() => {
      const updated = canvases.map(c => 
        c.id === currentCanvasId 
          ? { ...c, strokes, textElements, pdfOverlays, canvasBg, name: currentCanvasName, updatedAt: new Date().toISOString() }
          : c
      );
      setCanvases(updated);
      saveCanvases(updated);
      const currentCanvas = updated.find(c => c.id === currentCanvasId) || null;
      syncCanvasToServer(currentCanvas);
    }, 500);
    
    return () => clearTimeout(saveTimeout);
  }, [strokes, textElements, pdfOverlays, canvasBg, currentCanvasName, currentCanvasId, isOpen]);

  // Resize canvas to fit container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }

    redrawCanvas();
  }, []);

  useEffect(() => {
    if (isOpen) {
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);
      return () => window.removeEventListener("resize", resizeCanvas);
    }
  }, [isOpen, resizeCanvas]);

  // Load CoSolve history from server when opening
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        setHistoryLoading(true);
        const res = await fetch("/api/cosolve/history", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && Array.isArray(json?.items)) {
          setHistoryItems(json.items);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Redraw canvas when strokes or background changes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = {
      width: canvas.width / dpr,
      height: canvas.height / dpr,
    };

    // Clear and fill background
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw background
    let bgColor = "#1a1a1a";
    let gridColor = "#2a2a2a";

    if (canvasBg === "graph-dark") {
      bgColor = "#1a1a1a";
      gridColor = "#2a2a2a";
    } else if (canvasBg === "graph-light") {
      bgColor = "#ffffff";
      gridColor = "#e5e5e5";
    } else if (canvasBg.startsWith("#")) {
      bgColor = canvasBg;
      const isLight = parseInt(canvasBg.slice(1), 16) > 0x7fffff;
      gridColor = isLight ? "#e5e5e5" : "#2a2a2a";
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw grid in screen space for stable performance during pan/zoom
    // Use refs for pan/zoom (source of truth) to avoid jitter during panning
    const currentPan = panOffsetRef.current;
    const currentZoom = zoomRef.current;

    // Always show grid - never hide it during panning
    if (showGrid) {
      const gridSize = 25;
      const spacing = gridSize * currentZoom;
      if (spacing >= 4) {
        const mod = (value: number, m: number) => ((value % m) + m) % m;
        const startX = mod(currentPan.x, spacing) - spacing;
        const startY = mod(currentPan.y, spacing) - spacing;
        const endX = rect.width + spacing;
        const endY = rect.height + spacing;

        ctx.save();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = startX; x <= endX; x += spacing) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, rect.height);
        }
        for (let y = startY; y <= endY; y += spacing) {
          ctx.moveTo(0, y);
          ctx.lineTo(rect.width, y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // Apply pan and zoom transform
    // Use refs (source of truth) for immediate updates during panning without jitter
    ctx.save();
    ctx.translate(currentPan.x, currentPan.y);
    ctx.scale(currentZoom, currentZoom);

    // Draw page edge guide line at x=0
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 3 / currentZoom; // Thicker line that scales with zoom
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -rect.height / currentZoom); // Start above visible area
    ctx.lineTo(0, rect.height / currentZoom * 2); // End below visible area
    ctx.stroke();

    // Skip PDF overlay drawing during very active panning for better performance

    if (pdfOverlays.length > 0) {
      pdfOverlays.forEach((overlay) => {
        const img = pdfImageCacheRef.current.get(overlay.id);
        if (!img || !img.complete) return;
        ctx.drawImage(img, overlay.x, overlay.y, overlay.width, overlay.height);
      });
    }

    // Draw cached strokes when available for smooth pan/zoom at the current zoom
    const staticLayer = staticLayerRef.current;
    const staticBounds = staticLayerBoundsRef.current;
    const cachedStrokeCount = staticLayerStrokeCountRef.current;
    // Use ref to get latest strokes during panning
    const strokesToCheck = strokesRef.current.length > 0 ? strokesRef.current : strokes;
    const cacheHasAllStrokes = cachedStrokeCount === strokesToCheck.length;
    const cacheCanCover = cachedStrokeCount <= strokesToCheck.length;
    const viewX = -currentPan.x / Math.max(0.001, currentZoom);
    const viewY = -currentPan.y / Math.max(0.001, currentZoom);
    const viewW = rect.width / Math.max(0.001, currentZoom);
    const viewH = rect.height / Math.max(0.001, currentZoom);
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    // Use ref for isPanning to get current value during panning
    const isPanZoomActive =
      isPanningRef.current ||
      isPanning ||
      activeTouchesRef.current.size === 2 ||
      now - lastPanZoomTimeRef.current < 180;
    // Check if we have an active stroke being drawn - ALWAYS check ref first (most up-to-date)
    // Then fallback to state in case ref hasn't been updated yet
    const activeStrokeFromRef = currentStrokeRef.current;
    const activeStrokeFromState = currentStroke;
    const activeStroke = activeStrokeFromRef || activeStrokeFromState;
    const hasActiveStroke = activeStroke && activeStroke.points && activeStroke.points.length > 0;
    
    // NEVER use cache if there's an active stroke being drawn - it must be visible
    // Check both ref and state to ensure we never miss an active stroke
    // This ensures newly drawn strokes are always visible during panning
    const isDrawingActive = isDrawingRef.current || isDrawing;
    // If there's ANY current stroke, NEVER use cache - draw everything fresh
    const canUseCache = isPanZoomActive && !isDrawingActive && !hasActiveStroke && staticLayer && staticBounds && cacheCanCover;

    // Safety check: if we somehow decided to use cache but there's a current stroke, don't use cache
    const finalCanUseCache = canUseCache && !hasActiveStroke && !isDrawingActive;
    
    if (finalCanUseCache) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(staticLayer, staticBounds.x, staticBounds.y, staticBounds.width, staticBounds.height);

      // Critical for smooth pan/zoom: avoid per-frame O(N) loops over all strokes.
      // Only draw strokes that were added after the cache was built.
      if (!cacheHasAllStrokes) {
        // Use ref to get latest strokes during panning
        const strokesToDraw = strokesRef.current.length > 0 ? strokesRef.current : strokes;
        for (let i = cachedStrokeCount; i < strokesToDraw.length; i++) {
          const stroke = strokesToDraw[i];
          if (!stroke?.points.length) continue;
          drawStroke(ctx, stroke, null);
        }
      }
    } else {
      // Draw all strokes (not using cache, or cache unavailable)
      // Use ref to get latest strokes during panning
      const strokesToDraw = strokesRef.current.length > 0 ? strokesRef.current : strokes;
      strokesToDraw.forEach((stroke, index) => {
        if (stroke.points.length === 0) return;
        const bounds = strokeBoundsRef.current[index];
        if (bounds) {
          const outside =
            bounds.maxX < viewX ||
            bounds.minX > viewX + viewW ||
            bounds.maxY < viewY ||
            bounds.minY > viewY + viewH;
          if (outside) return;
        }
        drawStroke(ctx, stroke, null);
      });
    }

    // ALWAYS draw active stroke on top (even when using cache, so it's always visible)
    // Check multiple sources to ensure we never miss it
    let strokeToDraw = null;
    if (activeStroke && activeStroke.points && activeStroke.points.length > 0) {
      strokeToDraw = activeStroke;
    } else if (currentStroke && currentStroke.points && currentStroke.points.length > 0) {
      strokeToDraw = currentStroke;
    } else if (currentStrokeRef.current && currentStrokeRef.current.points && currentStrokeRef.current.points.length > 0) {
      strokeToDraw = currentStrokeRef.current;
    }
    
    if (strokeToDraw) {
      drawStroke(ctx, strokeToDraw, tool === "eraser" ? eraserTarget : null);
    }

    // Text elements are rendered as HTML overlays for proper markdown/latex support

    // Draw lasso
    if (lassoPoints.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#00E5FF";
      ctx.lineWidth = 2 / currentZoom;
      ctx.setLineDash([5 / currentZoom, 5 / currentZoom]);
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      lassoPoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
    }

    // Draw lasso selection bounds
    if (lassoSelection) {
      ctx.save();
      ctx.strokeStyle = "#00E5FF";
      ctx.lineWidth = 2 / currentZoom;
      ctx.setLineDash([8 / currentZoom, 4 / currentZoom]);
      ctx.strokeRect(
        lassoSelection.bounds.x,
        lassoSelection.bounds.y,
        lassoSelection.bounds.width,
        lassoSelection.bounds.height
      );
      ctx.restore();
    }

    ctx.restore();
  }, [strokes, currentStroke, canvasBg, showGrid, panOffset, zoom, eraserTarget, tool, lassoPoints, lassoSelection, textElements, pdfOverlays, isPanning]);

  // Keep refs in sync with state
  useEffect(() => {
    textElementsRef.current = textElements;
  }, [textElements]);
  
  useEffect(() => {
    pdfOverlaysArrayRef.current = pdfOverlays;
    const nextMap = new Map<string, PdfOverlay>();
    pdfOverlays.forEach((overlay) => {
      nextMap.set(overlay.id, overlay);
    });
    pdfOverlaysRef.current = nextMap;
  }, [pdfOverlays]);

  useEffect(() => {
    let cancelled = false;
    pdfOverlays.forEach((overlay) => {
      if (pdfImageCacheRef.current.has(overlay.id)) {
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        redrawCanvas();
      };
      img.onerror = () => {
        if (cancelled) return;
        pdfImageCacheRef.current.delete(overlay.id);
      };
      img.src = overlay.src;
      pdfImageCacheRef.current.set(overlay.id, img);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfOverlays, redrawCanvas]);

  useEffect(() => {
    const validIds = new Set(pdfOverlays.map((overlay) => overlay.id));
    Array.from(pdfImageCacheRef.current.keys()).forEach((id) => {
      if (!validIds.has(id)) {
        pdfImageCacheRef.current.delete(id);
      }
    });
  }, [pdfOverlays]);

  const drawStrokePoint = (ctx: CanvasRenderingContext2D, stroke: Stroke, point: Point) => {
    const radius = Math.max(stroke.size * point.pressure, stroke.size * 0.3) / 2;
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawStrokeSegment = (ctx: CanvasRenderingContext2D, stroke: Stroke, fromPoint: Point, toPoint: Point) => {
    const avgPressure = (fromPoint.pressure + toPoint.pressure) / 2;
    ctx.lineWidth = Math.max(stroke.size * avgPressure, stroke.size * 0.3);
    ctx.beginPath();
    ctx.moveTo(fromPoint.x, fromPoint.y);
    ctx.lineTo(toPoint.x, toPoint.y);
    ctx.stroke();
  };

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, highlightIndex: number | null) => {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.globalCompositeOperation = 'source-over';

    const pointsToDraw = stroke.points;

    if (pointsToDraw.length === 1) {
      const point = pointsToDraw[0];
      drawStrokePoint(ctx, stroke, point);
    } else if (pointsToDraw.length >= 2) {
      for (let i = 1; i < pointsToDraw.length; i++) {
        const prevPoint = pointsToDraw[i - 1];
        const currPoint = pointsToDraw[i];
        drawStrokeSegment(ctx, stroke, prevPoint, currPoint);
      }
    }

    ctx.restore();
  };

  const getViewWorldRect = (targetZoom: number, targetPan: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const dpr = window.devicePixelRatio || 1;
    const viewWidth = (canvas.width / dpr) / Math.max(0.001, targetZoom);
    const viewHeight = (canvas.height / dpr) / Math.max(0.001, targetZoom);
    const x = -targetPan.x / Math.max(0.001, targetZoom);
    const y = -targetPan.y / Math.max(0.001, targetZoom);
    return { x, y, width: viewWidth, height: viewHeight };
  };

  const buildStaticLayer = useCallback((targetZoom: number) => {
    if (strokes.length === 0) {
      staticLayerRef.current = null;
      staticLayerBoundsRef.current = null;
      staticLayerScaleRef.current = null;
      staticLayerStrokeCountRef.current = 0;
      return;
    }

    const viewRect = getViewWorldRect(targetZoom, panOffsetRef.current);
    const padX = Math.max(200, viewRect.width * 1.5);
    const padY = Math.max(200, viewRect.height * 1.5);
    let minX = viewRect.x - padX;
    let minY = viewRect.y - padY;
    let maxX = viewRect.x + viewRect.width + padX;
    let maxY = viewRect.y + viewRect.height + padY;

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      staticLayerRef.current = null;
      staticLayerBoundsRef.current = null;
      staticLayerScaleRef.current = null;
      staticLayerStrokeCountRef.current = 0;
      return;
    }

    const width = Math.max(1, Math.ceil(maxX - minX));
    const height = Math.max(1, Math.ceil(maxY - minY));
    const dpr = window.devicePixelRatio || 1;
    const maxPixelSize = 8192;

    const desiredScale = Math.max(0.25, targetZoom);
    const maxScaleX = maxPixelSize / (width * dpr);
    const maxScaleY = maxPixelSize / (height * dpr);
    const maxScale = Math.min(maxScaleX, maxScaleY);
    const scale = Math.max(0.25, Math.min(desiredScale, maxScale));
    const pixelWidth = Math.max(1, Math.floor(width * dpr * scale));
    const pixelHeight = Math.max(1, Math.floor(height * dpr * scale));

    if (!Number.isFinite(scale) || scale <= 0 || pixelWidth > maxPixelSize || pixelHeight > maxPixelSize) {
      staticLayerRef.current = null;
      staticLayerBoundsRef.current = null;
      staticLayerScaleRef.current = null;
      staticLayerStrokeCountRef.current = 0;
      return;
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = pixelWidth;
    offscreen.height = pixelHeight;
    const ctx = offscreen.getContext("2d");
    if (!ctx) {
      staticLayerRef.current = null;
      staticLayerBoundsRef.current = null;
      staticLayerScaleRef.current = null;
      staticLayerStrokeCountRef.current = 0;
      return;
    }

    ctx.scale(dpr * scale, dpr * scale);
    ctx.translate(-minX, -minY);
    strokes.forEach((stroke, index) => {
      if (stroke.points.length === 0) return;
      const bounds = strokeBoundsRef.current[index];
      if (bounds) {
        const outside =
          bounds.maxX < minX ||
          bounds.minX > maxX ||
          bounds.maxY < minY ||
          bounds.minY > maxY;
        if (outside) return;
      }
      drawStroke(ctx, stroke, null);
    });

    staticLayerRef.current = offscreen;
    staticLayerBoundsRef.current = { x: minX, y: minY, width, height };
    staticLayerScaleRef.current = scale;
    staticLayerStrokeCountRef.current = strokes.length;
  }, [strokes]);

  // Invalidate static layer cache when strokes are deleted (length decreases)
  const prevStrokeCountRef = useRef(strokes.length);
  useEffect(() => {
    if (strokes.length < prevStrokeCountRef.current) {
      // Strokes were deleted - invalidate cache
      staticLayerRef.current = null;
      staticLayerBoundsRef.current = null;
      staticLayerScaleRef.current = null;
      staticLayerStrokeCountRef.current = 0;
    }
    prevStrokeCountRef.current = strokes.length;
  }, [strokes.length]);

  useEffect(() => {
    if (isDrawingRef.current) return;
    const timer = window.setTimeout(() => {
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (now - lastPanZoomTimeRef.current < 250) return;
      // Use ref to check if panning (more reliable during panning)
      if (isPanningRef.current || isPanning) return;
      if (activeTouchesRef.current.size === 2) return;
      buildStaticLayer(zoom);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [strokes, zoom, isPanning, buildStaticLayer]);

  // Sync textPanZoom when not panning (so text elements use correct position)
  useEffect(() => {
    if (!isPanning && activeTouchesRef.current.size === 0) {
      const newValue = { pan: { ...panOffset }, zoom };
      textPanZoomRef.current = newValue;
      setTextPanZoom(newValue);
    }
  }, [panOffset, zoom, isPanning]);

  // Use useLayoutEffect to ensure canvas redraws synchronously with text element updates
  // This keeps everything perfectly in sync
  // Skip during active panning to prevent jitter (panning uses direct ref updates)
  useLayoutEffect(() => {
    if (!isPanning) {
      redrawCanvas();
    }
  }, [redrawCanvas, panOffset, zoom, isPanning]);

  const getPointerPressure = (e: PointerLike) => {
    if (!e.pointerType || e.pointerType === "mouse") {
      return 0.5;
    }
    const pressure = typeof e.pressure === "number" ? e.pressure : 0.5;
    return Math.min(1, Math.max(0.01, pressure));
  };

  const isPenBarrelButtonPressed = (e: { pointerType?: string; buttons?: number }) => {
    if (e.pointerType !== "pen") return false;
    const buttons = typeof e.buttons === "number" ? e.buttons : 0;
    return (buttons & ~1) !== 0;
  };

  const updatePointerDebug = (e: { pointerType?: string; buttons?: number; button?: number }) => {
    const pointerType = e.pointerType ?? "unknown";
    const buttons = typeof e.buttons === "number" ? e.buttons : 0;
    const button = typeof e.button === "number" ? e.button : -1;
    const barrel = isPenBarrelButtonPressed(e);
    setDebugPointerInfo((prev) =>
      prev &&
      prev.pointerType === pointerType &&
      prev.buttons === buttons &&
      prev.button === button &&
      prev.barrel === barrel
        ? prev
        : { pointerType, buttons, button, barrel }
    );
  };

  const getPointerPos = (e: PointerLike): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

    // Get the actual visual display size of the canvas
    const rect = canvas.getBoundingClientRect();

    // Mouse position relative to canvas visual display
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // The canvas internal resolution is (width * dpr) x (height * dpr)
    // With ctx.scale(dpr, dpr), we draw in CSS pixel coordinates: [0, canvas.width/dpr] x [0, canvas.height/dpr]
    // rect.width/height is the actual visual display size (affected by zoom, CSS, etc.)
    // We need to map from visual coords to the CSS coordinate system used for drawing
    const dpr = window.devicePixelRatio || 1;
    const canvasCssWidth = canvas.width / dpr;
    const canvasCssHeight = canvas.height / dpr;
    
    // Scale mouse position from visual space to canvas CSS coordinate space
    const scaleX = canvasCssWidth / rect.width;
    const scaleY = canvasCssHeight / rect.height;

    const currentPan = panOffsetRef.current;
    const currentZoom = zoomRef.current;

    // Apply scaling, inverse pan offset, and inverse zoom
    const calculatedX = ((mouseX * scaleX) - currentPan.x) / currentZoom;
    const calculatedY = ((mouseY * scaleY) - currentPan.y) / currentZoom;

    // Prevent extreme coordinate values that can cause crashes
    const clampedX = Math.max(-10000, Math.min(10000, calculatedX));
    const clampedY = Math.max(-10000, Math.min(10000, calculatedY));

    return {
      x: clampedX,
      y: clampedY,
      pressure: getPointerPressure(e),
    };
  };

  const getCoalescedPointerEvents = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const nativeEvent = e.nativeEvent as PointerEvent;
    if (typeof nativeEvent.getCoalescedEvents === "function") {
      const coalesced = nativeEvent.getCoalescedEvents();
      if (coalesced.length > 0) {
        return coalesced;
      }
    }
    return [nativeEvent];
  };

  const getCoalescedPointerEventsFromNative = (event: PointerEvent) => {
    if (typeof event.getCoalescedEvents === "function") {
      const coalesced = event.getCoalescedEvents();
      if (coalesced.length > 0) {
        return coalesced;
      }
    }
    return [event];
  };

  const flushPendingPoints = () => {
    drawRafRef.current = null;
    if (!isDrawingRef.current || !currentStrokeRef.current) {
      pendingPointsRef.current = [];
      return;
    }

    const stroke = currentStrokeRef.current;
    const canvas = canvasRef.current;
    if (!canvas) {
      pendingPointsRef.current = [];
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      pendingPointsRef.current = [];
      return;
    }

    const queuedPoints = pendingPointsRef.current;
    if (queuedPoints.length === 0) return;
    pendingPointsRef.current = [];

    // Set canvas properties once per batch instead of every point
    ctx.save();
    ctx.translate(panOffsetRef.current.x, panOffsetRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    // Only set smoothing properties if they might have changed
    if (!ctx.imageSmoothingEnabled) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
    if (ctx.lineCap !== "round" || ctx.lineJoin !== "round") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    ctx.strokeStyle = stroke.color;

    let prevPoint = lastPointRef.current;
    const zoomFactor = Math.max(0.25, zoomRef.current);
    const maxJump = 600 / zoomFactor;
    const minMoveToDrawSegment = 0.001;

    for (const point of queuedPoints) {
      if (prevPoint) {
        const fromPoint = prevPoint;
        const dx = point.x - fromPoint.x;
        const dy = point.y - fromPoint.y;
        const dist = Math.hypot(dx, dy);

        if (!Number.isFinite(dist) || dist > maxJump) {
          stroke.points.push(point);
          drawStrokePoint(ctx, stroke, point);
          prevPoint = point;
          continue;
        }

        stroke.points.push(point);
        if (dist <= minMoveToDrawSegment) {
          drawStrokePoint(ctx, stroke, point);
        } else {
          drawStrokeSegment(ctx, stroke, fromPoint, point);
        }
        prevPoint = point;
      } else {
        stroke.points.push(point);
        drawStrokePoint(ctx, stroke, point);
        prevPoint = point;
      }
    }

    lastPointRef.current = prevPoint ?? lastPointRef.current;
    ctx.restore();
  };

  const schedulePointFlush = () => {
    if (pendingPointsRef.current.length === 0) return;
    if (drawRafRef.current !== null) {
      window.cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
    flushPendingPoints();
  };

  const queuePendingPoints = (points: Point[]) => {
    if (points.length === 0) return;
    pendingPointsRef.current.push(...points);
    schedulePointFlush();
  };

  const processPointerEvents = (events: PointerEvent[]) => {
    if (!isDrawingRef.current) return;
    if (toolRef.current !== "pen") return;
    if (!currentStrokeRef.current) return;

    const points: Point[] = [];
    for (const event of events) {
      if (isPenBarrelButtonPressed(event)) {
        continue;
      }
      const point = getPointerPos(event);
      // Filter out corrupted coordinate values
      if (Math.abs(point.x) < 10000 && Math.abs(point.y) < 10000 &&
          Number.isFinite(point.x) && Number.isFinite(point.y)) {
        points.push(point);
      }
    }

    // Store the raw/coalesced points as-is. (Interpolation here caused point explosions and pan/zoom lag.)
    queuePendingPoints(points);
  };

  const getWorldPointFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasCssWidth = canvas.width / dpr;
    const canvasCssHeight = canvas.height / dpr;
    const scaleX = canvasCssWidth / rect.width;
    const scaleY = canvasCssHeight / rect.height;

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const currentZoom = Number.isFinite(zoomRef.current) ? zoomRef.current : 1;
    const currentPan = panOffsetRef.current;
    const panX = Number.isFinite(currentPan.x) ? currentPan.x : 0;
    const panY = Number.isFinite(currentPan.y) ? currentPan.y : 0;

    return {
      x: ((mouseX * scaleX) - panX) / currentZoom,
      y: ((mouseY * scaleY) - panY) / currentZoom,
    };
  };

  const findStrokeUnderCursor = (cursorX: number, cursorY: number): number | null => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      if (!stroke || stroke.points.length === 0) continue;

      for (const point of stroke.points) {
        const distance = Math.sqrt(
          Math.pow(point.x - cursorX, 2) + Math.pow(point.y - cursorY, 2)
        );

        if (distance <= brushSize * 3) {
          return i;
        }
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    updatePointerDebug(e);
    // Prevent default for middle button to avoid browser navigation
    if (e.pointerType === "mouse" && e.button === 1) {
      e.preventDefault();
    } else {
      e.preventDefault();
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (textInteractionRef.current.mode) {
      return;
    }
    if (drawRafRef.current !== null) {
      window.cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
    pendingPointsRef.current = [];

    // If the event target is not the canvas itself, don't handle it (let text elements handle it)
    if (e.target !== canvas) {
      return;
    }

    // Track touch for pinch-to-zoom
    if (e.pointerType === "touch") {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      
      // If two fingers, start pinch gesture
      if (activeTouchesRef.current.size === 2) {
        const touches = Array.from(activeTouchesRef.current.values());
        const dist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
        const centerX = (touches[0].x + touches[1].x) / 2;
        const centerY = (touches[0].y + touches[1].y) / 2;
        lastPinchDistRef.current = dist;
        lastPanPointRef.current = { x: centerX, y: centerY };
        setIsPanning(false);
        isPanningRef.current = false;
        return;
      }
    }

    // Check if it's a touch event (finger) - use pan if so, unless pen is detected
    const isTouch = e.pointerType === "touch";
    const isMouse = e.pointerType === "mouse";
    const isMiddleButton = isMouse && e.button === 1; // Middle mouse button
    const effectiveTool = isPenBarrelButtonPressed(e) ? "eraser" : tool;

    // For touch events, be more careful about pointer capture to avoid premature cancellation
    // Only capture if we're actually going to handle the event (panning)
    const point = getPointerPos(e);

    // Middle mouse button always pans (PC)
    if (isMiddleButton) {
      // Sync all refs with latest state before starting panning
      strokesRef.current = strokes;
      currentStrokeRef.current = currentStroke;
      isDrawingRef.current = isDrawing;
      // Force immediate redraw with latest data before starting RAF loop
      redrawCanvas();
      setIsPanning(true);
      isPanningRef.current = true;
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      // Ensure static layer exists for smooth panning
      if (!staticLayerRef.current && strokes.length > 0) {
        buildStaticLayer(zoomRef.current);
      }
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Touch defaults to pan, pen defaults to current tool
    if (isTouch && effectiveTool !== "pan") {
      // Sync all refs with latest state before starting panning
      strokesRef.current = strokes;
      currentStrokeRef.current = currentStroke;
      isDrawingRef.current = isDrawing;
      // Force immediate redraw with latest data before starting RAF loop
      redrawCanvas();
      setIsPanning(true);
      isPanningRef.current = true;
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      // Ensure static layer exists for smooth panning
      if (!staticLayerRef.current && strokes.length > 0) {
        buildStaticLayer(zoomRef.current);
      }
      canvas.setPointerCapture(e.pointerId); // Only capture when we actually need it for panning
      return;
    }

    // For other cases (pen, or touch with pan tool), capture normally
    canvas.setPointerCapture(e.pointerId);

    if (effectiveTool === "pan") {
      // Sync all refs with latest state before starting panning
      strokesRef.current = strokes;
      currentStrokeRef.current = currentStroke;
      isDrawingRef.current = isDrawing;
      // Force immediate redraw with latest data before starting RAF loop
      redrawCanvas();
      setIsPanning(true);
      isPanningRef.current = true;
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      // Ensure static layer exists for smooth panning
      if (!staticLayerRef.current && strokes.length > 0) {
        buildStaticLayer(zoomRef.current);
      }
      return;
    }

    if (effectiveTool === "lasso") {
      setLassoPoints([point]);
      setLassoSelection(null);
      setShowLassoMenu(false);
      setIsDrawing(true);
      return;
    }

    setIsDrawing(true);

    if (effectiveTool === "eraser") {
      const strokeIndex = findStrokeUnderCursor(point.x, point.y);
      if (strokeIndex !== null) {
        setUndoStack((prev) => [...prev, strokes]);
        setStrokes((prev) => prev.filter((_, index) => index !== strokeIndex));
      }
      return;
    }

    const startPoint = point;

    const nextStroke = {
      points: [startPoint],
      color: currentColor,
      size: brushSize,
    };
    setCurrentStroke(nextStroke);
    currentStrokeRef.current = nextStroke;
    isDrawingRef.current = true;
    rawUpdateSeenRef.current = false;
    lastPointRef.current = point;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.translate(panOffsetRef.current.x, panOffsetRef.current.y);
        ctx.scale(zoomRef.current, zoomRef.current);
        if (!ctx.imageSmoothingEnabled) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
        }
        if (ctx.lineCap !== "round" || ctx.lineJoin !== "round") {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
        }
        drawStrokePoint(ctx, nextStroke, startPoint);
        ctx.restore();
      }
    }
  };

  const schedulePinchUpdate = () => {
    if (pinchRafRef.current !== null) return;
    pinchRafRef.current = window.requestAnimationFrame(() => {
      pinchRafRef.current = null;
      if (activeTouchesRef.current.size !== 2) return;
      const touches = Array.from(activeTouchesRef.current.values());
      const touchA = touches[0];
      const touchB = touches[1];
      const newDist = Math.hypot(touchA.x - touchB.x, touchA.y - touchB.y);
      const centerScreenX = (touchA.x + touchB.x) / 2;
      const centerScreenY = (touchA.y + touchB.y) / 2;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssScaleX = (canvas.width / dpr) / rect.width;
      const cssScaleY = (canvas.height / dpr) / rect.height;
      const canvasCenterX = (centerScreenX - rect.left) * cssScaleX;
      const canvasCenterY = (centerScreenY - rect.top) * cssScaleY;

      if (lastPinchDistRef.current === null || lastPanPointRef.current === null) {
        lastPinchDistRef.current = newDist;
        lastPanPointRef.current = { x: centerScreenX, y: centerScreenY };
        return;
      }

      const currentZoom = zoomRef.current;
      const currentPan = panOffsetRef.current;
      const scaleFactor = newDist / lastPinchDistRef.current;
      const nextZoom = Math.max(0.25, Math.min(4, currentZoom * scaleFactor));

      const lastCenterX = lastPanPointRef.current.x;
      const lastCenterY = lastPanPointRef.current.y;
      const panDeltaX = (centerScreenX - lastCenterX) * cssScaleX;
      const panDeltaY = (centerScreenY - lastCenterY) * cssScaleY;

      const worldCenterX = (canvasCenterX - currentPan.x) / currentZoom;
      const worldCenterY = (canvasCenterY - currentPan.y) / currentZoom;
      const newPanX = canvasCenterX - worldCenterX * nextZoom + panDeltaX;
      const newPanY = canvasCenterY - worldCenterY * nextZoom + panDeltaY;

      // Skip state update during pinch zoom to prevent jitter (only update refs and redraw)
      schedulePanZoom({ x: newPanX, y: newPanY }, nextZoom, false, true);
      lastPinchDistRef.current = newDist;
      lastPanPointRef.current = { x: centerScreenX, y: centerScreenY };
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      e.preventDefault();
    }
    // If the event target is not the canvas itself, don't handle it (let text elements handle it)
    if (e.target !== e.currentTarget) {
      return;
    }

    // Track touch for pinch-to-zoom
    if (e.pointerType === "touch") {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      
      // Handle pinch-to-zoom with two fingers (with simultaneous panning)
      if (activeTouchesRef.current.size === 2) {
        if (isPanning) {
          setIsPanning(false);
          isPanningRef.current = false;
          lastPanPointRef.current = null;
        }
        schedulePinchUpdate();
        return;
      }

      if (activeTouchesRef.current.size === 1 && lastPinchDistRef.current !== null) {
        lastPinchDistRef.current = null;
        lastPanPointRef.current = null;
      }
    }

    const point = getPointerPos(e);

    // Handle panning - use RAF throttling for smooth updates
    // During panning, skip React state updates to prevent jitter
    if (isPanning && lastPanPointRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const scaleX = (canvas.width / dpr) / rect.width;
        const scaleY = (canvas.height / dpr) / rect.height;
        const dx = (e.clientX - lastPanPointRef.current.x) * scaleX;
        const dy = (e.clientY - lastPanPointRef.current.y) * scaleY;
        const currentPan = panOffsetRef.current;
        // Skip state update during panning - only update refs and redraw (prevents jitter)
        schedulePanZoom({ x: currentPan.x + dx, y: currentPan.y + dy }, zoomRef.current, false, true);
      }

      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const effectiveTool = isPenBarrelButtonPressed(e) ? "eraser" : tool;

    if (effectiveTool === "lasso" && isDrawing) {
      setLassoPoints(prev => [...prev, point]);
      return;
    }

    if (effectiveTool === "eraser") {
      if (isDrawing) {
        const strokeIndex = findStrokeUnderCursor(point.x, point.y);
        if (strokeIndex !== null) {
          setUndoStack((prev) => [...prev, strokes]);
          setStrokes((prev) => prev.filter((_, index) => index !== strokeIndex));
        }
        setEraserTarget(strokeIndex);
      } else {
        const strokeIndex = findStrokeUnderCursor(point.x, point.y);
        setEraserTarget(strokeIndex);
      }
      return;
    }

    if (!isDrawingRef.current || !currentStrokeRef.current) return;

    // When available, prefer `pointerrawupdate` for pen drawing to avoid duplicating points
    // (both `pointermove` and `pointerrawupdate` can fire for the same motion).
    if (supportsPointerRawUpdateRef.current && rawUpdateSeenRef.current) {
      return;
    }
    const events = getCoalescedPointerEvents(e);
    processPointerEvents(events);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    updatePointerDebug(e);
    // If the event target is not the canvas itself, don't handle it (let text elements handle it)
    if (e.target !== e.currentTarget) {
      return;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }

    // Clean up touch tracking
    if (e.pointerType === "touch") {
      const wasPinching = activeTouchesRef.current.size >= 2;
      activeTouchesRef.current.delete(e.pointerId);
      if (activeTouchesRef.current.size < 2) {
        lastPinchDistRef.current = null;
        // Sync state when pinch ends (refs were updated during pinch, now sync to state)
        if (wasPinching) {
          setPanOffset({ ...panOffsetRef.current });
          setZoom(zoomRef.current);
          const newValue = { pan: { ...panOffsetRef.current }, zoom: zoomRef.current };
          textPanZoomRef.current = newValue;
          setTextPanZoom(newValue);
          // Rebuild static layer for better quality after pinch ends
          setTimeout(() => {
            if (!isDrawingRef.current && !isPanningRef.current && activeTouchesRef.current.size === 0) {
              // Force rebuild by invalidating cache first, then rebuild at current zoom
              const currentZoom = zoomRef.current;
              staticLayerRef.current = null;
              buildStaticLayer(currentZoom);
              // Force a canvas redraw to show the improved quality
              setTimeout(() => redrawCanvas(), 50);
            }
          }, 150);
        }
      }
      if (pinchRafRef.current !== null) {
        window.cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = null;
      }
    }

    if (isPanning) {
      setIsPanning(false);
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      // Sync state when panning ends (refs were updated during panning, now sync to state)
      setPanOffset({ ...panOffsetRef.current });
      setZoom(zoomRef.current);
      const newValue = { pan: { ...panOffsetRef.current }, zoom: zoomRef.current };
      textPanZoomRef.current = newValue;
      setTextPanZoom(newValue);
      // Rebuild static layer for better quality after panning ends
      setTimeout(() => {
        if (!isDrawingRef.current && !isPanningRef.current && activeTouchesRef.current.size === 0) {
          // Force rebuild by invalidating cache first, then rebuild at current zoom
          const currentZoom = zoomRef.current;
          staticLayerRef.current = null;
          buildStaticLayer(currentZoom);
          // Force a canvas redraw to show the improved quality
          setTimeout(() => redrawCanvas(), 50);
        }
      }, 150);
      return;
    }

    if (tool === "lasso" && isDrawing && lassoPoints.length > 2) {
      // Calculate selection
      const selectedStrokes: number[] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      strokes.forEach((stroke, index) => {
        const isInside = stroke.points.some(p => isPointInPolygon(p, lassoPoints));
        if (isInside) {
          selectedStrokes.push(index);
          stroke.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });
        }
      });

      if (selectedStrokes.length > 0) {
        setLassoSelection({
          strokes: selectedStrokes,
          bounds: { x: minX - 10, y: minY - 10, width: maxX - minX + 20, height: maxY - minY + 20 }
        });
        setShowLassoMenu(true);
      }
      setLassoPoints([]);
    }

    if (drawRafRef.current !== null) {
      window.cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
    flushPendingPoints();
    pendingPointsRef.current = [];

    setIsDrawing(false);
    isDrawingRef.current = false;

    if (currentStroke && currentStroke.points.length >= 1) {
      setUndoStack((prev) => [...prev, strokes]);
      // Add stroke to array and immediately update ref
      const newStrokes = [...strokes, currentStroke];
      strokesRef.current = newStrokes; // Update ref first
      setStrokes(newStrokes);
      // Clear current stroke after adding to strokes
      setCurrentStroke(null);
      currentStrokeRef.current = null;
      // Force immediate redraw to show the new stroke (use requestAnimationFrame for proper timing)
      requestAnimationFrame(() => {
        redrawCanvas();
      });
    } else {
      setCurrentStroke(null);
      currentStrokeRef.current = null;
    }
    setEraserTarget(null);
    lastPointRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchesRef.current.delete(e.pointerId);
      if (activeTouchesRef.current.size < 2) {
        lastPinchDistRef.current = null;
      }
      if (pinchRafRef.current !== null) {
        window.cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = null;
      }
    }
    if (isPanning) {
      setIsPanning(false);
      isPanningRef.current = false;
      lastPanPointRef.current = null;
      // Rebuild static layer for better quality after panning ends
      setTimeout(() => {
        if (!isDrawingRef.current && !isPanningRef.current && activeTouchesRef.current.size === 0) {
          // Force rebuild by invalidating cache first, then rebuild at current zoom
          const currentZoom = zoomRef.current;
          staticLayerRef.current = null;
          buildStaticLayer(currentZoom);
          // Force a canvas redraw to show the improved quality
          setTimeout(() => redrawCanvas(), 20);
        }
      }, 150);
    }
  };

  // Refs to track text element DOM nodes for direct manipulation during panning
  const textElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pdfOverlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // State for text element positioning (only used when not panning)
  const [textPanZoom, setTextPanZoom] = useState({ pan: { x: 0, y: 0 }, zoom: 1 });
  const textPanZoomRef = useRef({ pan: { x: 0, y: 0 }, zoom: 1 });
  
  const textElementsLayer = useMemo(() => {
    // During panning, use refs directly (via textPanZoom which updates less frequently)
    // This prevents jitter while still allowing text to move
    const isPanningActive = isPanning || activeTouchesRef.current.size === 2;
    const currentZoom = isPanningActive
      ? (Number.isFinite(textPanZoom.zoom) ? textPanZoom.zoom : zoomRef.current)
      : (Number.isFinite(zoom) ? zoom : 1);
    const panX = isPanningActive
      ? (Number.isFinite(textPanZoom.pan.x) ? textPanZoom.pan.x : panOffsetRef.current.x)
      : (Number.isFinite(panOffset.x) ? panOffset.x : 0);
    const panY = isPanningActive
      ? (Number.isFinite(textPanZoom.pan.y) ? textPanZoom.pan.y : panOffsetRef.current.y)
      : (Number.isFinite(panOffset.y) ? panOffset.y : 0);
    return textElements.map(textEl => {
      const isSelected = selectedTextId === textEl.id;
      const elementScale = (typeof textEl.scale === "number" && Number.isFinite(textEl.scale)) ? textEl.scale : 1;
      const safeX = Number.isFinite(textEl.x) ? textEl.x : 0;
      const safeY = Number.isFinite(textEl.y) ? textEl.y : 0;
      const controlSize = 14;
      const screenX = safeX * currentZoom + panX;
      const screenY = safeY * currentZoom + panY;
      const compositeScale = currentZoom * elementScale;

      return (
        <div
          key={textEl.id}
          ref={(el) => {
            if (el) {
              textElementRefs.current.set(textEl.id, el);
            } else {
              textElementRefs.current.delete(textEl.id);
            }
          }}
          className={`absolute inline-block ${textElementsClickable ? 'cursor-move' : 'cursor-default'} touch-none ${isSelected ? 'ring-1 ring-gray-400' : ''}`}
          style={{
            left: screenX,
            top: screenY,
            width: 'auto',
            height: 'auto',
            padding: '1px 2px',
            backgroundColor: isSelected ? 'rgba(0,0,0,0.1)' : 'transparent',
            borderRadius: '8px',
            fontSize: textEl.fontSize,
            color: textEl.color,
            zIndex: isSelected ? 100 : 10,
            pointerEvents: textElementsClickable ? 'auto' : 'none',
            userSelect: 'none',
            transform: `scale(${compositeScale})`,
            transformOrigin: 'top left',
          }}
          onClick={(e) => {
            if (!textElementsClickable) return;
            e.stopPropagation();
            setSelectedTextId(textEl.id);
          }}
          onPointerDown={(e) => {
            if (!textElementsClickable) return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            if (textInteractionRef.current.mode && textInteractionRef.current.pointerId !== e.pointerId) {
              return;
            }

            setSelectedTextId(textEl.id);
            setIsDraggingText(true);
            setIsResizingText(false);
            lastDragStateRef.current = { dragging: true, resizing: false };
            textInteractionRef.current = { mode: "drag", pointerId: e.pointerId, textId: textEl.id };
            activePointerRef.current = e.pointerId;
            activePointerTypeRef.current = e.pointerType;
            const baseX = Number.isFinite(textEl.x) ? textEl.x : 0;
            const baseY = Number.isFinite(textEl.y) ? textEl.y : 0;
            if (!Number.isFinite(textEl.x) || !Number.isFinite(textEl.y)) {
              setTextElements(prev => prev.map(t =>
                t.id === textEl.id
                  ? { ...t, x: baseX, y: baseY }
                  : t
              ));
            }
            const worldPoint = getWorldPointFromClient(e.clientX, e.clientY);
            textDragStartRef.current = {
              offsetX: worldPoint.x - baseX,
              offsetY: worldPoint.y - baseY
            };
            textResizeStartRef.current = null;

            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch (error) {
              try {
                document.documentElement.setPointerCapture(e.pointerId);
              } catch (fallbackError) {
              }
            }
          }}
          onLostPointerCapture={(e) => {
            eventSequenceRef.current++;
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            eventSequenceRef.current++;
            try {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            } catch (error) {
            }
          }}
          onPointerLeave={() => {}}
        >
          <div className="prose max-w-none overflow-wrap-anywhere break-words prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 [&_*]:text-inherit [&_.katex]:text-inherit [&_.katex_*]:text-inherit [&_.katex_display]:text-inherit [&_.katex_display_*]:text-inherit" style={{ color: textEl.color, fontSize: 'inherit', lineHeight: 1.25, display: 'inline-block', pointerEvents: 'none' }}>
            <LessonBody body={textEl.content} />
          </div>

          {isSelected && (
            <div
              className={`absolute flex items-center justify-center touch-none rounded-full border border-[var(--foreground)]/25 bg-[var(--background)]/70 text-[var(--foreground)]/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--background)]/90 hover:border-[var(--foreground)]/40 ${textElementsClickable ? 'cursor-se-resize' : 'cursor-not-allowed'}`}
              style={{
                right: 0,
                bottom: 0,
                width: `${controlSize}px`,
                height: `${controlSize}px`,
                transform: "translate(50%, 50%)",
                pointerEvents: textElementsClickable ? 'auto' : 'none'
              }}
              onPointerDown={(e) => {
                if (!textElementsClickable) return;
                if (e.pointerType === "mouse" && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                if (textInteractionRef.current.mode && textInteractionRef.current.pointerId !== e.pointerId) {
                  return;
                }

                setSelectedTextId(textEl.id);
                setIsDraggingText(false);
                setIsResizingText(true);
                lastDragStateRef.current = { dragging: false, resizing: true };
                textInteractionRef.current = { mode: "resize", pointerId: e.pointerId, textId: textEl.id };
                activePointerRef.current = e.pointerId;
                activePointerTypeRef.current = e.pointerType;
                textDragStartRef.current = null;
                const textContainer = e.currentTarget.parentElement;
                const rect = textContainer?.getBoundingClientRect();
                textResizeStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  screenWidth: rect?.width ?? 1,
                  screenHeight: rect?.height ?? 1,
                  startScale: (typeof textEl.scale === "number" && Number.isFinite(textEl.scale)) ? textEl.scale : 1
                };

                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch (error) {
                  try {
                    document.documentElement.setPointerCapture(e.pointerId);
                  } catch (fallbackError) {
                  }
                }
              }}
              onLostPointerCapture={(e) => {
                eventSequenceRef.current++;
              }}
              onPointerMove={(e) => {
                e.stopPropagation();
              }}
              onPointerUp={(e) => {
                eventSequenceRef.current++;
                try {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                } catch (error) {
                }
              }}
            >
              <svg
                className="pointer-events-none opacity-70"
                xmlns="http://www.w3.org/2000/svg"
                width="8"
                height="8"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M3 9l6-6" />
                <path d="M7 9l2-2" />
              </svg>
            </div>
          )}

          {isSelected && (
            <button
              className={`absolute flex items-center justify-center touch-none rounded-full border border-[var(--foreground)]/25 bg-[var(--background)]/70 text-[var(--foreground)]/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--background)]/90 hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 ${textElementsClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              style={{
                top: 0,
                right: 0,
                width: `${controlSize}px`,
                height: `${controlSize}px`,
                transform: "translate(50%, -50%)",
                pointerEvents: textElementsClickable ? 'auto' : 'none'
              }}
              onClick={(e) => {
                if (!textElementsClickable) return;
                e.stopPropagation();
                setTextElements(prev => prev.filter(t => t.id !== textEl.id));
                setSelectedTextId(null);
              }}
            >
              <svg
                className="pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
                width="8"
                height="8"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <path d="M3 3l6 6M9 3L3 9" />
              </svg>
            </button>
          )}
        </div>
      );
    });
  }, [textElements, selectedTextId, textElementsClickable, panOffset, zoom, textPanZoom, isPanning]);

  const pdfOverlayLayer = useMemo(() => {
    if (pdfOverlays.length === 0) return null;
    // During panning, use refs directly (via textPanZoom which updates less frequently)
    const isPanningActive = isPanning || activeTouchesRef.current.size === 2;
    const currentZoom = isPanningActive
      ? (Number.isFinite(textPanZoom.zoom) ? textPanZoom.zoom : zoomRef.current)
      : (Number.isFinite(zoom) ? zoom : 1);
    const panX = isPanningActive
      ? (Number.isFinite(textPanZoom.pan.x) ? textPanZoom.pan.x : panOffsetRef.current.x)
      : (Number.isFinite(panOffset.x) ? panOffset.x : 0);
    const panY = isPanningActive
      ? (Number.isFinite(textPanZoom.pan.y) ? textPanZoom.pan.y : panOffsetRef.current.y)
      : (Number.isFinite(panOffset.y) ? panOffset.y : 0);
    const handleSize = 14;

    return pdfOverlays.map((overlay) => {
      const isSelected = selectedPdfId === overlay.id;
      const screenX = overlay.x * currentZoom + panX;
      const screenY = overlay.y * currentZoom + panY;
      const screenW = overlay.width * currentZoom;
      const screenH = overlay.height * currentZoom;

      return (
        <div
          key={overlay.id}
          ref={(el) => {
            if (el) {
              pdfOverlayRefs.current.set(overlay.id, el);
            } else {
              pdfOverlayRefs.current.delete(overlay.id);
            }
          }}
          className={`absolute touch-none ${overlay.locked ? "cursor-default" : "cursor-move"} ${isSelected ? "ring-1 ring-gray-400" : "ring-1 ring-transparent"}`}
          style={{
            left: screenX,
            top: screenY,
            width: screenW,
            height: screenH,
            pointerEvents: overlay.locked ? "none" : "auto",
            userSelect: "none",
            zIndex: isSelected ? 80 : 20
          }}
          onPointerDown={(e) => {
            if (overlay.locked) return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            if (pdfInteractionRef.current.mode && pdfInteractionRef.current.pointerId !== e.pointerId) {
              return;
            }

            setSelectedPdfId(overlay.id);
            pdfInteractionRef.current = { mode: "drag", pointerId: e.pointerId, pdfId: overlay.id };
            const worldPoint = getWorldPointFromClient(e.clientX, e.clientY);
            pdfDragStartRef.current = {
              offsetX: worldPoint.x - overlay.x,
              offsetY: worldPoint.y - overlay.y
            };
            pdfResizeStartRef.current = null;

            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch (error) {
              try {
                document.documentElement.setPointerCapture(e.pointerId);
              } catch (fallbackError) {
                console.log('Pointer capture failed:', error, fallbackError);
              }
            }
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
          }}
          onLostPointerCapture={(e) => {
            console.log('PDF pointer capture lost for:', e.pointerId, 'but continuing drag');
          }}
          onPointerUp={(e) => {
            try {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            } catch (error) {
              console.warn('Pointer release failed:', error);
            }
          }}
        >
          {isSelected && !overlay.locked && (
            <div
              className="absolute flex items-center justify-center rounded-full border border-[var(--foreground)]/25 bg-[var(--background)]/80 text-[var(--foreground)]/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--background)]/90 touch-none"
              style={{
                right: 0,
                bottom: 0,
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: "translate(50%, 50%)",
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                if (pdfInteractionRef.current.mode && pdfInteractionRef.current.pointerId !== e.pointerId) {
                  return;
                }

                setSelectedPdfId(overlay.id);
                pdfInteractionRef.current = { mode: "resize", pointerId: e.pointerId, pdfId: overlay.id };
                pdfDragStartRef.current = null;
                pdfResizeStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  width: overlay.width,
                  height: overlay.height,
                  aspect: overlay.width / Math.max(1, overlay.height)
                };

                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch (error) {
                  try {
                    document.documentElement.setPointerCapture(e.pointerId);
                  } catch (fallbackError) {
                    console.warn('Pointer capture failed:', error, 'fallback also failed:', fallbackError);
                  }
                }
              }}
              onPointerUp={(e) => {
                try {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                } catch (error) {
                  console.warn('Pointer release failed:', error);
                }
              }}
            >
              <svg
                className="pointer-events-none opacity-70"
                xmlns="http://www.w3.org/2000/svg"
                width="8"
                height="8"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M3 9l6-6" />
                <path d="M7 9l2-2" />
              </svg>
            </div>
          )}
          {isSelected && (
            <button
              className="absolute flex items-center justify-center rounded-full border border-[var(--foreground)]/25 bg-[var(--background)]/80 text-[var(--foreground)]/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--background)]/90"
              style={{
                top: 0,
                left: 0,
                width: `${handleSize}px`,
                height: `${handleSize}px`,
                transform: "translate(-50%, -50%)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setPdfOverlays(prev => prev.map(p =>
                  p.id === overlay.id ? { ...p, locked: !p.locked } : p
                ));
                if (!overlay.locked) {
                  setSelectedPdfId(null);
                }
              }}
            >
              <svg
                className="pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {overlay.locked ? (
                  <path d="M6 11h12v10H6zM9 11V7a3 3 0 0 1 6 0v4"/>
                ) : (
                  <path d="M17 11V7a5 5 0 0 0-10 0v4M6 11h12v10H6z"/>
                )}
              </svg>
            </button>
          )}
        </div>
      );
    });
  }, [pdfOverlays, selectedPdfId, zoom, panOffset, textPanZoom, isPanning]);

  const handlePointerLeave = () => {
    setEraserTarget(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleRawUpdate = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.target !== canvas) return;
      if (toolRef.current !== "pen") return;
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      rawUpdateSeenRef.current = true;
      const events = getCoalescedPointerEventsFromNative(pointerEvent);
      processPointerEvents(events);
    };

    canvas.addEventListener("pointerrawupdate", handleRawUpdate);
    return () => {
      canvas.removeEventListener("pointerrawupdate", handleRawUpdate);
    };
  }, []);

  // Point in polygon test
  const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  const handleUndo = () => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setStrokes(previousState);
      setUndoStack((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setShowClearConfirmModal(true);
  };

  const confirmClear = () => {
    setUndoStack((prev) => [...prev, strokes]);
    setStrokes([]);
    setTextElements([]);
    setPdfOverlays([]);
    setSelectedPdfId(null);
    setLassoSelection(null);
    setShowClearConfirmModal(false);
  };

  const cancelClear = () => {
    setShowClearConfirmModal(false);
  };

  const startNewChat = () => {
    setChatMessages([]);
    setChatInput("");
    setShowHistoryInChat(false); // Hide history when starting new chat
  };

  // Voice input functions
  const appendTranscriptionText = useCallback((text: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    setChatInput((prev) => {
      if (!prev) return trimmed;
      const needsSpace = /\s$/.test(prev) ? '' : ' ';
      return `${prev}${needsSpace}${trimmed}`;
    });
    requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
  }, []);

  const cleanupMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopActiveRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupMediaStream();
    }
  }, [cleanupMediaStream]);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    setVoiceError(null);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice-input.webm');
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Failed to transcribe audio.');
      }
      appendTranscriptionText(String(json.text || '').trim());
    } catch (err: any) {
      setVoiceError(err?.message || 'Voice transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  }, [appendTranscriptionText]);

  const handleToggleRecording = useCallback(async () => {
    if (isTranscribing) return;
    if (isRecording) {
      setIsRecording(false);
      stopActiveRecording();
      return;
    }
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setVoiceError('Voice recording is not available in this environment.');
      return;
    }
    
    // Check for MediaRecorder support
    if (typeof MediaRecorder === 'undefined') {
      setVoiceError('MediaRecorder is not supported in this browser.');
      return;
    }
    
    // Check for getUserMedia support - try multiple ways
    let getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null = null;
    if (navigator.mediaDevices?.getUserMedia) {
      getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    } else if ((navigator as any).getUserMedia) {
      // Fallback for older browsers
      getUserMedia = (navigator as any).getUserMedia.bind(navigator);
    } else if ((navigator as any).webkitGetUserMedia) {
      getUserMedia = (navigator as any).webkitGetUserMedia.bind(navigator);
    } else if ((navigator as any).mozGetUserMedia) {
      getUserMedia = (navigator as any).mozGetUserMedia.bind(navigator);
    }
    
    if (!getUserMedia) {
      setVoiceError('Microphone access is not available in this browser.');
      return;
    }
    
    try {
      setVoiceError(null);
      const stream = await getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        cleanupMediaStream();
        setIsRecording(false);
        const chunks = audioChunksRef.current.splice(0);
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await transcribeAudio(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Microphone access failed', err);
      cleanupMediaStream();
      setIsRecording(false);
      setVoiceError(
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'Microphone permission was denied. Please allow microphone access in your browser settings.'
          : err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'
          ? 'No microphone found. Please connect a microphone and try again.'
          : err?.message || 'Unable to access the microphone. Please check your browser permissions.'
      );
    }
  }, [cleanupMediaStream, isRecording, isTranscribing, stopActiveRecording, transcribeAudio]);

  useEffect(() => {
    return () => {
      stopActiveRecording();
      cleanupMediaStream();
    };
  }, [cleanupMediaStream, stopActiveRecording]);

  async function exportCanvasImageDataUrl(): Promise<string | null> {
    const container = containerRef.current;
    if (!container) return null;

    // Use html2canvas to capture exactly what's visible on screen
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(container, {
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: false,
        ignoreElements: (element) => {
          // Ignore elements that might cause issues
          return false;
        },
        onclone: (clonedDoc, element) => {
          // Convert oklab colors to rgb before capturing
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            try {
              const computedStyle = clonedDoc.defaultView?.getComputedStyle(htmlEl) || window.getComputedStyle(htmlEl);
              
              // Check and convert color
              try {
                const color = computedStyle.color;
                if (color && (color.includes('oklab') || color.includes('oklch'))) {
                  // Fallback to a default color if oklab/oklch is used
                  htmlEl.style.color = 'rgb(0, 0, 0)';
                }
              } catch (e) {
                // Ignore color parsing errors
              }
              
              // Check and convert background-color
              try {
                const bgColor = computedStyle.backgroundColor;
                if (bgColor && (bgColor.includes('oklab') || bgColor.includes('oklch'))) {
                  // Fallback to transparent if oklab/oklch is used
                  htmlEl.style.backgroundColor = 'transparent';
                }
              } catch (e) {
                // Ignore color parsing errors
              }
              
              // Check and convert border-color
              try {
                const borderColor = computedStyle.borderColor;
                if (borderColor && (borderColor.includes('oklab') || borderColor.includes('oklch'))) {
                  htmlEl.style.borderColor = 'transparent';
                }
              } catch (e) {
                // Ignore color parsing errors
              }
            } catch (e) {
              // Ignore any errors during style processing
            }
          });
        },
      });
      
      // Resize if too large
      const maxWidth = 1280;
      const maxHeight = 1280;
      if (canvas.width > maxWidth || canvas.height > maxHeight) {
        const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
        const resized = document.createElement("canvas");
        resized.width = Math.floor(canvas.width * scale);
        resized.height = Math.floor(canvas.height * scale);
        const ctx = resized.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
          return resized.toDataURL("image/jpeg", 0.85);
        }
      }
      
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (error) {
      console.error("Error capturing screenshot with html2canvas:", error);
      return null;
    }
  }

  const handleSendToAI = async (customPrompt?: string, imageData?: string | null) => {
    setIsLoading(true);

    try {
      // If imageData is null, it means explicitly don't include canvas
      // If imageData is undefined, get canvas (for backward compatibility)
      // If imageData is a string, use it
      const canvasImage = imageData === null 
        ? null 
        : (imageData || await exportCanvasImageDataUrl());
      if (!canvasImage && !customPrompt) throw new Error("No content");
      
      // Prepare conversation history (last 10 messages for context)
      const recentMessages = chatMessages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.role === 'user' 
          ? (msg.content + (msg.imageData ? ' [Image attached]' : ''))
          : msg.content
      }));
      
      const response = await fetch("/api/cosolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          image: canvasImage,
          prompt: customPrompt,
          messages: recentMessages
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze");
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: data.response || "No response received.",
      };
      setChatMessages(prev => [...prev, assistantMessage]);

      if (data?.historyItem?.id) {
        const item: CoSolveHistoryItem = {
          id: String(data.historyItem.id),
          createdAt: String(data.historyItem.createdAt),
          imageData: String(data.historyItem.imageData || canvasImage),
          response: String(data.historyItem.response || data.response || ""),
        };
        setHistoryItems((prev) => [item, ...prev]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, {
        id: generateId(),
        role: "assistant",
        content: "Error analyzing. Please try again.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() && (strokes.length === 0 || !includeCanvas)) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: chatInput || "Solve this",
      imageData: includeCanvas ? (await exportCanvasImageDataUrl() || undefined) : undefined,
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");

    // Pass null explicitly when includeCanvas is false to prevent fallback to canvas
    await handleSendToAI(chatInput, includeCanvas ? userMessage.imageData : null);
  };

  const handleImagePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const imageData = event.target?.result as string;
            const userMessage: ChatMessage = {
              id: generateId(),
              role: "user",
              content: chatInput || "Analyze this image",
              imageData,
            };
            setChatMessages(prev => [...prev, userMessage]);
            setChatInput("");
            await handleSendToAI(chatInput || "Analyze this image", imageData);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handlePdfFile = async (file: File) => {
    if (!file) return;
    setIsPdfProcessing(true);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }

      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const renderScale = Math.max(2, window.devicePixelRatio || 1);
      const pageCanvases: HTMLCanvasElement[] = [];
      let maxWidth = 0;
      let totalHeight = 0;

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: renderScale });
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = Math.ceil(viewport.width);
        pageCanvas.height = Math.ceil(viewport.height);
        const pageCtx = pageCanvas.getContext("2d");
        if (!pageCtx) continue;
        pageCtx.imageSmoothingEnabled = true;
        pageCtx.imageSmoothingQuality = "high";
        await page.render({ canvas: pageCanvas, viewport }).promise;
        pageCanvases.push(pageCanvas);
        maxWidth = Math.max(maxWidth, pageCanvas.width);
        totalHeight += pageCanvas.height;
      }

      if (pageCanvases.length === 0) return;

      const spacing = Math.round(24 * renderScale);
      const totalHeightWithSpacing = totalHeight + spacing * (pageCanvases.length - 1);
      const combinedCanvas = document.createElement("canvas");
      combinedCanvas.width = Math.max(1, Math.ceil(maxWidth));
      combinedCanvas.height = Math.max(1, Math.ceil(totalHeightWithSpacing));
      const combinedCtx = combinedCanvas.getContext("2d");
      if (!combinedCtx) return;

      let offsetY = 0;
      pageCanvases.forEach((pageCanvas, index) => {
        combinedCtx.drawImage(pageCanvas, 0, offsetY);
        offsetY += pageCanvas.height + (index < pageCanvases.length - 1 ? spacing : 0);
      });

      const imageData = combinedCtx.getImageData(0, 0, combinedCanvas.width, combinedCanvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 5) {
          continue;
        }
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        if (gray > 250) {
          data[i + 3] = 0;
          continue;
        }
        const inv = 255 - gray;
        data[i] = inv;
        data[i + 1] = inv;
        data[i + 2] = inv;
        data[i + 3] = alpha;
      }
      combinedCtx.putImageData(imageData, 0, 0);

      const dataUrl = combinedCanvas.toDataURL("image/png");
      const width = combinedCanvas.width / renderScale;
      const height = combinedCanvas.height / renderScale;
      const container = containerRef.current;
      let x = 0;
      let y = 0;
      if (container) {
        const rect = container.getBoundingClientRect();
        const worldTopLeft = getWorldPointFromClient(rect.left, rect.top);
        x = worldTopLeft.x;
        y = worldTopLeft.y;
      }

      const newOverlay: PdfOverlay = {
        id: generateId(),
        name: file.name || "PDF",
        src: dataUrl,
        x,
        y,
        width,
        height,
        locked: false,
      };

      setPdfOverlays(prev => [...prev, newOverlay]);
      setSelectedPdfId(newOverlay.id);
    } catch (error) {
      console.error("Failed to import PDF:", error);
    } finally {
      setIsPdfProcessing(false);
    }
  };

  // Capture selection area as image
  const captureSelectionImage = async (): Promise<string | null> => {
    if (!lassoSelection || !canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const bounds = lassoSelection.bounds;
    
    // Create a temporary canvas for the selection
    const tempCanvas = document.createElement('canvas');
    const padding = 20;
    tempCanvas.width = (bounds.width + padding * 2) * dpr;
    tempCanvas.height = (bounds.height + padding * 2) * dpr;
    
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.scale(dpr, dpr);
    
    // Fill with background color
    let bgColor = "#1a1a1a";
    if (canvasBg === "graph-dark") bgColor = "#1a1a1a";
    else if (canvasBg === "graph-light") bgColor = "#ffffff";
    else if (canvasBg.startsWith("#")) bgColor = canvasBg;
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, bounds.width + padding * 2, bounds.height + padding * 2);
    
    // Translate to draw strokes at correct position
    ctx.translate(padding - bounds.x, padding - bounds.y);
    
    // Draw only selected strokes
    lassoSelection.strokes.forEach(strokeIndex => {
      const stroke = strokes[strokeIndex];
      if (stroke) {
        drawStroke(ctx, stroke, null);
      }
    });
    
    return tempCanvas.toDataURL('image/jpeg', 0.9);
  };

  // Lasso AI actions
  const handleLassoExplain = async () => {
    if (!lassoSelection) return;
    setShowLassoMenu(false);
    
    const selectionImage = await captureSelectionImage();
    if (!selectionImage) return;
    
    // Add user message showing what was selected
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: "Explain this selection:",
      imageData: selectionImage,
    };
    setChatMessages(prev => [...prev, userMessage]);
    
    setIsLoading(true);
    try {
      const response = await fetch("/api/cosolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          image: selectionImage,
          prompt: "Explain what is written/drawn in this image. What does it mean? If there are symbols, explain them. Be concise but thorough."
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setChatMessages(prev => [...prev, {
          id: generateId(),
          role: "assistant",
          content: data.response || "Could not explain the selection.",
        }]);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
      setLassoSelection(null);
    }
  };

  const handleLassoSolve = async () => {
    if (!lassoSelection) return;
    setShowLassoMenu(false);
    
    const selectionImage = await captureSelectionImage();
    if (!selectionImage) return;
    
    // Add user message showing what was selected
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: "Solve this:",
      imageData: selectionImage,
    };
    setChatMessages(prev => [...prev, userMessage]);
    
    setIsLoading(true);
    try {
      const response = await fetch("/api/cosolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          image: selectionImage,
          prompt: "Solve the mathematical problem or equation shown in this image. Show all steps clearly and give the final answer."
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setChatMessages(prev => [...prev, {
          id: generateId(),
          role: "assistant",
          content: data.response || "Could not solve the selection.",
        }]);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
      setLassoSelection(null);
    }
  };

  const handleLassoAsk = async () => {
    if (!lassoSelection) return;
    const question = window.prompt("Ask about this selection:");
    if (!question || !question.trim()) return;
    setShowLassoMenu(false);

    const selectionImage = await captureSelectionImage();
    if (!selectionImage) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: question.trim(),
      imageData: selectionImage,
    };
    setChatMessages(prev => [...prev, userMessage]);

    setIsLoading(true);
    try {
      const response = await fetch("/api/cosolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: selectionImage,
          prompt: `User question: ${question.trim()}\nAnswer the question using the content in the image. If it is ambiguous, say what is missing.`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setChatMessages(prev => [...prev, {
          id: generateId(),
          role: "assistant",
          content: data.response || "Could not answer the question.",
        }]);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
      setLassoSelection(null);
    }
  };

  const handleLassoRewrite = async () => {
    if (!lassoSelection) return;
    setShowLassoMenu(false);
    
    const selectionImage = await captureSelectionImage();
    if (!selectionImage) return;
    
    // Store current state for undo
    setUndoStack(prev => [...prev, strokes]);
    
    setIsLoading(true);
    try {
      const response = await fetch("/api/cosolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          image: selectionImage,
          prompt: `EXACT TRANSCRIPTION ONLY - NO EXPLANATIONS

You see handwritten content. Your ONLY job is to output the exact content that was written, cleaned up.

CRITICAL RULES:
- Output ONLY the handwritten content
- NO explanations, NO "The equation is", NO "This appears to be"
- NO introductions, NO conclusions
- ALL MATH must use LaTeX display blocks: $$math here$$
- If text: output clean text
- If list: use markdown bullet points
- NOTHING else - just the content

EXAMPLE:
Input: handwritten "f(x) = kx + m"
Output: $$f(x) = kx + m$$

EXAMPLE:
Input: handwritten equation
Output: $$\\frac{dy}{dx} = 2x$$

DO NOT ADD ANY EXTRA TEXT.`
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        let rewrittenText = data.response || "";

        // Clean up the response - remove any explanatory text
        if (rewrittenText) {
          // Remove common explanatory prefixes
          rewrittenText = rewrittenText
            .replace(/^.*?(?:equation is|appears to be|this is|the text|rewritten as)[:\s]*/i, '')
            .replace(/^.*?["""](.*)["""].*?$/s, '$1') // Extract content from quotes
            .trim();

          // If it still contains explanatory text, try to extract just the content
          const lines = rewrittenText.split('\n');
          if (lines.length > 1) {
            // Look for lines that look like content (contain math symbols or are short)
            const contentLines = lines.filter(line =>
              line.includes('$') || line.includes('\\') ||
              (line.length < 100 && !line.toLowerCase().includes('equation') && !line.toLowerCase().includes('text'))
            );
            if (contentLines.length > 0) {
              rewrittenText = contentLines.join('\n');
            }
          }
        }

        if (rewrittenText) {
          // Determine text color based on background
          const isLightBg = canvasBg === "graph-light" || canvasBg === "#ffffff" || canvasBg === "White" || canvasBg === "Cream" || canvasBg === "#fdf6e3";
          
          // Create text element at selection position
          // Store in canvas coordinates so it moves with pan/zoom like strokes
          const newTextElement: TextElement = {
            id: generateId(),
            content: rewrittenText,
            x: lassoSelection.bounds.x,
            y: lassoSelection.bounds.y,
            width: Math.max(lassoSelection.bounds.width, 150),
            height: Math.max(lassoSelection.bounds.height, 50),
            scale: 1,
            fontSize: 14,
            color: isLightBg ? "#1a1a1a" : "#ffffff",
          };
          
          setTextElements(prev => [...prev, newTextElement]);
          setSelectedTextId(newTextElement.id);
          
          // Remove selected strokes
          const selectedIndexes = new Set(lassoSelection.strokes);
          setStrokes(prev => prev.filter((_, index) => !selectedIndexes.has(index)));
          
          // Add to chat
          setChatMessages(prev => [...prev, {
            id: generateId(),
            role: "assistant",
            content: `✨ Rewritten:\n\n${rewrittenText}`,
          }]);
        }
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
      setLassoSelection(null);
    }
  };

  const deleteCanvas = (id: string) => {
    const updated = canvases.filter(c => c.id !== id);
    setCanvases(updated);
    saveCanvases(updated);
    deleteCanvasFromServer(id);
    
    if (currentCanvasId === id) {
      if (updated.length > 0) {
        loadCanvas(updated[0].id, updated);
      } else {
        createNewCanvas();
      }
    }
  };

  const waitForIceGatheringComplete = useCallback((pc: RTCPeerConnection) => {
    if (pc.iceGatheringState === "complete") {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const handleStateChange = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", handleStateChange);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", handleStateChange);
    });
  }, []);

  const stopShare = useCallback(
    async ({ notifyServer = true, keepError = false }: { notifyServer?: boolean; keepError?: boolean } = {}) => {
      if (sharePollRef.current !== null) {
        window.clearInterval(sharePollRef.current);
        sharePollRef.current = null;
      }

      shareHandledViewersRef.current.clear();

      sharePeersRef.current.forEach((peer) => {
        peer.close();
      });
      sharePeersRef.current.clear();

      if (shareStreamRef.current) {
        shareStreamRef.current.getTracks().forEach((track) => track.stop());
        shareStreamRef.current = null;
      }

      const sessionId = shareSessionIdRef.current;
      shareSessionIdRef.current = null;
      setShareUrl(null);
      setShareStatus(keepError ? "error" : "idle");
      if (!keepError) {
        setShareError(null);
      }
      setShareCopied(false);

      if (notifyServer && sessionId) {
        try {
          await fetch(`/api/cosolve/share/${sessionId}`, { method: "DELETE" });
        } catch {
          // ignore cleanup errors
        }
      }
    },
    []
  );

  const handleShareCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1500);
    } catch {
      setShareCopied(false);
    }
  }, [shareUrl]);

  const startShare = useCallback(async () => {
    if (shareStatus === "starting" || shareStatus === "live") return;
    setShareStatus("starting");
    setShareError(null);

    try {
      const sessionRes = await fetch("/api/cosolve/share", { method: "POST" });
      if (!sessionRes.ok) {
        throw new Error("Failed to create share session");
      }
      const sessionData = await sessionRes.json();
      const sessionId = sessionData?.shareId;
      const sessionUrl = sessionData?.shareUrl;
      if (!sessionId || !sessionUrl) {
        throw new Error("Invalid share session response");
      }

      shareSessionIdRef.current = sessionId;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener(
          "ended",
          () => {
            stopShare();
          },
          { once: true }
        );
      }

      shareStreamRef.current = stream;
      setShareUrl(sessionUrl);
      setShareStatus("live");

      const rtcConfig: RTCConfiguration = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        iceCandidatePoolSize: 2,
      };

      const connectViewer = async (viewerId: string, offer: RTCSessionDescriptionInit) => {
        const peer = new RTCPeerConnection(rtcConfig);
        sharePeersRef.current.set(viewerId, peer);

        peer.onconnectionstatechange = () => {
          if (peer.connectionState === "failed" || peer.connectionState === "disconnected" || peer.connectionState === "closed") {
            peer.close();
            sharePeersRef.current.delete(viewerId);
          }
        };

        stream.getTracks().forEach((mediaTrack) => {
          peer.addTrack(mediaTrack, stream);
        });

        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await waitForIceGatheringComplete(peer);

        await fetch(`/api/cosolve/share/${sessionId}/host/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ viewerId, answer: peer.localDescription }),
        });
      };

      const pollOffers = async () => {
        if (!shareSessionIdRef.current) return;
        try {
          const res = await fetch(`/api/cosolve/share/${sessionId}/host/offers`, { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          const offers = Array.isArray(data?.offers) ? data.offers : [];
          for (const entry of offers) {
            const viewerId = entry?.viewerId;
            const offer = entry?.offer;
            if (!viewerId || !offer || shareHandledViewersRef.current.has(viewerId)) {
              continue;
            }
            shareHandledViewersRef.current.add(viewerId);
            connectViewer(viewerId, offer).catch((error) => {
              shareHandledViewersRef.current.delete(viewerId);
              const existing = sharePeersRef.current.get(viewerId);
              if (existing) {
                existing.close();
                sharePeersRef.current.delete(viewerId);
              }
            });
          }
        } catch {
          // ignore poll errors
        }
      };

      await pollOffers();
      if (sharePollRef.current !== null) {
        window.clearInterval(sharePollRef.current);
      }
      sharePollRef.current = window.setInterval(pollOffers, 750);
    } catch (error) {
      setShareError("Failed to start share. Please try again.");
      await stopShare({ notifyServer: true, keepError: true });
    }
  }, [shareStatus, stopShare, waitForIceGatheringComplete]);

  useEffect(() => {
    return () => {
      stopShare({ notifyServer: false });
    };
  }, [stopShare]);

  useEffect(() => {
    if (!isOpen && shareStatus !== "idle") {
      stopShare();
    }
  }, [isOpen, shareStatus, stopShare]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--background)]">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 border-b border-[var(--foreground)]/10 bg-[var(--background)]/95 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--foreground)]/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          
          {/* Canvas name - editable */}
          <div className="relative">
            {isRenamingCanvas ? (
              <input
                type="text"
                value={currentCanvasName}
                onChange={(e) => setCurrentCanvasName(e.target.value)}
                onBlur={() => setIsRenamingCanvas(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsRenamingCanvas(false)}
                className="bg-transparent border-b border-[var(--accent-cyan)] text-lg font-semibold outline-none px-1"
                autoFocus
              />
            ) : (
              <button
                onClick={() => { setShowCanvasList(!showCanvasList); setShowSharePanel(false); }}
                className="flex items-center gap-2 hover:bg-[var(--foreground)]/10 px-2 py-1 rounded-lg transition-colors"
              >
                <span className="text-lg font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] bg-clip-text text-transparent">
                  {currentCanvasName}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            )}
            
            {/* Canvas dropdown */}
            {showCanvasList && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-[var(--background)] border border-[var(--foreground)]/20 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-[var(--foreground)]/10">
                  <button
                    onClick={() => { createNewCanvas(); setShowCanvasList(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--foreground)]/10 text-sm flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    New Canvas
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {canvases.map(c => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between px-3 py-2 hover:bg-[var(--foreground)]/10 ${c.id === currentCanvasId ? 'bg-[var(--accent-cyan)]/10' : ''}`}
                    >
                      <button
                        onClick={() => { loadCanvas(c.id); setShowCanvasList(false); }}
                        className="flex-1 text-left text-sm truncate"
                      >
                        {c.name}
                      </button>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setCurrentCanvasName(c.name); setIsRenamingCanvas(true); setShowCanvasList(false); }}
                          className="p-1 hover:bg-[var(--foreground)]/20 rounded"
                          title="Rename"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                          </svg>
                        </button>
                        {canvases.length > 1 && (
                          <button
                            onClick={() => deleteCanvas(c.id)}
                            className="p-1 hover:bg-red-500/20 text-red-400 rounded"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Tools in header */}
        <div className="flex items-center gap-2">
          {/* Text elements toggle */}
          <button
            onClick={() => setTextElementsClickable(!textElementsClickable)}
            className={`p-2 rounded-lg transition-colors ${
              textElementsClickable
                ? "bg-[var(--foreground)]/10 hover:bg-[var(--foreground)]/20"
                : "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
            }`}
            title={textElementsClickable ? "Disable text element interaction" : "Enable text element interaction"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {textElementsClickable ? (
                <>
                  <path d="M12 2v20M2 12h20"/>
                  <circle cx="9" cy="9" r="2"/>
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                </>
              ) : (
                <path d="M12 2v20M2 12h20"/>
              )}
            </svg>
          </button>

          <div className="relative flex items-center gap-1">
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="p-2 rounded-lg transition-colors bg-[var(--foreground)]/10 hover:bg-[var(--foreground)]/20 disabled:opacity-60"
              title="Import PDF"
              disabled={isPdfProcessing}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <path d="M12 18v-6"/>
                <path d="M9 15h6"/>
              </svg>
            </button>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handlePdfFile(file);
                }
                e.currentTarget.value = "";
              }}
            />
            <button
              onClick={() => setShowPdfPanel((prev) => !prev)}
              className="p-2 rounded-lg transition-colors bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/15"
              title="PDF layers"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 2 9 5-9 5-9-5 9-5z"/>
                <path d="m12 12 9 5-9 5-9-5 9-5z"/>
              </svg>
            </button>
            {showPdfPanel && (
              <div
                className="absolute right-0 top-12 z-[1000] w-64 rounded-xl border border-[var(--foreground)]/10 bg-[var(--background)]/95 p-3 shadow-lg backdrop-blur"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <div className="text-[11px] uppercase tracking-wide text-[var(--foreground)]/60">PDF layers</div>
                {pdfOverlays.length === 0 ? (
                  <div className="mt-2 text-sm text-[var(--foreground)]/70">No PDFs loaded.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {pdfOverlays.map((overlay) => (
                      <div key={overlay.id} className="flex items-center justify-between gap-2 text-sm">
                        <button
                          className="truncate text-left text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                          onClick={() => {
                            if (!overlay.locked) {
                              setSelectedPdfId(overlay.id);
                            }
                          }}
                          title={overlay.name}
                        >
                          {overlay.name}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            className="rounded-md px-2 py-1 text-xs text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10"
                            onClick={() => {
                              const scale = 1.08;
                              setPdfOverlays(prev => prev.map(p =>
                                p.id === overlay.id
                                  ? { ...p, width: p.width * scale, height: p.height * scale }
                                  : p
                              ));
                            }}
                          >
                            +
                          </button>
                          <button
                            className="rounded-md px-2 py-1 text-xs text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10"
                            onClick={() => {
                              const scale = 1 / 1.08;
                              setPdfOverlays(prev => prev.map(p =>
                                p.id === overlay.id
                                  ? { ...p, width: Math.max(20, p.width * scale), height: Math.max(20, p.height * scale) }
                                  : p
                              ));
                            }}
                          >
                            -
                          </button>
                          <button
                            className="rounded-md px-2 py-1 text-xs text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10"
                            onClick={() => {
                              setPdfOverlays(prev => prev.map(p =>
                                p.id === overlay.id ? { ...p, locked: !p.locked } : p
                              ));
                              if (!overlay.locked) {
                                setSelectedPdfId(null);
                              }
                            }}
                          >
                            {overlay.locked ? "Unlock" : "Lock"}
                          </button>
                          <button
                            className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                            onClick={() => {
                              setPdfOverlays(prev => prev.filter(p => p.id !== overlay.id));
                              pdfImageCacheRef.current.delete(overlay.id);
                              setSelectedPdfId((prev) => (prev === overlay.id ? null : prev));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tool selection */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--foreground)]/5">
            <button
              onClick={() => setTool("pen")}
              className={`p-2 rounded-md transition-colors ${tool === "pen" ? "bg-[var(--foreground)]/20" : "hover:bg-[var(--foreground)]/10"}`}
              title="Pen (finger pans)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l7.586 7.586"/>
                <circle cx="11" cy="11" r="2"/>
              </svg>
            </button>
            <button
              onClick={() => setTool("eraser")}
              className={`p-2 rounded-md transition-colors ${tool === "eraser" ? "bg-[var(--foreground)]/20" : "hover:bg-[var(--foreground)]/10"}`}
              title="Eraser"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
                <path d="M22 21H7"/>
                <path d="m5 11 9 9"/>
              </svg>
            </button>
            <button
              onClick={() => setTool("lasso")}
              className={`p-2 rounded-md transition-colors ${tool === "lasso" ? "bg-[var(--foreground)]/20" : "hover:bg-[var(--foreground)]/10"}`}
              title="Lasso Select"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 22a5 5 0 0 1-2-4"/>
                <path d="M7 16.93c.96.43 1.96.74 2.99.91"/>
                <path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2"/>
                <path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
                <path d="M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z"/>
              </svg>
            </button>
            <button
              onClick={() => setTool("pan")}
              className={`p-2 rounded-md transition-colors ${tool === "pan" ? "bg-[var(--foreground)]/20" : "hover:bg-[var(--foreground)]/10"}`}
              title="Pan"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
                <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
                <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
              </svg>
            </button>
          </div>

          {/* Color dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowColorDropdown(!showColorDropdown); setShowSizeDropdown(false); setShowSharePanel(false); }}
              className="p-2 rounded-lg hover:bg-[var(--foreground)]/10 flex items-center gap-2"
              title="Pen Color"
            >
              <div className="w-5 h-5 rounded-full border border-white/30" style={{ backgroundColor: currentColor }} />
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            
            {showColorDropdown && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-[var(--background)] border border-[var(--foreground)]/20 rounded-xl shadow-xl z-50 min-w-[200px]">
                <div className="text-xs text-[var(--foreground)]/60 mb-2 uppercase tracking-wide">Pen Color</div>
                <div className="flex gap-2 mb-3">
                  {colorPresets.map((color, index) => (
                    <button
                      key={`${color.value}-${index}`}
                      onClick={() => setCurrentColor(color.value)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        currentColor === color.value
                          ? "border-[var(--accent-cyan)] scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  className="w-full h-10 rounded-lg border border-[var(--foreground)]/20 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Size dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowSizeDropdown(!showSizeDropdown); setShowColorDropdown(false); setShowSharePanel(false); }}
              className="p-2 rounded-lg hover:bg-[var(--foreground)]/10 flex items-center gap-2"
              title="Brush Size"
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <div 
                  className="rounded-full bg-current" 
                  style={{ width: Math.min(brushSize, 16), height: Math.min(brushSize, 16) }} 
                />
              </div>
              <span className="text-xs">{brushSize}px</span>
            </button>
            
            {showSizeDropdown && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-[var(--background)] border border-[var(--foreground)]/20 rounded-xl shadow-xl z-50 min-w-[200px]">
                <div className="text-xs text-[var(--foreground)]/60 mb-2 uppercase tracking-wide">Brush Size: {brushSize}px</div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full h-2 bg-[var(--foreground)]/10 rounded-lg appearance-none cursor-pointer"
                />
                <div className="mt-3 flex items-center justify-center h-12">
                  <div
                    className="rounded-full transition-all duration-150"
                    style={{
                      width: Math.max(brushSize, 4),
                      height: Math.max(brushSize, 4),
                      backgroundColor: currentColor,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-2 rounded-lg hover:bg-[var(--foreground)]/10 transition-colors disabled:opacity-30"
            title="Undo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6"/>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            disabled={strokes.length === 0}
            className="p-2 rounded-lg hover:bg-[var(--foreground)]/10 transition-colors disabled:opacity-30"
            title="Clear canvas"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>


          {/* Share */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSharePanel(!showSharePanel);
                setShowColorDropdown(false);
                setShowSizeDropdown(false);
              }}
              className={`p-2 rounded-lg transition-colors ${shareStatus === "live" ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" : "hover:bg-[var(--foreground)]/10"}`}
              title="Share live view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51 15.42 17.49"/>
                <path d="M15.41 6.51 8.59 10.49"/>
              </svg>
            </button>
            {showSharePanel && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-[var(--background)] border border-[var(--foreground)]/20 rounded-xl shadow-xl z-50 p-3 space-y-2">
                <div className="text-xs text-[var(--foreground)]/60 uppercase tracking-wide">Live Share</div>
                {shareStatus === "idle" && (
                  <button
                    onClick={startShare}
                    className="w-full py-2 rounded-lg bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors text-sm"
                  >
                    Start sharing
                  </button>
                )}
                {shareStatus === "starting" && (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/60">
                    <div className="w-3 h-3 border-2 border-[var(--accent-cyan)]/30 border-t-[var(--accent-cyan)] rounded-full animate-spin" />
                    Preparing share link...
                  </div>
                )}
                {shareStatus === "live" && (
                  <>
                    <div className="text-xs text-[var(--foreground)]/60">
                      Share this link for live view.
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={shareUrl || ""}
                        readOnly
                        className="flex-1 px-2 py-1.5 rounded-md bg-[var(--foreground)]/5 border border-[var(--foreground)]/20 text-[11px] text-[var(--foreground)]/80"
                      />
                      <button
                        onClick={handleShareCopy}
                        className="px-2 py-1.5 rounded-md border border-[var(--foreground)]/20 text-[11px] hover:bg-[var(--foreground)]/10"
                      >
                        {shareCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <button
                      onClick={() => stopShare()}
                      className="w-full py-2 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors text-sm"
                    >
                      Stop sharing
                    </button>
                  </>
                )}
                {shareStatus === "error" && (
                  <>
                    <div className="text-xs text-red-300">{shareError || "Share error"}</div>
                    <button
                      onClick={startShare}
                      className="w-full py-2 rounded-lg bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors text-sm"
                    >
                      Try again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-lg hover:bg-[var(--foreground)]/10 transition-colors"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      {/* History modal overlay - fixed position over sidebar */}
      {showHistoryInChat && historyItems.length > 0 && (
        <div 
          className="fixed top-14 bottom-0 left-0 z-[1000] flex flex-col"
          style={{ width: sidebarCollapsed ? '40px' : '288px' }}
        >
          <div className="bg-[var(--background)] border-r border-[var(--foreground)]/10 flex flex-col h-full">
            <div className="flex items-center justify-between p-2 border-b border-[var(--foreground)]/10">
              <div className="text-[11px] text-[var(--foreground)]/60 uppercase tracking-wide font-medium">Previous Conversations</div>
              <button
                onClick={() => setShowHistoryInChat(false)}
                className="text-[11px] text-[var(--foreground)]/60 hover:text-[var(--foreground)] px-2 py-1 rounded hover:bg-[var(--foreground)]/10 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {historyItems.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    // Restore conversation from history
                    const userMsg: ChatMessage = {
                      id: generateId(),
                      role: "user",
                      content: "Previous conversation",
                      imageData: item.imageData,
                    };
                    const assistantMsg: ChatMessage = {
                      id: generateId(),
                      role: "assistant",
                      content: item.response,
                    };
                    setChatMessages([userMsg, assistantMsg]);
                    setShowHistoryInChat(false); // Hide history when loading a conversation
                    // Scroll to bottom
                    setTimeout(() => {
                      if (chatContainerRef.current) {
                        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                      }
                    }, 100);
                  }}
                  className="w-full text-left p-2 rounded-lg bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 transition-colors border border-[var(--foreground)]/10"
                >
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--foreground)]/60">
                      <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[var(--foreground)]/60 truncate">
                        {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-[var(--foreground)]/80 line-clamp-2 mt-0.5">
                        {item.response.substring(0, 60)}...
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-14 bottom-0 left-0 right-0 flex">
        {/* AI Sidebar - compact */}
        <div
          className={`${sidebarCollapsed ? 'w-10' : 'w-72'} border-r border-[var(--foreground)]/10 bg-[var(--background)]/95 flex flex-col transition-all duration-200`}
        >
          {!sidebarCollapsed ? (
            <>
              {/* Sidebar toggle - integrated with content */}
              <div className="flex items-center justify-between p-2 border-b border-[var(--foreground)]/10">
                <div className="flex items-center gap-2 flex-1">
                  <div className="text-[10px] text-[var(--foreground)]/60 uppercase tracking-wide">AI Chat</div>
                  <button
                    onClick={startNewChat}
                    className="p-0.5 rounded hover:bg-[var(--foreground)]/10 transition-colors opacity-60 hover:opacity-100"
                    title="New chat"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowHistoryInChat(!showHistoryInChat)}
                    className={`p-1 rounded transition-colors ${
                      showHistoryInChat 
                        ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]' 
                        : 'hover:bg-[var(--foreground)]/10'
                    }`}
                    title={showHistoryInChat ? "Hide history" : "Show history"}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 3h18v18H3zM7 8h10M7 12h10M7 16h10"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="p-1 rounded hover:bg-[var(--foreground)]/10 transition-colors"
                    title="Collapse sidebar"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-transform"
                    >
                      <path d="M15 18l-6-6 6-6"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto relative" ref={chatContainerRef}>
                <div className="p-2 space-y-2">
                  {chatMessages.length === 0 && !showHistoryInChat && (
                    <div className="text-[11px] text-[var(--foreground)]/40 italic text-center py-4">
                      {historyItems.length > 0 
                        ? "Click the history button to view previous conversations, or start a new chat."
                        : "Draw and ask AI to solve or explain."}
                    </div>
                  )}
                
                  {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[95%] rounded-lg px-2 py-1.5 text-[11px] ${
                      msg.role === 'user' 
                        ? 'bg-[var(--accent-cyan)]/20 text-[var(--foreground)]' 
                        : 'bg-[var(--foreground)]/5'
                    }`}>
                      {msg.imageData && (
                        <img src={msg.imageData} alt="Attached" className="max-w-full rounded mb-1 max-h-24" />
                      )}
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-invert prose-xs max-w-none text-[11px] [&_p]:text-[11px] [&_li]:text-[11px]">
                          <LessonBody body={msg.content} />
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-[var(--foreground)]/5 rounded-lg px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 border-2 border-[var(--accent-cyan)]/30 border-t-[var(--accent-cyan)] rounded-full animate-spin" />
                          <span className="text-[10px] text-[var(--foreground)]/60">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat input */}
              <div className="p-2 border-t border-[var(--foreground)]/10">
                <div className="flex gap-1">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onPaste={handleImagePaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit();
                      }
                    }}
                    placeholder="Ask AI... (paste images)"
                    className="flex-1 bg-[var(--foreground)]/5 border border-[var(--foreground)]/10 rounded-lg px-2 py-1.5 text-[11px] resize-none focus:outline-none focus:border-[var(--accent-cyan)]/50"
                    rows={1}
                  />
                  <button
                    type="button"
                    onClick={handleToggleRecording}
                    disabled={isLoading || isTranscribing}
                    aria-pressed={isRecording}
                    title={isRecording ? "Stop recording" : "Record voice message"}
                    className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                      isRecording ? "text-[#FFB347] border-[#FFB347]/60 bg-[#FFB347]/10" : "border-[var(--foreground)]/10 hover:bg-[var(--foreground)]/5"
                    } disabled:opacity-50`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 15c1.66 0 3-1.34 3-3V7a3 3 0 0 0-6 0v5c0 1.66 1.34 3 3 3z" />
                      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
                      <path d="M12 19v3" />
                    </svg>
                  </button>
                  <button
                    onClick={handleChatSubmit}
                    disabled={isLoading || (!chatInput.trim() && (strokes.length === 0 || !includeCanvas))}
                    className="px-2 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-pink)] text-white font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13"/>
                      <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
                    </svg>
                  </button>
                </div>
                {(voiceError || isRecording || isTranscribing) && (
                  <p className={`mt-1 text-[9px] ${voiceError ? 'text-[#FF8A8A]' : 'text-[var(--foreground)]/60'}`}>
                    {voiceError
                      ? voiceError
                      : isRecording
                        ? 'Recording… tap the mic to stop.'
                        : 'Transcribing voice...'}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <label className="flex items-center gap-1.5 text-[9px] text-[var(--foreground)]/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCanvas}
                      onChange={(e) => setIncludeCanvas(e.target.checked)}
                      className="w-3 h-3 rounded border border-[var(--foreground)]/20 bg-[var(--foreground)]/5 checked:bg-[var(--accent-cyan)] checked:border-[var(--accent-cyan)] cursor-pointer"
                    />
                    <span>Include canvas</span>
                  </label>
                  <p className="text-[9px] text-[var(--foreground)]/40">
                    • Enter to send • Paste images
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Collapsed sidebar - show history and expand buttons */
            <div className="flex flex-col items-center gap-2 py-2">
              <button
                onClick={() => setShowHistoryInChat(!showHistoryInChat)}
                className={`p-1 rounded transition-colors ${
                  showHistoryInChat 
                    ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]' 
                    : 'hover:bg-[var(--foreground)]/10'
                }`}
                title={showHistoryInChat ? "Hide history" : "Show history"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 3h18v18H3zM7 8h10M7 12h10M7 16h10"/>
                </svg>
              </button>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1 rounded hover:bg-[var(--foreground)]/10 transition-colors"
                title="Expand sidebar"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform rotate-180"
                >
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          onClick={() => {
            setSelectedTextId(null);
            setSelectedPdfId(null);
          }}
          style={{
            backgroundColor: canvasBg.startsWith("graph")
              ? (canvasBg === "graph-dark" ? "#1a1a1a" : "#ffffff")
              : canvasBg.startsWith("#")
              ? canvasBg
              : canvasBg === "Dark" ? "#1a1a1a"
              : canvasBg === "Darker" ? "#0f0f0f"
              : canvasBg === "White" ? "#ffffff"
              : canvasBg === "Cream" ? "#fdf6e3"
              : "#1a1a1a"
          }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none cosolve-canvas"
            style={{
              cursor: tool === "pan" || isPanning ? "grab" : tool === "eraser" ? "crosshair" : tool === "lasso" ? "crosshair" : "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerLeave}
            onContextMenu={(e) => {
              // Prevent context menu when middle button panning
              if (isPanning) {
                e.preventDefault();
              }
            }}
            onWheel={(e) => {
              // Ctrl+wheel for zoom, plain wheel for pan
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const canvas = canvasRef.current;
                if (!canvas) return;
                
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const cssScaleX = (canvas.width / dpr) / rect.width;
                const cssScaleY = (canvas.height / dpr) / rect.height;
                
                // Mouse position in canvas CSS coordinates
                const canvasMouseX = (e.clientX - rect.left) * cssScaleX;
                const canvasMouseY = (e.clientY - rect.top) * cssScaleY;
                
                const currentZoom = zoomRef.current;
                const currentPan = panOffsetRef.current;
                // Convert to world coordinates (before zoom change)
                const worldMouseX = (canvasMouseX - currentPan.x) / currentZoom;
                const worldMouseY = (canvasMouseY - currentPan.y) / currentZoom;
                
                const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                const newZoom = Math.max(0.25, Math.min(4, currentZoom * zoomFactor));
                
                // Calculate new pan to keep world point at same screen position
                const newPanX = canvasMouseX - worldMouseX * newZoom;
                const newPanY = canvasMouseY - worldMouseY * newZoom;
                
                schedulePanZoom({ x: newPanX, y: newPanY }, newZoom);
              }
            }}
          />
          {debugPointerInfo && (
            <div className="absolute top-3 right-3 z-40 rounded bg-black/60 px-2 py-1 text-[11px] leading-tight text-white">
              <div>input: {debugPointerInfo.pointerType}</div>
              <div>buttons: {debugPointerInfo.buttons}</div>
              <div>button: {debugPointerInfo.button}</div>
              <div>barrel: {debugPointerInfo.barrel ? "on" : "off"}</div>
            </div>
          )}

          {pdfOverlayLayer}

          {/* Text elements as draggable/resizable overlays */}
          {textElementsLayer}

          {/* Zoom indicator */}
          {zoom !== 1 && (
            <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm flex items-center gap-1">
              {Math.round(zoom * 100)}%
              <button
                onClick={() => schedulePanZoom(panOffsetRef.current, 1)}
                className="text-white/70 hover:text-white text-xs px-1 rounded hover:bg-white/10 transition-colors"
                title="Reset zoom to 100%"
              >
                ↺
              </button>
            </div>
          )}

          {/* Lasso AI menu */}
          {showLassoMenu && lassoSelection && (
            <div
              className="absolute bg-[var(--background)] border border-[var(--foreground)]/20 rounded-xl shadow-xl z-50 p-2 flex gap-2"
              style={{
                left: lassoSelection.bounds.x + panOffset.x,
                top: lassoSelection.bounds.y + lassoSelection.bounds.height + panOffset.y + 10,
              }}
            >
              <button
                onClick={handleLassoExplain}
                className="px-3 py-2 text-sm rounded-lg bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/30 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                  <path d="M12 17h.01"/>
                </svg>
                Explain
              </button>
              <button
                onClick={handleLassoSolve}
                className="px-3 py-2 text-sm rounded-lg bg-[var(--accent-pink)]/20 hover:bg-[var(--accent-pink)]/30 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 22h14"/>
                  <path d="M5 2h14"/>
                  <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>
                  <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
                </svg>
                Solve
              </button>
              <button
                onClick={handleLassoAsk}
                className="px-3 py-2 text-sm rounded-lg bg-[var(--accent-cyan)]/10 hover:bg-[var(--accent-cyan)]/20 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
                </svg>
                Ask
              </button>
              <button
                onClick={handleLassoRewrite}
                className="px-3 py-2 text-sm rounded-lg bg-[var(--accent-yellow)]/20 hover:bg-[var(--accent-yellow)]/30 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
                Rewrite
              </button>
              <button
                onClick={() => { setLassoSelection(null); setShowLassoMenu(false); }}
                className="px-3 py-2 text-sm rounded-lg hover:bg-[var(--foreground)]/10 transition-colors"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[var(--background)] border border-[var(--foreground)]/20 rounded-2xl shadow-2xl w-[400px] max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-[var(--foreground)]/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-2 hover:bg-[var(--foreground)]/10 rounded-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-6">
              {/* Grid Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm">Show Grid</label>
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    showGrid ? 'bg-[var(--accent-cyan)]' : 'bg-[var(--foreground)]/20'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      showGrid ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Smoothing Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm">Line Smoothing</label>
                <button
                  onClick={() => setSmoothingEnabled(!smoothingEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    smoothingEnabled ? 'bg-[var(--accent-pink)]' : 'bg-[var(--foreground)]/20'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      smoothingEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Canvas Background */}
              <div>
                <label className="block text-sm mb-3">Canvas Background</label>
                <div className="grid grid-cols-3 gap-2">
                  {CANVAS_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.value}
                      onClick={() => setCanvasBg(bg.value)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                        canvasBg === bg.value
                          ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30"
                          : "bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-transparent"
                      }`}
                    >
                      {bg.name}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <input
                    type="color"
                    value={canvasBg.startsWith('#') ? canvasBg : '#1a1a1a'}
                    onChange={(e) => setCanvasBg(e.target.value)}
                    className="w-full h-10 rounded-lg border border-[var(--foreground)]/20 cursor-pointer"
                  />
                </div>
              </div>

              {/* Color Presets */}
              <div>
                <label className="block text-sm mb-3">Color Presets</label>
                <div className="flex gap-2 mb-2">
                  {colorPresets.map((color, index) => (
                    <div key={index} className="flex flex-col items-center gap-1">
                      <input
                        type="color"
                        value={color.value}
                        onChange={(e) => {
                          const newPresets = [...colorPresets];
                          newPresets[index] = { ...color, value: e.target.value };
                          setColorPresets(newPresets);
                          saveColorPresets(newPresets);
                        }}
                        className="w-10 h-10 rounded-lg border border-[var(--foreground)]/20 cursor-pointer"
                      />
                      <span className="text-[10px] text-[var(--foreground)]/60">{index + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Zoom controls */}
              <div>
                <label className="block text-sm mb-3">Zoom: {Math.round(zoom * 100)}%</label>
                <input
                  type="range"
                  min="25"
                  max="400"
                  value={zoom * 100}
                  onChange={(e) => schedulePanZoom(panOffsetRef.current, Number(e.target.value) / 100)}
                  className="w-full h-2 bg-[var(--foreground)]/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Reset Pan & Zoom */}
              <button
                onClick={() => schedulePanZoom({ x: 0, y: 0 }, 1)}
                className="w-full py-2 rounded-lg bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-sm"
              >
                Reset View (Position & Zoom)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[var(--background)] border border-[var(--foreground)]/20 rounded-2xl shadow-2xl w-[400px] p-6">
            <h2 className="text-lg font-semibold mb-4">Clear Canvas</h2>
            <p className="text-[var(--foreground)]/70 mb-6">
              Are you sure you want to clear the entire canvas? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelClear}
                className="px-4 py-2 rounded-lg hover:bg-[var(--foreground)]/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Clear Canvas
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Click outside to close dropdowns */}
      {(showColorDropdown || showSizeDropdown || showCanvasList || showSharePanel) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => { setShowColorDropdown(false); setShowSizeDropdown(false); setShowCanvasList(false); setShowSharePanel(false); }}
        />
      )}
    </div>
  );
}

export default CoSolve;
