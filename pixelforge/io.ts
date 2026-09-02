// 메인 스레드 입출력 — 이미지/GIF 로드, PNG/GIF/ZIP 내보내기, 팔레트 PNG
import { parseGIF, decompressFrame } from 'gifuct-js';
import type { Img, ImageSeq, RGB } from './core/types.ts';
import { createImg } from './core/types.ts';
import { upscaleInt } from './core/resample.ts';

type RawGifFrame = Parameters<typeof decompressFrame>[0];

export const MAX_SOURCE_PIXELS = 4096 * 4096;

export const decodeGif = (buffer: ArrayBuffer): ImageSeq => {
  const gif = parseGIF(buffer);
  const raw = gif.frames.filter((f): f is RawGifFrame => 'image' in f);
  if (raw.length === 0) throw new Error('No frames in GIF');
  const width = gif.lsd.width || raw[0].image.descriptor.width;
  const height = gif.lsd.height || raw[0].image.descriptor.height;
  const composite = new Uint8ClampedArray(width * height * 4);
  const frames: Img[] = [];
  const delays: number[] = [];
  let prev: Uint8ClampedArray | null = null;
  for (const rf of raw) {
    const { dims, patch, disposalType, delay } = decompressFrame(rf, gif.gct, true);
    if (disposalType === 3) prev = composite.slice();
    for (let y = 0; y < dims.height; y++) {
      const cy = dims.top + y;
      if (cy < 0 || cy >= height) continue;
      for (let x = 0; x < dims.width; x++) {
        const cx = dims.left + x;
        if (cx < 0 || cx >= width) continue;
        const si = (y * dims.width + x) * 4;
        if (patch[si + 3] === 0) continue;
        const di = (cy * width + cx) * 4;
        composite[di] = patch[si]; composite[di + 1] = patch[si + 1]; composite[di + 2] = patch[si + 2]; composite[di + 3] = patch[si + 3];
      }
    }
    frames.push({ width, height, data: composite.slice() });
    delays.push(delay && delay > 0 ? delay : 100);
    if (disposalType === 2) {
      for (let y = 0; y < dims.height; y++) {
        const cy = dims.top + y;
        if (cy < 0 || cy >= height) continue;
        const start = (cy * width + Math.max(0, dims.left)) * 4;
        const end = (cy * width + Math.min(width, dims.left + dims.width)) * 4;
        if (end > start) composite.fill(0, start, end);
      }
    } else if (disposalType === 3 && prev) {
      composite.set(prev);
      prev = null;
    }
  }
  return { frames, delays };
};

/** 브라우저 디코더로 읽는다. 너무 큰 이미지는 픽셀 수 한도에 맞춰 축소한다 */
const bitmapToImg = async (blob: Blob, onDownsize?: (from: [number, number], to: [number, number]) => void): Promise<Img> => {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    // createImageBitmap이 거부하는 포맷은 <img> 경로로 재시도
    bmp = await new Promise<ImageBitmap>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); createImageBitmap(im).then(resolve, reject); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode_failed')); };
      im.src = url;
    });
  }
  let w = bmp.width, h = bmp.height;
  if (w * h > MAX_SOURCE_PIXELS) {
    const s = Math.sqrt(MAX_SOURCE_PIXELS / (w * h));
    const nw = Math.max(1, Math.floor(w * s)), nh = Math.max(1, Math.floor(h * s));
    onDownsize?.([w, h], [nw, nh]);
    w = nw; h = nh;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const id = ctx.getImageData(0, 0, w, h);
  return { width: id.width, height: id.height, data: id.data };
};

export const loadImageBlob = async (blob: Blob, onDownsize?: (from: [number, number], to: [number, number]) => void): Promise<ImageSeq> => {
  const isGif = blob.type === 'image/gif' || (blob instanceof File && /\.gif$/i.test(blob.name));
  if (isGif) {
    try {
      return decodeGif(await blob.arrayBuffer());
    } catch {
      /* GIF 파싱 실패 시 브라우저 디코더로 첫 프레임만 */
    }
  }
  const img = await bitmapToImg(blob, onDownsize);
  return { frames: [img], delays: [100] };
};

/** 클립보드 이벤트에서 이미지 Blob 추출 */
export const imageFromClipboard = (items: DataTransferItemList | null | undefined): Blob | null => {
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
};

export const imgToCanvas = (img: Img, scale = 1): HTMLCanvasElement => {
  const src = scale > 1 ? upscaleInt(img, scale) : img;
  const canvas = document.createElement('canvas');
  canvas.width = src.width; canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), 0, 0);
  return canvas;
};

export const imgToPngBlob = (img: Img, scale = 1): Promise<Blob> =>
  new Promise((resolve, reject) => {
    imgToCanvas(img, scale).toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });

