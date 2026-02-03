import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

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

type Lang = 'ko' | 'en';

const i18n: Record<Lang, Record<string, string>> = {
  ko: {
    uploadVideo: '동영상 / GIF 업로드',
    newFile: '새 파일',
    totalFrames: '전체 프레임',
    clearSelection: '선택 해제',
    selectAll: '전체 선택',
    extractInterval: '추출 간격 (N프레임마다)',
    dedupSensitivity: '중복 제거 감도',
    uploadPrompt: '동영상이나 GIF를 업로드하여 스프라이트를 추출하세요',
    processing: '동영상 처리 중...',
    preview: '미리보기',
    pickingColor: '색상 선택 중...',
    noFrames: '프레임 없음',
    selfDedup: 'Self Deduplicate',
    threshold: '임계값',
    removeDuplicates: '중복 프레임 제거',
    processingDedup: '처리 중...',
    chromaKey: '크로마 키',
    transparentColor: '투명 색상',
    tolerance: '허용 범위',
    export: '내보내기',
    columns: '열 (0 = 자동)',
    selected: '선택됨',
    frames: '프레임',
    downloadSprite: '스프라이트 시트 다운로드',
    dedupRemoved: '개 중복 제거',
    dedupRemaining: '개 남음',
    dedupError: '처리 중 오류가 발생했습니다.',
    downloadGif: 'GIF 다운로드',
    onionSkin: '어니언 스킨',
    opacity: '투명도',
    importSpriteSheet: '시트 가져오기',
    splitRows: '행',
    splitCols: '열',
    splitFrames: '프레임 분리',
    cancel: '취소',
    exportingGif: 'GIF 생성 중...',
    deleteConfirm: '삭제하시겠습니까?',
    delete: '삭제',
    frameSize: '프레임 크기',
    scale: '비율',
    fixedSize: '고정',
  },
  en: {
    uploadVideo: 'Upload Video / GIF',
    newFile: 'New File',
    totalFrames: 'Total Frames',
    clearSelection: 'Clear Selection',
    selectAll: 'Select All',
    extractInterval: 'Extract Interval (Every N frames)',
    dedupSensitivity: 'Dedup Sensitivity',
    uploadPrompt: 'Upload a video or GIF to extract sprites',
    processing: 'Processing Video...',
    preview: 'Preview',
    pickingColor: 'Picking Color...',
    noFrames: 'No frames selected',
    selfDedup: 'Self Deduplicate',
    threshold: 'Threshold',
    removeDuplicates: 'Remove Duplicates',
    processingDedup: 'Processing...',
    chromaKey: 'Chroma Key',
    transparentColor: 'Transparent Color',
    tolerance: 'Tolerance',
    export: 'Export',
    columns: 'Columns (0 = Auto)',
    selected: 'Selected',
    frames: 'frames',
    downloadSprite: 'Download Sprite Sheet',
    dedupRemoved: ' duplicates removed',
    dedupRemaining: ' remaining',
    dedupError: 'An error occurred during processing.',
    downloadGif: 'Download GIF',
    onionSkin: 'Onion Skin',
    opacity: 'Opacity',
    importSpriteSheet: 'Import Sheet',
    splitRows: 'Rows',
    splitCols: 'Columns',
    splitFrames: 'Split Frames',
    cancel: 'Cancel',
    exportingGif: 'Generating GIF...',
    deleteConfirm: 'Delete this frame?',
    delete: 'Delete',
    frameSize: 'Frame Size',
    scale: 'Scale',
    fixedSize: 'Fixed',
  },
};

