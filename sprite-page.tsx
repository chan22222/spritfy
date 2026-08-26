import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { parseGIF, decompressFrame } from 'gifuct-js';
import {
  motionEnergy, pickByMotionArcLength, findLoopSeam, despill,
  frameMetrics, planAlignment, extractionQuality, frameDiff,
  type LoopSeam, type ExtractionQuality, type FrameMetrics,
} from '@/lib/sprite-analysis.ts';
import SEO from '@/seo.tsx';
import { Lang } from '@/i18n.ts';
import { ToolInfo } from '@/tool-info.tsx';


// gifuct-js가 원본 프레임 타입을 export하지 않아 시그니처에서 뽑아 쓴다
type RawGifFrame = Parameters<typeof decompressFrame>[0];

interface Frame {
  id: number;
  blob: Blob;
  url: string;
  timestamp: number;
}

interface SpriteConfig {
  columns: number;
  padding: number;
}

const applySharpenKernel = (ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) => {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);
  const s = amount / 5;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const val = copy[i + c] * (1 + 4 * s)
          - copy[((y - 1) * w + x) * 4 + c] * s
          - copy[((y + 1) * w + x) * 4 + c] * s
          - copy[(y * w + (x - 1)) * 4 + c] * s
          - copy[(y * w + (x + 1)) * 4 + c] * s;
        data[i + c] = Math.max(0, Math.min(255, Math.round(val)));
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
};

