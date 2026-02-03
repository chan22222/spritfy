import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useBlocker } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';
import SEO from '@/seo.tsx';

// ===== Types =====
type RGBA = [number, number, number, number];
type ToolType = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  data: ImageData;
}

interface EditorFrame {
  id: string;
  layers: Layer[];
  activeLayerId: string;
}

interface HistorySnapshot {
  frameId: string;
  layers: Array<{ id: string; data: ImageData }>;
}

interface PalettePreset {
  name: string;
  colors: RGBA[];
}

// ===== Palette Presets =====
const PALETTE_PRESETS: PalettePreset[] = [
  {
    name: 'PICO-8',
    colors: [
      [0,0,0,255],[29,43,83,255],[126,37,83,255],[0,135,81,255],
      [171,82,54,255],[95,87,79,255],[194,195,199,255],[255,241,232,255],
      [255,0,77,255],[255,163,0,255],[255,236,39,255],[0,228,54,255],
      [41,173,255,255],[131,118,156,255],[255,119,168,255],[255,204,170,255],
    ],
  },
  {
    name: 'Game Boy',
    colors: [
      [15,56,15,255],[48,98,48,255],[139,172,15,255],[155,188,15,255],
    ],
  },
  {
    name: 'NES',
    colors: [
      [0,0,0,255],[252,252,252,255],[188,188,188,255],[124,124,124,255],
      [168,0,16,255],[228,0,88,255],[248,56,0,255],[228,92,16,255],
      [172,124,0,255],[0,184,0,255],[0,168,0,255],[0,168,68,255],
      [0,136,136,255],[248,120,88,255],[252,160,68,255],[248,184,0,255],
      [184,248,24,255],[88,216,84,255],[0,232,216,255],[104,136,252,255],
      [68,40,188,255],[148,0,132,255],[120,120,120,255],[252,160,176,255],
      [252,188,148,255],[252,216,108,255],[216,248,120,255],[120,248,168,255],
      [148,224,252,255],[176,176,252,255],[168,0,200,255],[196,60,132,255],
    ],
  },
  {
    name: 'Grayscale',
    colors: Array.from({ length: 16 }, (_, i) => {
      const v = Math.round(i * 255 / 15);
      return [v, v, v, 255] as RGBA;
    }),
  },
  {
    name: 'DB32',
    colors: [
      [0,0,0,255],[34,32,52,255],[69,40,60,255],[102,57,49,255],
      [143,86,59,255],[223,113,38,255],[217,160,102,255],[238,195,154,255],
      [251,242,54,255],[153,229,80,255],[106,190,48,255],[55,148,110,255],
      [75,105,47,255],[82,75,36,255],[50,60,57,255],[63,63,116,255],
      [48,96,130,255],[91,110,225,255],[99,155,255,255],[95,205,228,255],
      [203,219,252,255],[255,255,255,255],[155,173,183,255],[132,126,135,255],
      [105,106,106,255],[89,86,82,255],[118,66,138,255],[172,50,50,255],
      [217,87,99,255],[215,123,186,255],[143,151,74,255],[138,111,48,255],
    ],
  },
];

// ===== Utility Functions =====
const genId = (): string => Math.random().toString(36).slice(2, 10);

const rgbaToHex = (c: RGBA): string =>
  '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');

const hexToRgba = (hex: string, a: number = 255): RGBA => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    a,
  ];
};

const rgbaEqual = (a: RGBA, b: RGBA): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const createEmptyImageData = (w: number, h: number): ImageData =>
  new ImageData(w, h);

const cloneImageData = (src: ImageData): ImageData =>
  new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);

const createLayer = (w: number, h: number, name: string): Layer => ({
  id: genId(),
  name,
  visible: true,
  opacity: 100,
  locked: false,
  data: createEmptyImageData(w, h),
});

const createFrame = (w: number, h: number): EditorFrame => {
  const layer = createLayer(w, h, 'Layer 1');
  return { id: genId(), layers: [layer], activeLayerId: layer.id };
};

// ===== Drawing Algorithms =====
const setPixel = (data: Uint8ClampedArray, w: number, x: number, y: number, color: RGBA) => {
  if (x < 0 || y < 0 || x >= w) return;
  const idx = (y * w + x) * 4;
  if (idx < 0 || idx + 3 >= data.length) return;
  data[idx] = color[0];
  data[idx + 1] = color[1];
  data[idx + 2] = color[2];
  data[idx + 3] = color[3];
};