const App = () => {
  // Language
  const [lang, setLang] = useState<Lang>('ko');
  const t = i18n[lang];

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
  const [exportSizeMode, setExportSizeMode] = useState<'scale' | 'fixed'>('fixed');
  const [exportScale, setExportScale] = useState(100);
  const [exportFixedW, setExportFixedW] = useState(64);
  const [exportFixedH, setExportFixedH] = useState(64);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const lockedRatioRef = useRef(1); // W / H

  // Drag & Drop
  const [frameOrder, setFrameOrder] = useState<number[]>([]);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const draggedIdRef = useRef<number | null>(null);

  // Onion Skin
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(40);

  // Sprite Sheet Split
  const [splitMode, setSplitMode] = useState(false);
  const [splitImageUrl, setSplitImageUrl] = useState<string | null>(null);
  const [splitCols, setSplitCols] = useState(4);
  const [splitRows, setSplitRows] = useState(4);

  // Delete
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

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

      // Draw current frame (chroma key applied)
      const currentProcessed = processFrame(img);
      ctx.drawImage(currentProcessed, 0, 0);
    };

    drawFrame();
  }, [currentPreviewFrameIndex, activeFrames, chromaColor, chromaTolerance, onionSkinEnabled, onionSkinOpacity, loadImage, getExportSize]);


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
    if (!isPickingColor) return;
    
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const p = ctx.getImageData(x, y, 1, 1).data;
      const hex = "#" + ("000000" + ((p[0] << 16) | (p[1] << 8) | p[2]).toString(16)).slice(-6);
      setChromaColor(hex);
      setIsPickingColor(false);
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
      <div className="app-header">
        <div className="brand" style={{ cursor: 'pointer' }} onClick={() => {
          frames.forEach(f => URL.revokeObjectURL(f.url));
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
          if (splitImageUrl) URL.revokeObjectURL(splitImageUrl);
          setSplitImageUrl(null);
          setSplitMode(false);
          if (videoRef.current) videoRef.current.src = '';
        }}>
          <img src="/logo.png" alt="Spritfy" style={{ width: 42, height: 42 }} />
          <span style={{ fontFamily: "'DungGeunMo', monospace", fontSize: '1.5rem' }}>Spritfy.xyz</span>
        </div>
        <button
            className="btn btn-secondary"
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>translate</span>
            {lang === 'ko' ? 'EN' : '한국어'}
        </button>
      </div>

      <div className="main-workspace">
        {/* LEFT AD */}
        <div className="ad-slot ad-slot-left">
            <span className="ad-placeholder">AD</span>
        </div>

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
                    <div className="row" style={{ gap: 12 }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.frameSize}</label>
                        <div className="row" style={{ gap: 0 }}>
                            <button
                                className={`btn ${exportSizeMode === 'fixed' ? '' : 'btn-secondary'}`}
                                style={{ borderRadius: '6px 0 0 6px', padding: '6px 12px', fontSize: '0.8rem' }}
                                onClick={() => setExportSizeMode('fixed')}
                            >{t.fixedSize}</button>
                            <button
                                className={`btn ${exportSizeMode === 'scale' ? '' : 'btn-secondary'}`}
                                style={{ borderRadius: '0 6px 6px 0', padding: '6px 12px', fontSize: '0.8rem' }}
                                onClick={() => setExportSizeMode('scale')}
                            >{t.scale}</button>
                        </div>
                        {exportSizeMode === 'scale' ? (
                            <div className="row" style={{ gap: 8, width: 240 }}>
                                <input
                                    type="range"
                                    min="10"
                                    max="300"
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
                </>
             )}
          </div>

          <div className="frame-grid-scroll">
            {frames.length === 0 ? (
                <div className="empty-state">
                    <span className="material-symbols-outlined" style={{ fontSize: 48 }}>movie</span>
                    <p>{t.uploadPrompt}</p>
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
                    className={`preview-container ${isPickingColor ? 'picking' : ''}`} 
                    onClick={handlePreviewClick}
                >
                    {activeFrames.length > 0 && <canvas ref={previewCanvasRef} />}
                    {isPickingColor && <div className="eyedropper-active-indicator">{t.pickingColor}</div>}
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
                <h3>{t.chromaKey}</h3>
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
        <div className="ad-slot ad-slot-right">
            <span className="ad-placeholder">AD</span>
        </div>
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
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