export const SpritePage: React.FC<{ lang: Lang; t: Record<string, string> }> = ({ lang, t }) => {

  // State
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);
  
  // Extraction Settings
  // 동영상 샘플링 간격 (30fps 기준 N프레임마다 = 10fps). 조절 UI 없이 넉넉히 뽑고
  // '프레임 줄이기' / '중복 프레임 제거' / 선택 삭제로 다듬는 흐름을 따른다.
  const [extractionInterval] = useState(3);
  const [similarityThreshold, setSimilarityThreshold] = useState(0); // 0-100%
  const [reduceTarget, setReduceTarget] = useState(12); // '프레임 줄이기' 목표 수
  const [loopSeam, setLoopSeam] = useState<LoopSeam | null>(null);
  const [quality, setQuality] = useState<ExtractionQuality | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [alignNotice, setAlignNotice] = useState(false); // 투명 배경이 없어 정렬 불가
  const [alignMode, setAlignMode] = useState<'stable' | 'feet'>('stable');
  const [loopNotice, setLoopNotice] = useState(false);

  // Chroma Key Settings
  const [chromaColor, setChromaColor] = useState<string | null>(null);
  const [chromaTolerance, setChromaTolerance] = useState(30);
  const [despillStrength, setDespillStrength] = useState(0); // 0 = 끔
  const [isPickingColor, setIsPickingColor] = useState(false);

  // Dedup
  const [dedupThreshold, setDedupThreshold] = useState(5);
  const [isDeduping, setIsDeduping] = useState(false);
  const [dedupResult, setDedupResult] = useState<{ removed: number; remaining: number } | 'error' | null>(null);

  // Preview & Export
  const [fps, setFps] = useState(12);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentPreviewFrameIndex, setCurrentPreviewFrameIndex] = useState(0);
  const [exportColumns, setExportColumns] = useState(0); // 0 = auto
  const [gridSize, setGridSize] = useState(100); // frame thumbnail size in px
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [exportSizeMode, setExportSizeMode] = useState<'scale' | 'fixed'>('scale');
  const [exportScale, setExportScale] = useState(100);
  const [exportFixedW, setExportFixedW] = useState(64);
  const [exportFixedH, setExportFixedH] = useState(64);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [anchorAlign, setAnchorAlign] = useState(false); // 발 baseline 정렬 시트
  const lockedRatioRef = useRef(1); // W / H

  // Drag & Drop
  const [frameOrder, setFrameOrder] = useState<number[]>([]);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const draggedIdRef = useRef<number | null>(null);

  // Toolbar Tabs
  const [activeTab, setActiveTab] = useState<'default' | 'bgRemove' | 'animation' | 'adjust'>('default');

  // Background Removal
  const [bgMode, setBgMode] = useState<'chroma' | 'flood'>('chroma');
  const [bgChromaColor, setBgChromaColor] = useState<string>('#00ff00');
  const [bgChromaTolerance, setBgChromaTolerance] = useState(30);
  const [isBgPickingColor, setIsBgPickingColor] = useState(false);
  const [bgRemoveTolerance, setBgRemoveTolerance] = useState(20);

  // Image Adjustment
  const [adjustBrightness, setAdjustBrightness] = useState(100);
  const [adjustContrast, setAdjustContrast] = useState(100);
  const [adjustSaturation, setAdjustSaturation] = useState(100);
  const [adjustHue, setAdjustHue] = useState(0);
  const [adjustBlur, setAdjustBlur] = useState(0);
  const [adjustSharpen, setAdjustSharpen] = useState(0);
  const [adjustInvert, setAdjustInvert] = useState(false);
  const [adjustGrayscale, setAdjustGrayscale] = useState(false);

  // Animation - Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Onion Skin
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(40);

  // Sprite Sheet Split
  const [splitMode, setSplitMode] = useState(false);
  const [splitImageUrl, setSplitImageUrl] = useState<string | null>(null);
  const [splitCols, setSplitCols] = useState(4);
  const [splitRows, setSplitRows] = useState(4);

  // Delete & Reset
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  // Frame Edit Modal
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [editBrightness, setEditBrightness] = useState(100);
  const [editContrast, setEditContrast] = useState(100);
  const [editSaturation, setEditSaturation] = useState(100);
  const [editHue, setEditHue] = useState(0);
  const [editBlur, setEditBlur] = useState(0);
  const [editSharpen, setEditSharpen] = useState(0);
  const [editInvert, setEditInvert] = useState(false);
  const [editGrayscale, setEditGrayscale] = useState(false);
  const [editBgTolerance, setEditBgTolerance] = useState(20);
  const [editBgApplied, setEditBgApplied] = useState(false);
  const editBackupRef = useRef<{ url: string; blob: Blob } | null>(null);
  const editCanvasRef = useRef<HTMLCanvasElement>(null);

  // File Drag & Drop
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const fileDragCounterRef = useRef(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const isDraggingRef = useRef(false);

  // --- Helper: Get export frame dimensions ---
  const getExportSize = useCallback((origW: number, origH: number) => {
    if (exportSizeMode === 'fixed') {
      return { w: exportFixedW, h: exportFixedH };
    }
    return {
      w: Math.round(origW * exportScale / 100),
      h: Math.round(origH * exportScale / 100),
    };
  }, [exportSizeMode, exportScale, exportFixedW, exportFixedH]);

  // --- Helper: Load Image ---
  const loadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  // --- Sidebar Resize ---
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startX - ev.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 260), 700);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // Set export fixed size from original frame dimensions on first load
  const prevFrameCountRef = useRef(0);
  useEffect(() => {
    if (prevFrameCountRef.current === 0 && frames.length > 0) {
      loadImage(frames[0].url).then(img => {
        setExportFixedW(img.width);
        setExportFixedH(img.height);
        lockedRatioRef.current = img.width / img.height;
      });
    }
    prevFrameCountRef.current = frames.length;
  }, [frames, loadImage]);

  // Sync frameOrder when frames change
  useEffect(() => {
    setFrameOrder(prev => {
      const existingIds = new Set(frames.map(f => f.id));
      const kept = prev.filter(id => existingIds.has(id));
      const keptSet = new Set(kept);
      const newIds = frames.map(f => f.id).filter(id => !keptSet.has(id));
      return [...kept, ...newIds];
    });
  }, [frames]);

  // Derived state (memoized, respects frameOrder)
  const activeFrames = useMemo(() => {
    const order = frameOrder.length > 0 ? frameOrder : frames.map(f => f.id);
    const selectedOrder = order.filter(id => selectedFrameIds.has(id));
    const ids = selectedOrder.length > 0 ? selectedOrder : order;
    return ids
      .map(id => frames.find(f => f.id === id))
      .filter((f): f is Frame => f !== undefined);
  }, [frames, selectedFrameIds, frameOrder]);

  // Cleanup blob URLs on unmount only
  const framesRef = useRef<Frame[]>([]);
  framesRef.current = frames;
  useEffect(() => {
    return () => {
      framesRef.current.forEach(f => URL.revokeObjectURL(f.url));
      historyRef.current.forEach(sn => sn.frames.forEach(f => URL.revokeObjectURL(f.url)));
      historyRef.current = [];
    };
  }, []);

  // Clamp preview index when activeFrames changes
  useEffect(() => {
    if (activeFrames.length > 0) {
      setCurrentPreviewFrameIndex(prev =>
        prev >= activeFrames.length ? 0 : prev
      );
    }
  }, [activeFrames.length]);

  // Keyboard arrow navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeFrames.length === 0) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentPreviewFrameIndex(prev =>
          (prev - 1 + activeFrames.length) % activeFrames.length
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentPreviewFrameIndex(prev =>
          (prev + 1) % activeFrames.length
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFrames.length]);

  // --- Animation Loop ---
  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  useEffect(() => {
    if (!isPlaying || activeFrames.length === 0) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    let lastTime = performance.now();

    const animate = (time: number) => {
      const interval = 1000 / fpsRef.current;
      if (time - lastTime >= interval) {
        setCurrentPreviewFrameIndex(prev => (prev + 1) % activeFrames.length);
        lastTime = time;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, activeFrames]);

  // --- Image Adjustment Filter String ---
  const adjustFilterStr = useMemo(() => {
    const parts: string[] = [];
    if (adjustBrightness !== 100) parts.push(`brightness(${adjustBrightness}%)`);
    if (adjustContrast !== 100) parts.push(`contrast(${adjustContrast}%)`);
    if (adjustSaturation !== 100) parts.push(`saturate(${adjustSaturation}%)`);
    if (adjustHue !== 0) parts.push(`hue-rotate(${adjustHue}deg)`);
    if (adjustBlur > 0) parts.push(`blur(${adjustBlur}px)`);
    if (adjustInvert) parts.push(`invert(100%)`);
    if (adjustGrayscale) parts.push(`grayscale(100%)`);
    return parts.length > 0 ? parts.join(' ') : '';
  }, [adjustBrightness, adjustContrast, adjustSaturation, adjustHue, adjustBlur, adjustInvert, adjustGrayscale]);

  // --- Frame Edit Filter String ---
  const editFilterStr = useMemo(() => {
    const parts: string[] = [];
    if (editBrightness !== 100) parts.push(`brightness(${editBrightness}%)`);
    if (editContrast !== 100) parts.push(`contrast(${editContrast}%)`);
    if (editSaturation !== 100) parts.push(`saturate(${editSaturation}%)`);
    if (editHue !== 0) parts.push(`hue-rotate(${editHue}deg)`);
    if (editBlur > 0) parts.push(`blur(${editBlur}px)`);
    if (editInvert) parts.push(`invert(100%)`);
    if (editGrayscale) parts.push(`grayscale(100%)`);
    return parts.length > 0 ? parts.join(' ') : '';
  }, [editBrightness, editContrast, editSaturation, editHue, editBlur, editInvert, editGrayscale]);

  // --- Draw Preview (with Onion Skin) ---
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || activeFrames.length === 0) return;

    const frame = activeFrames[currentPreviewFrameIndex];
    if (!frame) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const drawFrame = async () => {
      const img = await loadImage(frame.url);
      const { w, h } = getExportSize(img.width, img.height);
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);

      // Helper: render a frame image onto a temp canvas with chroma key
      const processFrame = (sourceImg: HTMLImageElement) => {
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const tmpCtx = tmp.getContext('2d', { willReadFrequently: true })!;
        tmpCtx.drawImage(sourceImg, 0, 0, w, h);
        if (chromaColor) {
          applyChromaKey(tmpCtx, w, h);
        }
        return tmp;
      };

      // Onion skin: draw previous frame with reduced opacity (chroma key applied)
      if (onionSkinEnabled && currentPreviewFrameIndex > 0) {
        const prevFrame = activeFrames[currentPreviewFrameIndex - 1];
        if (prevFrame) {
          const prevImg = await loadImage(prevFrame.url);
          const prevProcessed = processFrame(prevImg);
          ctx.globalAlpha = onionSkinOpacity / 100;
          ctx.drawImage(prevProcessed, 0, 0);
          ctx.globalAlpha = 1.0;
        }
      }

      // Draw current frame (chroma key applied) with adjustment preview
      const currentProcessed = processFrame(img);
      if (adjustFilterStr) ctx.filter = adjustFilterStr;
      ctx.drawImage(currentProcessed, 0, 0);
      ctx.filter = 'none';

      if (adjustSharpen > 0) applySharpenKernel(ctx, w, h, adjustSharpen);
    };

    drawFrame();
  }, [currentPreviewFrameIndex, activeFrames, chromaColor, chromaTolerance, onionSkinEnabled, onionSkinOpacity, loadImage, getExportSize, adjustFilterStr, adjustSharpen]);


  // --- Helper: Apply Chroma Key ---
  const applyChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!chromaColor) return;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    // Convert hex chromaColor to RGB
    const rTarget = parseInt(chromaColor.slice(1, 3), 16);
    const gTarget = parseInt(chromaColor.slice(3, 5), 16);
    const bTarget = parseInt(chromaColor.slice(5, 7), 16);
    
    // Simple Euclidean distance or Manhattan distance
    // Using simple Manhattan for speed: |r1-r2| + |g1-g2| + |b1-b2|
    // Max diff is 255*3 = 765. Tolerance is 0-100 mapped to this.
    const maxDist = 765; 
    const threshold = (chromaTolerance / 100) * maxDist;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Calculate distance
      const dist = Math.abs(r - rTarget) + Math.abs(g - gTarget) + Math.abs(b - bTarget);

      if (dist < threshold) {
        data[i + 3] = 0; // Set Alpha to 0
      }
    }

    // 배경을 지워도 경계에 키 색이 남는다(spill). 키 채널을 나머지 채널 기준으로 클램프해 걷어낸다.
    despill(data, [rTarget, gTarget, bTarget], despillStrength);

    ctx.putImageData(imgData, 0, 0);
  };

  // --- Remove Duplicates (post-extraction) ---
  const removeDuplicates = async () => {
    if (frames.length < 2) return;
    setIsDeduping(true);
    setDedupResult(null);
    pushHistory();

    const size = 64;
    const compareCanvas = document.createElement('canvas');
    compareCanvas.width = size;
    compareCanvas.height = size;
    const compareCtx = compareCanvas.getContext('2d', { willReadFrequently: true });
    if (!compareCtx) { setIsDeduping(false); return; }

    const getPixelData = (url: string): Promise<Uint8ClampedArray> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          compareCtx.clearRect(0, 0, size, size);
          compareCtx.drawImage(img, 0, 0, size, size);
          resolve(new Uint8ClampedArray(compareCtx.getImageData(0, 0, size, size).data));
        };
        img.onerror = reject;
        img.src = url;
      });
    };

    try {
      const kept: Frame[] = [frames[0]];
      let lastData = await getPixelData(frames[0].url);
      const thresholdVal = dedupThreshold * 1.5;

      for (let i = 1; i < frames.length; i++) {
        const currentData = await getPixelData(frames[i].url);

        let diff = 0;
        for (let j = 0; j < currentData.length; j += 4) {
          diff += Math.abs(currentData[j] - lastData[j]) +
                  Math.abs(currentData[j + 1] - lastData[j + 1]) +
                  Math.abs(currentData[j + 2] - lastData[j + 2]);
        }

        const avgDiff = diff / (size * size);

        if (avgDiff >= thresholdVal) {
          kept.push(frames[i]);
          lastData = currentData;
        }
      }

      const removed = frames.length - kept.length;
      setFrames(kept);
      setSelectedFrameIds(new Set(kept.map(f => f.id)));
      setDedupResult({ removed, remaining: kept.length });
    } catch {
      setDedupResult('error');
    }

    setIsDeduping(false);
  };

  // --- File Drag & Drop ---
  const handleFileDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileDragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsFileDragOver(true);
    }
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileDragCounterRef.current--;
    if (fileDragCounterRef.current === 0) {
      setIsFileDragOver(false);
    }
  };

  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileDragOver(false);
    fileDragCounterRef.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // 일부 환경에선 드롭된 파일의 type이 비어 있어 확장자도 함께 본다
    const isVideo = file.type.startsWith('video/');
    const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    const isImage = file.type.startsWith('image/') && !isGif;

    if (isVideo || isGif) {
      loadMediaFile(file);
    } else if (isImage) {
      setLoadError(false);
      const url = URL.createObjectURL(file);
      setSplitImageUrl(url);
      setSplitMode(true);
    }
  };

  // --- 되돌리기 스택 ---
  // 프레임 목록/픽셀을 바꾸는 모든 작업(삭제·중복 제거·트림·배경 제거·보정·정렬 등)이
  // 실행 직전에 스냅샷을 쌓는다. 스냅샷은 blob URL을 공유하며, URL 해제는
  // 어떤 스냅샷과 현재 프레임 어디에도 남지 않게 됐을 때만 한다.
  type FrameSnapshot = { frames: Frame[]; frameOrder: number[]; selected: Set<number> };
  const historyRef = useRef<FrameSnapshot[]>([]);
  const [historyDepth, setHistoryDepth] = useState(0);
  const HISTORY_MAX = 30;

  const revokeOrphans = (candidates: Frame[], keep: Frame[][]) => {
    const live = new Set<string>();
    keep.forEach(list => list.forEach(f => live.add(f.url)));
    candidates.forEach(f => {
      if (!live.has(f.url)) URL.revokeObjectURL(f.url);
    });
  };

  /** 프레임을 바꾸는 작업 직전에 호출한다 */
  const pushHistory = () => {
    const stack = historyRef.current;
    stack.push({ frames, frameOrder, selected: new Set(selectedFrameIds) });
    if (stack.length > HISTORY_MAX) {
      const dropped = stack.shift();
      if (dropped) revokeOrphans(dropped.frames, [frames, ...stack.map(sn => sn.frames)]);
    }
    setHistoryDepth(stack.length);
  };

  const undoHistory = () => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    revokeOrphans(frames, [snap.frames, ...historyRef.current.map(sn => sn.frames)]);
    setFrames(snap.frames);
    setFrameOrder(snap.frameOrder);
    setSelectedFrameIds(new Set(snap.selected));
    setHistoryDepth(historyRef.current.length);
    setDedupResult(null);
    setQuality(null);
  };

  const clearHistory = (current: Frame[]) => {
    const all = historyRef.current.flatMap(sn => sn.frames);
    revokeOrphans(all, [current]);
    historyRef.current = [];
    setHistoryDepth(0);
  };

  // Ctrl+Z / Cmd+Z (입력 요소에 포커스가 있으면 브라우저 기본 동작에 맡긴다)
  const undoRef = useRef<() => void>(() => {});
  undoRef.current = undoHistory;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- File Handling ---
  // 새 파일을 읽기 전 프레임과 되돌리기 스택을 모두 비운다.
  const clearFrameState = () => {
    // 되돌리기 스택까지 모두 비운다 (새 파일)
    clearHistory([]);
    frames.forEach(f => URL.revokeObjectURL(f.url));
    setFrames([]);
    setSelectedFrameIds(new Set());
    setFrameOrder([]);
    setDedupResult(null);
    setCurrentPreviewFrameIndex(0);
    setAlignNotice(false);
    setLoopNotice(false);
    setQuality(null);
    setLoopSeam(null);
  };

  // <video>는 GIF를 재생하지 못하므로(loadedmetadata가 발생하지 않음) 별도 디코더로 처리한다.
  const extractGifFrames = async (file: File) => {
    setIsLoading(true);
    setProgress(0);

    try {
      const buffer = await file.arrayBuffer();
      const gif = parseGIF(buffer);

      // decompressFrames는 전 프레임의 비압축 RGBA를 한꺼번에 메모리에 올린다
      // (640x480 200프레임에서 약 470MB). 프레임 단위로 디코딩해 피크를 낮춘다.
      const rawFrames = gif.frames.filter((f): f is RawGifFrame => 'image' in f);

      // GIF가 아니거나 손상된 파일이면 parseGIF가 던지거나 빈 배열이 나온다
      if (rawFrames.length === 0) {
        throw new Error('No frames in GIF');
      }

      // 이전 프레임과 파생 상태 정리
      clearFrameState();
      setLoopSeam(null);
      setQuality(null);

      // 논리 화면 크기 — 프레임 dims는 부분 갱신 영역이라 전체 크기와 다를 수 있다
      const width = gif.lsd.width || rawFrames[0].image.descriptor.width;
      const height = gif.lsd.height || rawFrames[0].image.descriptor.height;

      // 디스포절을 반영해 프레임을 누적 합성하는 캔버스
      const composite = document.createElement('canvas');
      composite.width = width;
      composite.height = height;
      const compositeCtx = composite.getContext('2d', { willReadFrequently: true });

      // 중복 비교용 축소 캔버스 (동영상 경로와 동일한 방식)
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = 64;
      smallCanvas.height = 64;
      const smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });

      const patchCanvas = document.createElement('canvas');
      const patchCtx = patchCanvas.getContext('2d');

      if (!compositeCtx || !smallCtx || !patchCtx) {
        throw new Error('Canvas 2D context unavailable');
      }

      // GIF은 이미 프레임 단위로 저작된 시퀀스라 전 프레임을 그대로 가져온다.
      // (프레임을 줄이려면 가져온 뒤 '프레임 줄이기' · '중복 프레임 제거' · 선택 삭제를 쓴다)
      const newFrames: Frame[] = [];
      let lastSmallData: Uint8ClampedArray | null = null;
      let elapsed = 0;
      // 디스포절 3(이전 상태로 복원)을 위해 그리기 직전 캔버스를 보관한다
      let prevState: ImageData | null = null;

      for (let i = 0; i < rawFrames.length; i++) {
        const { dims, patch, disposalType, delay } = decompressFrame(rawFrames[i], gif.gct, true);

        if (disposalType === 3) {
          prevState = compositeCtx.getImageData(0, 0, width, height);
        }

        patchCanvas.width = dims.width;
        patchCanvas.height = dims.height;
        const patchData = patchCtx.createImageData(dims.width, dims.height);
        patchData.data.set(patch);
        patchCtx.putImageData(patchData, 0, 0);
        compositeCtx.drawImage(patchCanvas, dims.left, dims.top);

        // 중복 제거 감도는 기본이 0(끔)이며, 켰을 때만 동영상과 같은 방식으로 걸러낸다
        let isDuplicate = false;
        smallCtx.clearRect(0, 0, 64, 64);
        smallCtx.drawImage(composite, 0, 0, 64, 64);
        const currentSmallData = smallCtx.getImageData(0, 0, 64, 64).data;

        if (similarityThreshold > 0 && lastSmallData) {
          let diff = 0;
          for (let p = 0; p < currentSmallData.length; p += 4) {
            diff += Math.abs(currentSmallData[p] - lastSmallData[p]) +
                    Math.abs(currentSmallData[p + 1] - lastSmallData[p + 1]) +
                    Math.abs(currentSmallData[p + 2] - lastSmallData[p + 2]);
          }
          const avgDiff = diff / (64 * 64);
          const thresholdVal = (100 - similarityThreshold) / 100 * 50;
          if (avgDiff < thresholdVal) {
            isDuplicate = true;
          }
        }

        if (!isDuplicate) {
          lastSmallData = currentSmallData;
          const blob = await new Promise<Blob | null>(resolve => composite.toBlob(resolve, 'image/png'));
          if (blob) {
            newFrames.push({
              id: i,
              blob,
              url: URL.createObjectURL(blob),
              timestamp: elapsed / 1000,
            });
          }
        }

        if (disposalType === 2) {
          // 2 = 다음 프레임 전에 해당 영역을 배경(투명)으로 되돌린다
          compositeCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
        } else if (disposalType === 3 && prevState) {
          // 3 = 이 프레임을 그리기 직전 상태로 되돌린다 (없으면 잔상이 남는다)
          compositeCtx.putImageData(prevState, 0, 0);
          prevState = null;
        }

        elapsed += delay || 100;
        setProgress(((i + 1) / rawFrames.length) * 100);
      }

      setFrames(newFrames);
      setSelectedFrameIds(new Set(newFrames.map(f => f.id)));
      setExportColumns(Math.ceil(Math.sqrt(Math.max(1, newFrames.length))));
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const loadMediaFile = (file: File) => {
    setLoadError(false);

    if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) {
      void extractGifFrames(file);
      return;
    }

    if (videoRef.current) {
      videoRef.current.src = URL.createObjectURL(file);
      setIsLoading(true);
      setProgress(0);
      // Wait for metadata to load before starting extraction
    }
  };

  // 동영상 로드 실패 시 로딩 오버레이가 영원히 걸리는 것을 막는다
  const handleVideoError = () => {
    setIsLoading(false);
    setProgress(0);
    setLoadError(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 골라도 onChange가 발생하도록 값을 비운다
    e.target.value = '';
    if (!file) return;
    loadMediaFile(file);
  };

  const startExtraction = async () => {
    const video = videoRef.current;
    if (!video) return;

    // 이전 프레임과 파생 상태(배경제거/보정 백업 포함) 정리
    clearFrameState();
    setLoopSeam(null);
    setQuality(null);

    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Rough estimate of FPS if not available (default to 30)
    const estimatedFps = 30; 
    const totalFrames = Math.floor(duration * estimatedFps);
    const step = extractionInterval / estimatedFps; 
    
    const newFrames: Frame[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) return;

    // Small canvas for comparison (performance)
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = 64;
    smallCanvas.height = 64;
    const smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });
    let lastSmallData: Uint8ClampedArray | null = null;

    let currentTime = 0;
    let frameCount = 0;

    const processFrame = async () => {
      if (currentTime >= duration) {
        setFrames(newFrames);
        // Select all by default
        const allIds = new Set(newFrames.map(f => f.id));
        setSelectedFrameIds(allIds);
        setExportColumns(Math.ceil(Math.sqrt(newFrames.length)));
        setIsLoading(false);
        return;
      }

      video.currentTime = currentTime;
      
      // Wait for seek
      await new Promise<void>(resolve => {
        const onSeek = () => {
          video.removeEventListener('seeked', onSeek);
          resolve();
        };
        video.addEventListener('seeked', onSeek);
      });

      // Draw
      ctx.drawImage(video, 0, 0, width, height);

      let isDuplicate = false;

      // Duplicate detection
      if (similarityThreshold > 0 && lastSmallData && smallCtx) {
        smallCtx.drawImage(video, 0, 0, 64, 64);
        const currentSmallData = smallCtx.getImageData(0, 0, 64, 64).data;
        
        let diff = 0;
        for (let i = 0; i < currentSmallData.length; i += 4) {
          diff += Math.abs(currentSmallData[i] - lastSmallData[i]) +
                  Math.abs(currentSmallData[i+1] - lastSmallData[i+1]) +
                  Math.abs(currentSmallData[i+2] - lastSmallData[i+2]);
        }
        
        // Normalize diff (max difference per pixel is 255*3 = 765)
        const totalPixels = 64 * 64;
        const avgDiff = diff / totalPixels;
        // Threshold is percentage of max diff (765)
        const thresholdVal = (100 - similarityThreshold) / 100 * 50; // Arbitrary scale factor for sensitivity
        
        if (avgDiff < thresholdVal) {
          isDuplicate = true;
        } else {
          lastSmallData = currentSmallData;
        }
      } else if (smallCtx) {
        // Just store for next time
        smallCtx.drawImage(video, 0, 0, 64, 64);
        lastSmallData = smallCtx.getImageData(0, 0, 64, 64).data;
      }

      if (!isDuplicate) {
        // Save frame
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          newFrames.push({
            id: frameCount,
            blob,
            url: URL.createObjectURL(blob),
            timestamp: currentTime
          });
        }
      }

      frameCount++;
      currentTime += step;
      setProgress((currentTime / duration) * 100);
      
      // Next frame
      requestAnimationFrame(processFrame);
    };

    processFrame();
  };

  // --- Background Removal (Flood Fill from corners) ---
  const applyBgRemoval = async () => {
    const targetFrames = selectedFrameIds.size > 0
      ? frames.filter(f => selectedFrameIds.has(f.id))
      : frames;
    if (targetFrames.length === 0) return;

    setIsLoading(true);
    setProgress(0);

    pushHistory();

    const tolerance = bgRemoveTolerance;
    const newFrames = [...frames];

    for (let fi = 0; fi < targetFrames.length; fi++) {
      const frame = targetFrames[fi];
      const img = await loadImage(frame.url);
      const w = img.width;
      const h = img.height;

      const cvs = document.createElement('canvas');
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const visited = new Uint8Array(w * h);

      // BFS flood fill from a seed pixel
      const floodFill = (sx: number, sy: number) => {
        const seedIdx = (sy * w + sx) * 4;
        const sr = data[seedIdx], sg = data[seedIdx + 1], sb = data[seedIdx + 2];
        const queue: number[] = [sx, sy];
        const maxDist = tolerance * 765 / 100;

        while (queue.length > 0) {
          const cy = queue.pop()!;
          const cx = queue.pop()!;
          const pi = cy * w + cx;
          if (visited[pi]) continue;
          visited[pi] = 1;

          const i = pi * 4;
          const dist = Math.abs(data[i] - sr) + Math.abs(data[i + 1] - sg) + Math.abs(data[i + 2] - sb);
          if (dist > maxDist) continue;

          data[i + 3] = 0; // transparent

          if (cx > 0) queue.push(cx - 1, cy);
          if (cx < w - 1) queue.push(cx + 1, cy);
          if (cy > 0) queue.push(cx, cy - 1);
          if (cy < h - 1) queue.push(cx, cy + 1);
        }
      };

      // Fill from 4 corners
      floodFill(0, 0);
      floodFill(w - 1, 0);
      floodFill(0, h - 1);
      floodFill(w - 1, h - 1);

      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise<Blob | null>(resolve => cvs.toBlob(resolve, 'image/png'));
      if (blob) {
        const newUrl = URL.createObjectURL(blob);
        const idx = newFrames.findIndex(f => f.id === frame.id);
        if (idx !== -1) {
          newFrames[idx] = { ...newFrames[idx], blob, url: newUrl };
        }
      }
      setProgress(Math.round(((fi + 1) / targetFrames.length) * 100));
    }

    setFrames(newFrames);
    setIsLoading(false);
    setProgress(0);
  };

  const applyChromaKeyRemoval = async () => {
    const targetFrames = selectedFrameIds.size > 0
      ? frames.filter(f => selectedFrameIds.has(f.id))
      : frames;
    if (targetFrames.length === 0) return;

    setIsLoading(true);
    setProgress(0);

    pushHistory();

    const rTarget = parseInt(bgChromaColor.slice(1, 3), 16);
    const gTarget = parseInt(bgChromaColor.slice(3, 5), 16);
    const bTarget = parseInt(bgChromaColor.slice(5, 7), 16);
    const maxDist = 765;
    const threshold = (bgChromaTolerance / 100) * maxDist;

    const newFrames = [...frames];
    for (let fi = 0; fi < targetFrames.length; fi++) {
      const frame = targetFrames[fi];
      const img = await loadImage(frame.url);
      const w = img.width;
      const h = img.height;

      const cvs = document.createElement('canvas');
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const dist = Math.abs(data[i] - rTarget) + Math.abs(data[i + 1] - gTarget) + Math.abs(data[i + 2] - bTarget);
        if (dist < threshold) data[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise<Blob | null>(resolve => cvs.toBlob(resolve, 'image/png'));
      if (blob) {
        const newUrl = URL.createObjectURL(blob);
        const idx = newFrames.findIndex(f => f.id === frame.id);
        if (idx !== -1) {
          newFrames[idx] = { ...newFrames[idx], blob, url: newUrl };
        }
      }
      setProgress(Math.round(((fi + 1) / targetFrames.length) * 100));
    }

    setFrames(newFrames);
    setIsLoading(false);
    setProgress(0);
  };

  // --- Image Adjustment ---
  const applyAdjustment = async () => {
    const targetFrames = selectedFrameIds.size > 0
      ? frames.filter(f => selectedFrameIds.has(f.id))
      : frames;
    if (targetFrames.length === 0) return;
    if (adjustFilterStr === '' && adjustSharpen === 0) return;

    setIsLoading(true);
    setProgress(0);

    pushHistory();

    const newFrames = [...frames];
    for (let fi = 0; fi < targetFrames.length; fi++) {
      const frame = targetFrames[fi];
      const img = await loadImage(frame.url);
      const w = img.width;
      const h = img.height;

      const cvs = document.createElement('canvas');
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext('2d', { willReadFrequently: true })!;

      if (adjustFilterStr) ctx.filter = adjustFilterStr;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';

      if (adjustSharpen > 0) applySharpenKernel(ctx, w, h, adjustSharpen);

      const blob = await new Promise<Blob | null>(resolve => cvs.toBlob(resolve, 'image/png'));
      if (blob) {
        const newUrl = URL.createObjectURL(blob);
        const idx = newFrames.findIndex(f => f.id === frame.id);
        if (idx !== -1) {
          newFrames[idx] = { ...newFrames[idx], blob, url: newUrl };
        }
      }
      setProgress(Math.round(((fi + 1) / targetFrames.length) * 100));
    }

    setFrames(newFrames);
    resetAdjustSliders();
    setIsLoading(false);
    setProgress(0);
  };


  const resetAdjustSliders = () => {
    setAdjustBrightness(100);
    setAdjustContrast(100);
    setAdjustSaturation(100);
    setAdjustHue(0);
    setAdjustBlur(0);
    setAdjustSharpen(0);
    setAdjustInvert(false);
    setAdjustGrayscale(false);
  };

  // --- Animation Editing ---
  const handleReverse = () => {
    pushHistory();
    setFrameOrder(prev => [...prev].reverse());
  };

  const handlePingPong = async () => {
    if (frames.length < 2) return;
    setIsLoading(true);
    setProgress(0);

    const order = frameOrder.length > 0 ? frameOrder : frames.map(f => f.id);
    // Reverse without first and last to avoid duplicates at boundaries
    const reverseIds = [...order].reverse().slice(1, -1);
    const maxId = Math.max(...frames.map(f => f.id));
    const newFrames: Frame[] = [];

    for (let i = 0; i < reverseIds.length; i++) {
      const srcFrame = frames.find(f => f.id === reverseIds[i]);
      if (!srcFrame) continue;

      // Clone the blob
      const blob = new Blob([srcFrame.blob], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      newFrames.push({
        id: maxId + 1 + i,
        blob,
        url,
        timestamp: srcFrame.timestamp,
      });
      setProgress(Math.round(((i + 1) / reverseIds.length) * 100));
    }

    pushHistory();
    setFrames(prev => [...prev, ...newFrames]);
    setFrameOrder([...order, ...newFrames.map(f => f.id)]);
    setIsLoading(false);
    setProgress(0);
  };

  const handleDuplicateFrames = async () => {
    const selected = frames.filter(f => selectedFrameIds.has(f.id));
    if (selected.length === 0) return;

    const maxId = Math.max(...frames.map(f => f.id));
    const newFrames: Frame[] = [];

    for (let i = 0; i < selected.length; i++) {
      const src = selected[i];
      const blob = new Blob([src.blob], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      newFrames.push({
        id: maxId + 1 + i,
        blob,
        url,
        timestamp: src.timestamp,
      });
    }

    pushHistory();
    setFrames(prev => [...prev, ...newFrames]);
    setSelectedFrameIds(prev => {
      const s = new Set(prev);
      newFrames.forEach(f => s.add(f.id));
      return s;
    });
  };

  const handleTrim = () => {
    if (frames.length === 0) return;
    const order = frameOrder.length > 0 ? frameOrder : frames.map(f => f.id);
    const start = Math.min(trimStart, order.length - 1);
    const end = Math.min(trimEnd, order.length - 1 - start);
    if (start + end >= order.length) return;

    const keepIds = new Set(order.slice(start, order.length - end));
    pushHistory();
    setFrames(prev => prev.filter(f => keepIds.has(f.id)));
    setSelectedFrameIds(prev => {
      const s = new Set<number>();
      prev.forEach(id => { if (keepIds.has(id)) s.add(id); });
      return s;
    });
    setTrimStart(0);
    setTrimEnd(0);
  };

  // --- Drag & Drop ---
  const handleDrop = (targetId: number) => {
    const draggedId = draggedIdRef.current;
    if (draggedId === null || draggedId === targetId) return;
    const newOrder = [...frameOrder];
    const fromIdx = newOrder.indexOf(draggedId);
    const toIdx = newOrder.indexOf(targetId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedId);
    setFrameOrder(newOrder);
  };

  // --- Delete Frame ---
  const handleDeleteFrame = (id: number) => {
    pushHistory();
    setFrames(prev => prev.filter(f => f.id !== id));
    setSelectedFrameIds(prev => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    setDeleteTargetId(null);
  };

  // --- 추출 품질 분석 ---
  // 발 위치·중심이 얼마나 흔들리는지, 루프가 얼마나 매끄럽게 이어지는지를 숫자로 낸다.
  // 위치 지표는 알파가 있어야 의미가 있으므로 배경 제거 후에 보는 것이 정확하다.
  const analyzeQuality = async () => {
    if (activeFrames.length === 0) return;
    setIsAnalyzing(true);
    try {
      const full = document.createElement('canvas');
      const fullCtx = full.getContext('2d', { willReadFrequently: true });
      const small = document.createElement('canvas');
      small.width = 64;
      small.height = 64;
      const smallCtx = small.getContext('2d', { willReadFrequently: true });
      if (!fullCtx || !smallCtx) return;

      const metricsList: FrameMetrics[] = [];
      const smalls: Uint8ClampedArray[] = [];

      for (const f of activeFrames) {
        const img = await loadImage(f.url);
        full.width = img.width;
        full.height = img.height;
        fullCtx.clearRect(0, 0, img.width, img.height);
        fullCtx.drawImage(img, 0, 0);
        if (chromaColor) applyChromaKey(fullCtx, img.width, img.height);

        const m = frameMetrics(fullCtx.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
        if (m) metricsList.push(m);

        smallCtx.clearRect(0, 0, 64, 64);
        smallCtx.drawImage(img, 0, 0, 64, 64);
        smalls.push(smallCtx.getImageData(0, 0, 64, 64).data);
      }

      const loopDiff = loopSeam
        ? loopSeam.diff
        : smalls.length > 1
          ? frameDiff(smalls[0], smalls[smalls.length - 1])
          : 0;

      setQuality(extractionQuality(metricsList, loopDiff));
    } catch {
      setQuality(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- 정렬 계획 ---
  // 프레임을 캔버스에 올려(크로마키 반영) 정렬 계획을 세운다. 알파가 전혀 없으면 null.
  const buildAlignmentPlan = async (list: Frame[]) => {
    const images: (HTMLCanvasElement | null)[] = [];
    const inputs: { data: Uint8ClampedArray; w: number; h: number }[] = [];
    let anyAlpha = false;
    for (let i = 0; i < list.length; i++) {
      const img = await loadImage(list[i].url);
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) {
        images.push(null);
        inputs.push({ data: new Uint8ClampedArray(4), w: 1, h: 1 });
        continue;
      }
      cx.drawImage(img, 0, 0);
      if (chromaColor) applyChromaKey(cx, img.width, img.height);
      const data = cx.getImageData(0, 0, img.width, img.height).data;
      if (!anyAlpha) {
        for (let q = 3; q < data.length; q += 4) {
          if (data[q] === 0) { anyAlpha = true; break; }
        }
      }
      images.push(c);
      inputs.push({ data, w: img.width, h: img.height });
      setProgress(((i + 1) / list.length) * 40);
    }
    if (!anyAlpha) return null;
    const order = frameOrder.length > 0 ? frameOrder : list.map(f => f.id);
    const refIndex = Math.max(0, list.findIndex(f => f.id === order[0]));
    const plan = planAlignment(inputs, { mode: alignMode, refIndex, pad: 4, onProgress: pr => setProgress(40 + pr * 20) });
    return plan ? { images, plan } : null;
  };

  // --- 발 정렬 적용 ---
  // 품질 분석이 보여주는 '발 흔들림'과 '중심 이동'을 실제로 잡는 조치.
  // 움직이지 않는 부위(또는 발 바닥)를 기준으로 전 프레임을 균일한 셀에 다시 그린다.
  const applyAnchorAlignment = async () => {
    if (frames.length === 0) return;
    setIsAligning(true);
    setProgress(0);

    try {
      const built = await buildAlignmentPlan(frames);
      if (!built) {
        setAlignNotice(true);
        return;
      }
      const { images, plan } = built;

      const out = document.createElement('canvas');
      out.width = plan.cellW;
      out.height = plan.cellH;
      const outCtx = out.getContext('2d', { willReadFrequently: true });
      if (!outCtx) return;

      pushHistory();
      const metricsList: FrameMetrics[] = [];
      const replaced = new Map<number, { url: string; blob: Blob }>();
      for (let i = 0; i < frames.length; i++) {
        const src = images[i];
        if (!src) continue;
        outCtx.clearRect(0, 0, plan.cellW, plan.cellH);
        outCtx.drawImage(src, plan.originX + plan.shifts[i][0], plan.originY + plan.shifts[i][1]);
        const m = frameMetrics(outCtx.getImageData(0, 0, plan.cellW, plan.cellH).data, plan.cellW, plan.cellH);
        if (m) metricsList.push(m);
        const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
        if (blob) replaced.set(frames[i].id, { url: URL.createObjectURL(blob), blob });
        setProgress(60 + ((i + 1) / frames.length) * 40);
      }

      setFrames(prev => prev.map(f => {
        const r = replaced.get(f.id);
        return r ? { ...f, url: r.url, blob: r.blob } : f;
      }));
      setAlignNotice(false);
      // 정렬 결과를 바로 지표로 보여준다 (루프 일치도는 위치와 무관하므로 유지)
      setQuality(extractionQuality(metricsList, quality?.loopDiff ?? 0));
    } catch {
      setLoadError(true);
    } finally {
      setIsAligning(false);
      setProgress(0);
    }
  };

  // --- 프레임 줄이기 / 루프 구간 ---
  const orderedFrames = (): Frame[] => {
    const order = frameOrder.length > 0 ? frameOrder : frames.map(f => f.id);
    return order.map(id => frames.find(f => f.id === id)).filter((f): f is Frame => !!f);
  };

  const loadSmalls = async (list: Frame[]): Promise<Uint8ClampedArray[]> => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) return [];
    const out: Uint8ClampedArray[] = [];
    for (const f of list) {
      const img = await loadImage(f.url);
      cx.clearRect(0, 0, 64, 64);
      cx.drawImage(img, 0, 0, 64, 64);
      out.push(cx.getImageData(0, 0, 64, 64).data);
    }
    return out;
  };

  // 누적 모션량을 등분해 목표 수만 남긴다 — 정지 구간은 덜, 동작 구간은 더
  const reduceFramesByMotion = async () => {
    const list = orderedFrames();
    if (list.length <= reduceTarget) return;
    setIsLoading(true);
    setProgress(0);
    try {
      const smalls = await loadSmalls(list);
      const picks = new Set(pickByMotionArcLength(motionEnergy(smalls), reduceTarget).slice(0, reduceTarget));
      const keepIds = new Set(list.filter((_, i) => picks.has(i)).map(f => f.id));
      pushHistory();
      setFrames(prev => prev.filter(f => keepIds.has(f.id)));
      setSelectedFrameIds(prev => {
        const kept = new Set<number>();
        prev.forEach(id => { if (keepIds.has(id)) kept.add(id); });
        return kept;
      });
      setDedupResult(null);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  // 가장 닮은 두 프레임 사이(매끄러운 사이클)만 남긴다
  const keepLoopRange = async () => {
    const list = orderedFrames();
    setIsLoading(true);
    setProgress(0);
    try {
      const smalls = await loadSmalls(list);
      const { seam } = findLoopSeam(smalls, 1);
      if (!seam) {
        setLoopNotice(true);
        return;
      }
      const keepIds = new Set(list.slice(seam.i, seam.j).map(f => f.id));
      pushHistory();
      setFrames(prev => prev.filter(f => keepIds.has(f.id)));
      setSelectedFrameIds(prev => {
        const kept = new Set<number>();
        prev.forEach(id => { if (keepIds.has(id)) kept.add(id); });
        return kept;
      });
      setLoopSeam(seam);
      setLoopNotice(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  // --- Bulk Selection / Delete ---  // --- Bulk Selection / Delete ---
  const selectAllFrames = () => setSelectedFrameIds(new Set(frames.map(f => f.id)));
  const clearFrameSelection = () => setSelectedFrameIds(new Set());

  // 선택된 프레임을 지운다
  const deleteSelectedFrames = () => {
    if (selectedFrameIds.size === 0) return;
    pushHistory();
    setFrames(prev => prev.filter(f => !selectedFrameIds.has(f.id)));
    setSelectedFrameIds(new Set());
  };

  // 선택되지 않은 프레임을 지운다 (= 선택한 것만 남긴다)
  const deleteUnselectedFrames = () => {
    if (selectedFrameIds.size === 0 || selectedFrameIds.size === frames.length) return;
    pushHistory();
    setFrames(prev => prev.filter(f => selectedFrameIds.has(f.id)));
  };

  // --- Frame Edit Modal ---
  const openEditModal = (frameId: number) => {
    setEditTargetId(frameId);
    setEditBrightness(100);
    setEditContrast(100);
    setEditSaturation(100);
    setEditHue(0);
    setEditBlur(0);
    setEditSharpen(0);
    setEditInvert(false);
    setEditGrayscale(false);
    setEditBgTolerance(20);
    setEditBgApplied(false);
    editBackupRef.current = null;
  };

  const resetEditSliders = () => {
    setEditBrightness(100);
    setEditContrast(100);
    setEditSaturation(100);
    setEditHue(0);
    setEditBlur(0);
    setEditSharpen(0);
    setEditInvert(false);
    setEditGrayscale(false);
  };

  const applyEditBgRemoval = async () => {
    if (editTargetId === null) return;
    const frame = frames.find(f => f.id === editTargetId);
    if (!frame) return;

    if (!editBackupRef.current) {
      editBackupRef.current = { url: frame.url, blob: frame.blob };
    }

    const img = await loadImage(frame.url);
    const w = img.width;
    const h = img.height;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const visited = new Uint8Array(w * h);
    const tolerance = editBgTolerance;
    const maxDist = tolerance * 765 / 100;

    const floodFill = (sx: number, sy: number) => {
      const seedIdx = (sy * w + sx) * 4;
      const sr = data[seedIdx], sg = data[seedIdx + 1], sb = data[seedIdx + 2];
      const queue: number[] = [sx, sy];
      while (queue.length > 0) {
        const cy = queue.pop()!;
        const cx = queue.pop()!;
        const pi = cy * w + cx;
        if (visited[pi]) continue;
        visited[pi] = 1;
        const i = pi * 4;
        const dist = Math.abs(data[i] - sr) + Math.abs(data[i + 1] - sg) + Math.abs(data[i + 2] - sb);
        if (dist > maxDist) continue;
        data[i + 3] = 0;
        if (cx > 0) queue.push(cx - 1, cy);
        if (cx < w - 1) queue.push(cx + 1, cy);
        if (cy > 0) queue.push(cx, cy - 1);
        if (cy < h - 1) queue.push(cx, cy + 1);
      }
    };

    floodFill(0, 0);
    floodFill(w - 1, 0);
    floodFill(0, h - 1);
    floodFill(w - 1, h - 1);
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>(resolve => cvs.toBlob(resolve, 'image/png'));
    if (blob) {
      const newUrl = URL.createObjectURL(blob);
      setFrames(prev => prev.map(f =>
        f.id === editTargetId ? { ...f, blob, url: newUrl } : f
      ));
    }
    setEditBgApplied(true);
  };

  const undoEditBgRemoval = () => {
    if (!editBackupRef.current || editTargetId === null) return;
    const backup = editBackupRef.current;
    setFrames(prev => prev.map(f => {
      if (f.id === editTargetId) {
        URL.revokeObjectURL(f.url);
        return { ...f, url: backup.url, blob: backup.blob };
      }
      return f;
    }));
    editBackupRef.current = null;
    setEditBgApplied(false);
  };

  const applyEditToFrame = async () => {
    if (editTargetId === null) return;
    const frame = frames.find(f => f.id === editTargetId);
    if (!frame) return;
    if (editFilterStr === '' && editSharpen === 0) {
      setEditTargetId(null);
      return;
    }

    const img = await loadImage(frame.url);
    const w = img.width;
    const h = img.height;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d', { willReadFrequently: true })!;

    if (editFilterStr) ctx.filter = editFilterStr;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
    if (editSharpen > 0) applySharpenKernel(ctx, w, h, editSharpen);

    const blob = await new Promise<Blob | null>(resolve => cvs.toBlob(resolve, 'image/png'));
    if (blob) {
      const newUrl = URL.createObjectURL(blob);
      pushHistory();
      setFrames(prev => prev.map(f =>
        f.id === editTargetId ? { ...f, blob, url: newUrl } : f
      ));
    }
    setEditTargetId(null);
  };

  const cancelEdit = () => {
    if (editBgApplied && editBackupRef.current && editTargetId !== null) {
      const backup = editBackupRef.current;
      setFrames(prev => prev.map(f => {
        if (f.id === editTargetId) {
          URL.revokeObjectURL(f.url);
          return { ...f, url: backup.url, blob: backup.blob };
        }
        return f;
      }));
      editBackupRef.current = null;
    }
    setEditTargetId(null);
  };

  // Edit modal preview
  const editFrame = editTargetId !== null ? frames.find(f => f.id === editTargetId) : null;
  useEffect(() => {
    const canvas = editCanvasRef.current;
    if (!canvas || !editFrame) return;

    const draw = async () => {
      const img = await loadImage(editFrame.url);
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.clearRect(0, 0, img.width, img.height);
      if (editFilterStr) ctx.filter = editFilterStr;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      if (editSharpen > 0) applySharpenKernel(ctx, img.width, img.height, editSharpen);
    };

    draw();
  }, [editFrame, editFilterStr, editSharpen, loadImage]);

  // --- Interaction Handlers ---
  const toggleFrameSelection = (id: number, multi: boolean) => {
    const newSet = new Set(selectedFrameIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      if (!multi && false) {
        // Optional: Single select mode logic if needed, but sprite sheets usually need multi
      }
      newSet.add(id);
    }
    setSelectedFrameIds(newSet);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickingColor && !isBgPickingColor) return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const p = ctx.getImageData(x, y, 1, 1).data;
      const hex = "#" + ("000000" + ((p[0] << 16) | (p[1] << 8) | p[2]).toString(16)).slice(-6);
      if (isBgPickingColor) {
        setBgChromaColor(hex);
        setIsBgPickingColor(false);
      } else {
        setChromaColor(hex);
        setIsPickingColor(false);
      }
    }
  };

  /**
   * 정렬 시트 내보내기 — '발 정렬 적용'과 같은 계획(고정 부위/발 바닥)을 쓰되
   * 프레임을 바꾸지 않고 내보내기 캔버스에서만 정렬한다.
   */
  const exportAnchoredSheet = async () => {
    const built = await buildAlignmentPlan(activeFrames);
    if (!built) {
      setAlignNotice(true);
      return;
    }
    const { images, plan } = built;

    const { w: fitW, h: fitH } = getExportSize(plan.cellW, plan.cellH);
    const scale = Math.min(fitW / plan.cellW, fitH / plan.cellH);
    const cellW = Math.max(1, Math.round(plan.cellW * scale));
    const cellH = Math.max(1, Math.round(plan.cellH * scale));
    const cols = exportColumns > 0 ? exportColumns : Math.ceil(Math.sqrt(activeFrames.length));
    const rows = Math.ceil(activeFrames.length / cols);

    const sheet = document.createElement('canvas');
    sheet.width = cols * cellW;
    sheet.height = rows * cellH;
    const ctx = sheet.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    activeFrames.forEach((_, i) => {
      const src = images[i];
      if (!src) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      ctx.drawImage(
        src,
        col * cellW + (plan.originX + plan.shifts[i][0]) * scale,
        row * cellH + (plan.originY + plan.shifts[i][1]) * scale,
        src.width * scale,
        src.height * scale
      );
    });

    const link = document.createElement('a');
    link.download = 'sprite-sheet.png';
    link.href = sheet.toDataURL('image/png');
    link.click();
  };

  // --- Export ---  // --- Export ---
  const handleExport = () => {
    if (activeFrames.length === 0) return;

    if (anchorAlign) {
      void exportAnchoredSheet();
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load first frame to get dims (assume all same size)
    const sampleImg = new Image();
    sampleImg.src = activeFrames[0].url;
    sampleImg.onload = async () => {
      const { w: frameW, h: frameH } = getExportSize(sampleImg.width, sampleImg.height);

      const cols = exportColumns > 0 ? exportColumns : Math.ceil(Math.sqrt(activeFrames.length));
      const rows = Math.ceil(activeFrames.length / cols);

      canvas.width = cols * frameW;
      canvas.height = rows * frameH;

      for (let i = 0; i < activeFrames.length; i++) {
        const frame = activeFrames[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * frameW;
        const y = row * frameH;

        const img = new Image();
        img.src = frame.url;
        await new Promise<void>(resolve => {
            img.onload = () => resolve();
        });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameW;
        tempCanvas.height = frameH;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.drawImage(img, 0, 0, frameW, frameH);
            if (chromaColor) {
                applyChromaKey(tempCtx, frameW, frameH);
            }
            ctx.drawImage(tempCanvas, x, y);
        }
      }
      
      // Trigger download
      const link = document.createElement('a');
      link.download = 'sprite-sheet.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
  };

  // --- GIF Export ---
  const handleExportGIF = async () => {
    if (activeFrames.length === 0) return;
    setIsExportingGif(true);
    setProgress(0);

    try {
      const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
      const firstImg = await loadImage(activeFrames[0].url);
      const { w: width, h: height } = getExportSize(firstImg.width, firstImg.height);

      const gif = GIFEncoder();
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
      const delay = Math.round(1000 / fps);

      for (let i = 0; i < activeFrames.length; i++) {
        const img = await loadImage(activeFrames[i].url);
        tempCtx.clearRect(0, 0, width, height);
        tempCtx.drawImage(img, 0, 0, width, height);

        if (chromaColor) {
          applyChromaKey(tempCtx, width, height);
        }

        const imageData = tempCtx.getImageData(0, 0, width, height);
        const palette = quantize(imageData.data, 256);
        const index = applyPalette(imageData.data, palette);

        gif.writeFrame(index, width, height, { palette, delay });
        setProgress(Math.round(((i + 1) / activeFrames.length) * 100));
      }

      gif.finish();
      const output = gif.bytes();
      const blob = new Blob([output], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'animation.gif';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // GIF export failed silently
    }

    setIsExportingGif(false);
    setProgress(0);
  };

  // --- Merge Images ---
  const handleMergeImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files: File[] = Array.from(fileList);
    e.target.value = '';

    setIsLoading(true);
    setProgress(0);

    try {
      const startId = frames.length > 0 ? Math.max(...frames.map(f => f.id)) + 1 : 0;
      const newFrames: Frame[] = [];
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      const total = imageFiles.length;
      if (total === 0) { setIsLoading(false); return; }

      // 1) 모든 이미지 로드
      const images: HTMLImageElement[] = [];
      for (let i = 0; i < total; i++) {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Failed to load image'));
          image.src = URL.createObjectURL(imageFiles[i]);
        });
        images.push(img);
        setProgress(Math.round(((i + 1) / total) * 50));
      }

      // 2) 최대 크기 계산
      const maxW = Math.max(...images.map(img => img.naturalWidth));
      const maxH = Math.max(...images.map(img => img.naturalHeight));

      // 3) 최대 크기 캔버스에 중앙 배치
      const canvas = document.createElement('canvas');
      canvas.width = maxW;
      canvas.height = maxH;
      const ctx = canvas.getContext('2d')!;

      for (let i = 0; i < total; i++) {
        const img = images[i];
        ctx.clearRect(0, 0, maxW, maxH);
        const offsetX = Math.floor((maxW - img.naturalWidth) / 2);
        const offsetY = Math.floor((maxH - img.naturalHeight) / 2);
        ctx.drawImage(img, offsetX, offsetY);
        URL.revokeObjectURL(img.src);

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          newFrames.push({
            id: startId + i,
            blob,
            url: URL.createObjectURL(blob),
            timestamp: 0,
          });
        }
        setProgress(50 + Math.round(((i + 1) / total) * 50));
      }

      if (newFrames.length > 0) {
        setFrames(prev => [...prev, ...newFrames]);
        setSelectedFrameIds(prev => {
          const newSet = new Set(prev);
          newFrames.forEach(f => newSet.add(f.id));
          return newSet;
        });
        if (exportColumns === 0) {
          setExportColumns(Math.ceil(Math.sqrt(frames.length + newFrames.length)));
        }
      }
    } catch {
      // Merge failed silently
    }

    setIsLoading(false);
    setProgress(0);
  };

  // --- Sprite Sheet Import & Split ---
  const handleSpriteSheetImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSplitImageUrl(url);
    setSplitMode(true);
    e.target.value = '';
  };

  const processSpriteSheetSplit = async () => {
    if (!splitImageUrl) return;
    setIsLoading(true);
    setProgress(0);
    setSplitMode(false);

    try {
      const img = await loadImage(splitImageUrl);
      const frameW = Math.floor(img.width / splitCols);
      const frameH = Math.floor(img.height / splitRows);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = frameW;
      tempCanvas.height = frameH;
      const tempCtx = tempCanvas.getContext('2d')!;

      const newFrames: Frame[] = [];
      const startId = frames.length > 0 ? Math.max(...frames.map(f => f.id)) + 1 : 0;
      const total = splitRows * splitCols;

      for (let row = 0; row < splitRows; row++) {
        for (let col = 0; col < splitCols; col++) {
          tempCtx.clearRect(0, 0, frameW, frameH);
          tempCtx.drawImage(img, col * frameW, row * frameH, frameW, frameH, 0, 0, frameW, frameH);

          const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/png'));
          if (blob) {
            const idx = row * splitCols + col;
            newFrames.push({
              id: startId + idx,
              blob,
              url: URL.createObjectURL(blob),
              timestamp: 0,
            });
          }
          setProgress(Math.round(((row * splitCols + col + 1) / total) * 100));
        }
      }

      setFrames(prev => [...prev, ...newFrames]);
      setSelectedFrameIds(prev => {
        const newSet = new Set(prev);
        newFrames.forEach(f => newSet.add(f.id));
        return newSet;
      });
      if (exportColumns === 0) {
        setExportColumns(Math.ceil(Math.sqrt(frames.length + newFrames.length)));
      }
    } catch {
      // Split failed silently
    }

    URL.revokeObjectURL(splitImageUrl);
    setSplitImageUrl(null);
    setIsLoading(false);
    setProgress(0);
  };

  return (
    <>
      <SEO title={t.seoSpriteTitle} description={t.seoSpriteDesc} path="/sprite" lang={lang} />
      <div className="main-workspace">
        {/* LEFT AD */}
        <div className="side-rail side-rail-left" />

        {/* Hidden Video for processing */}
        <video 
            ref={videoRef} 
            style={{ display: 'none' }} 
            crossOrigin="anonymous" 
            playsInline
            onLoadedMetadata={startExtraction}
            onError={handleVideoError}
        />

        {/* Loading Overlay */}
        {(isLoading || isExportingGif) && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <div>{isExportingGif ? t.exportingGif : t.processing} {Math.round(progress)}%</div>
          </div>
        )}

        {/* LEFT PANEL: GRID */}
        <div className="frame-panel">
          <div className="panel-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
             {/* 파일 로드 실패 알림 — 프레임이 이미 있는 상태의 실패도 보여야 하므로 분기 바깥에 둔다 */}
             {loadError && (
                <div className="row" role="alert" style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>
                   <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>error</span>
                   {t.dedupError}
                </div>
             )}
             {frames.length === 0 ? (
                <div className="row">
                    <label className="btn">
                       <span className="material-symbols-outlined">upload_file</span>
                       {t.uploadVideo}
                       <input type="file" className="hidden-input" accept="video/*, image/gif" onChange={handleFileUpload} />
                    </label>
                    <label className="btn btn-secondary">
                       <span className="material-symbols-outlined">grid_on</span>
                       {t.importSpriteSheet}
                       <input type="file" className="hidden-input" accept="image/*" onChange={handleSpriteSheetImport} />
                    </label>
                    <label className="btn btn-secondary">
                       <span className="material-symbols-outlined">collections</span>
                       {t.mergeImages}
                       <input type="file" className="hidden-input" accept="image/*" multiple onChange={handleMergeImages} />
                    </label>
                </div>
             ) : (
                <>
                    <div className="row">
                        <label className="btn btn-secondary">
                            <span className="material-symbols-outlined">add</span>
                            {t.newFile}
                            <input type="file" className="hidden-input" accept="video/*, image/gif" onChange={handleFileUpload} />
                        </label>
                        <label className="btn btn-secondary">
                            <span className="material-symbols-outlined">grid_on</span>
                            {t.importSpriteSheet}
                            <input type="file" className="hidden-input" accept="image/*" onChange={handleSpriteSheetImport} />
                        </label>
                        <label className="btn btn-secondary">
                            <span className="material-symbols-outlined">collections</span>
                            {t.mergeImages}
                            <input type="file" className="hidden-input" accept="image/*" multiple onChange={handleMergeImages} />
                        </label>
                        <div style={{ marginLeft: 8 }}>
                           <span className="badge">{t.totalFrames}: {frames.length}</span>
                        </div>
                        <div className="flex-grow"></div>
                        {/* 선택/삭제 일괄 작업 — 어느 탭에서든 보이도록 상단 행에 둔다 */}
                        <div className="row" style={{ gap: 6 }}>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                onClick={undoHistory}
                                disabled={historyDepth === 0}
                                title="Ctrl+Z"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>undo</span>
                                {t.undo}{historyDepth > 0 ? ` (${historyDepth})` : ''}
                            </button>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                onClick={selectAllFrames}
                                disabled={selectedFrameIds.size === frames.length}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>select_all</span>
                                {t.selectAll}
                            </button>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                onClick={clearFrameSelection}
                                disabled={selectedFrameIds.size === 0}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>deselect</span>
                                {t.clearSelection}
                            </button>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--danger)' }}
                                onClick={deleteSelectedFrames}
                                disabled={selectedFrameIds.size === 0}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                {t.deleteSelected}
                            </button>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--danger)' }}
                                onClick={deleteUnselectedFrames}
                                disabled={selectedFrameIds.size === 0 || selectedFrameIds.size === frames.length}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete_sweep</span>
                                {t.deleteUnselected}
                            </button>
                        </div>
                        <div className="row" style={{ marginLeft: 12, gap: 6, width: 120 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>grid_view</span>
                            <input
                                type="range"
                                min="60"
                                max="200"
                                value={gridSize}
                                onChange={(e) => setGridSize(Number(e.target.value))}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>
                    {/* Tab Bar */}
                    <div className="toolbar-tabs">
                        <button
                            className={`toolbar-tab ${activeTab === 'default' ? 'active' : ''}`}
                            onClick={() => setActiveTab('default')}
                        >{t.tabDefault}</button>
                        <button
                            className={`toolbar-tab ${activeTab === 'bgRemove' ? 'active' : ''}`}
                            onClick={() => setActiveTab('bgRemove')}
                        >{t.tabBgRemove}</button>
                        <button
                            className={`toolbar-tab ${activeTab === 'animation' ? 'active' : ''}`}
                            onClick={() => setActiveTab('animation')}
                        >{t.tabAnimation}</button>
                        <button
                            className={`toolbar-tab ${activeTab === 'adjust' ? 'active' : ''}`}
                            onClick={() => setActiveTab('adjust')}
                        >{t.tabAdjust}</button>
                        <div className="flex-grow"></div>
                        <button
                            className="toolbar-tab"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setShowResetModal(true)}
                        >{t.resetAll}</button>
                    </div>

                    {/* Tab: Default */}
                    {activeTab === 'default' && (
                        <div className="tab-content">
                            <div className="row" style={{ gap: 12 }}>
                                <div className="control-group" style={{ marginBottom: 0, width: 240 }}>
                                    <label>{t.threshold} ({dedupThreshold})</label>
                                    <input
                                       type="range"
                                       min="1"
                                       max="50"
                                       value={dedupThreshold}
                                       onChange={(e) => { setDedupThreshold(Number(e.target.value)); setDedupResult(null); }}
                                    />
                                </div>
                                <button
                                   className="btn btn-secondary"
                                   onClick={removeDuplicates}
                                   disabled={frames.length < 2 || isDeduping}
                                   style={{ whiteSpace: 'nowrap' }}
                                >
                                   <span className="material-symbols-outlined">auto_fix_high</span>
                                   {isDeduping ? t.processingDedup : t.removeDuplicates}
                                </button>
                                {dedupResult && dedupResult !== 'error' && (
                                   <span className="badge">
                                       {dedupResult.removed}{t.dedupRemoved} ({dedupResult.remaining}{t.dedupRemaining})
                                   </span>
                                )}
                                {dedupResult === 'error' && (
                                   <span style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>{t.dedupError}</span>
                                )}
                                <button
                                   className="btn btn-secondary"
                                   onClick={analyzeQuality}
                                   disabled={frames.length < 2 || isAnalyzing}
                                   style={{ whiteSpace: 'nowrap' }}
                                   title={t.qualityHint}
                                >
                                   <span className="material-symbols-outlined">query_stats</span>
                                   {isAnalyzing ? t.analyzing : t.analyzeQuality}
                                </button>
                                {/* 분석이 보여주는 흔들림을 실제로 잡는 조치 — 분석 없이도 쓸 수 있게 옆에 둔다 */}
                                <div className="row" style={{ gap: 0 }} title={t.alignModeHint}>
                                    <button
                                        className={`btn ${alignMode === 'stable' ? '' : 'btn-secondary'}`}
                                        style={{ borderRadius: '6px 0 0 6px', padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                        onClick={() => setAlignMode('stable')}
                                    >{t.alignModeStable}</button>
                                    <button
                                        className={`btn ${alignMode === 'feet' ? '' : 'btn-secondary'}`}
                                        style={{ borderRadius: '0 6px 6px 0', padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                        onClick={() => setAlignMode('feet')}
                                    >{t.alignModeFeet}</button>
                                </div>
                                <button
                                   className="btn btn-secondary"
                                   onClick={applyAnchorAlignment}
                                   disabled={frames.length === 0 || isAligning}
                                   style={{ whiteSpace: 'nowrap' }}
                                   title={t.applyAlignHint}
                                >
                                   <span className="material-symbols-outlined">align_vertical_bottom</span>
                                   {isAligning ? t.processing : t.applyAlign}
                                </button>
                            </div>
                            <div className="row" style={{ gap: 12, marginTop: 8 }}>
                                <div className="control-group" style={{ marginBottom: 0, width: 240 }}>
                                    <label>{t.reduceFrames} ({reduceTarget})</label>
                                    <input
                                       type="range"
                                       min="2"
                                       max="60"
                                       value={reduceTarget}
                                       onChange={(e) => setReduceTarget(Number(e.target.value))}
                                    />
                                </div>
                                <button
                                   className="btn btn-secondary"
                                   onClick={reduceFramesByMotion}
                                   disabled={frames.length <= reduceTarget || isLoading}
                                   style={{ whiteSpace: 'nowrap' }}
                                   title={t.reduceFramesHint}
                                >
                                   <span className="material-symbols-outlined">compress</span>
                                   {t.reduceFrames}
                                </button>
                                <button
                                   className="btn btn-secondary"
                                   onClick={keepLoopRange}
                                   disabled={frames.length < 3 || isLoading}
                                   style={{ whiteSpace: 'nowrap' }}
                                   title={t.keepLoopHint}
                                >
                                   <span className="material-symbols-outlined">repeat</span>
                                   {t.keepLoop}
                                </button>
                                {loopNotice && (
                                   <span role="alert" style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>{t.loopNotFound}</span>
                                )}
                            </div>
                            {quality && (
                               <div className="row" style={{ gap: 10, marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  {/* 발/중심 흔들림이 2px를 넘으면 정렬이 필요하다는 신호로 강조한다 */}
                                  <span className="badge" style={quality.baselineDriftPx > 2 ? { color: 'var(--danger)' } : undefined} title={quality.baselineDriftPx > 2 ? t.qualityCheck : t.qualityGood}>
                                     {t.qualityBaselineDrift}: {quality.baselineDriftPx}px
                                  </span>
                                  {/* 중심(전체 픽셀 평균)은 팔·꼬리 흔들림에도 움직이므로 발보다 느슨하게 본다 */}
                                  <span className="badge" style={quality.centroidDriftPx > 4 ? { color: 'var(--danger)' } : undefined} title={quality.centroidDriftPx > 4 ? t.qualityCheck : t.qualityGood}>
                                     {t.qualityCentroidDrift}: {quality.centroidDriftPx}px
                                  </span>
                                  <span className="badge">{t.qualityHeightVar}: {quality.heightVarPx}px</span>
                                  <span className="badge">{t.qualityLoopDiff}: {quality.loopDiff}</span>
                                  <span className="badge" style={quality.worstBgPurity < 0.98 ? { color: 'var(--danger)' } : undefined} title={quality.worstBgPurity < 0.98 ? t.qualityCheck : t.qualityGood}>
                                     {t.qualityBgPurity}: {Math.round(quality.worstBgPurity * 100)}%
                                  </span>
                                  {loopSeam && (
                                     <span className="badge">{t.loopSeamFound}: {loopSeam.i}~{loopSeam.j}</span>
                                  )}
                               </div>
                            )}
                            {alignNotice && (
                               <span role="alert" style={{ display: 'block', marginTop: 6, fontSize: '0.8rem', color: 'var(--danger)' }}>{t.alignNeedsAlpha}</span>
                            )}
                            <div className="row" style={{ gap: 12, marginTop: 8 }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.frameSize}</label>
                                <div className="row" style={{ gap: 0 }}>
                                    <button
                                        className={`btn ${exportSizeMode === 'scale' ? '' : 'btn-secondary'}`}
                                        style={{ borderRadius: '6px 0 0 6px', padding: '6px 12px', fontSize: '0.8rem' }}
                                        onClick={() => setExportSizeMode('scale')}
                                    >{t.scale}</button>
                                    <button
                                        className={`btn ${exportSizeMode === 'fixed' ? '' : 'btn-secondary'}`}
                                        style={{ borderRadius: '0 6px 6px 0', padding: '6px 12px', fontSize: '0.8rem' }}
                                        onClick={() => setExportSizeMode('fixed')}
                                    >{t.fixedSize}</button>
                                </div>
                                {exportSizeMode === 'scale' ? (
                                    <div className="row" style={{ gap: 8, width: 240 }}>
                                        <input
                                            type="range"
                                            min="10"
                                            max="200"
                                            step="5"
                                            value={exportScale}
                                            onChange={(e) => setExportScale(Number(e.target.value))}
                                            style={{ flex: 1 }}
                                        />
                                        <span className="badge">{exportScale}%</span>
                                    </div>
                                ) : (
                                    <div className="row" style={{ gap: 4 }}>
                                        <input
                                            type="number"
                                            min="1"
                                            max="4096"
                                            value={exportFixedW || ''}
                                            onChange={(e) => {
                                                const v = Number(e.target.value) || 0;
                                                setExportFixedW(v);
                                                if (lockAspectRatio && v > 0 && lockedRatioRef.current > 0) {
                                                    setExportFixedH(Math.max(1, Math.round(v / lockedRatioRef.current)));
                                                }
                                            }}
                                            onBlur={() => { if (exportFixedW < 1) setExportFixedW(1); }}
                                            style={{ width: 60, padding: '4px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'white', borderRadius: 4, textAlign: 'center' }}
                                        />
                                        <button
                                            className={`btn btn-icon ${lockAspectRatio ? '' : 'btn-secondary'}`}
                                            style={{ padding: 4 }}
                                            onClick={() => {
                                                if (!lockAspectRatio && exportFixedW > 0 && exportFixedH > 0) {
                                                    lockedRatioRef.current = exportFixedW / exportFixedH;
                                                }
                                                setLockAspectRatio(!lockAspectRatio);
                                            }}
                                            title={lockAspectRatio ? 'Unlock' : 'Lock aspect ratio'}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{lockAspectRatio ? 'lock' : 'lock_open'}</span>
                                        </button>
                                        <input
                                            type="number"
                                            min="1"
                                            max="4096"
                                            value={exportFixedH || ''}
                                            onChange={(e) => {
                                                const v = Number(e.target.value) || 0;
                                                setExportFixedH(v);
                                                if (lockAspectRatio && v > 0 && lockedRatioRef.current > 0) {
                                                    setExportFixedW(Math.max(1, Math.round(v * lockedRatioRef.current)));
                                                }
                                            }}
                                            onBlur={() => { if (exportFixedH < 1) setExportFixedH(1); }}
                                            style={{ width: 60, padding: '4px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'white', borderRadius: 4, textAlign: 'center' }}
                                        />
                                        <span className="badge">px</span>
                                    </div>
                                )}

                            </div>
                        </div>
                    )}

                    {/* Tab: BG Remove */}
                    {activeTab === 'bgRemove' && (
                        <div className="tab-content">
                            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                                <div className="row" style={{ gap: 0 }}>
                                    <button
                                        className={`btn ${bgMode === 'chroma' ? '' : 'btn-secondary'}`}
                                        style={{ borderRadius: '6px 0 0 6px', padding: '6px 12px', fontSize: '0.8rem' }}
                                        onClick={() => setBgMode('chroma')}
                                    >{t.bgModeChroma}</button>
                                    <button
                                        className={`btn ${bgMode === 'flood' ? '' : 'btn-secondary'}`}
                                        style={{ borderRadius: '0 6px 6px 0', padding: '6px 12px', fontSize: '0.8rem' }}
                                        onClick={() => setBgMode('flood')}
                                    >{t.bgModeFlood}</button>
                                </div>
                                {bgMode === 'chroma' ? (
                                    <>
                                        <button
                                            className={`btn ${isBgPickingColor ? '' : 'btn-secondary'}`}
                                            style={{ padding: '6px 10px' }}
                                            onClick={() => { setIsBgPickingColor(!isBgPickingColor); setIsPickingColor(false); }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>colorize</span>
                                        </button>
                                        <input
                                            type="color"
                                            value={bgChromaColor}
                                            onChange={(e) => setBgChromaColor(e.target.value)}
                                        />
                                        <div className="control-group" style={{ marginBottom: 0, width: 180 }}>
                                            <label>{t.tolerance} ({bgChromaTolerance}%)</label>
                                            <input type="range" min="1" max="50" value={bgChromaTolerance}
                                                onChange={(e) => setBgChromaTolerance(Number(e.target.value))} />
                                        </div>
                                    </>
                                ) : (
                                    <div className="control-group" style={{ marginBottom: 0, width: 240 }}>
                                        <label>{t.bgRemoveTolerance} ({bgRemoveTolerance})</label>
                                        <input type="range" min="1" max="50" value={bgRemoveTolerance}
                                            onChange={(e) => setBgRemoveTolerance(Number(e.target.value))} />
                                    </div>
                                )}
                                <button className="btn btn-secondary" onClick={bgMode === 'chroma' ? applyChromaKeyRemoval : applyBgRemoval} disabled={frames.length === 0 || isLoading}>
                                    <span className="material-symbols-outlined">auto_fix</span>
                                    {t.bgRemoveApply}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tab: Animation */}
                    {activeTab === 'animation' && (
                        <div className="tab-content">
                            <div className="row" style={{ gap: 8 }}>
                                <button className="btn btn-secondary" onClick={handleReverse} disabled={frames.length === 0}>
                                    <span className="material-symbols-outlined">swap_horiz</span>
                                    {t.reverse}
                                </button>
                                <button className="btn btn-secondary" onClick={handlePingPong} disabled={frames.length < 2}>
                                    <span className="material-symbols-outlined">repeat</span>
                                    {t.pingPong}
                                </button>
                                <button className="btn btn-secondary" onClick={handleDuplicateFrames} disabled={selectedFrameIds.size === 0}>
                                    <span className="material-symbols-outlined">content_copy</span>
                                    {t.duplicateFrames}
                                </button>
                            </div>
                            <div className="row" style={{ gap: 12, marginTop: 8 }}>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.trimStart} ({trimStart})</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max={Math.max(0, frames.length - 1)}
                                        value={trimStart}
                                        onChange={(e) => setTrimStart(Number(e.target.value))}
                                    />
                                </div>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.trimEnd} ({trimEnd})</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max={Math.max(0, frames.length - 1)}
                                        value={trimEnd}
                                        onChange={(e) => setTrimEnd(Number(e.target.value))}
                                    />
                                </div>
                                <button className="btn btn-secondary" onClick={handleTrim} disabled={trimStart + trimEnd === 0 || trimStart + trimEnd >= frames.length}>
                                    <span className="material-symbols-outlined">content_cut</span>
                                    {t.trimApply}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tab: Adjust */}
                    {activeTab === 'adjust' && (
                        <div className="tab-content">
                            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.brightness} ({adjustBrightness}%)</label>
                                    <input type="range" min="0" max="200" value={adjustBrightness}
                                        onChange={(e) => setAdjustBrightness(Number(e.target.value))} />
                                </div>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.contrast} ({adjustContrast}%)</label>
                                    <input type="range" min="0" max="200" value={adjustContrast}
                                        onChange={(e) => setAdjustContrast(Number(e.target.value))} />
                                </div>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.saturation} ({adjustSaturation}%)</label>
                                    <input type="range" min="0" max="200" value={adjustSaturation}
                                        onChange={(e) => setAdjustSaturation(Number(e.target.value))} />
                                </div>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.hue} ({adjustHue}°)</label>
                                    <input type="range" min="0" max="360" value={adjustHue}
                                        onChange={(e) => setAdjustHue(Number(e.target.value))} />
                                </div>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.blur} ({adjustBlur}px)</label>
                                    <input type="range" min="0" max="10" value={adjustBlur}
                                        onChange={(e) => setAdjustBlur(Number(e.target.value))} />
                                </div>
                                <div className="control-group" style={{ marginBottom: 0, width: 160 }}>
                                    <label>{t.sharpen} ({adjustSharpen})</label>
                                    <input type="range" min="0" max="10" value={adjustSharpen}
                                        onChange={(e) => setAdjustSharpen(Number(e.target.value))} />
                                </div>
                            </div>
                            <div className="row" style={{ gap: 12, marginTop: 8, alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={adjustInvert} onChange={(e) => setAdjustInvert(e.target.checked)} />
                                    {t.invert}
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={adjustGrayscale} onChange={(e) => setAdjustGrayscale(e.target.checked)} />
                                    {t.grayscale}
                                </label>
                                <div className="flex-grow"></div>
                                <button className="btn btn-secondary" onClick={resetAdjustSliders} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                                    {t.adjustReset}
                                </button>
                                <button className="btn" onClick={applyAdjustment} disabled={frames.length === 0 || isLoading || (adjustFilterStr === '' && adjustSharpen === 0)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                                    {t.adjustApply}
                                </button>
                            </div>
                        </div>
                    )}
                </>
             )}
          </div>

          <div
            className={`frame-grid-scroll ${isFileDragOver ? 'file-drag-over' : ''}`}
            onDragEnter={handleFileDragEnter}
            onDragLeave={handleFileDragLeave}
            onDragOver={handleFileDragOver}
            onDrop={handleFileDrop}
          >
            {isFileDragOver && (
              <div className="file-drop-overlay">
                <span className="material-symbols-outlined" style={{ fontSize: 64 }}>upload_file</span>
                <p>{t.dropFileHere}</p>
              </div>
            )}
            {frames.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-drop-zone">
                      <span className="material-symbols-outlined">upload_file</span>
                      <p className="empty-drop-title">{t.dropOrUpload}</p>
                      <p className="empty-drop-sub">{t.dropSupportedFormats}</p>
                    </div>

                    <div className="empty-features">
                      <div className="empty-feature-card">
                        <span className="material-symbols-outlined">movie</span>
                        <h4>{t.featureVideoTitle}</h4>
                        <p>{t.featureVideoDesc}</p>
                      </div>
                      <div className="empty-feature-card">
                        <span className="material-symbols-outlined">grid_on</span>
                        <h4>{t.featureSheetTitle}</h4>
                        <p>{t.featureSheetDesc}</p>
                      </div>
                      <div className="empty-feature-card">
                        <span className="material-symbols-outlined">hide_image</span>
                        <h4>{t.featureBgTitle}</h4>
                        <p>{t.featureBgDesc}</p>
                      </div>
                      <div className="empty-feature-card">
                        <span className="material-symbols-outlined">tune</span>
                        <h4>{t.featureAdjustTitle}</h4>
                        <p>{t.featureAdjustDesc}</p>
                      </div>
                      <div className="empty-feature-card">
                        <span className="material-symbols-outlined">download</span>
                        <h4>{t.featureExportTitle}</h4>
                        <p>{t.featureExportDesc}</p>
                      </div>
                    </div>
                </div>
            ) : (
                <div className="frame-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}>
                    {(frameOrder.length > 0
                      ? frameOrder.map(id => frames.find(f => f.id === id)).filter((f): f is Frame => !!f)
                      : frames
                    ).map((frame, visualIdx) => (
                        <div
                            key={frame.id}
                            className={`frame-card ${selectedFrameIds.has(frame.id) ? 'selected' : ''} ${dragOverId === frame.id ? 'drag-over' : ''}`}
                            onClick={() => toggleFrameSelection(frame.id, true)}
                            draggable
                            onDragStart={() => { draggedIdRef.current = frame.id; }}
                            onDragOver={(e) => { e.preventDefault(); setDragOverId(frame.id); }}
                            onDragLeave={() => setDragOverId(null)}
                            onDrop={(e) => { e.preventDefault(); setDragOverId(null); handleDrop(frame.id); }}
                            onDragEnd={() => { draggedIdRef.current = null; setDragOverId(null); }}
                        >
                            <img src={frame.url} alt={`Frame ${frame.id}`} draggable={false} />
                            <div className="frame-index">{visualIdx + 1}</div>
                            <button
                                className="frame-edit-btn"
                                onClick={(e) => { e.stopPropagation(); openEditModal(frame.id); }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                            </button>
                            <button
                                className="frame-delete-btn"
                                onClick={(e) => { e.stopPropagation(); setDeleteTargetId(frame.id); }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>

        {/* RESIZE HANDLE */}
        <div className="resize-handle" onMouseDown={handleResizeStart} />

        {/* RIGHT PANEL: TOOLS */}
        <div
          className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
        <div className={`sidebar${sidebarOpen ? ' open' : ''}`} style={{ width: sidebarWidth }}>
            <div className="sidebar-section">
                <h3>{t.preview}</h3>
                <div 
                    className={`preview-container ${isPickingColor || isBgPickingColor ? 'picking' : ''}`}
                    onClick={handlePreviewClick}
                >
                    {activeFrames.length > 0 && <canvas ref={previewCanvasRef} />}
                    {(isPickingColor || isBgPickingColor) && <div className="eyedropper-active-indicator">{t.pickingColor}</div>}
                    {activeFrames.length === 0 && <span style={{ color: 'var(--text-muted)' }}>{t.noFrames}</span>}
                </div>
                
                <div className="row" style={{ marginTop: 16 }}>
                    <button className="btn btn-icon btn-secondary" onClick={() => {
                        setIsPlaying(false);
                        setCurrentPreviewFrameIndex(prev =>
                          (prev - 1 + activeFrames.length) % activeFrames.length
                        );
                    }} disabled={activeFrames.length === 0}>
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button className="btn btn-icon btn-secondary" onClick={() => setIsPlaying(!isPlaying)}>
                        <span className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    </button>
                    <button className="btn btn-icon btn-secondary" onClick={() => {
                        setIsPlaying(false);
                        setCurrentPreviewFrameIndex(prev =>
                          (prev + 1) % activeFrames.length
                        );
                    }} disabled={activeFrames.length === 0}>
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                    {activeFrames.length > 0 && (
                        <span className="badge" style={{ marginLeft: 4 }}>
                            {currentPreviewFrameIndex + 1} / {activeFrames.length}
                        </span>
                    )}
                </div>
                <div style={{ marginTop: 8 }}>
                    <label>FPS: {fps}</label>
                    <input type="range" min="1" max="60" value={fps} onChange={(e) => setFps(Number(e.target.value))} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <div className="row">
                        <label style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.onionSkin}</label>
                        <input
                            type="checkbox"
                            checked={onionSkinEnabled}
                            onChange={(e) => setOnionSkinEnabled(e.target.checked)}
                        />
                    </div>
                    {onionSkinEnabled && (
                        <div style={{ marginTop: 8 }}>
                            <label>{t.opacity}: {onionSkinOpacity}%</label>
                            <input
                                type="range"
                                min="10"
                                max="80"
                                value={onionSkinOpacity}
                                onChange={(e) => setOnionSkinOpacity(Number(e.target.value))}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="sidebar-section">
                <h3>{t.additionalChromaKey}</h3>
                <div className="control-group">
                    <label>{t.transparentColor}</label>
                    <div className="row">
                        <button 
                            className={`btn ${isPickingColor ? 'btn-primary' : 'btn-secondary'}`} 
                            onClick={() => setIsPickingColor(!isPickingColor)}
                            title="Pick from preview"
                        >
                            <span className="material-symbols-outlined">colorize</span>
                        </button>
                        <input 
                            type="color" 
                            value={chromaColor || '#00ff00'} 
                            onChange={(e) => setChromaColor(e.target.value)} 
                            style={{ marginLeft: 8 }}
                        />
                        {chromaColor && (
                            <button className="btn btn-icon btn-secondary" onClick={() => setChromaColor(null)} style={{marginLeft: 'auto'}}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        )}
                    </div>
                </div>
                {chromaColor && (
                    <>
                        <div className="control-group">
                            <label>{t.tolerance} ({chromaTolerance}%)</label>
                            <input
                                type="range"
                                min="1"
                                max="50"
                                value={chromaTolerance}
                                onChange={(e) => setChromaTolerance(Number(e.target.value))}
                            />
                        </div>
                        <div className="control-group">
                            <label>{t.despillLabel} ({Math.round(despillStrength * 100)}%)</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round(despillStrength * 100)}
                                onChange={(e) => setDespillStrength(Number(e.target.value) / 100)}
                            />
                        </div>
                    </>
                )}
            </div>

            <div className="sidebar-section">
                <h3>{t.export}</h3>
                <div className="control-group">
                    <label>{t.columns}</label>
                    <input 
                        type="number" 
                        min="0" 
                        value={exportColumns} 
                        onChange={(e) => setExportColumns(Number(e.target.value))}
                        style={{ width: '100%', padding: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'white', borderRadius: 4 }} 
                    />
                </div>
                <div className="control-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title={t.anchorAlignHint}>
                        <input
                            type="checkbox"
                            checked={anchorAlign}
                            onChange={(e) => setAnchorAlign(e.target.checked)}
                        />
                        {t.anchorAlign}
                    </label>
                </div>
                <div className="control-group">
                   <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                       {t.selected}: {activeFrames.length} {t.frames}
                   </div>
                </div>
                <button className="btn" style={{ width: '100%' }} onClick={handleExport} disabled={activeFrames.length === 0}>
                    <span className="material-symbols-outlined">download</span>
                    {t.downloadSprite}
                </button>
                <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={handleExportGIF} disabled={activeFrames.length === 0 || isExportingGif}>
                    <span className="material-symbols-outlined">gif_box</span>
                    {t.downloadGif}
                </button>
            </div>
        </div>

        {/* RIGHT AD */}
        <div className="side-rail side-rail-right" />
      </div>

      {/* Sprite Sheet Split Modal */}
      {splitMode && splitImageUrl && (
        <div className="loading-overlay" onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            URL.revokeObjectURL(splitImageUrl);
            setSplitImageUrl(null);
            setSplitMode(false);
          }
        }}>
          <div className="split-modal">
            <h3 style={{ margin: '0 0 16px', color: 'var(--text-main)' }}>{t.importSpriteSheet}</h3>
            <div className="sprite-sheet-preview">
              <div className="sprite-sheet-preview-inner">
                <img src={splitImageUrl} alt="Sprite Sheet" draggable={false} style={{ maxHeight: 300 }} />
                <div
                  className="sprite-sheet-grid-overlay"
                  style={{
                    backgroundSize: `${100 / (splitCols || 1)}% ${100 / (splitRows || 1)}%`,
                  }}
                />
              </div>
            </div>
            <div className="row" style={{ gap: 16, marginBottom: 16 }}>
              <div className="control-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>{t.splitCols}</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={splitCols || ''}
                  onChange={(e) => setSplitCols(Number(e.target.value) || 0)}
                  onBlur={() => { if (splitCols < 1) setSplitCols(1); }}
                  style={{ width: '100%', padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'white', borderRadius: 4 }}
                />
              </div>
              <div className="control-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>{t.splitRows}</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={splitRows || ''}
                  onChange={(e) => setSplitRows(Number(e.target.value) || 0)}
                  onBlur={() => { if (splitRows < 1) setSplitRows(1); }}
                  style={{ width: '100%', padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'white', borderRadius: 4 }}
                />
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={processSpriteSheetSplit}>
                <span className="material-symbols-outlined">grid_on</span>
                {t.splitFrames}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
                URL.revokeObjectURL(splitImageUrl);
                setSplitImageUrl(null);
                setSplitMode(false);
              }}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetId !== null && (
        <div className="loading-overlay" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setDeleteTargetId(null);
        }}>
          <div className="split-modal" style={{ maxWidth: 360 }}>
            <p style={{ margin: '0 0 16px', fontSize: '1rem' }}>{t.deleteConfirm}</p>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--danger)' }}
                onClick={() => handleDeleteFrame(deleteTargetId)}
                autoFocus
              >
                <span className="material-symbols-outlined">delete</span>
                {t.delete}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteTargetId(null)}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset All Confirmation Modal */}
      {showResetModal && (
        <div className="loading-overlay" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setShowResetModal(false);
        }}>
          <div className="split-modal" style={{ maxWidth: 400 }}>
            <p style={{ margin: '0 0 16px', fontSize: '1rem' }}>{t.resetConfirm}</p>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--danger)' }}
                autoFocus
                onClick={() => {
                  clearHistory([]);
                  frames.forEach(f => URL.revokeObjectURL(f.url));
                  setFrames([]);
                  setSelectedFrameIds(new Set());
                  setIsLoading(false);
                  setProgress(0);
                  setLoadError(false);
                  setChromaColor(null);
                  setDedupResult(null);
                  setCurrentPreviewFrameIndex(0);
                  setExportColumns(0);
                  setFrameOrder([]);
                  setOnionSkinEnabled(false);
                  setOnionSkinOpacity(40);
                  setIsExportingGif(false);
                  resetAdjustSliders();
                  setActiveTab('default');
                  setTrimStart(0);
                  setTrimEnd(0);
                  if (splitImageUrl) URL.revokeObjectURL(splitImageUrl);
                  setSplitImageUrl(null);
                  setSplitMode(false);
                  if (videoRef.current) videoRef.current.src = '';
                  setShowResetModal(false);
                }}
              >
                <span className="material-symbols-outlined">restart_alt</span>
                {t.resetAll}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowResetModal(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Frame Edit Modal */}
      {editTargetId !== null && editFrame && (
        <div className="loading-overlay" onMouseDown={(e) => {
          if (e.target === e.currentTarget) cancelEdit();
        }}>
          <div className="edit-modal">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem' }}>
                {t.editFrame} (#{frameOrder.indexOf(editTargetId) + 1})
              </h3>
              <button className="btn btn-icon btn-secondary" onClick={cancelEdit}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="edit-modal-body">
              <div className="edit-modal-preview">
                <canvas ref={editCanvasRef} />
              </div>
              <div className="edit-modal-controls">
                <div className="control-group" style={{ marginBottom: 0 }}>
                  <label>{t.brightness} ({editBrightness}%)</label>
                  <input type="range" min="0" max="200" value={editBrightness}
                    onChange={(e) => setEditBrightness(Number(e.target.value))} />
                </div>
                <div className="control-group" style={{ marginBottom: 0 }}>
                  <label>{t.contrast} ({editContrast}%)</label>
                  <input type="range" min="0" max="200" value={editContrast}
                    onChange={(e) => setEditContrast(Number(e.target.value))} />
                </div>
                <div className="control-group" style={{ marginBottom: 0 }}>
                  <label>{t.saturation} ({editSaturation}%)</label>
                  <input type="range" min="0" max="200" value={editSaturation}
                    onChange={(e) => setEditSaturation(Number(e.target.value))} />
                </div>
                <div className="control-group" style={{ marginBottom: 0 }}>
                  <label>{t.hue} ({editHue}°)</label>
                  <input type="range" min="0" max="360" value={editHue}
                    onChange={(e) => setEditHue(Number(e.target.value))} />
                </div>
                <div className="control-group" style={{ marginBottom: 0 }}>
                  <label>{t.blur} ({editBlur}px)</label>
                  <input type="range" min="0" max="10" value={editBlur}
                    onChange={(e) => setEditBlur(Number(e.target.value))} />
                </div>
                <div className="control-group" style={{ marginBottom: 0 }}>
                  <label>{t.sharpen} ({editSharpen})</label>
                  <input type="range" min="0" max="10" value={editSharpen}
                    onChange={(e) => setEditSharpen(Number(e.target.value))} />
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={editInvert} onChange={(e) => setEditInvert(e.target.checked)} />
                    {t.invert}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={editGrayscale} onChange={(e) => setEditGrayscale(e.target.checked)} />
                    {t.grayscale}
                  </label>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                  <div className="control-group" style={{ marginBottom: 0 }}>
                    <label>{t.tabBgRemove} - {t.bgRemoveTolerance} ({editBgTolerance})</label>
                    <input type="range" min="1" max="50" value={editBgTolerance}
                      onChange={(e) => setEditBgTolerance(Number(e.target.value))} />
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '6px 8px' }}
                      onClick={applyEditBgRemoval} disabled={editBgApplied}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix</span>
                      {t.bgRemoveApply}
                    </button>
                    <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '6px 8px' }}
                      onClick={undoEditBgRemoval} disabled={!editBgApplied}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>undo</span>
                      {t.undo}
                    </button>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '6px 8px' }}
                      onClick={resetEditSliders}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                      {t.adjustReset}
                    </button>
                    <button className="btn" style={{ flex: 1, fontSize: '0.8rem', padding: '6px 8px' }}
                      onClick={applyEditToFrame}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                      {t.adjustApply}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className={`sidebar-toggle${sidebarOpen ? ' open' : ''}`}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(o => !o)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">{sidebarOpen ? 'close' : 'tune'}</span>
      </button>
      <ToolInfo t={t} toolKey="sprite" />
    </>
  );
};