/** ≤256색이면 정확한 팔레트, 아니면 양자화. 투명 픽셀은 인덱스 0 */
export const encodeGif = async (seq: ImageSeq, scale = 1, fps = 0, onProgress?: (p: number) => void): Promise<Blob> => {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  for (let f = 0; f < seq.frames.length; f++) {
    const img = scale > 1 ? upscaleInt(seq.frames[f], scale) : seq.frames[f];
    const { width, height, data } = img;
    const n = width * height;
    let hasAlpha = false;
    const uniq = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (data[o + 3] < 128) { hasAlpha = true; continue; }
      const k = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
      if (!uniq.has(k) && uniq.size <= 256) uniq.set(k, uniq.size);
    }
    const reserve = hasAlpha ? 1 : 0;
    let palette: number[][];
    let index: Uint8Array;
    if (uniq.size + reserve <= 256) {
      palette = hasAlpha ? [[0, 0, 0]] : [];
      const lookup = new Map<number, number>();
      for (const k of uniq.keys()) { lookup.set(k, palette.length); palette.push([(k >> 16) & 255, (k >> 8) & 255, k & 255]); }
      index = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        if (data[o + 3] < 128) { index[i] = 0; continue; }
        index[i] = lookup.get((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]) ?? 0;
      }
    } else {
      const rgb = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) { const o = i * 4; rgb[o] = data[o]; rgb[o + 1] = data[o + 1]; rgb[o + 2] = data[o + 2]; rgb[o + 3] = 255; }
      const q = quantize(rgb, 256 - reserve, { format: 'rgb565' });
      const idx = applyPalette(rgb, q, 'rgb565');
      palette = hasAlpha ? [[0, 0, 0], ...q] : q;
      index = new Uint8Array(n);
      for (let i = 0; i < n; i++) index[i] = data[i * 4 + 3] < 128 ? 0 : idx[i] + reserve;
    }
    const delay = fps > 0 ? Math.round(1000 / fps) : Math.max(20, Math.round(seq.delays[f] || 100));
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      transparent: hasAlpha,
      transparentIndex: 0,
      dispose: hasAlpha ? 2 : -1,
      repeat: 0,
    });
    onProgress?.((f + 1) / seq.frames.length);
    if (f % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
};

// ---------- ZIP (저장 전용, 무압축) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export const zipStore = (files: Array<{ name: string; data: Uint8Array }>): Blob => {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, crc, true); dv.setUint32(18, f.data.length, true); dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, f.data);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + f.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// ---------- 팔레트 PNG ----------
export const paletteToPngBlob = (colors: RGB[], cell = 8): Promise<Blob> => {
  const img = createImg(Math.max(1, colors.length) * cell, cell);
  colors.forEach((c, i) => {
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const o = (y * img.width + i * cell + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  });
  return imgToPngBlob(img);
};

/** 팔레트 PNG → 등장 순서대로 고유색 (최대 256) */
export const paletteFromImage = (img: Img, max = 256): RGB[] => {
  const seen = new Set<number>();
  const out: RGB[] = [];
  const { data } = img;
  for (let i = 0; i < data.length && out.length < max; i += 4) {
    if (data[i + 3] < 128) continue;
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([data[i], data[i + 1], data[i + 2]]);
  }
  return out;
};

// ---------- 최근 이미지 (IndexedDB) ----------
export interface RecentImage {
  id: number;
  name: string;
  width: number;
  height: number;
  frames: number;
  /** 작은 미리보기 data URL */
  thumb: string;
  blob: Blob;
  addedAt: number;
}

const DB_NAME = 'spritfy-pixelforge';
const DB_STORE = 'recent';
const RECENT_MAX = 8;
const RECENT_MAX_BYTES = 24 * 1024 * 1024;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const reqPromise = <T,>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export const makeThumb = (img: Img, max = 96): string => {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const src = imgToCanvas(img);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = scale < 0.5;
  ctx.drawImage(src, 0, 0, w, h);
  return c.toDataURL('image/png');
};

export const listRecentImages = async (): Promise<RecentImage[]> => {
  try {
    const db = await openDb();
    const all = await reqPromise(db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll() as IDBRequest<RecentImage[]>);
    db.close();
    return all.sort((a, b) => b.addedAt - a.addedAt);
  } catch { return []; }
};

export const addRecentImage = async (entry: Omit<RecentImage, 'id' | 'addedAt'>): Promise<RecentImage[]> => {
  try {
    if (entry.blob.size > RECENT_MAX_BYTES) return listRecentImages();
    const db = await openDb();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const existing = await reqPromise(store.getAll() as IDBRequest<RecentImage[]>);
    for (const e of existing) if (e.name === entry.name && e.blob.size === entry.blob.size) store.delete(e.id);
    store.add({ ...entry, addedAt: Date.now() });
    const remaining = existing.filter((e) => !(e.name === entry.name && e.blob.size === entry.blob.size)).sort((a, b) => b.addedAt - a.addedAt);
    for (const e of remaining.slice(RECENT_MAX - 1)) store.delete(e.id);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  } catch { /* 저장 실패는 무시 */ }
  return listRecentImages();
};

export const deleteRecentImage = async (id: number): Promise<RecentImage[]> => {
  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  } catch { /* ignore */ }
  return listRecentImages();
};

export const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
