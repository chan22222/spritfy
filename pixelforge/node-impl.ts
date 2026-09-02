// 노드 구현 (워커 전용) — node-defs.ts 의 스키마와 1:1 대응
import { Img, ImageSeq, RGB, ColorSpace, singleSeq, keyToRgb } from './core/types.ts';
import { hexToRgb } from './core/color.ts';
import type { Metric } from './core/color.ts';
import { downscale, fitLongSide, scaleImg, rotateImg, type DownscaleMethod } from './core/resample.ts';
import { histogram, mergeHist, filterHistNearColor, estimateBgColor, extractPalette, mapToPalette, dither, implicitPalette, type DitherMethod, type ExtractMethod } from './core/quantize.ts';
import { preprocess, aiDenoise, colorCleanup, removeBackground, deAntialias, pixelLines, colorMerge, autoCrop, autoCropBounds, cropToBounds, gridRestore, pixelSnap, detectGrid, type CropMode } from './core/cleanup.ts';
import { outline, bresenhamOutline, autoOutlineColor, type BresenhamMode } from './core/outline.ts';
import { colorAdjust, colorReplace, postFx, mixImg, applyNoise, deflicker, shiftImg, type BlendMode, type NoiseParams, type ColorReplaceEntry } from './core/effects.ts';
import { slic } from './core/slic.ts';
import { findBuiltinPalette } from './core/palettes.ts';
import type { PaletteParam, ReplaceEntry } from './graph.ts';

export type Value =
  | { kind: 'image'; seq: ImageSeq }
  | { kind: 'palette'; palette: RGB[] }
  | { kind: 'number'; value: number };

export class NodeError extends Error {
  code: string;
  constructor(code: string, message?: string) { super(message ?? code); this.code = code; }
}

export interface ProcCtx {
  params: Record<string, unknown>;
  inputs: Record<string, Value | undefined>;
  source: ImageSeq | null;
  tick: () => Promise<void>;
}

export type NodeProcess = (ctx: ProcCtx) => Promise<Record<string, Value>>;

// ---------- 헬퍼 ----------
const num = (ctx: ProcCtx, key: string): number => {
  const v = ctx.inputs[key];
  if (v && v.kind === 'number') return v.value;
  return Number(ctx.params[key]) || 0;
};
const str = (ctx: ProcCtx, key: string): string => String(ctx.params[key] ?? '');
const bool = (ctx: ProcCtx, key: string): boolean => !!ctx.params[key];
const col = (ctx: ProcCtx, key: string): RGB => hexToRgb(str(ctx, key) || '#000000');

const imgIn = (ctx: ProcCtx, key = 'image'): ImageSeq => {
  const v = ctx.inputs[key];
  if (!v || v.kind !== 'image') throw new NodeError('missing_input');
  return v.seq;
};
const palIn = (ctx: ProcCtx, key = 'palette'): RGB[] | null => {
  const v = ctx.inputs[key];
  if (!v || v.kind !== 'palette') return null;
  return v.palette;
};

const perFrame = async (seq: ImageSeq, tick: () => Promise<void>, fn: (img: Img, i: number) => Img): Promise<ImageSeq> => {
  const frames: Img[] = [];
  for (let i = 0; i < seq.frames.length; i++) {
    frames.push(fn(seq.frames[i], i));
    if (seq.frames.length > 1) await tick();
  }
  return { frames, delays: seq.delays.slice() };
};

const image = (seq: ImageSeq): Record<string, Value> => ({ image: { kind: 'image', seq } });
const clampFrame = (seq: ImageSeq, frame: number): number => Math.max(0, Math.min(seq.frames.length - 1, frame | 0));
const framesFor = (seq: ImageSeq, all: boolean, frame: number): Img[] => (all ? seq.frames : [seq.frames[clampFrame(seq, frame)]]);
const lockedOf = (ctx: ProcCtx): RGB[] => (Array.isArray(ctx.params.locked) ? (ctx.params.locked as RGB[]).map((c) => [c[0] | 0, c[1] | 0, c[2] | 0] as RGB) : []);
const withLocked = (palette: RGB[], locked: RGB[]): RGB[] => [
  ...locked,
  ...palette.filter((c) => !locked.some((l) => l[0] === c[0] && l[1] === c[1] && l[2] === c[2])),
];

