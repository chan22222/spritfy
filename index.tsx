import React, { useState, useRef, useEffect, useCallback, useMemo, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';
import { Header } from '@/header.tsx';
import { PixelEditor } from '@/editor.tsx';
import { LandingPage } from '@/landing.tsx';
import { PrivacyPage } from '@/privacy.tsx';
import { TermsPage } from '@/terms.tsx';
import { AboutPage } from '@/about.tsx';
import { LangContext } from '@/lang-context.ts';

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

const SpritePage: React.FC<{ lang: Lang; t: Record<string, string> }> = ({ lang, t }) => {

  // State
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Extraction Settings
  const [extractionInterval, setExtractionInterval] = useState(5); // Every N frames
  const [similarityThreshold, setSimilarityThreshold] = useState(0); // 0-100%

  // Chroma Key Settings
  const [chromaColor, setChromaColor] = useState<string | null>(null);
  const [chromaTolerance, setChromaTolerance] = useState(30);
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
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [exportSizeMode, setExportSizeMode] = useState<'scale' | 'fixed'>('scale');
  const [exportScale, setExportScale] = useState(100);
  const [exportFixedW, setExportFixedW] = useState(64);
  const [exportFixedH, setExportFixedH] = useState(64);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
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
  const bgBackupRef = useRef<{ id: number; url: string; blob: Blob }[]>([]);
  const [hasBgBackup, setHasBgBackup] = useState(false);

  // Image Adjustment
  const [adjustBrightness, setAdjustBrightness] = useState(100);
  const [adjustContrast, setAdjustContrast] = useState(100);
  const [adjustSaturation, setAdjustSaturation] = useState(100);
  const [adjustHue, setAdjustHue] = useState(0);
  const [adjustBlur, setAdjustBlur] = useState(0);
  const [adjustSharpen, setAdjustSharpen] = useState(0);
  const [adjustInvert, setAdjustInvert] = useState(false);
  const [adjustGrayscale, setAdjustGrayscale] = useState(false);
  const adjustBackupRef = useRef<{ id: number; url: string; blob: Blob }[]>([]);
  const [hasAdjustBackup, setHasAdjustBackup] = useState(false);

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
    
    ctx.putImageData(imgData, 0, 0);
  };

  // --- Remove Duplicates (post-extraction) ---
  const removeDuplicates = async () => {
    if (frames.length < 2) return;
    setIsDeduping(true);
    setDedupResult(null);

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
        } else {
          URL.revokeObjectURL(frames[i].url);
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

    const isVideo = file.type.startsWith('video/');
    const isGif = file.type === 'image/gif';
    const isImage = file.type.startsWith('image/') && !isGif;

    if (isVideo || isGif) {
      const url = URL.createObjectURL(file);
      if (videoRef.current) {
        videoRef.current.src = url;
        setIsLoading(true);
        setProgress(0);
      }
    } else if (isImage) {
      const url = URL.createObjectURL(file);
      setSplitImageUrl(url);
      setSplitMode(true);
    }
  };

  // --- File Handling ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (videoRef.current) {
      videoRef.current.src = url;
      setIsLoading(true);
      setProgress(0);
      // Wait for metadata to load before starting extraction
    }
  };

  const startExtraction = async () => {
    const video = videoRef.current;
    if (!video) return;
    
    // Revoke old frames
    frames.forEach(f => URL.revokeObjectURL(f.url));
    setFrames([]);
    setSelectedFrameIds(new Set());

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

    // Backup for undo
    bgBackupRef.current = targetFrames.map(f => ({ id: f.id, url: f.url, blob: f.blob }));

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
    setHasBgBackup(true);
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

    bgBackupRef.current = targetFrames.map(f => ({ id: f.id, url: f.url, blob: f.blob }));

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
    setHasBgBackup(true);
    setIsLoading(false);
    setProgress(0);
  };

  const undoBgRemoval = () => {
    if (bgBackupRef.current.length === 0) return;
    const backup = bgBackupRef.current;
    setFrames(prev => prev.map(f => {
      const b = backup.find(bk => bk.id === f.id);
      if (b) {
        URL.revokeObjectURL(f.url);
        return { ...f, url: b.url, blob: b.blob };
      }
      return f;
    }));
    bgBackupRef.current = [];
    setHasBgBackup(false);
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

    adjustBackupRef.current = targetFrames.map(f => ({ id: f.id, url: f.url, blob: f.blob }));

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
    setHasAdjustBackup(true);
    resetAdjustSliders();
    setIsLoading(false);
    setProgress(0);
  };

  const undoAdjustment = () => {
    if (adjustBackupRef.current.length === 0) return;
    const backup = adjustBackupRef.current;
    setFrames(prev => prev.map(f => {
      const b = backup.find(bk => bk.id === f.id);
      if (b) {
        URL.revokeObjectURL(f.url);
        return { ...f, url: b.url, blob: b.blob };
      }
      return f;
    }));
    adjustBackupRef.current = [];
    setHasAdjustBackup(false);
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
    const removedFrames = frames.filter(f => !keepIds.has(f.id));
    removedFrames.forEach(f => URL.revokeObjectURL(f.url));

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
    const frame = frames.find(f => f.id === id);
    if (frame) URL.revokeObjectURL(frame.url);
    setFrames(prev => prev.filter(f => f.id !== id));
    setSelectedFrameIds(prev => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    setDeleteTargetId(null);
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
      URL.revokeObjectURL(frame.url);
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

  // --- Export ---
  const handleExport = () => {
    if (activeFrames.length === 0) return;
    
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
      <div className="main-workspace">
        {/* LEFT AD */}
        <div className="ad-slot ad-slot-left" />

        {/* Hidden Video for processing */}
        <video 
            ref={videoRef} 
            style={{ display: 'none' }} 
            crossOrigin="anonymous" 
            playsInline 
            onLoadedMetadata={startExtraction}
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
                    <div className="row" style={{ marginLeft: 20, gap: 20 }}>
                        <div className="control-group" style={{ marginBottom: 0, width: 240 }}>
                            <label>{t.extractInterval} ({extractionInterval})</label>
                            <input
                               type="range"
                               min="1"
                               max="30"
                               value={extractionInterval}
                               onChange={(e) => setExtractionInterval(Number(e.target.value))}
                            />
                        </div>
                        <div className="control-group" style={{ marginBottom: 0, width: 240 }}>
                            <label>{t.dedupSensitivity} ({similarityThreshold}%)</label>
                            <input
                               type="range"
                               min="0"
                               max="90"
                               value={similarityThreshold}
                               onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                            />
                        </div>
                    </div>
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
                        <div style={{ marginLeft: 8 }}>
                           <span className="badge">{t.totalFrames}: {frames.length}</span>
                        </div>
                        <div className="flex-grow"></div>
                        <button className="btn btn-secondary" onClick={() => setSelectedFrameIds(new Set())}>{t.clearSelection}</button>
                        <button className="btn btn-secondary" onClick={() => setSelectedFrameIds(new Set(frames.map(f => f.id)))}>{t.selectAll}</button>
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
                            </div>
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
                                <button className="btn btn-secondary" onClick={bgMode === 'chroma' ? applyChromaKeyRemoval : applyBgRemoval} disabled={frames.length === 0 || hasBgBackup}>
                                    <span className="material-symbols-outlined">auto_fix</span>
                                    {t.bgRemoveApply}
                                </button>
                                <button className="btn btn-secondary" onClick={undoBgRemoval} disabled={!hasBgBackup}>
                                    <span className="material-symbols-outlined">undo</span>
                                    {t.bgRemoveUndo}
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
                                <button className="btn btn-secondary" onClick={undoAdjustment} disabled={!hasAdjustBackup} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>undo</span>
                                    {t.adjustUndo}
                                </button>
                                <button className="btn" onClick={applyAdjustment} disabled={frames.length === 0 || hasAdjustBackup || (adjustFilterStr === '' && adjustSharpen === 0)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
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
        <div className="sidebar" style={{ width: sidebarWidth }}>
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
        <div className="ad-slot ad-slot-right" />
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
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <img src={splitImageUrl} alt="Sprite Sheet" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, background: 'var(--bg-card)' }} />
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
                  frames.forEach(f => URL.revokeObjectURL(f.url));
                  bgBackupRef.current.forEach(b => URL.revokeObjectURL(b.url));
                  bgBackupRef.current = [];
                  adjustBackupRef.current.forEach(b => URL.revokeObjectURL(b.url));
                  adjustBackupRef.current = [];
                  setFrames([]);
                  setSelectedFrameIds(new Set());
                  setIsLoading(false);
                  setProgress(0);
                  setChromaColor(null);
                  setDedupResult(null);
                  setCurrentPreviewFrameIndex(0);
                  setExportColumns(0);
                  setFrameOrder([]);
                  setOnionSkinEnabled(false);
                  setOnionSkinOpacity(40);
                  setIsExportingGif(false);
                  setHasBgBackup(false);
                  setHasAdjustBackup(false);
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
                      {t.bgRemoveUndo}
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
    </>
  );
};