const blendPixel = (data: Uint8ClampedArray, w: number, x: number, y: number, color: RGBA) => {
  if (x < 0 || y < 0 || x >= w) return;
  const idx = (y * w + x) * 4;
  if (idx < 0 || idx + 3 >= data.length) return;
  const sa = color[3] / 255;
  if (sa >= 1) {
    data[idx] = color[0]; data[idx + 1] = color[1]; data[idx + 2] = color[2]; data[idx + 3] = 255;
    return;
  }
  if (sa <= 0) return;
  const da = data[idx + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  data[idx]     = Math.round((color[0] * sa + data[idx]     * da * (1 - sa)) / outA);
  data[idx + 1] = Math.round((color[1] * sa + data[idx + 1] * da * (1 - sa)) / outA);
  data[idx + 2] = Math.round((color[2] * sa + data[idx + 2] * da * (1 - sa)) / outA);
  data[idx + 3] = Math.round(outA * 255);
};

const getPixel = (data: Uint8ClampedArray, w: number, x: number, y: number): RGBA => {
  const idx = (y * w + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
};

const bresenhamLine = (
  x0: number, y0: number, x1: number, y1: number,
  cb: (x: number, y: number) => void,
) => {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;
  while (true) {
    cb(cx, cy);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
};

const floodFill = (imageData: ImageData, startX: number, startY: number, fillColor: RGBA) => {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;
  const target = getPixel(data, w, startX, startY);
  if (rgbaEqual(target, fillColor)) return;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [startX, startY];

  while (stack.length > 0) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    const pi = cy * w + cx;
    if (visited[pi]) continue;
    visited[pi] = 1;
    const cur = getPixel(data, w, cx, cy);
    if (!rgbaEqual(cur, target)) continue;
    setPixel(data, w, cx, cy, fillColor);
    if (cx > 0) stack.push(cx - 1, cy);
    if (cx < w - 1) stack.push(cx + 1, cy);
    if (cy > 0) stack.push(cx, cy - 1);
    if (cy < h - 1) stack.push(cx, cy + 1);
  }
};

const drawEllipse = (
  data: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number, rx: number, ry: number,
  color: RGBA, filled: boolean,
) => {
  if (rx <= 0 && ry <= 0) {
    setPixel(data, w, cx, cy, color);
    return;
  }
  if (rx === 0) {
    for (let y = cy - ry; y <= cy + ry; y++) setPixel(data, w, cx, y, color);
    return;
  }
  if (ry === 0) {
    for (let x = cx - rx; x <= cx + rx; x++) setPixel(data, w, x, cy, color);
    return;
  }

  let x = 0, y = ry;
  let rxSq = rx * rx, rySq = ry * ry;
  let p1 = rySq - rxSq * ry + 0.25 * rxSq;

  const plotPoints = (px: number, py: number) => {
    if (filled) {
      for (let xi = cx - px; xi <= cx + px; xi++) {
        setPixel(data, w, xi, cy + py, color);
        setPixel(data, w, xi, cy - py, color);
      }
    } else {
      setPixel(data, w, cx + px, cy + py, color);
      setPixel(data, w, cx - px, cy + py, color);
      setPixel(data, w, cx + px, cy - py, color);
      setPixel(data, w, cx - px, cy - py, color);
    }
  };

  while (2 * rySq * x <= 2 * rxSq * y) {
    plotPoints(x, y);
    x++;
    if (p1 < 0) {
      p1 += 2 * rySq * x + rySq;
    } else {
      y--;
      p1 += 2 * rySq * x - 2 * rxSq * y + rySq;
    }
  }

  let p2 = rySq * (x + 0.5) * (x + 0.5) + rxSq * (y - 1) * (y - 1) - rxSq * rySq;
  while (y >= 0) {
    plotPoints(x, y);
    y--;
    if (p2 > 0) {
      p2 -= 2 * rxSq * y + rxSq;
    } else {
      x++;
      p2 += 2 * rySq * x - 2 * rxSq * y + rxSq;
    }
  }
};

const drawRect = (
  data: Uint8ClampedArray, w: number,
  x0: number, y0: number, x1: number, y1: number,
  color: RGBA, filled: boolean,
) => {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  if (filled) {
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++)
        setPixel(data, w, x, y, color);
  } else {
    for (let x = minX; x <= maxX; x++) {
      setPixel(data, w, x, minY, color);
      setPixel(data, w, x, maxY, color);
    }
    for (let y = minY; y <= maxY; y++) {
      setPixel(data, w, minX, y, color);
      setPixel(data, w, maxX, y, color);
    }
  }
};

// ===== Shape outline iterators =====
const forEachRectOutlinePoint = (
  x0: number, y0: number, x1: number, y1: number,
  cb: (x: number, y: number) => void,
) => {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  for (let x = minX; x <= maxX; x++) {
    cb(x, minY);
    if (minY !== maxY) cb(x, maxY);
  }
  for (let y = minY + 1; y < maxY; y++) {
    cb(minX, y);
    if (minX !== maxX) cb(maxX, y);
  }
};

const forEachEllipseOutlinePoint = (
  cx: number, cy: number, rx: number, ry: number,
  cb: (x: number, y: number) => void,
) => {
  if (rx <= 0 && ry <= 0) { cb(cx, cy); return; }
  if (rx === 0) { for (let y = cy - ry; y <= cy + ry; y++) cb(cx, y); return; }
  if (ry === 0) { for (let x = cx - rx; x <= cx + rx; x++) cb(x, cy); return; }

  let x = 0, y = ry;
  const rxSq = rx * rx, rySq = ry * ry;
  let p1 = rySq - rxSq * ry + 0.25 * rxSq;

  const plot = (px: number, py: number) => {
    cb(cx + px, cy + py);
    cb(cx - px, cy + py);
    cb(cx + px, cy - py);
    cb(cx - px, cy - py);
  };

  while (2 * rySq * x <= 2 * rxSq * y) {
    plot(x, y);
    x++;
    if (p1 < 0) { p1 += 2 * rySq * x + rySq; }
    else { y--; p1 += 2 * rySq * x - 2 * rxSq * y + rySq; }
  }
  let p2 = rySq * (x + 0.5) * (x + 0.5) + rxSq * (y - 1) * (y - 1) - rxSq * rySq;
  while (y >= 0) {
    plot(x, y);
    y--;
    if (p2 > 0) { p2 -= 2 * rxSq * y + rxSq; }
    else { x++; p2 += 2 * rySq * x - 2 * rxSq * y + rxSq; }
  }
};

// ===== Layer Compositing =====
const compositeAllLayers = (layers: Layer[], w: number, h: number): ImageData => {
  const result = new ImageData(w, h);
  const dst = result.data;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const src = layer.data.data;
    const la = layer.opacity / 100;
    for (let i = 0; i < src.length; i += 4) {
      const sa = (src[i + 3] / 255) * la;
      if (sa === 0) continue;
      const da = dst[i + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA > 0) {
        dst[i] = Math.round((src[i] * sa + dst[i] * da * (1 - sa)) / outA);
        dst[i + 1] = Math.round((src[i + 1] * sa + dst[i + 1] * da * (1 - sa)) / outA);
        dst[i + 2] = Math.round((src[i + 2] * sa + dst[i + 2] * da * (1 - sa)) / outA);
        dst[i + 3] = Math.round(outA * 255);
      }
    }
  }
  return result;
};

// ===== Apply with symmetry =====
const applyWithSymmetry = (
  x: number, y: number, w: number, h: number,
  symH: boolean, symV: boolean,
  action: (px: number, py: number) => void,
) => {
  action(x, y);
  if (symH) action(w - 1 - x, y);
  if (symV) action(x, h - 1 - y);
  if (symH && symV) action(w - 1 - x, h - 1 - y);
};

// ===== Brush pixel calculation (even sizes offset center between 4 pixels) =====
const getBrushOffsets = (size: number): [number, number][] => {
  if (size <= 1) return [[0, 0]];
  const offsets: [number, number][] = [];
  const r = size / 2;
  const rSq = r * r;
  const even = size % 2 === 0;
  const lo = even ? Math.ceil(-r) + 1 : Math.ceil(-r);
  const hi = even ? Math.floor(r) : Math.floor(r);
  for (let dy = lo; dy <= hi; dy++) {
    for (let dx = lo; dx <= hi; dx++) {
      const ddx = even ? dx - 0.5 : dx;
      const ddy = even ? dy - 0.5 : dy;
      if (ddx * ddx + ddy * ddy <= rSq) {
        offsets.push([dx, dy]);
      }
    }
  }
  return offsets;
};

// ===== Brush stamp =====
const stampBrush = (
  data: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number, brushSize: number, color: RGBA,
  symH: boolean, symV: boolean,
  erase: boolean = false,
) => {
  const offsets = getBrushOffsets(brushSize);
  const paint = erase ? setPixel : blendPixel;
  for (const [dx, dy] of offsets) {
    applyWithSymmetry(cx + dx, cy + dy, w, h, symH, symV, (px, py) => {
      if (px >= 0 && py >= 0 && px < w && py < h) paint(data, w, px, py, color);
    });
  }
};

