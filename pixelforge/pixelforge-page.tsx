import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import SEO from '@/seo.tsx';
import { Lang } from '@/i18n.ts';
import { ToolInfo } from '@/tool-info.tsx';
import { Graph, SerializedGraph, semanticKey, serializeGraph, deserializeGraph } from './graph.ts';
import { NODE_DEF_MAP } from './node-defs.ts';
import { BUILTIN_PRESETS } from './presets.ts';
import { EngineClient, type EvalResult } from './engine-client.ts';
import { NodeEditor, NumberField, type EditorHandle, type EyedropperTarget } from './node-editor.tsx';
import type { ImageSeq, Img, RGB } from './core/types.ts';
import { resampleNearest } from './core/resample.ts';
import { detectIntegerUpscale, downsampleExact } from './core/lossless.ts';
import {
  loadImageBlob, imageFromClipboard, imgToCanvas, imgToPngBlob, encodeGif, zipStore, downloadBlob, paletteToPngBlob, paletteFromImage, readFileAsText,
  listRecentImages, addRecentImage, deleteRecentImage, makeThumb, type RecentImage,
} from './io.ts';
import './pixelforge.css';

interface Props {
  lang: Lang;
  t: Record<string, string>;
  /** 탭 유지(keep-alive)로 숨겨져 있으면 false — 전역 단축키·붙여넣기·SEO를 비활성화한다 */
  active?: boolean;
}

interface UserPreset { name: string; graph: SerializedGraph; savedAt: number }
type Layout = 'vertical' | 'horizontal';
type SplitDir = 'lr' | 'tb';

const LS_GRAPH = 'spritfy-pf-graph';
const LS_PRESETS = 'spritfy-pf-presets';
const LS_LAYOUT = 'spritfy-pf-layout';
const LS_RECENT_PRESETS = 'spritfy-pf-recent-presets';
const ZOOMS = [0, 1, 2, 4, 8, 16];
const GRID_CELLS = [1, 2, 4, 8, 16];
const HISTORY_MAX = 60;

const loadInitialGraph = (): Graph => {
  try {
    const raw = localStorage.getItem(LS_GRAPH);
    if (raw) {
      const g = deserializeGraph(JSON.parse(raw), NODE_DEF_MAP);
      if (g && g.nodes.length > 0) return g;
    }
  } catch { /* ignore */ }
  return BUILTIN_PRESETS[0].build();
};

const loadUserPresets = (): UserPreset[] => {
  try {
    const raw = localStorage.getItem(LS_PRESETS);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr.filter((p) => p && typeof p.name === 'string' && p.graph); }
  } catch { /* ignore */ }
  return [];
};

const loadRecentPresets = (): string[] => {
  try { const arr = JSON.parse(localStorage.getItem(LS_RECENT_PRESETS) || '[]'); return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []; } catch { return []; }
};

const baseName = (name: string): string => (name || 'pixelforge').replace(/\.[^.]+$/, '') || 'pixelforge';
const fmt = (s: string, ...args: string[]): string => args.reduce((acc, a) => acc.replace('%s', a), s);