const RootLayout = () => {
  const { lang, setLang } = useContext(LangContext);
  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <Outlet />
    </>
  );
};

const SpriteWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <SpritePage lang={lang} t={t} />;
};

const EditorWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <PixelEditor lang={lang} t={t} />;
};

const LandingWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LandingPage lang={lang} t={t} />;
};

const PrivacyWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <PrivacyPage lang={lang} t={t} />;
};

const TermsWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <TermsPage lang={lang} t={t} />;
};

const AboutWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <AboutPage lang={lang} t={t} />;
};

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <LandingWrapper /> },
      { path: '/sprite', element: <SpriteWrapper /> },
      { path: '/editor', element: <EditorWrapper /> },
      { path: '/privacy', element: <PrivacyWrapper /> },
      { path: '/terms', element: <TermsWrapper /> },
      { path: '/about', element: <AboutWrapper /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const detectLang = (): Lang => {
  const nav = navigator.language || (navigator as unknown as Record<string, string>).userLanguage || '';
  return nav.startsWith('ko') ? 'ko' : 'en';
};

const Root = () => {
  const [lang, setLang] = useState<Lang>(detectLang);
  const t = i18n[lang];

  return (
    <LangContext.Provider value={{ lang, t, setLang }}>
      <RouterProvider router={router} />
    </LangContext.Provider>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Root />);