const dsOptions = (ctx: ProcCtx) => ({
  method: str(ctx, 'method') as DownscaleMethod,
  detail: num(ctx, 'detail'),
  edge: num(ctx, 'edge'),
  smoothness: num(ctx, 'smoothness'),
  radius: num(ctx, 'radius'),
  sharpness: num(ctx, 'sharpness'),
  iterations: num(ctx, 'iterations'),
  compactness: num(ctx, 'compactness'),
  smoothing: num(ctx, 'smoothing'),
  alphaMode: (str(ctx, 'alpha') === 'keep' ? 'keep' : 'opaque') as 'keep' | 'opaque',
});

const resolvePaletteParam = (p: unknown): RGB[] => {
  const pp = p as PaletteParam | undefined;
  if (!pp) return [];
  if (pp.id && pp.id !== 'custom') {
    const b = findBuiltinPalette(pp.id);
    if (b) return b.colors.map((c) => [c[0], c[1], c[2]] as RGB);
  }
  return Array.isArray(pp.colors) ? pp.colors.map((c) => [c[0] | 0, c[1] | 0, c[2] | 0] as RGB) : [];
};

// ---------- 구현 ----------
export const NODE_IMPL: Record<string, NodeProcess> = {
  async input(ctx) {
    if (!ctx.source) throw new NodeError('no_source');
    const ox = num(ctx, 'offset_x') | 0, oy = num(ctx, 'offset_y') | 0;
    if (!ox && !oy) return image(ctx.source);
    return image(await perFrame(ctx.source, ctx.tick, (img) => shiftImg(img, ox, oy)));
  },

  async output(ctx) {
    return image(imgIn(ctx));
  },

  async mix(ctx) {
    const a = imgIn(ctx, 'a');
    const bv = ctx.inputs.b;
    if (!bv || bv.kind !== 'image') return image(a);
    const b = bv.seq;
    const mode = str(ctx, 'blend_mode') as BlendMode;
    const f = num(ctx, 'factor');
    const n = Math.max(a.frames.length, b.frames.length);
    const frames: Img[] = [];
    const delays: number[] = [];
    for (let i = 0; i < n; i++) {
      frames.push(mixImg(a.frames[i % a.frames.length], b.frames[i % b.frames.length], mode, f));
      delays.push((a.frames.length >= b.frames.length ? a.delays : b.delays)[i % n] ?? 100);
      if (n > 1) await ctx.tick();
    }
    return image({ frames, delays });
  },

  async downscale(ctx) {
    const seq = imgIn(ctx);
    const long = Math.max(1, Math.round(num(ctx, 'long_side')));
    const opt = dsOptions(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => { const [w, h] = fitLongSide(img.width, img.height, long); return downscale(img, w, h, opt); }));
  },

  async pixel_snap(ctx) {
    const seq = imgIn(ctx);
    // 애니메이션은 기준 프레임에서 격자를 한 번 감지해 모든 프레임에 같은 격자를 적용한다
    const ref = seq.frames[clampFrame(seq, num(ctx, 'ref_frame'))];
    const info = detectGrid(ref, num(ctx, 'cell_size'));
    return image(await perFrame(seq, ctx.tick, (img) => pixelSnap(img, num(ctx, 'cell_size'), bool(ctx, 'auto_offset'), bool(ctx, 'resample_int'), num(ctx, 'inner'), img.width === ref.width && img.height === ref.height ? info : undefined)));
  },

  async grid_restore(ctx) {
    const seq = imgIn(ctx);
    const ref = seq.frames[clampFrame(seq, num(ctx, 'ref_frame'))];
    const info = detectGrid(ref, num(ctx, 'scale'));
    return image(await perFrame(seq, ctx.tick, (img) => gridRestore(img, num(ctx, 'scale'), num(ctx, 'inner'), img.width === ref.width && img.height === ref.height ? info : undefined)));
  },

  async scale(ctx) {
    const seq = imgIn(ctx);
    const sx = Math.max(0.05, num(ctx, 'x')), sy = Math.max(0.05, num(ctx, 'y'));
    const method = str(ctx, 'method') === 'bilinear' ? 'bilinear' : 'nearest';
    return image(await perFrame(seq, ctx.tick, (img) => scaleImg(img, sx, sy, method)));
  },

  async pia_auto(ctx) {
    const seq = imgIn(ctx);
    const long = Math.max(1, Math.round(num(ctx, 'long_side')));
    const K = Math.max(2, Math.round(num(ctx, 'color_count')));
    const iters = num(ctx, 'iterations'), compact = num(ctx, 'compactness');
    const fixed = bool(ctx, 'fixed_frame');
    const frameIdx = num(ctx, 'frame') | 0;
    // 1) 슈퍼픽셀 색으로 자동 팔레트
    const src = fixed ? [seq.frames[Math.max(0, Math.min(seq.frames.length - 1, frameIdx))]] : seq.frames;
    const map = new Map<number, number>();
    for (const img of src) {
      const [w, h] = fitLongSide(img.width, img.height, long);
      const res = slic(img, w, h, iters, compact);
      for (let k = 0; k < w * h; k++) {
        if (res.count[k] === 0) continue;
        const key = (Math.round(res.colors[k * 3]) << 16) | (Math.round(res.colors[k * 3 + 1]) << 8) | Math.round(res.colors[k * 3 + 2]);
        map.set(key, (map.get(key) || 0) + res.count[k]);
      }
      await ctx.tick();
    }
    const keys = new Int32Array(map.size), weights = new Float32Array(map.size);
    let i = 0;
    for (const [k, w] of map) { keys[i] = k; weights[i] = w; i++; }
    const palette = extractPalette({ keys, weights }, { count: K, method: 'pca', space: 'oklab', vivid: 0.3 });
    // 2) SLIC 다운스케일 + 팔레트 매핑
    const dm = str(ctx, 'dither') as DitherMethod;
    const strength = num(ctx, 'strength');
    const out = await perFrame(seq, ctx.tick, (img) => {
      const [w, h] = fitLongSide(img.width, img.height, long);
      const small = downscale(img, w, h, { method: 'slic', iterations: iters, compactness: compact, smoothing: 0, alphaMode: 'opaque' });
      return dm === 'none' ? mapToPalette(small, palette, 'oklab') : dither(small, palette, dm, strength, 'oklab');
    });
    return { image: { kind: 'image', seq: out }, palette: { kind: 'palette', palette } };
  },

  async pixelize_legacy(ctx) {
    const seq = imgIn(ctx);
    const long = Math.max(1, Math.round(num(ctx, 'long_side')));
    const opt = dsOptions(ctx);
    const pal = palIn(ctx);
    const dm = str(ctx, 'dither') as DitherMethod;
    const space = str(ctx, 'color_space') as ColorSpace;
    const strength = num(ctx, 'strength');
    return image(await perFrame(seq, ctx.tick, (img) => {
      const [w, h] = fitLongSide(img.width, img.height, long);
      const small = downscale(img, w, h, { ...opt, alphaMode: 'opaque' });
      if (!pal || pal.length === 0) return small;
      return dm === 'none' ? mapToPalette(small, pal, space) : dither(small, pal, dm, strength, space);
    }));
  },

  async palette(ctx) {
    return { palette: { kind: 'palette', palette: resolvePaletteParam(ctx.params.palette) } };
  },

  async palette_map(ctx) {
    const seq = imgIn(ctx);
    const pal = palIn(ctx);
    if (!pal || pal.length === 0) throw new NodeError('missing_palette');
    const space = str(ctx, 'color_space') as ColorSpace;
    const perceptual = bool(ctx, 'perceptual');
    return image(await perFrame(seq, ctx.tick, (img) => mapToPalette(img, pal, space, perceptual)));
  },

  async dither(ctx) {
    const seq = imgIn(ctx);
    const pal = palIn(ctx) ?? implicitPalette(seq.frames[0]);
    const dm = str(ctx, 'method') as DitherMethod;
    const space = str(ctx, 'color_space') as ColorSpace;
    const strength = num(ctx, 'strength');
    return image(await perFrame(seq, ctx.tick, (img) => dither(img, pal, dm, strength, space)));
  },

  async palette_extract(ctx) {
    const seq = imgIn(ctx);
    const frames = framesFor(seq, bool(ctx, 'all_frames'), num(ctx, 'frame'));
    let hist = histogram(frames);
    if (bool(ctx, 'bg_ignore')) {
      const bg = estimateBgColor(frames[0]);
      if (bg) hist = filterHistNearColor(hist, bg, 28);
    }
    const locked = lockedOf(ctx);
    const K = Math.max(1, Math.round(num(ctx, 'color_count')));
    const Keff = K - locked.length;
    if (Keff <= 0) return { palette: { kind: 'palette', palette: locked.slice(0, K) } };
    const merge = num(ctx, 'merge');
    const metric = str(ctx, 'merge_metric') as Metric;
    const space = str(ctx, 'color_space') as ColorSpace;
    const method = str(ctx, 'criterion') as ExtractMethod;
    let palette: RGB[];
    if (merge > 0 && str(ctx, 'merge_mode') === 'pre') {
      hist = mergeHist(hist, merge, metric);
      palette = extractPalette(hist, { count: Keff, method: 'popularity', space });
    } else {
      palette = extractPalette(hist, { count: Keff, method, space });
      if (merge > 0) {
        const keys = Int32Array.from(palette, (c) => (c[0] << 16) | (c[1] << 8) | c[2]);
        const merged = mergeHist({ keys, weights: new Float32Array(keys.length).fill(1) }, merge, metric);
        palette = Array.from(merged.keys, (k) => keyToRgb(k));
      }
    }
    return { palette: { kind: 'palette', palette: withLocked(palette, locked) } };
  },

  async palette_extract_exp(ctx) {
    const seq = imgIn(ctx);
    const frames = framesFor(seq, bool(ctx, 'all_frames'), num(ctx, 'frame'));
    let hist = histogram(frames);
    if (bool(ctx, 'bg_ignore')) {
      const bg = estimateBgColor(frames[0]);
      if (bg) hist = filterHistNearColor(hist, bg, 28);
    }
    const locked = lockedOf(ctx);
    const K = Math.max(1, Math.round(num(ctx, 'color_count')));
    const Keff = K - locked.length;
    if (Keff <= 0) return { palette: { kind: 'palette', palette: locked.slice(0, K) } };
    const palette = extractPalette(hist, { count: Keff, method: 'pca', space: 'oklab', vivid: num(ctx, 'vivid') });
    return { palette: { kind: 'palette', palette: withLocked(palette, locked) } };
  },

  async color_replace(ctx) {
    const seq = imgIn(ctx);
    const raw = Array.isArray(ctx.params.entries) ? (ctx.params.entries as ReplaceEntry[]) : [];
    const entries: ColorReplaceEntry[] = raw.map((e) => ({ from: e.from, to: e.to, tolerance: Number(e.tolerance) || 0 }));
    return image(await perFrame(seq, ctx.tick, (img) => colorReplace(img, entries)));
  },

  async color_adjust(ctx) {
    const seq = imgIn(ctx);
    const b = num(ctx, 'brightness'), c = num(ctx, 'contrast'), s = num(ctx, 'saturation');
    return image(await perFrame(seq, ctx.tick, (img) => colorAdjust(img, b, c, s)));
  },

  async color_merge(ctx) {
    const seq = imgIn(ctx);
    const frames = colorMerge(seq.frames, num(ctx, 'merge_tol'), str(ctx, 'color_space') as ColorSpace, str(ctx, 'merge_metric') as Metric);
    return image({ frames, delays: seq.delays.slice() });
  },

  async value(ctx) {
    return { number: { kind: 'number', value: num(ctx, 'value') } };
  },

  async preprocess(ctx) {
    const seq = imgIn(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => preprocess(img, num(ctx, 'sharpen'), num(ctx, 'noise'))));
  },

  async ai_denoise(ctx) {
    const seq = imgIn(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => aiDenoise(img, num(ctx, 'strength'), num(ctx, 'luma_preserve'))));
  },

  async color_cleanup(ctx) {
    const seq = imgIn(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => colorCleanup(img, num(ctx, 'radius'), num(ctx, 'color_delta'))));
  },

  async remove_background(ctx) {
    const seq = imgIn(ctx);
    const mode = str(ctx, 'bg_mode') === 'global' ? 'global' : 'flood';
    // 자동 색은 기준 프레임에서 한 번 추정해 모든 프레임에 동일하게 쓴다
    const color = bool(ctx, 'auto_color') ? estimateBgColor(seq.frames[clampFrame(seq, num(ctx, 'ref_frame'))]) : col(ctx, 'color');
    return image(await perFrame(seq, ctx.tick, (img) => removeBackground(img, num(ctx, 'tolerance'), mode, color)));
  },

  async rotate(ctx) {
    const seq = imgIn(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => rotateImg(img, num(ctx, 'angle'), bool(ctx, 'expand'))));
  },

  async auto_crop(ctx) {
    const seq = imgIn(ctx);
    const mode = str(ctx, 'crop_mode') as CropMode;
    const padding = num(ctx, 'padding') | 0, thr = num(ctx, 'alpha_threshold'), tol = num(ctx, 'tolerance'), margin = num(ctx, 'margin');
    if (seq.frames.length === 1) return image(singleSeq(autoCrop(seq.frames[0], mode, padding, thr, tol, margin), seq.delays[0]));
    // 애니메이션: 프레임 크기가 같아야 하므로 합집합 또는 기준 프레임의 경계를 모두에 적용한다
    let bounds: [number, number, number, number] | null = null;
    if (str(ctx, 'crop_ref') === 'frame') {
      bounds = autoCropBounds(seq.frames[clampFrame(seq, num(ctx, 'ref_frame'))], mode, thr, tol, margin);
    } else {
      for (const img of seq.frames) {
        const b = autoCropBounds(img, mode, thr, tol, margin);
        if (!b) continue;
        bounds = bounds ? [Math.min(bounds[0], b[0]), Math.min(bounds[1], b[1]), Math.max(bounds[2], b[2]), Math.max(bounds[3], b[3])] : b;
      }
    }
    if (!bounds) return image(seq);
    const bb = bounds;
    return image(await perFrame(seq, ctx.tick, (img) => cropToBounds(img, bb, padding)));
  },

  async de_antialias(ctx) {
    const seq = imgIn(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => deAntialias(img, num(ctx, 'strength'), num(ctx, 'alpha_threshold'))));
  },

  async pixel_lines(ctx) {
    const seq = imgIn(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => pixelLines(img, num(ctx, 'iterations'))));
  },

  async outline(ctx) {
    const seq = imgIn(ctx);
    const mode = str(ctx, 'outline_mode') === 'edges' ? 'edges' : 'silhouette';
    return image(await perFrame(seq, ctx.tick, (img) => outline(img, mode, col(ctx, 'color'), num(ctx, 'thickness'), num(ctx, 'alpha_threshold'), bool(ctx, 'expand'))));
  },

  async bresenham(ctx) {
    const seq = imgIn(ctx);
    const mode = str(ctx, 'bz_mode') as BresenhamMode;
    return image(await perFrame(seq, ctx.tick, (img) => {
      const color = bool(ctx, 'auto_color') ? (mode === 'clean_color' ? null : autoOutlineColor(img)) : col(ctx, 'color');
      return bresenhamOutline(img, mode, num(ctx, 'thickness'), color, num(ctx, 'tolerance'), num(ctx, 'alpha_threshold'));
    }));
  },

  async post_fx(ctx) {
    const seq = imgIn(ctx);
    return image(await perFrame(seq, ctx.tick, (img) => postFx(img, num(ctx, 'glow'), num(ctx, 'scanline'), num(ctx, 'vignette'), bool(ctx, 'legacy_outline'))));
  },

  async noise(ctx) {
    const v = ctx.inputs.image;
    const input = v && v.kind === 'image' ? v.seq : null;
    const prm: NoiseParams = {
      type: str(ctx, 'noise_type') as NoiseParams['type'],
      effect: str(ctx, 'noise_effect') as NoiseParams['effect'],
      size: num(ctx, 'size'),
      octaves: num(ctx, 'octaves'),
      seed: num(ctx, 'seed'),
      levels: num(ctx, 'levels'),
      speed: num(ctx, 'speed'),
      frames: num(ctx, 'frames'),
      animate: bool(ctx, 'animate'),
      strength: num(ctx, 'strength'),
      color: col(ctx, 'color'),
      blend: str(ctx, 'blend_mode') as BlendMode,
      width: num(ctx, 'width'),
      height: num(ctx, 'height'),
    };
    return image(applyNoise(input, prm));
  },

  async deflicker(ctx) {
    return image(deflicker(imgIn(ctx), num(ctx, 'threshold')));
  },
};

export { singleSeq };