export const PixelForgePage: React.FC<Props> = ({ lang, t, active = true }) => {
  const activeRef = useRef(active);
  activeRef.current = active;
  // ----- 그래프 + 실행 취소 이력 -----
  const [graph, setGraphState] = useState<Graph>(loadInitialGraph);
  const graphRef = useRef(graph);
  const pastRef = useRef<Graph[]>([]);
  const futureRef = useRef<Graph[]>([]);
  const lastPushRef = useRef(0);
  const [, setHistTick] = useState(0);

  const applyGraphRaw = useCallback((next: Graph) => { graphRef.current = next; setGraphState(next); }, []);
  const setGraph = useCallback((fn: (g: Graph) => Graph) => {
    const prev = graphRef.current;
    const next = fn(prev);
    if (next === prev) return;
    const now = Date.now();
    if (now - lastPushRef.current > 400) {
      pastRef.current.push(prev);
      if (pastRef.current.length > HISTORY_MAX) pastRef.current.shift();
      futureRef.current = [];
      setHistTick((v) => v + 1);
    }
    lastPushRef.current = now;
    applyGraphRaw(next);
  }, [applyGraphRaw]);
  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(graphRef.current);
    lastPushRef.current = 0;
    applyGraphRaw(prev);
    setHistTick((v) => v + 1);
  }, [applyGraphRaw]);
  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(graphRef.current);
    lastPushRef.current = 0;
    applyGraphRaw(next);
    setHistTick((v) => v + 1);
  }, [applyGraphRaw]);

  // ----- 원본 / 결과 -----
  const [source, setSource] = useState<ImageSeq | null>(null);
  const [sourceName, setSourceName] = useState('');
  const sourceIdRef = useRef(0);
  const engineRef = useRef<EngineClient | null>(null);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [output, setOutput] = useState<ImageSeq | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // ----- 보기 상태 -----
  // 기본은 좌우 배치 (미리보기 왼쪽 / 그래프 오른쪽). 사용자가 바꾸면 기억한다
  const [layout, setLayout] = useState<Layout>(() => { try { return localStorage.getItem(LS_LAYOUT) === 'vertical' ? 'vertical' : 'horizontal'; } catch { return 'horizontal'; } });
  const [previewRatio, setPreviewRatio] = useState(0.5);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [gridCell, setGridCell] = useState(1);
  const [split, setSplit] = useState(100);
  const [splitDir, setSplitDir] = useState<SplitDir>('lr');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(0);
  const [exportScale, setExportScale] = useState(1);
  const [eyedropper, setEyedropper] = useState<EyedropperTarget | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [userPresets, setUserPresets] = useState<UserPreset[]>(loadUserPresets);
  const [recentPresets, setRecentPresets] = useState<string[]>(loadRecentPresets);
  const [recentImages, setRecentImages] = useState<RecentImage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<{ seq: ImageSeq; name: string; blob: Blob } | null>(null);

  const editorRef = useRef<EditorHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paletteFileRef = useRef<HTMLInputElement>(null);
  const presetFileRef = useRef<HTMLInputElement>(null);
  const paletteTargetRef = useRef<number | null>(null);
  const frameCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const presetMenuRef = useRef<HTMLDivElement>(null);
  const recentMenuRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const [, setViewTick] = useState(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2800);
  }, []);

  useEffect(() => { try { localStorage.setItem(LS_LAYOUT, layout); } catch { /* ignore */ } }, [layout]);
  useEffect(() => { try { localStorage.setItem(LS_RECENT_PRESETS, JSON.stringify(recentPresets)); } catch { /* ignore */ } }, [recentPresets]);
  useEffect(() => { void listRecentImages().then(setRecentImages); }, []);

  // ----- 엔진 -----
  useEffect(() => {
    const engine = new EngineClient();
    engine.onProgress = (_id, done, total) => setProgress({ done, total });
    engineRef.current = engine;
    return () => { engine.dispose(); engineRef.current = null; };
  }, []);

  const runEval = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setBusy(true);
    const res = await engine.evaluate(graphRef.current, sourceIdRef.current);
    if (res.status === 'cancelled') return;
    setResult(res);
    if (res.output) setOutput(res.output);
    else if (res.status !== 'ok') setOutput(null);
    setBusy(false);
    setProgress(null);
  }, []);

  const semKey = useMemo(() => semanticKey(graph), [graph]);
  const [sourceTick, setSourceTick] = useState(0);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    sourceIdRef.current = engine.setSource(source);
    frameCanvases.current.clear();
    setFrame(0);
    setSourceTick((v) => v + 1);
  }, [source]);

  useEffect(() => {
    const id = window.setTimeout(() => { void runEval(); }, 140);
    return () => window.clearTimeout(id);
  }, [semKey, sourceTick, runEval]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try { localStorage.setItem(LS_GRAPH, JSON.stringify(serializeGraph(graph))); } catch { /* ignore */ }
    }, 400);
    return () => window.clearTimeout(id);
  }, [graph]);

  useEffect(() => {
    try { localStorage.setItem(LS_PRESETS, JSON.stringify(userPresets)); } catch { /* ignore */ }
  }, [userPresets]);

  // ----- 이미지 로드 -----
  const applySource = useCallback(async (seq: ImageSeq, name: string, blob: Blob | null) => {
    setSource(seq);
    setSourceName(name);
    setPan({ x: 0, y: 0 });
    setZoomIdx(0);
    setPendingPaste(null);
    if (blob) {
      const first = seq.frames[0];
      const list = await addRecentImage({ name, width: first.width, height: first.height, frames: seq.frames.length, thumb: makeThumb(first), blob });
      setRecentImages(list);
    }
  }, []);

  /** 디코드 + 무손실 최적화 (정수배 확대 이미지는 원래 격자로 되돌린다) */
  const decodeBlob = useCallback(async (blob: Blob): Promise<ImageSeq> => {
    let seq = await loadImageBlob(blob, (from, to) => showToast(fmt(t.pfDownsized, `${from[0]}×${from[1]}`, `${to[0]}×${to[1]}`)));
    const k = detectIntegerUpscale(seq.frames[0]);
    if (k > 1 && seq.frames.every((f) => f.width === seq.frames[0].width && f.height === seq.frames[0].height && detectIntegerUpscale(f, k) === k)) {
      const before = `${seq.frames[0].width}×${seq.frames[0].height}`;
      seq = { frames: seq.frames.map((f) => downsampleExact(f, k)), delays: seq.delays };
      showToast(fmt(t.pfLosslessOpt, before, `${seq.frames[0].width}×${seq.frames[0].height}`));
    }
    return seq;
  }, [showToast, t]);

  const loadBlob = useCallback(async (blob: Blob, name: string, opts: { confirmReplace?: boolean; remember?: boolean } = {}) => {
    setLoading(true);
    try {
      const seq = await decodeBlob(blob);
      if (opts.confirmReplace && source) {
        setPendingPaste({ seq, name, blob });
        return;
      }
      await applySource(seq, name, opts.remember === false ? null : blob);
    } catch (err) {
      console.error('[PixelForge] open failed', err);
      showToast(`${t.pfOpenFailed}${err instanceof Error && err.message ? ` (${err.message})` : ''}`);
    } finally {
      setLoading(false);
    }
  }, [decodeBlob, applySource, showToast, source, t]);

  const onFiles = useCallback((files: FileList | File[]) => {
    const file = Array.from(files).find((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name));
    if (file) void loadBlob(file, file.name);
  }, [loadBlob]);

  /** 파일 선택 창 열기. 입력 요소가 아직 없거나 click()이 막힌 환경을 대비해 임시 입력으로도 시도한다 */
  const openFileDialog = useCallback(() => {
    const input = fileInputRef.current;
    if (input) { input.click(); return; }
    const tmp = document.createElement('input');
    tmp.type = 'file'; tmp.accept = 'image/*';
    tmp.className = 'pf-file-input';
    tmp.onchange = () => { if (tmp.files?.length) onFiles(tmp.files); tmp.remove(); };
    document.body.appendChild(tmp);
    tmp.click();
  }, [onFiles]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (!activeRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const blob = imageFromClipboard(e.clipboardData?.items);
      if (blob) { e.preventDefault(); void loadBlob(blob, 'clipboard.png', { confirmReplace: true }); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadBlob]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard?.read) { showToast(t.pfPasteHint); return; }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((ty) => ty.startsWith('image/'));
        if (type) { const blob = await item.getType(type); void loadBlob(blob, 'clipboard.png', { confirmReplace: true }); return; }
      }
      showToast(t.pfPasteNoImage);
    } catch {
      showToast(t.pfPasteHint);
    }
  }, [loadBlob, showToast, t]);

  // ----- 프리셋 -----
  useEffect(() => {
    if (!presetOpen && !recentOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) setPresetOpen(false);
      if (recentMenuRef.current && !recentMenuRef.current.contains(e.target as Node)) setRecentOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [presetOpen, recentOpen]);

  const applyGraph = useCallback((g: Graph) => {
    setGraph(() => g);
    setPresetOpen(false);
    window.setTimeout(() => editorRef.current?.fitView(), 30);
  }, [setGraph]);

  const touchRecentPreset = (key: string): void => setRecentPresets((list) => [key, ...list.filter((k) => k !== key)].slice(0, 5));

  const loadBuiltinPreset = (id: string): void => {
    const p = BUILTIN_PRESETS.find((x) => x.id === id);
    if (p) { applyGraph(p.build()); touchRecentPreset(`b:${id}`); showToast(`${t.pfPresetLoaded}${t[p.label]}`); }
  };

  const loadUserPreset = (name: string): void => {
    const p = userPresets.find((x) => x.name === name);
    if (!p) return;
    const g = deserializeGraph(p.graph, NODE_DEF_MAP);
    if (g) { applyGraph(g); touchRecentPreset(`u:${name}`); showToast(`${t.pfPresetLoaded}${name}`); }
  };

  const loadRecentPreset = (key: string): void => {
    if (key.startsWith('b:')) loadBuiltinPreset(key.slice(2));
    else loadUserPreset(key.slice(2));
  };

  const recentPresetLabel = (key: string): string | null => {
    if (key.startsWith('b:')) { const p = BUILTIN_PRESETS.find((x) => x.id === key.slice(2)); return p ? t[p.label] : null; }
    return userPresets.some((p) => p.name === key.slice(2)) ? key.slice(2) : null;
  };

  const saveUserPreset = (): void => {
    const name = presetName.trim();
    if (!name) return;
    const entry: UserPreset = { name, graph: serializeGraph(graph, name), savedAt: Date.now() };
    setUserPresets((list) => [entry, ...list.filter((p) => p.name !== name)].slice(0, 30));
    touchRecentPreset(`u:${name}`);
    setSaveOpen(false); setPresetName('');
    showToast(`${t.pfPresetSaved}${name}`);
  };

  const exportPreset = (): void => {
    const blob = new Blob([JSON.stringify(serializeGraph(graph, presetName || 'preset'), null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'pixelforge-preset.json');
  };

  const importPresetFile = async (file: File): Promise<void> => {
    try {
      const g = deserializeGraph(JSON.parse(await readFileAsText(file)), NODE_DEF_MAP);
      if (!g) throw new Error('format');
      applyGraph(g);
      const name = baseName(file.name);
      setUserPresets((list) => [{ name, graph: serializeGraph(g, name), savedAt: Date.now() }, ...list.filter((p) => p.name !== name)].slice(0, 30));
      touchRecentPreset(`u:${name}`);
      showToast(`${t.pfPresetLoaded}${name}`);
    } catch {
      showToast(t.pfPresetFormatError);
    }
  };

  const resetGraph = (): void => {
    applyGraph(BUILTIN_PRESETS[0].build());
    setConfirmReset(false);
    showToast(t.pfResetDone);
  };

  // ----- 팔레트 저장/불러오기 -----
  const savePalette = useCallback(async (colors: RGB[], name: string) => {
    if (colors.length === 0) { showToast(t.pfPaletteSaveEmpty); return; }
    downloadBlob(await paletteToPngBlob(colors), `palette-${name}-${colors.length}.png`);
  }, [showToast, t]);

  const loadPalette = useCallback((nodeId: number) => {
    paletteTargetRef.current = nodeId;
    paletteFileRef.current?.click();
  }, []);

  const onPaletteFile = async (file: File): Promise<void> => {
    const nodeId = paletteTargetRef.current;
    if (nodeId === null) return;
    try {
      const seq = await loadImageBlob(file);
      const colors = paletteFromImage(seq.frames[0]);
      setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, params: { ...n.params, palette: { id: 'custom', colors } } } : n)) }));
      showToast(`${t.pfPaletteLoaded}${colors.length}`);
    } catch {
      showToast(t.pfOpenFailed);
    }
  };

  // ----- 미리보기 -----
  const outFrames = output?.frames.length ?? 0;
  const shown: Img | null = output ? output.frames[Math.min(frame, outFrames - 1)] : source ? source.frames[Math.min(frame, source.frames.length - 1)] : null;
  const totalFrames = output ? outFrames : source ? source.frames.length : 0;

  useEffect(() => { frameCanvases.current.clear(); }, [output]);

  const zoomValue = ZOOMS[zoomIdx];
  const computeFit = useCallback((iw: number, ih: number): number => {
    const wrap = wrapRef.current;
    if (!wrap) return 1;
    const fit = Math.min((wrap.clientWidth - 16) / iw, (wrap.clientHeight - 16) / ih);
    return fit >= 1 ? Math.max(1, Math.floor(fit)) : Math.max(0.02, fit);
  }, []);

  const getFrameCanvas = useCallback((img: Img, key: string): HTMLCanvasElement => {
    const cache = frameCanvases.current;
    let c = cache.get(key);
    if (!c) { c = imgToCanvas(img); if (cache.size > 128) cache.clear(); cache.set(key, c); }
    return c;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!shown) return;
    const z = zoomValue || computeFit(shown.width, shown.height);
    const dw = shown.width * z, dh = shown.height * z;
    const ox = Math.round((cw - dw) / 2 + pan.x), oy = Math.round((ch - dh) / 2 + pan.y);
    ctx.imageSmoothingEnabled = false;
    const outCanvas = getFrameCanvas(shown, `${output ? 'o' : 's'}${frame}`);
    const compare = split < 100 && source && output;
    const lr = splitDir === 'lr';
    const splitPos = lr ? ox + dw * (split / 100) : oy + dh * (split / 100);
    if (split > 0) {
      ctx.save(); ctx.beginPath();
      if (lr) ctx.rect(ox, oy, Math.max(0, splitPos - ox), dh); else ctx.rect(ox, oy, dw, Math.max(0, splitPos - oy));
      ctx.clip();
      ctx.drawImage(outCanvas, ox, oy, dw, dh);
      ctx.restore();
    }
    if (compare) {
      const srcImg = source.frames[Math.min(frame, source.frames.length - 1)];
      const key = `src${frame}-${shown.width}x${shown.height}`;
      const cmp = frameCanvases.current.get(key) ?? getFrameCanvas(srcImg.width === shown.width && srcImg.height === shown.height ? srcImg : resampleNearest(srcImg, shown.width, shown.height), key);
      ctx.save(); ctx.beginPath();
      if (lr) ctx.rect(splitPos, oy, ox + dw - splitPos, dh); else ctx.rect(ox, splitPos, dw, oy + dh - splitPos);
      ctx.clip();
      ctx.drawImage(cmp, ox, oy, dw, dh);
      ctx.restore();
      ctx.fillStyle = 'rgba(187,134,252,0.9)';
      if (lr) ctx.fillRect(Math.round(splitPos) - 1, oy, 2, dh); else ctx.fillRect(ox, Math.round(splitPos) - 1, dw, 2);
    }
    if (showGrid && z * gridCell >= 4) {
      ctx.strokeStyle = gridCell > 1 ? 'rgba(187,134,252,0.5)' : 'rgba(128,128,128,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor((0 - ox) / z / gridCell) * gridCell), x1 = Math.min(shown.width, Math.ceil((cw - ox) / z));
      const y0 = Math.max(0, Math.floor((0 - oy) / z / gridCell) * gridCell), y1 = Math.min(shown.height, Math.ceil((ch - oy) / z));
      for (let x = x0; x <= x1; x += gridCell) { const px = Math.round(ox + x * z) + 0.5; ctx.moveTo(px, oy); ctx.lineTo(px, oy + dh); }
      for (let y = y0; y <= y1; y += gridCell) { const py = Math.round(oy + y * z) + 0.5; ctx.moveTo(ox, py); ctx.lineTo(ox + dw, py); }
      ctx.stroke();
    }
  }, [shown, zoomValue, pan, split, splitDir, showGrid, gridCell, source, output, frame, computeFit, getFrameCanvas]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => setViewTick((v) => v + 1));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // 탭 유지로 숨겨졌다가 다시 보이면 크기가 0에서 복원되므로 미리보기를 다시 그린다
  useEffect(() => {
    if (active) setViewTick((v) => v + 1);
  }, [active]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      setZoomIdx((i) => {
        const cur = ZOOMS[i] || (shown ? computeFit(shown.width, shown.height) : 1);
        if (e.deltaY < 0) { const next = ZOOMS.findIndex((zv) => zv > cur); return next > 0 ? next : ZOOMS.length - 1; }
        const lower = ZOOMS.filter((zv) => zv > 0 && zv < cur);
        return lower.length ? ZOOMS.indexOf(lower[lower.length - 1]) : 0;
      });
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [shown, computeFit]);

  const panDrag = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  const onPreviewDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    // 드롭존 버튼·확인 창 등 상호작용 요소에서 시작된 포인터는 캡처하지 않는다.
    // (캡처하면 click 이벤트가 버튼이 아닌 이 영역으로 전달돼 버튼이 눌리지 않는다)
    if ((e.target as HTMLElement).closest('button, input, select, a, [role="dialog"]')) return;
    panDrag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false };
    try { wrapRef.current?.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
  };
  const onPreviewMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = panDrag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setPan({ x: d.px + dx, y: d.py + dy });
  };
  const onPreviewUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = panDrag.current;
    panDrag.current = null;
    try { wrapRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d || d.moved || !eyedropper || !shown) return;
    const wrap = wrapRef.current!;
    const rect = wrap.getBoundingClientRect();
    const z = zoomValue || computeFit(shown.width, shown.height);
    const dw = shown.width * z, dh = shown.height * z;
    const ox = Math.round((wrap.clientWidth - dw) / 2 + pan.x), oy = Math.round((wrap.clientHeight - dh) / 2 + pan.y);
    const localX = e.clientX - rect.left, localY = e.clientY - rect.top;
    const ix = Math.floor((localX - ox) / z), iy = Math.floor((localY - oy) / z);
    if (ix < 0 || iy < 0 || ix >= shown.width || iy >= shown.height) return;
    const compare = split < 100 && source && output;
    const fromOriginal = compare && (splitDir === 'lr' ? localX > ox + dw * (split / 100) : localY > oy + dh * (split / 100));
    let img: Img = shown;
    let sx = ix, sy = iy;
    if (fromOriginal && source) { img = source.frames[Math.min(frame, source.frames.length - 1)]; sx = Math.floor((ix / shown.width) * img.width); sy = Math.floor((iy / shown.height) * img.height); }
    const o = (sy * img.width + sx) * 4;
    const color: RGB = [img.data[o], img.data[o + 1], img.data[o + 2]];
    const target = eyedropper;
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => {
        if (n.id !== target.nodeId) return n;
        const entries = Array.isArray(n.params.entries) ? (n.params.entries as Array<{ from: RGB; to: RGB | null; tolerance: number }>).map((x) => ({ ...x })) : [];
        if (!entries[target.index]) return n;
        entries[target.index].from = color;
        return { ...n, params: { ...n.params, entries } };
      }),
    }));
    setEyedropper(null);
  };

  // 애니메이션 재생
  useEffect(() => {
    if (!playing || totalFrames <= 1 || !active) return;
    const delays = output ? output.delays : source ? source.delays : [];
    let raf = 0, last = performance.now(), acc = 0;
    let cur = frame;
    const step = (now: number): void => {
      acc += now - last; last = now;
      const wait = fps > 0 ? 1000 / fps : Math.max(20, delays[cur % Math.max(1, delays.length)] || 100);
      if (acc >= wait) { acc = 0; cur = (cur + 1) % totalFrames; setFrame(cur); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalFrames, fps, output, source, active]);

  const stepFrame = (dir: 1 | -1): void => {
    if (totalFrames <= 1) return;
    setPlaying(false);
    setFrame((f) => (f + dir + totalFrames) % totalFrames);
  };

  // ----- 내보내기 -----
  const savePng = async (): Promise<void> => {
    if (!output) { showToast(t.pfNoResult); return; }
    downloadBlob(await imgToPngBlob(output.frames[Math.min(frame, outFrames - 1)], exportScale), `${baseName(sourceName)}-pixel${outFrames > 1 ? `-f${frame + 1}` : ''}.png`);
    showToast(t.pfSaved);
  };
  const saveGif = async (): Promise<void> => {
    if (!output) { showToast(t.pfNoResult); return; }
    setExporting(true);
    try {
      downloadBlob(await encodeGif(output, exportScale, fps), `${baseName(sourceName)}-pixel.gif`);
      showToast(t.pfSaved);
    } finally { setExporting(false); }
  };
  const saveSequence = async (): Promise<void> => {
    if (!output) { showToast(t.pfNoResult); return; }
    setExporting(true);
    try {
      const files: Array<{ name: string; data: Uint8Array }> = [];
      for (let i = 0; i < output.frames.length; i++) {
        const blob = await imgToPngBlob(output.frames[i], exportScale);
        files.push({ name: `frame_${String(i + 1).padStart(3, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      downloadBlob(zipStore(files), `${baseName(sourceName)}-frames.zip`);
      showToast(t.pfSequenceSaved);
    } finally { setExporting(false); }
  };
  const copyResult = async (): Promise<void> => {
    if (!output) { showToast(t.pfNoResult); return; }
    try {
      const blob = await imgToPngBlob(output.frames[Math.min(frame, outFrames - 1)], exportScale);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast(t.pfCopied);
    } catch { showToast(t.pfCopyFailed); }
  };

  // ----- 단축키 -----
  const latest = useRef({ savePng, saveGif, undo, redo, totalFrames, outFrames, openFileDialog });
  latest.current = { savePng, saveGif, undo, redo, totalFrames, outFrames, openFileDialog };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!activeRef.current) return;
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const L = latest.current;
      if (mod && key === 'o') { e.preventDefault(); L.openFileDialog(); }
      else if (mod && key === 's') { e.preventDefault(); if (e.shiftKey && L.outFrames > 1) void L.saveGif(); else void L.savePng(); }
      else if (mod && !e.shiftKey && key === 'z') { if (typing) return; e.preventDefault(); L.undo(); }
      else if (mod && (key === 'y' || (e.shiftKey && key === 'z'))) { if (typing) return; e.preventDefault(); L.redo(); }
      else if (e.key === ' ' && !typing && L.totalFrames > 1) { e.preventDefault(); setPlaying((v) => !v); }
      else if (e.key === 'Escape') { setEyedropper(null); setPendingPaste(null); setPresetOpen(false); setRecentOpen(false); setConfirmReset(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- 드래그 앤 드롭 -----
  const onDragEnter = (e: React.DragEvent): void => { e.preventDefault(); dragCounter.current++; setDragOver(true); };
  const onDragLeave = (e: React.DragEvent): void => { e.preventDefault(); dragCounter.current = Math.max(0, dragCounter.current - 1); if (dragCounter.current === 0) setDragOver(false); };
  const onDrop = (e: React.DragEvent): void => { e.preventDefault(); dragCounter.current = 0; setDragOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); };

  // ----- 분할 바 (상하 / 좌우) -----
  const splitDrag = useRef<{ start: number; ratio: number; size: number } | null>(null);
  const onSplitterDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const body = e.currentTarget.parentElement as HTMLElement;
    const horizontal = layout === 'horizontal';
    splitDrag.current = { start: horizontal ? e.clientX : e.clientY, ratio: previewRatio, size: horizontal ? body.clientWidth : body.clientHeight };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onSplitterMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = splitDrag.current;
    if (!d) return;
    const cur = layout === 'horizontal' ? e.clientX : e.clientY;
    setPreviewRatio(Math.min(0.85, Math.max(0.15, d.ratio + (cur - d.start) / Math.max(1, d.size))));
  };
  const onSplitterUp = (): void => { splitDrag.current = null; };

  // ----- 상태 표시 -----
  const statusText = (): string => {
    if (loading) return t.pfLoading;
    if (busy) return progress ? `${t.pfProcessing} ${progress.done}/${progress.total}` : t.pfProcessing;
    if (!result) return t.pfReady;
    switch (result.status) {
      case 'ok': return t.pfReady;
      case 'cycle': return t.pfStatusCycle;
      case 'no_output': return t.pfStatusNoOutput;
      case 'not_connected': return t.pfStatusNotConnected;
      case 'no_source': return t.pfOpenImageFirst;
      case 'error': return `${t.pfError}: ${t[`pfErr_${result.error}`] || result.error || ''}`;
      default: return t.pfReady;
    }
  };

  const zoomLabel = shown ? `${zoomValue || computeFit(shown.width, shown.height)}×` : '—';
  const nodeInfo = result?.nodeInfo || {};
  const canUndo = pastRef.current.length > 0, canRedo = futureRef.current.length > 0;
  const recentPresetRows = recentPresets.map((k) => ({ key: k, label: recentPresetLabel(k) })).filter((r): r is { key: string; label: string } => !!r.label);

  return (
    <div className={`pf-page${dragOver ? ' drag-over' : ''}${eyedropper ? ' eyedropping' : ''}`} onDragEnter={onDragEnter} onDragOver={(e) => e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}>
      {active && <SEO title={t.seoPixelforgeTitle} description={t.seoPixelforgeDesc} path="/pixelforge" lang={lang} />}

      <div className="pf-toolbar" role="toolbar" aria-label={t.pfTitle}>
        <div className="pf-toolbar-brand">
          <span className="material-symbols-outlined" aria-hidden="true">grain</span>
          <h1>{t.pfTitle}</h1>
        </div>
        <button type="button" className="pf-btn pf-btn-primary" onClick={openFileDialog} title="Ctrl+O">
          <span className="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span><span>{t.pfOpenImage}</span>
        </button>
        <button type="button" className="pf-btn" onClick={() => { void pasteFromClipboard(); }} title={t.pfPasteTip}>
          <span className="material-symbols-outlined" aria-hidden="true">content_paste</span><span>{t.pfPaste}</span>
        </button>

        <div className="pf-dropdown" ref={recentMenuRef}>
          <button type="button" className="pf-btn" aria-haspopup="menu" aria-expanded={recentOpen} onClick={() => { setRecentOpen((v) => !v); setPresetOpen(false); }}>
            <span className="material-symbols-outlined" aria-hidden="true">history</span><span>{t.pfRecent}</span>
            <span className="material-symbols-outlined pf-chevron" aria-hidden="true">expand_more</span>
          </button>
          {recentOpen && (
            <div className="pf-dropdown-menu" role="menu">
              <div className="pf-dropdown-title">{t.pfRecentImages}</div>
              {recentImages.length === 0 && <div className="pf-dropdown-empty">{t.pfRecentEmpty}</div>}
              {recentImages.map((r) => (
                <div key={r.id} className="pf-dropdown-row">
                  <button type="button" role="menuitem" className="pf-recent-item" onClick={() => { setRecentOpen(false); void loadBlob(r.blob, r.name, { remember: false }); }}>
                    <img className="pf-recent-thumb" src={r.thumb} alt="" width={40} height={40} />
                    <span className="pf-recent-meta">
                      <span className="pf-recent-name">{r.name}</span>
                      <span className="pf-recent-dims">{r.width}×{r.height}{r.frames > 1 ? ` ×${r.frames}` : ''}</span>
                    </span>
                  </button>
                  <button type="button" className="pf-dropdown-x" aria-label={t.pfDelete} onClick={() => { void deleteRecentImage(r.id).then(setRecentImages); }}>×</button>
                </div>
              ))}
              <div className="pf-dropdown-title">{t.pfRecentPresets}</div>
              {recentPresetRows.length === 0 && <div className="pf-dropdown-empty">{t.pfRecentEmpty}</div>}
              {recentPresetRows.map((r) => (
                <button key={r.key} type="button" role="menuitem" className="pf-dropdown-item" onClick={() => { setRecentOpen(false); loadRecentPreset(r.key); }}>{r.label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="pf-dropdown" ref={presetMenuRef}>
          <button type="button" className="pf-btn" aria-haspopup="menu" aria-expanded={presetOpen} onClick={() => { setPresetOpen((v) => !v); setRecentOpen(false); }}>
            <span className="material-symbols-outlined" aria-hidden="true">tune</span><span>{t.pfPreset}</span>
            <span className="material-symbols-outlined pf-chevron" aria-hidden="true">expand_more</span>
          </button>
          {presetOpen && (
            <div className="pf-dropdown-menu" role="menu">
              <div className="pf-dropdown-title">{t.pfPresetBuiltin}</div>
              {BUILTIN_PRESETS.map((p) => (
                <button key={p.id} type="button" role="menuitem" className="pf-dropdown-item" onClick={() => loadBuiltinPreset(p.id)}>{t[p.label]}</button>
              ))}
              <div className="pf-dropdown-title">{t.pfPresetUser}</div>
              {userPresets.length === 0 && <div className="pf-dropdown-empty">{t.pfPresetEmpty}</div>}
              {userPresets.map((p) => (
                <div key={p.name} className="pf-dropdown-row">
                  <button type="button" role="menuitem" className="pf-dropdown-item" onClick={() => loadUserPreset(p.name)}>{p.name}</button>
                  <button type="button" className="pf-dropdown-x" aria-label={t.pfDelete} onClick={() => setUserPresets((list) => list.filter((x) => x.name !== p.name))}>×</button>
                </div>
              ))}
              <div className="pf-dropdown-sep" />
              {saveOpen ? (
                <form className="pf-dropdown-form" onSubmit={(e) => { e.preventDefault(); saveUserPreset(); }}>
                  <input type="text" value={presetName} placeholder={t.pfPresetName} onChange={(e) => setPresetName(e.target.value)} autoFocus maxLength={40} />
                  <button type="submit" className="pf-mini-btn" disabled={!presetName.trim()}>{t.pfSave}</button>
                  <button type="button" className="pf-mini-btn" onClick={() => setSaveOpen(false)}>{t.pfCancel}</button>
                </form>
              ) : (
                <button type="button" role="menuitem" className="pf-dropdown-item" onClick={() => setSaveOpen(true)}>{t.pfPresetSaveCurrent}</button>
              )}
              <button type="button" role="menuitem" className="pf-dropdown-item" onClick={() => presetFileRef.current?.click()}>{t.pfPresetImport}</button>
              <button type="button" role="menuitem" className="pf-dropdown-item" onClick={exportPreset}>{t.pfPresetExport}</button>
            </div>
          )}
        </div>

        {confirmReset ? (
          <span className="pf-confirm">
            <span>{t.pfResetConfirm}</span>
            <button type="button" className="pf-mini-btn danger" onClick={resetGraph}>{t.pfReset}</button>
            <button type="button" className="pf-mini-btn" onClick={() => setConfirmReset(false)}>{t.pfCancel}</button>
          </span>
        ) : (
          <button type="button" className="pf-btn" onClick={() => setConfirmReset(true)} title={t.pfResetNote}>
            <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span><span>{t.pfReset}</span>
          </button>
        )}

        <button type="button" className="pf-btn" onClick={undo} disabled={!canUndo} title={t.pfUndo} aria-label={t.pfUndo}>
          <span className="material-symbols-outlined" aria-hidden="true">undo</span>
        </button>
        <button type="button" className="pf-btn" onClick={redo} disabled={!canRedo} title={t.pfRedo} aria-label={t.pfRedo}>
          <span className="material-symbols-outlined" aria-hidden="true">redo</span>
        </button>

        <span className="pf-toolbar-spacer" />

        <button type="button" className="pf-btn" onClick={() => setLayout((l) => (l === 'vertical' ? 'horizontal' : 'vertical'))} title={t.pfLayoutToggle} aria-label={t.pfLayoutToggle}>
          <span className="material-symbols-outlined" aria-hidden="true">{layout === 'vertical' ? 'horizontal_split' : 'vertical_split'}</span>
        </button>
        <label className="pf-field">
          <span>{t.pfExportScale}</span>
          <select value={exportScale} onChange={(e) => setExportScale(Number(e.target.value))}>
            {[1, 2, 3, 4, 6, 8].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        {totalFrames > 1 && (
          <label className="pf-field">
            <span>{t.pfFps}</span>
            <NumberField value={fps} min={0} max={60} step={1} onCommit={setFps} title={t.pfFpsHint} ariaLabel={t.pfFps} />
          </label>
        )}
        <button type="button" className="pf-btn pf-btn-accent" onClick={() => { void savePng(); }} disabled={!output || exporting} title="Ctrl+S">
          <span className="material-symbols-outlined" aria-hidden="true">download</span><span>PNG</span>
        </button>
        {outFrames > 1 && (
          <>
            <button type="button" className="pf-btn pf-btn-accent" onClick={() => { void saveGif(); }} disabled={exporting} title="Ctrl+Shift+S">
              <span className="material-symbols-outlined" aria-hidden="true">gif_box</span><span>GIF</span>
            </button>
            <button type="button" className="pf-btn" onClick={() => { void saveSequence(); }} disabled={exporting} title={t.pfExportSequence}>
              <span className="material-symbols-outlined" aria-hidden="true">folder_zip</span><span>ZIP</span>
            </button>
          </>
        )}
        <button type="button" className="pf-btn" onClick={() => { void copyResult(); }} disabled={!output} title={t.pfCopy} aria-label={t.pfCopy}>
          <span className="material-symbols-outlined" aria-hidden="true">content_copy</span>
        </button>
      </div>

      <div className={`pf-body${layout === 'horizontal' ? ' horizontal' : ''}`}>
        <section className="pf-preview-area" style={{ flexBasis: `${previewRatio * 100}%` }} aria-label={t.pfPreview}>
          <div className="pf-preview-bar">
            <span className="pf-bar-label">{t.pfPreview}</span>
            <div className="pf-zoom-group" role="group" aria-label="Zoom">
              {ZOOMS.map((z, i) => (
                <button key={z} type="button" className={`pf-chip${zoomIdx === i ? ' active' : ''}`} onClick={() => { setZoomIdx(i); if (i === 0) setPan({ x: 0, y: 0 }); }}>{z === 0 ? t.pfFit : `${z}×`}</button>
              ))}
            </div>
            <button type="button" className={`pf-chip${showGrid ? ' active' : ''}`} onClick={() => setShowGrid((v) => !v)} aria-pressed={showGrid}>{t.pfGrid}</button>
            {showGrid && (
              <select className="pf-grid-cell" value={gridCell} onChange={(e) => setGridCell(Number(e.target.value))} aria-label={t.pfGridCell} title={t.pfGridCell}>
                {GRID_CELLS.map((c) => <option key={c} value={c}>{c}px</option>)}
              </select>
            )}
            <label className="pf-split-field" title={t.pfSplitHint}>
              <span>{t.pfSplit}</span>
              <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} disabled={!output || !source} />
            </label>
            <button type="button" className="pf-chip" onClick={() => setSplitDir((d) => (d === 'lr' ? 'tb' : 'lr'))} title={t.pfSplitDir} aria-label={t.pfSplitDir} disabled={!output || !source}>
              <span className="material-symbols-outlined" aria-hidden="true">{splitDir === 'lr' ? 'swap_horiz' : 'swap_vert'}</span>
            </button>
            {totalFrames > 1 && (
              <div className="pf-anim">
                <button type="button" className="pf-chip" onClick={() => stepFrame(-1)} aria-label={t.pfPrevFrame} title={t.pfPrevFrame}>
                  <span className="material-symbols-outlined" aria-hidden="true">skip_previous</span>
                </button>
                <button type="button" className="pf-chip" onClick={() => setPlaying((v) => !v)} aria-label={playing ? t.pfPause : t.pfPlay} title="Space">
                  <span className="material-symbols-outlined" aria-hidden="true">{playing ? 'pause' : 'play_arrow'}</span>
                </button>
                <button type="button" className="pf-chip" onClick={() => stepFrame(1)} aria-label={t.pfNextFrame} title={t.pfNextFrame}>
                  <span className="material-symbols-outlined" aria-hidden="true">skip_next</span>
                </button>
                <input type="range" min={0} max={totalFrames - 1} value={Math.min(frame, totalFrames - 1)} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} aria-label={t.pfFrame} />
                <span className="pf-anim-label">{(t.pfFrameFormat || 'frame %d').replace('%d', String(Math.min(frame, totalFrames - 1) + 1))} / {totalFrames}</span>
                <span className="pf-anim-tip" title={t.pfAnimTip}>
                  <span className="material-symbols-outlined" aria-hidden="true">info</span>
                  <span>{t.pfAnimTip}</span>
                </span>
              </div>
            )}
          </div>
          <div
            ref={wrapRef}
            className={`pf-preview-wrap${eyedropper ? ' eyedrop' : ''}`}
            onPointerDown={onPreviewDown} onPointerMove={onPreviewMove} onPointerUp={onPreviewUp} onPointerCancel={onPreviewUp}
          >
            <canvas ref={canvasRef} className="pf-preview-canvas" />
            {!shown && !loading && (
              <button type="button" className="pf-dropzone" onClick={openFileDialog}>
                <span className="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span>
                <strong>{t.pfDropTitle}</strong>
                <span>{t.pfDropSubtitle}</span>
                <small>{t.pfDropHint}</small>
              </button>
            )}
            {loading && <div className="pf-overlay"><span className="material-symbols-outlined spin" aria-hidden="true">progress_activity</span>{t.pfLoading}</div>}
            {busy && shown && <div className="pf-busy-badge"><span className="material-symbols-outlined spin" aria-hidden="true">progress_activity</span>{t.pfProcessing}</div>}
            {eyedropper && <div className="pf-eyedrop-hint">{t.pfEyedropperTip}</div>}
            {pendingPaste && (
              <div className="pf-confirm-box" role="dialog" aria-label={t.pfPasteConfirmTitle} onPointerDown={(e) => e.stopPropagation()}>
                <span>{t.pfPasteConfirmTitle}</span>
                <small>{fmt(t.pfPasteConfirmNote, `${pendingPaste.seq.frames[0].width}×${pendingPaste.seq.frames[0].height}${pendingPaste.seq.frames.length > 1 ? ` ×${pendingPaste.seq.frames.length}` : ''}`)}</small>
                <div className="pf-param-actions">
                  <button type="button" className="pf-mini-btn active" onClick={() => { const p = pendingPaste; void applySource(p.seq, p.name, p.blob); }}>{t.pfPaste}</button>
                  <button type="button" className="pf-mini-btn" onClick={() => setPendingPaste(null)}>{t.pfCancel}</button>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="pf-splitter" role="separator" aria-orientation={layout === 'horizontal' ? 'vertical' : 'horizontal'} onPointerDown={onSplitterDown} onPointerMove={onSplitterMove} onPointerUp={onSplitterUp} onPointerCancel={onSplitterUp}>
          <span />
        </div>

        <section className="pf-graph-area" aria-label={t.pfNodeGraph}>
          <div className="pf-graph-bar">
            <span className="pf-bar-label">{t.pfNodeGraph}</span>
            <span className="pf-graph-hint" title={t.pfShortcuts}>{t.pfGraphHint}</span>
          </div>
          <NodeEditor
            ref={editorRef}
            graph={graph}
            setGraph={setGraph}
            t={t}
            nodeInfo={nodeInfo}
            eyedropper={eyedropper}
            onEyedropper={setEyedropper}
            onSavePalette={(colors, name) => { void savePalette(colors, name); }}
            onLoadPalette={loadPalette}
          />
        </section>
      </div>

      <div className="pf-status" role="status" aria-live="polite">
        <span className={`pf-status-text${result && result.status !== 'ok' && !busy ? ' warn' : ''}`}>{statusText()}</span>
        {shown && <span>{t.pfResult} {shown.width}×{shown.height}{totalFrames > 1 ? ` ×${totalFrames}` : ''}</span>}
        <span>{t.pfView} {zoomLabel}</span>
        {result && <span>{t.pfCache} {result.stats.cached}/{t.pfParsed} {result.stats.computed}{result.stats.ms ? ` · ${result.stats.ms} ms` : ''}</span>}
        {sourceName && <span className="pf-status-file" title={sourceName}>{sourceName}</span>}
      </div>

      {/* display:none 대신 시각적으로만 숨긴다 — 일부 브라우저/임베디드 웹뷰는 display:none 파일 입력의 click()을 무시한다 */}
      <input ref={fileInputRef} type="file" accept="image/*" className="pf-file-input" tabIndex={-1} aria-hidden="true" onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={paletteFileRef} type="file" accept="image/png,image/gif,image/webp" className="pf-file-input" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPaletteFile(f); e.target.value = ''; }} />
      <input ref={presetFileRef} type="file" accept="application/json,.json,.pfgraph" className="pf-file-input" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importPresetFile(f); e.target.value = ''; }} />

      {toast && <div className="pf-toast" role="status">{toast}</div>}
      {dragOver && <div className="pf-drop-overlay" aria-hidden="true"><span className="material-symbols-outlined">upload</span>{t.pfDropTitle}</div>}
      <ToolInfo t={t} toolKey="pixelforge" />
    </div>
  );
};