// ===== Main Component =====
export const PixelEditor: React.FC<{ lang: Lang; t: Record<string, string> }> = ({ lang, t }) => {
  // Canvas dimensions
  const [canvasWidth, setCanvasWidth] = useState(32);
  const [canvasHeight, setCanvasHeight] = useState(32);

  // Frames & layers
  const [frames, setFrames] = useState<EditorFrame[]>(() => [createFrame(32, 32)]);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  // Tool state
  const [activeTool, setActiveTool] = useState<ToolType>('pencil');
  const [primaryColor, setPrimaryColor] = useState<RGBA>([0, 0, 0, 255]);
  const [secondaryColor, setSecondaryColor] = useState<RGBA>([255, 255, 255, 255]);
  const [brushSize, setBrushSize] = useState(1);
  const [symmetryH, setSymmetryH] = useState(false);
  const [symmetryV, setSymmetryV] = useState(false);

  // View
  const [zoom, setZoom] = useState(12);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);

  // Palette
  const [selectedPreset, setSelectedPreset] = useState(0);
  const palette = PALETTE_PRESETS[selectedPreset].colors;

  // Animation
  const [fps, setFps] = useState(12);
  const [isPlaying, setIsPlaying] = useState(false);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(30);

  // History
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // UI state
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number } | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editLayerName, setEditLayerName] = useState('');
  const [showNewCanvasModal, setShowNewCanvasModal] = useState(false);
  const [newW, setNewW] = useState(32);
  const [newH, setNewH] = useState(32);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; frameIndex: number } | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showDeleteLayerConfirm, setShowDeleteLayerConfirm] = useState(false);

  // Drawing refs
  const isDrawingRef = useRef(false);
  const lastPixelRef = useRef<{ x: number; y: number } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const spaceHeldRef = useRef(false);
  const shiftHeldRef = useRef(false);
  const drawButtonRef = useRef(0);

  // Canvas refs
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const timelineCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Derived
  const activeFrame = frames[activeFrameIndex];
  const activeLayer = activeFrame?.layers.find(l => l.id === activeFrame.activeLayerId) ?? null;
  const activeLayerIndex = activeFrame?.layers.findIndex(l => l.id === activeFrame.activeLayerId) ?? -1;

  const isLayerEmpty = useCallback((layer: Layer): boolean => {
    const d = layer.data.data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] !== 0) return false;
    }
    return true;
  }, []);

  // ===== History =====
  const getMaxHistory = useCallback(() => {
    const bytesPerSnapshot = canvasWidth * canvasHeight * 4 * (activeFrame?.layers.length ?? 1);
    return Math.max(10, Math.floor((20 * 1024 * 1024) / bytesPerSnapshot));
  }, [canvasWidth, canvasHeight, activeFrame?.layers.length]);

  const pushHistory = useCallback(() => {
    if (!activeFrame) return;
    const snapshot: HistorySnapshot = {
      frameId: activeFrame.id,
      layers: activeFrame.layers.map(l => ({ id: l.id, data: cloneImageData(l.data) })),
    };
    setUndoStack(prev => {
      const next = [...prev, snapshot];
      const max = getMaxHistory();
      if (next.length > max) next.splice(0, next.length - max);
      return next;
    });
    setRedoStack([]);
    setIsDirty(true);
  }, [activeFrame, getMaxHistory]);

  const performUndo = useCallback(() => {
    if (undoStack.length === 0 || !activeFrame) return;
    const current: HistorySnapshot = {
      frameId: activeFrame.id,
      layers: activeFrame.layers.map(l => ({ id: l.id, data: cloneImageData(l.data) })),
    };
    const snapshot = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, current]);
    setFrames(prev => prev.map(f => {
      if (f.id !== snapshot.frameId) return f;
      return {
        ...f,
        layers: f.layers.map(l => {
          const saved = snapshot.layers.find(s => s.id === l.id);
          return saved ? { ...l, data: cloneImageData(saved.data) } : l;
        }),
      };
    }));
  }, [undoStack, activeFrame]);

  const performRedo = useCallback(() => {
    if (redoStack.length === 0 || !activeFrame) return;
    const current: HistorySnapshot = {
      frameId: activeFrame.id,
      layers: activeFrame.layers.map(l => ({ id: l.id, data: cloneImageData(l.data) })),
    };
    const snapshot = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, current]);
    setFrames(prev => prev.map(f => {
      if (f.id !== snapshot.frameId) return f;
      return {
        ...f,
        layers: f.layers.map(l => {
          const saved = snapshot.layers.find(s => s.id === l.id);
          return saved ? { ...l, data: cloneImageData(saved.data) } : l;
        }),
      };
    }));
  }, [redoStack, activeFrame]);

  // ===== Rendering =====
  const renderAll = useCallback(() => {
    if (!activeFrame) return;
    const w = canvasWidth;
    const h = canvasHeight;

    // Background canvas (checkerboard)
    const bgCanvas = bgCanvasRef.current;
    if (bgCanvas) {
      bgCanvas.width = w;
      bgCanvas.height = h;
      const bgCtx = bgCanvas.getContext('2d')!;
      const cellSize = 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          bgCtx.fillStyle = (x + y) % 2 === 0 ? '#b0b0b0' : '#a8a8a8';
          bgCtx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // Main canvas (composited layers)
    const mainCanvas = mainCanvasRef.current;
    if (mainCanvas) {
      mainCanvas.width = w;
      mainCanvas.height = h;
      const ctx = mainCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);

      // Onion skin: previous frame
      if (onionSkinEnabled && activeFrameIndex > 0) {
        const prevFrame = frames[activeFrameIndex - 1];
        const prevComposite = compositeAllLayers(prevFrame.layers, w, h);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = w;
        tmpCanvas.height = h;
        const tmpCtx = tmpCanvas.getContext('2d')!;
        tmpCtx.putImageData(prevComposite, 0, 0);
        ctx.globalAlpha = onionSkinOpacity / 100;
        ctx.drawImage(tmpCanvas, 0, 0);
        ctx.globalAlpha = 1;
      }

      const composited = compositeAllLayers(activeFrame.layers, w, h);
      const tmpCanvas2 = document.createElement('canvas');
      tmpCanvas2.width = w;
      tmpCanvas2.height = h;
      tmpCanvas2.getContext('2d')!.putImageData(composited, 0, 0);
      ctx.drawImage(tmpCanvas2, 0, 0);
    }

    // Overlay canvas (grid)
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      overlayCanvas.width = w;
      overlayCanvas.height = h;
      const ctx = overlayCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);

      if (showGrid && zoom >= 4) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1 / zoom;
        for (let x = 0; x <= w; x++) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y <= h; y++) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      const isShapeTool = activeTool === 'line' || activeTool === 'rect' || activeTool === 'ellipse';

      // Shape preview during active drawing
      if (isDrawingRef.current && drawStartRef.current && lastPixelRef.current && isShapeTool) {
        const previewData = createEmptyImageData(w, h);
        const s = drawStartRef.current;
        const lp = lastPixelRef.current;
        const col = primaryColor;
        const shift = shiftHeldRef.current;

        if (activeTool === 'line') {
          bresenhamLine(s.x, s.y, lp.x, lp.y, (px, py) => {
            if (px >= 0 && py >= 0 && px < w && py < h)
              stampBrush(previewData.data, w, h, px, py, brushSize, col, false, false);
          });
        } else if (activeTool === 'rect') {
          if (shift) {
            drawRect(previewData.data, w, s.x, s.y, lp.x, lp.y, col, true);
          } else {
            forEachRectOutlinePoint(s.x, s.y, lp.x, lp.y, (px, py) => {
              if (px >= 0 && py >= 0 && px < w && py < h)
                stampBrush(previewData.data, w, h, px, py, brushSize, col, false, false);
            });
          }
        } else if (activeTool === 'ellipse') {
          const crx = Math.abs(lp.x - s.x);
          const cry = Math.abs(lp.y - s.y);
          const ccx = Math.round((s.x + lp.x) / 2);
          const ccy = Math.round((s.y + lp.y) / 2);
          if (shift) {
            drawEllipse(previewData.data, w, h, ccx, ccy, Math.floor(crx / 2), Math.floor(cry / 2), col, true);
          } else {
            forEachEllipseOutlinePoint(ccx, ccy, Math.floor(crx / 2), Math.floor(cry / 2), (px, py) => {
              if (px >= 0 && py >= 0 && px < w && py < h)
                stampBrush(previewData.data, w, h, px, py, brushSize, col, false, false);
            });
          }
        }

        const tmpC = document.createElement('canvas');
        tmpC.width = w; tmpC.height = h;
        tmpC.getContext('2d')!.putImageData(previewData, 0, 0);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(tmpC, 0, 0);
        ctx.globalAlpha = 1;
      }
      // Brush preview (not for eyedropper or fill, not during shape drawing)
      else if (mouseCoords && mouseCoords.x >= 0 && mouseCoords.x < w && mouseCoords.y >= 0 && mouseCoords.y < h
               && activeTool !== 'eyedropper' && activeTool !== 'fill') {
        const bx = mouseCoords.x;
        const by = mouseCoords.y;
        const previewColor = activeTool === 'eraser'
          ? 'rgba(255,0,0,0.35)'
          : `rgba(${primaryColor[0]},${primaryColor[1]},${primaryColor[2]},0.55)`;

        const offsets = getBrushOffsets(brushSize);
        ctx.fillStyle = previewColor;
        for (const [dx, dy] of offsets) {
          const px = bx + dx, py = by + dy;
          if (px >= 0 && py >= 0 && px < w && py < h) {
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
  }, [activeFrame, activeFrameIndex, canvasWidth, canvasHeight, frames, onionSkinEnabled, onionSkinOpacity, showGrid, zoom, mouseCoords, brushSize, activeTool, primaryColor]);

  useEffect(() => {
    renderAll();
  }, [renderAll]);

  // Render timeline thumbnails
  useEffect(() => {
    frames.forEach(frame => {
      const canvas = timelineCanvasRefs.current.get(frame.id);
      if (!canvas) return;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d')!;
      const composited = compositeAllLayers(frame.layers, canvasWidth, canvasHeight);
      const tmp = document.createElement('canvas');
      tmp.width = canvasWidth;
      tmp.height = canvasHeight;
      tmp.getContext('2d')!.putImageData(composited, 0, 0);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.drawImage(tmp, 0, 0);
    });
  }, [frames, canvasWidth, canvasHeight]);

  // Center canvas on mount / resize
  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const cw = canvasWidth * zoom;
    const ch = canvasHeight * zoom;
    setPan({
      x: Math.round((rect.width - cw) / 2),
      y: Math.round((rect.height - ch) / 2),
    });
  }, [canvasWidth, canvasHeight, zoom]);

  // ===== Animation Playback =====
  const fpsRef = useRef(fps);
  fpsRef.current = fps;
  const framesLenRef = useRef(frames.length);
  framesLenRef.current = frames.length;

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;
    let lastTime = performance.now();
    let rafId: number;
    const animate = (time: number) => {
      const interval = 1000 / fpsRef.current;
      if (time - lastTime >= interval) {
        setActiveFrameIndex(prev => (prev + 1) % framesLenRef.current);
        lastTime = time;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, frames.length]);

  // ===== Pixel Coordinate Conversion =====
  const getPixelCoord = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const area = canvasAreaRef.current;
    if (!area) return { x: -1, y: -1 };
    const rect = area.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    return {
      x: Math.floor((mx - pan.x) / zoom),
      y: Math.floor((my - pan.y) / zoom),
    };
  }, [pan, zoom]);

  // ===== Drawing Handlers =====
  const handlePointerDown = useCallback((e: React.MouseEvent) => {
    if (!activeLayer || activeLayer.locked) return;

    // Pan with middle mouse or space+left click
    if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
      isPanningRef.current = true;
      panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;

    const { x, y } = getPixelCoord(e);
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return;

    const color: RGBA = e.button === 2 ? secondaryColor : primaryColor;

    if (activeTool === 'eyedropper') {
      const composited = compositeAllLayers(activeFrame!.layers, canvasWidth, canvasHeight);
      const picked = getPixel(composited.data, canvasWidth, x, y);
      if (e.button === 2) setSecondaryColor(picked);
      else setPrimaryColor(picked);
      return;
    }

    if (activeTool === 'fill') {
      pushHistory();
      const newData = cloneImageData(activeLayer.data);
      floodFill(newData, x, y, color);
      setFrames(prev => prev.map((f, fi) => {
        if (fi !== activeFrameIndex) return f;
        return { ...f, layers: f.layers.map(l => l.id === activeLayer.id ? { ...l, data: newData } : l) };
      }));
      return;
    }

    drawButtonRef.current = e.button;

    if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'ellipse') {
      pushHistory();
      isDrawingRef.current = true;
      drawStartRef.current = { x, y };
      lastPixelRef.current = { x, y };
      return;
    }

    // Pencil / eraser
    pushHistory();
    isDrawingRef.current = true;
    lastPixelRef.current = { x, y };

    const isEraser = activeTool === 'eraser';
    const drawColor: RGBA = isEraser ? [0, 0, 0, 0] : color;
    const newData = cloneImageData(activeLayer.data);
    stampBrush(newData.data, canvasWidth, canvasHeight, x, y, brushSize, drawColor, symmetryH, symmetryV, isEraser);
    setFrames(prev => prev.map((f, fi) => {
      if (fi !== activeFrameIndex) return f;
      return { ...f, layers: f.layers.map(l => l.id === activeLayer.id ? { ...l, data: newData } : l) };
    }));
  }, [activeLayer, activeFrame, activeFrameIndex, activeTool, primaryColor, secondaryColor, brushSize, canvasWidth, canvasHeight, getPixelCoord, pan, pushHistory, symmetryH, symmetryV]);

  const handlePointerMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getPixelCoord(e);
    setMouseCoords(x >= 0 && y >= 0 && x < canvasWidth && y < canvasHeight ? { x, y } : null);

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mx;
      const dy = e.clientY - panStartRef.current.my;
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
      return;
    }

    if (!isDrawingRef.current || !activeLayer || activeLayer.locked) return;
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return;

    if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'ellipse') {
      lastPixelRef.current = { x, y };
      shiftHeldRef.current = e.shiftKey;
      return;
    }

    // Pencil / eraser - draw line from last to current
    const last = lastPixelRef.current;
    if (!last || (last.x === x && last.y === y)) return;

    const isErase = activeTool === 'eraser';
    const activeColor = drawButtonRef.current === 2 ? secondaryColor : primaryColor;
    const drawColor: RGBA = isErase ? [0, 0, 0, 0] : activeColor;
    setFrames(prev => prev.map((f, fi) => {
      if (fi !== activeFrameIndex) return f;
      const layer = f.layers.find(l => l.id === activeFrame!.activeLayerId);
      if (!layer) return f;
      const newData = cloneImageData(layer.data);
      bresenhamLine(last.x, last.y, x, y, (px, py) => {
        if (px >= 0 && py >= 0 && px < canvasWidth && py < canvasHeight) {
          stampBrush(newData.data, canvasWidth, canvasHeight, px, py, brushSize, drawColor, symmetryH, symmetryV, isErase);
        }
      });
      return { ...f, layers: f.layers.map(l => l.id === layer.id ? { ...l, data: newData } : l) };
    }));
    lastPixelRef.current = { x, y };
  }, [activeLayer, activeFrame, activeFrameIndex, activeTool, primaryColor, secondaryColor, brushSize, canvasWidth, canvasHeight, getPixelCoord, showGrid, zoom, symmetryH, symmetryV]);

  const handlePointerUp = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if ((activeTool === 'line' || activeTool === 'rect' || activeTool === 'ellipse') && drawStartRef.current && activeLayer) {
      const s = drawStartRef.current;
      const { x, y } = getPixelCoord(e);
      const ex = Math.max(0, Math.min(canvasWidth - 1, x));
      const ey = Math.max(0, Math.min(canvasHeight - 1, y));
      const col = drawButtonRef.current === 2 ? secondaryColor : primaryColor;

      setFrames(prev => prev.map((f, fi) => {
        if (fi !== activeFrameIndex) return f;
        const layer = f.layers.find(l => l.id === activeFrame!.activeLayerId);
        if (!layer) return f;
        const newData = cloneImageData(layer.data);

        if (activeTool === 'line') {
          bresenhamLine(s.x, s.y, ex, ey, (px, py) => {
            if (px >= 0 && py >= 0 && px < canvasWidth && py < canvasHeight) {
              stampBrush(newData.data, canvasWidth, canvasHeight, px, py, brushSize, col, symmetryH, symmetryV);
            }
          });
        } else if (activeTool === 'rect') {
          if (e.shiftKey) {
            drawRect(newData.data, canvasWidth, s.x, s.y, ex, ey, col, true);
          } else {
            forEachRectOutlinePoint(s.x, s.y, ex, ey, (px, py) => {
              if (px >= 0 && py >= 0 && px < canvasWidth && py < canvasHeight)
                stampBrush(newData.data, canvasWidth, canvasHeight, px, py, brushSize, col, symmetryH, symmetryV);
            });
          }
        } else if (activeTool === 'ellipse') {
          const crx = Math.abs(ex - s.x);
          const cry = Math.abs(ey - s.y);
          const ccx = Math.round((s.x + ex) / 2);
          const ccy = Math.round((s.y + ey) / 2);
          if (e.shiftKey) {
            drawEllipse(newData.data, canvasWidth, canvasHeight, ccx, ccy, Math.floor(crx / 2), Math.floor(cry / 2), col, true);
          } else {
            forEachEllipseOutlinePoint(ccx, ccy, Math.floor(crx / 2), Math.floor(cry / 2), (px, py) => {
              if (px >= 0 && py >= 0 && px < canvasWidth && py < canvasHeight)
                stampBrush(newData.data, canvasWidth, canvasHeight, px, py, brushSize, col, symmetryH, symmetryV);
            });
          }
        }
        return { ...f, layers: f.layers.map(l => l.id === layer.id ? { ...l, data: newData } : l) };
      }));
    }

    drawStartRef.current = null;
    lastPixelRef.current = null;
    renderAll();
  }, [activeTool, activeLayer, activeFrame, activeFrameIndex, primaryColor, secondaryColor, brushSize, canvasWidth, canvasHeight, getPixelCoord, renderAll, symmetryH, symmetryV]);

  // ===== Zoom (Scroll Wheel) =====
  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      setZoom(prev => Math.max(1, Math.min(64, prev + delta)));
    };
    area.addEventListener('wheel', handleWheel, { passive: false });
    return () => area.removeEventListener('wheel', handleWheel);
  }, []);

  // ===== Layer Operations =====
  const addLayer = useCallback(() => {
    setFrames(prev => prev.map((f, fi) => {
      if (fi !== activeFrameIndex) return f;
      const newLayer = createLayer(canvasWidth, canvasHeight, `Layer ${f.layers.length + 1}`);
      return { ...f, layers: [...f.layers, newLayer], activeLayerId: newLayer.id };
    }));
  }, [activeFrameIndex, canvasWidth, canvasHeight]);

  const removeLayer = useCallback(() => {
    if (!activeFrame || activeFrame.layers.length <= 1) return;
    pushHistory();
    setFrames(prev => prev.map((f, fi) => {
      if (fi !== activeFrameIndex) return f;
      const newLayers = f.layers.filter(l => l.id !== f.activeLayerId);
      return { ...f, layers: newLayers, activeLayerId: newLayers[newLayers.length - 1].id };
    }));
  }, [activeFrame, activeFrameIndex, pushHistory]);

  const moveLayer = useCallback((dir: 'up' | 'down') => {
    setFrames(prev => prev.map((f, fi) => {
      if (fi !== activeFrameIndex) return f;
      const idx = f.layers.findIndex(l => l.id === f.activeLayerId);
      if (idx < 0) return f;
      const newIdx = dir === 'up' ? idx + 1 : idx - 1;
      if (newIdx < 0 || newIdx >= f.layers.length) return f;
      const newLayers = [...f.layers];
      [newLayers[idx], newLayers[newIdx]] = [newLayers[newIdx], newLayers[idx]];
      return { ...f, layers: newLayers };
    }));
  }, [activeFrameIndex]);

  const mergeDown = useCallback(() => {
    if (!activeFrame || activeLayerIndex <= 0) return;
    pushHistory();
    setFrames(prev => prev.map((f, fi) => {
      if (fi !== activeFrameIndex) return f;
      const idx = f.layers.findIndex(l => l.id === f.activeLayerId);
      if (idx <= 0) return f;
      const upper = f.layers[idx];
      const lower = f.layers[idx - 1];
      const merged = cloneImageData(lower.data);
      const src = upper.data.data;
      const dst = merged.data;
      const la = upper.opacity / 100;
      for (let i = 0; i < src.length; i += 4) {
        const sa = (src[i + 3] / 255) * la;
        if (sa === 0) continue;
        const da = dst[i + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA > 0) {
          dst[i] = Math.round((src[i] * sa + dst[i] * da * (1 - sa)) / outA);
          dst[i + 1] = Math.round((src[i + 1] * sa + dst[i + 1] * da * (1 - sa)) / outA);
          dst[i + 2] = Math.round((src[i + 2] * sa + dst[i + 2] * da * (1 - sa)) / outA);
          dst[i + 3] = Math.round(outA * 255);
        }
      }
      const newLayers = f.layers.filter((_, i2) => i2 !== idx);
      newLayers[idx - 1] = { ...lower, data: merged };
      return { ...f, layers: newLayers, activeLayerId: lower.id };
    }));
  }, [activeFrame, activeFrameIndex, activeLayerIndex, pushHistory]);

  // ===== Frame Operations =====
  const addFrame = useCallback(() => {
    const newFrame = createFrame(canvasWidth, canvasHeight);
    setFrames(prev => [...prev, newFrame]);
    setActiveFrameIndex(frames.length);
  }, [canvasWidth, canvasHeight, frames.length]);

  const duplicateFrame = useCallback(() => {
    if (!activeFrame) return;
    const dup: EditorFrame = {
      id: genId(),
      layers: activeFrame.layers.map(l => ({ ...l, id: genId(), data: cloneImageData(l.data) })),
      activeLayerId: '',
    };
    dup.activeLayerId = dup.layers[activeFrame.layers.findIndex(l => l.id === activeFrame.activeLayerId)]?.id ?? dup.layers[0].id;
    setFrames(prev => {
      const next = [...prev];
      next.splice(activeFrameIndex + 1, 0, dup);
      return next;
    });
    setActiveFrameIndex(activeFrameIndex + 1);
  }, [activeFrame, activeFrameIndex]);

  const deleteFrame = useCallback(() => {
    if (frames.length <= 1) return;
    setFrames(prev => prev.filter((_, i) => i !== activeFrameIndex));
    setActiveFrameIndex(prev => Math.min(prev, frames.length - 2));
  }, [activeFrameIndex, frames.length]);

  const duplicateFrameAt = useCallback((index: number) => {
    const frame = frames[index];
    if (!frame) return;
    const dup: EditorFrame = {
      id: genId(),
      layers: frame.layers.map(l => ({ ...l, id: genId(), data: cloneImageData(l.data) })),
      activeLayerId: '',
    };
    dup.activeLayerId = dup.layers[frame.layers.findIndex(l => l.id === frame.activeLayerId)]?.id ?? dup.layers[0].id;
    setFrames(prev => {
      const next = [...prev];
      next.splice(index + 1, 0, dup);
      return next;
    });
    setActiveFrameIndex(index + 1);
  }, [frames]);

  const deleteFrameAt = useCallback((index: number) => {
    if (frames.length <= 1) return;
    setFrames(prev => prev.filter((_, i) => i !== index));
    setActiveFrameIndex(prev => Math.min(prev, frames.length - 2));
  }, [frames.length]);

  const moveFrame = useCallback((index: number, dir: 'left' | 'right') => {
    const newIdx = dir === 'left' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= frames.length) return;
    setFrames(prev => {
      const next = [...prev];
      [next[index], next[newIdx]] = [next[newIdx], next[index]];
      return next;
    });
    if (activeFrameIndex === index) setActiveFrameIndex(newIdx);
    else if (activeFrameIndex === newIdx) setActiveFrameIndex(index);
  }, [frames.length, activeFrameIndex]);

  // ===== Keyboard Shortcuts =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spaceHeldRef.current = true;
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); performUndo(); return; }
        if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); performRedo(); return; }
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          // Tools
          case 'b': setActiveTool('pencil'); break;
          case 'e': setActiveTool('eraser'); break;
          case 'g': setActiveTool('fill'); break;
          case 'i': setActiveTool('eyedropper'); break;
          case 'l': setActiveTool('line'); break;
          case 'u': setActiveTool('rect'); break;
          case 'o': setActiveTool('ellipse'); break;
          // Color swap
          case 'x':
            setPrimaryColor(prev => {
              const old = prev;
              setSecondaryColor(old);
              return secondaryColor;
            });
            break;
          // Brush size
          case '[': setBrushSize(prev => Math.max(1, prev - 1)); break;
          case ']': setBrushSize(prev => Math.min(16, prev + 1)); break;
          // Frames
          case 'n': addFrame(); break;
          case 'd': duplicateFrame(); break;
          // Frame navigation
          case ',': case 'arrowleft': setActiveFrameIndex(prev => Math.max(0, prev - 1)); break;
          case '.': case 'arrowright': setActiveFrameIndex(prev => Math.min(frames.length - 1, prev + 1)); break;
          // Playback
          case 'p': setIsPlaying(prev => !prev); break;
          // Grid
          case 'h': setShowGrid(prev => !prev); break;
          // Symmetry
          case 's': setSymmetryH(prev => !prev); break;
          case 'v': setSymmetryV(prev => !prev); break;
          // Delete frame
          case 'delete': if (frames.length > 1) setDeleteConfirmIndex(activeFrameIndex); break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [performUndo, performRedo, secondaryColor, addFrame, duplicateFrame, frames.length]);

  // ===== Export =====
  const exportPng = useCallback(() => {
    if (!activeFrame) return;
    const composited = compositeAllLayers(activeFrame.layers, canvasWidth, canvasHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.getContext('2d')!.putImageData(composited, 0, 0);
    const link = document.createElement('a');
    link.download = 'pixel-art.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [activeFrame, canvasWidth, canvasHeight]);

  const exportSpriteSheet = useCallback(() => {
    const cols = Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * canvasWidth;
    canvas.height = rows * canvasHeight;
    const ctx = canvas.getContext('2d')!;
    frames.forEach((frame, i) => {
      const composited = compositeAllLayers(frame.layers, canvasWidth, canvasHeight);
      const tmp = document.createElement('canvas');
      tmp.width = canvasWidth;
      tmp.height = canvasHeight;
      tmp.getContext('2d')!.putImageData(composited, 0, 0);
      const col = i % cols;
      const row = Math.floor(i / cols);
      ctx.drawImage(tmp, col * canvasWidth, row * canvasHeight);
    });
    const link = document.createElement('a');
    link.download = 'sprite-sheet.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [frames, canvasWidth, canvasHeight]);

  const exportGif = useCallback(async () => {
    try {
      const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
      const gif = GIFEncoder();
      const delay = Math.round(1000 / fps);
      for (const frame of frames) {
        const composited = compositeAllLayers(frame.layers, canvasWidth, canvasHeight);
        const rgba = composited.data;
        const pal = quantize(rgba, 256);
        const idx = applyPalette(rgba, pal);
        gif.writeFrame(idx, canvasWidth, canvasHeight, { palette: pal, delay, transparent: true, transparentIndex: 0 });
      }
      gif.finish();
      const blob = new Blob([gif.bytes()], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'animation.gif';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // gifenc not available
    }
  }, [frames, canvasWidth, canvasHeight, fps]);

  // ===== Unsaved changes guard =====
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const blocker = useBlocker(isDirty);

  // ===== New Canvas =====
  const handleNewCanvas = useCallback(() => {
    const w = Math.max(1, Math.min(256, newW));
    const h = Math.max(1, Math.min(256, newH));
    setCanvasWidth(w);
    setCanvasHeight(h);
    setFrames([createFrame(w, h)]);
    setActiveFrameIndex(0);
    setUndoStack([]);
    setRedoStack([]);
    setShowNewCanvasModal(false);
    setIsDirty(false);
  }, [newW, newH]);

  // ===== Context Menu Prevention =====
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ===== Tool definitions for toolbar =====
  const tools: { type: ToolType; icon: string; key: string }[] = [
    { type: 'pencil', icon: 'edit', key: 'B' },
    { type: 'eraser', icon: 'ink_eraser', key: 'E' },
    { type: 'fill', icon: 'format_color_fill', key: 'G' },
    { type: 'eyedropper', icon: 'colorize', key: 'I' },
    { type: 'line', icon: 'pen_size_1', key: 'L' },
    { type: 'rect', icon: 'crop_square', key: 'U' },
    { type: 'ellipse', icon: 'circle', key: 'O' },
  ];

  // ===== Canvas cursor =====
  const canvasCursor = useMemo(() => {
    if (spaceHeldRef.current || isPanningRef.current) return 'grab';
    return 'crosshair';
  }, []);

  return (
    <div className="editor-container">
      <SEO title={t.seoEditorTitle} description={t.seoEditorDesc} canonicalPath="/editor" />
      <div className="editor-main">
        {/* LEFT AD */}
        <div className="ad-slot ad-slot-left" />

        {/* Left Toolbar */}
        <div className="editor-toolbar">
          {tools.map(tool => (
            <button
              key={tool.type}
              className={`tool-btn${activeTool === tool.type ? ' active' : ''}`}
              onClick={() => setActiveTool(tool.type)}
              title={`${t[`tool${tool.type.charAt(0).toUpperCase() + tool.type.slice(1)}` as keyof typeof t] ?? tool.type} (${tool.key})`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{tool.icon}</span>
            </button>
          ))}
          <div className="tool-divider" />
          <button
            className={`tool-btn${symmetryH ? ' active' : ''}`}
            onClick={() => setSymmetryH(!symmetryH)}
            title={`${t.symmetryH} (S)`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>flip</span>
          </button>
          <button
            className={`tool-btn${symmetryV ? ' active' : ''}`}
            onClick={() => setSymmetryV(!symmetryV)}
            title={`${t.symmetryV} (V)`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, transform: 'rotate(90deg)' }}>flip</span>
          </button>
          <div className="tool-divider" />
          <button className="tool-btn" onClick={performUndo} title={`${t.undo} (Ctrl+Z)`} disabled={undoStack.length === 0}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>undo</span>
          </button>
          <button className="tool-btn" onClick={performRedo} title={`${t.redo} (Ctrl+Shift+Z)`} disabled={redoStack.length === 0}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>redo</span>
          </button>
        </div>

        {/* Canvas Area */}
        <div
          ref={canvasAreaRef}
          className="editor-canvas-area"
          style={{ cursor: canvasCursor }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={(e) => { handlePointerUp(e); setMouseCoords(null); }}
          onContextMenu={handleContextMenu}
        >
          <div
            className="canvas-wrapper"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: canvasWidth,
              height: canvasHeight,
            }}
          >
            <canvas ref={bgCanvasRef} />
            <canvas ref={mainCanvasRef} />
            <canvas ref={overlayCanvasRef} />
          </div>

          {mouseCoords && (
            <div className="canvas-coords">{mouseCoords.x}, {mouseCoords.y}</div>
          )}
          <div className="zoom-indicator">{zoom}x | {canvasWidth}x{canvasHeight}</div>
        </div>

        {/* Right Panels */}
        <div className="editor-panels">
          {/* Color */}
          <div className="editor-panel">
            <h4>{t.colorPalette}</h4>
            <div className="color-section">
              <div className="color-swatch-pair">
                <div
                  className="color-primary-swatch"
                  style={{ backgroundColor: `rgba(${primaryColor.join(',')})` }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'color';
                    input.value = rgbaToHex(primaryColor);
                    input.addEventListener('input', () => setPrimaryColor(hexToRgba(input.value, primaryColor[3])));
                    input.click();
                  }}
                />
                <div
                  className="color-secondary-swatch"
                  style={{ backgroundColor: `rgba(${secondaryColor.join(',')})` }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'color';
                    input.value = rgbaToHex(secondaryColor);
                    input.addEventListener('input', () => setSecondaryColor(hexToRgba(input.value, secondaryColor[3])));
                    input.click();
                  }}
                />
                <button
                  className="color-swap-btn"
                  onClick={() => {
                    const tmp = primaryColor;
                    setPrimaryColor(secondaryColor);
                    setSecondaryColor(tmp);
                  }}
                  title="X"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>swap_horiz</span>
                </button>
              </div>
              <div className="color-inputs">
                <input
                  className="color-hex-input"
                  value={rgbaToHex(primaryColor)}
                  onChange={e => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) setPrimaryColor(hexToRgba(v, primaryColor[3]));
                  }}
                />
                <div className="alpha-slider-row">
                  <span>A</span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={primaryColor[3]}
                    onChange={e => setPrimaryColor([primaryColor[0], primaryColor[1], primaryColor[2], Number(e.target.value)])}
                  />
                  <span>{primaryColor[3]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Palette */}
          <div className="editor-panel">
            <div className="palette-header">
              <select
                className="palette-select"
                value={selectedPreset}
                onChange={e => setSelectedPreset(Number(e.target.value))}
              >
                {PALETTE_PRESETS.map((p, i) => (
                  <option key={i} value={i}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="palette-grid">
              {palette.map((color, i) => (
                <div
                  key={i}
                  className={`palette-cell${rgbaEqual(color, primaryColor) ? ' active-color' : ''}`}
                  style={{ backgroundColor: `rgba(${color.join(',')})` }}
                  onClick={() => setPrimaryColor(color)}
                  onContextMenu={e => { e.preventDefault(); setSecondaryColor(color); }}
                />
              ))}
            </div>
          </div>

          {/* Brush Size */}
          <div className="editor-panel">
            <h4>{t.brushSize} ([ / ])</h4>
            <div className="brush-size-row">
              <input
                type="range"
                min={1}
                max={16}
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
              />
              <span>{brushSize}</span>
            </div>
          </div>

          {/* Layers */}
          <div className="editor-panel">
            <h4>
              {t.layers}
              <span className="panel-actions">
                <button className="panel-icon-btn" onClick={addLayer} title={t.addLayer}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                </button>
                <button className="panel-icon-btn" onClick={() => { if (activeLayer && !isLayerEmpty(activeLayer)) setShowDeleteLayerConfirm(true); else removeLayer(); }} title={t.removeLayer} disabled={!activeFrame || activeFrame.layers.length <= 1}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove</span>
                </button>
                <button className="panel-icon-btn" onClick={() => moveLayer('up')} title="Move Up" disabled={!activeFrame || activeLayerIndex >= activeFrame.layers.length - 1}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_upward</span>
                </button>
                <button className="panel-icon-btn" onClick={() => moveLayer('down')} title="Move Down" disabled={activeLayerIndex <= 0}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_downward</span>
                </button>
                <button className="panel-icon-btn" onClick={mergeDown} title={t.mergeDown} disabled={activeLayerIndex <= 0}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>merge</span>
                </button>
              </span>
            </h4>
            <div className="layer-list">
              {activeFrame && [...activeFrame.layers].reverse().map(layer => (
                <React.Fragment key={layer.id}>
                  <div
                    className={`layer-item${layer.id === activeFrame.activeLayerId ? ' active-layer' : ''}`}
                    onClick={() => setFrames(prev => prev.map((f, fi) => fi === activeFrameIndex ? { ...f, activeLayerId: layer.id } : f))}
                  >
                    <canvas
                      className="layer-thumbnail"
                      ref={el => {
                        if (!el) return;
                        el.width = canvasWidth;
                        el.height = canvasHeight;
                        const ctx = el.getContext('2d')!;
                        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
                        const tmp = document.createElement('canvas');
                        tmp.width = canvasWidth;
                        tmp.height = canvasHeight;
                        tmp.getContext('2d')!.putImageData(layer.data, 0, 0);
                        ctx.drawImage(tmp, 0, 0);
                      }}
                    />
                    {editingLayerId === layer.id ? (
                      <input
                        className="layer-name-input"
                        value={editLayerName}
                        onChange={e => setEditLayerName(e.target.value)}
                        onBlur={() => {
                          setFrames(prev => prev.map((f, fi) => fi !== activeFrameIndex ? f : {
                            ...f,
                            layers: f.layers.map(l => l.id === layer.id ? { ...l, name: editLayerName || l.name } : l),
                          }));
                          setEditingLayerId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="layer-name"
                        onDoubleClick={() => {
                          setEditingLayerId(layer.id);
                          setEditLayerName(layer.name);
                        }}
                      >
                        {layer.name}
                      </span>
                    )}
                    <button
                      className="layer-visibility-btn"
                      onClick={e => {
                        e.stopPropagation();
                        setFrames(prev => prev.map((f, fi) => fi !== activeFrameIndex ? f : {
                          ...f,
                          layers: f.layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l),
                        }));
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        {layer.visible ? 'visibility' : 'visibility_off'}
                      </span>
                    </button>
                  </div>
                  {layer.id === activeFrame.activeLayerId && (
                    <div className="layer-opacity-row">
                      <span>{t.layerOpacity}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={layer.opacity}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setFrames(prev => prev.map((f, fi) => fi !== activeFrameIndex ? f : {
                            ...f,
                            layers: f.layers.map(l => l.id === layer.id ? { ...l, opacity: val } : l),
                          }));
                        }}
                      />
                      <span>{layer.opacity}%</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Grid / View */}
          <div className="editor-panel">
            <h4>{t.canvasSize}</h4>
            <div className="option-row">
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} id="grid-toggle" />
              <label htmlFor="grid-toggle">{t.gridToggle} (H)</label>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', width: '100%' }} onClick={() => setShowNewCanvasModal(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                {t.newCanvas} ({canvasWidth}x{canvasHeight})
              </button>
            </div>
          </div>

          {/* Export */}
          <div className="editor-panel">
            <h4>{t.export}</h4>
            <div className="export-btns">
              <button className="btn" onClick={exportPng}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>image</span>
                {t.exportPng}
              </button>
              {frames.length > 1 && (
                <>
                  <button className="btn btn-secondary" onClick={exportSpriteSheet}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>grid_view</span>
                    {t.exportSpriteSheet}
                  </button>
                  <button className="btn btn-secondary" onClick={exportGif}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>gif</span>
                    {t.exportGif}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT AD */}
        <div className="ad-slot ad-slot-right" />
      </div>

      {/* Timeline */}
      <div className="editor-timeline">
        <div className="timeline-frames">
          {frames.map((frame, i) => (
            <div
              key={frame.id}
              className={`timeline-frame${i === activeFrameIndex ? ' active-timeline-frame' : ''}`}
              onClick={() => { setActiveFrameIndex(i); setIsPlaying(false); }}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, frameIndex: i }); }}
            >
              <canvas
                ref={el => {
                  if (el) timelineCanvasRefs.current.set(frame.id, el);
                  else timelineCanvasRefs.current.delete(frame.id);
                }}
              />
              <span className="timeline-frame-index">{i + 1}</span>
            </div>
          ))}
          <button className="timeline-add-frame" onClick={addFrame}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>add</span>
          </button>
        </div>

        <div className="timeline-controls">
          <div className="timeline-playback">
            <button onClick={() => setActiveFrameIndex(prev => Math.max(0, prev - 1))} title="Previous (,)">
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>skip_previous</span>
            </button>
            <button
              className={isPlaying ? 'playing' : ''}
              onClick={() => setIsPlaying(!isPlaying)}
              title={`${isPlaying ? t.pauseAnimation : t.playAnimation} (P)`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{isPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <button onClick={() => setActiveFrameIndex(prev => Math.min(frames.length - 1, prev + 1))} title="Next (.)">
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>skip_next</span>
            </button>
          </div>
          <div className="timeline-fps">
            <span>{t.fpsControl}:</span>
            <input
              type="number"
              min={1}
              max={60}
              value={fps}
              onChange={e => setFps(Math.max(1, Math.min(60, Number(e.target.value))))}
            />
          </div>
          <div className="timeline-onion">
            <input
              type="checkbox"
              checked={onionSkinEnabled}
              onChange={e => setOnionSkinEnabled(e.target.checked)}
              id="onion-toggle"
            />
            <label htmlFor="onion-toggle">{t.onionSkinEditor}</label>
            {onionSkinEnabled && (
              <>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={onionSkinOpacity}
                  onChange={e => setOnionSkinOpacity(Number(e.target.value))}
                  style={{ width: 60 }}
                />
                <span>{onionSkinOpacity}%</span>
              </>
            )}
          </div>
          <div className="timeline-playback">
            <button onClick={addFrame} title={`${t.addFrame} (N)`}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add_circle</span>
            </button>
            <button onClick={duplicateFrame} title={`${t.duplicateFrame} (D)`}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>content_copy</span>
            </button>
            <button onClick={deleteFrame} title={t.deleteFrame} disabled={frames.length <= 1}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Frame Context Menu */}
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div className="context-menu" style={{ top: contextMenu.y - 160, left: contextMenu.x }}>
            <button onClick={() => { duplicateFrameAt(contextMenu.frameIndex); setContextMenu(null); }}>
              <span className="material-symbols-outlined">content_copy</span>
              {t.duplicateFrame}
            </button>
            <button onClick={() => { deleteFrameAt(contextMenu.frameIndex); setContextMenu(null); }} disabled={frames.length <= 1}>
              <span className="material-symbols-outlined">delete</span>
              {t.deleteFrame}
            </button>
            <div className="context-menu-divider" />
            <button onClick={() => { moveFrame(contextMenu.frameIndex, 'left'); setContextMenu(null); }} disabled={contextMenu.frameIndex <= 0}>
              <span className="material-symbols-outlined">arrow_back</span>
              {t.moveLeft}
            </button>
            <button onClick={() => { moveFrame(contextMenu.frameIndex, 'right'); setContextMenu(null); }} disabled={contextMenu.frameIndex >= frames.length - 1}>
              <span className="material-symbols-outlined">arrow_forward</span>
              {t.moveRight}
            </button>
          </div>
        </>
      )}

      {/* New Canvas Modal */}
      {/* Unsaved Changes Blocker */}
      {blocker.state === 'blocked' && (
        <div className="editor-modal-overlay">
          <div
            className="editor-modal"
            onKeyDown={e => {
              if (e.key === 'Enter') blocker.proceed();
              if (e.key === 'Escape') blocker.reset();
            }}
            tabIndex={-1}
            ref={el => el?.focus()}
          >
            <h3>{t.unsavedTitle}</h3>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>
              {t.unsavedMessage}
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => blocker.reset()}>{t.cancel}</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => blocker.proceed()}>
                {t.unsavedLeave}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Layer Confirm */}
      {showDeleteLayerConfirm && (
        <div className="editor-modal-overlay" onClick={() => setShowDeleteLayerConfirm(false)}>
          <div
            className="editor-modal"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') { removeLayer(); setShowDeleteLayerConfirm(false); }
              if (e.key === 'Escape') setShowDeleteLayerConfirm(false);
            }}
            tabIndex={-1}
            ref={el => el?.focus()}
          >
            <h3>{t.removeLayer}</h3>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>
              {t.confirmDeleteLayer}
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteLayerConfirm(false)}>{t.cancel}</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => { removeLayer(); setShowDeleteLayerConfirm(false); }}>
                {t.removeLayer}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Frame Confirm */}
      {deleteConfirmIndex !== null && (
        <div className="editor-modal-overlay" onClick={() => setDeleteConfirmIndex(null)}>
          <div
            className="editor-modal"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') { deleteFrameAt(deleteConfirmIndex); setDeleteConfirmIndex(null); }
              if (e.key === 'Escape') setDeleteConfirmIndex(null);
            }}
            tabIndex={-1}
            ref={el => el?.focus()}
          >
            <h3>{t.deleteFrame}</h3>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>
              {t.confirmDeleteFrame?.replace('{n}', String(deleteConfirmIndex + 1))}
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirmIndex(null)}>{t.cancel}</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => { deleteFrameAt(deleteConfirmIndex); setDeleteConfirmIndex(null); }}>
                {t.deleteFrame}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewCanvasModal && (
        <div className="editor-modal-overlay" onClick={() => setShowNewCanvasModal(false)}>
          <div className="editor-modal" onClick={e => e.stopPropagation()}>
            <h3>{t.newCanvas}</h3>
            <div className="size-inputs" style={{ marginBottom: 16 }}>
              <label>{t.width}:</label>
              <input type="number" min={1} max={256} value={newW} onChange={e => setNewW(Number(e.target.value))} />
              <span style={{ color: 'var(--text-muted)' }}>x</span>
              <label>{t.height}:</label>
              <input type="number" min={1} max={256} value={newH} onChange={e => setNewH(Number(e.target.value))} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowNewCanvasModal(false)}>{t.cancel}</button>
              <button className="btn" onClick={handleNewCanvas}>{t.create}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
