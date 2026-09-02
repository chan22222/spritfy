// 외곽선 / Bresenham(Zingl 2012) AA 외곽선
import { Img, RGB, createImg, cloneImg, rgbKey, keyToRgb } from './types.ts';
import { luma } from './color.ts';
import { pixelLines } from './cleanup.ts';

const idx4 = (w: number, x: number, y: number): number => (y * w + x) * 4;

// ---------- 픽셀 외곽선 ----------
export const outline = (img: Img, mode: 'silhouette' | 'edges', color: RGB, thickness: number, alphaThr: number, expand: boolean): Img => {
  const th = Math.max(1, Math.min(8, thickness | 0));
  if (mode === 'edges') {
    const { width: w, height: h, data } = img;
    const out = cloneImg(img);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = idx4(w, x, y);
        if (data[o + 3] < alphaThr) continue;
        let edge = false;
        if (x > 0) { const q = o - 4; if (data[q + 3] >= alphaThr && (data[q] !== data[o] || data[q + 1] !== data[o + 1] || data[q + 2] !== data[o + 2])) edge = true; }
        if (!edge && y > 0) { const q = o - w * 4; if (data[q + 3] >= alphaThr && (data[q] !== data[o] || data[q + 1] !== data[o + 1] || data[q + 2] !== data[o + 2])) edge = true; }
        if (edge) { out.data[o] = color[0]; out.data[o + 1] = color[1]; out.data[o + 2] = color[2]; }
      }
    }
    return out;
  }
  const pad = expand ? th : 0;
  const w = img.width + pad * 2, h = img.height + pad * 2;
  const base = createImg(w, h);
  for (let y = 0; y < img.height; y++) base.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + pad) * w + pad) * 4);
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = base.data[i * 4 + 3] >= alphaThr ? 1 : 0;
  const orig = mask.slice();
  for (let t = 0; t < th; t++) {
    const next = mask.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i]) continue;
        if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) next[i] = 1;
      }
    }
    mask = next;
  }
  for (let i = 0; i < w * h; i++) {
    if (mask[i] && !orig[i]) { base.data[i * 4] = color[0]; base.data[i * 4 + 1] = color[1]; base.data[i * 4 + 2] = color[2]; base.data[i * 4 + 3] = 255; }
  }
  return base;
};

// ---------- 윤곽 추적 (Moore 이웃) ----------
type Pt = [number, number];

const traceContours = (mask: Uint8Array, w: number, h: number): Pt[][] => {
  const contours: Pt[][] = [];
  const visited = new Uint8Array(w * h);
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  const DIRS: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i] || visited[i]) continue;
      // 왼쪽이 비어 있는 픽셀에서만 추적 시작(외곽선 시작점)
      if (at(x - 1, y)) continue;
      const contour: Pt[] = [];
      let cx = x, cy = y, dir = 6; // 진입 방향(위쪽부터 탐색)
      const sx = x, sy = y;
      let guard = 0;
      do {
        contour.push([cx, cy]);
        visited[cy * w + cx] = 1;
        let found = false;
        for (let k = 0; k < 8; k++) {
          const d = (dir + 6 + k) % 8;
          const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (at(nx, ny)) { cx = nx; cy = ny; dir = d; found = true; break; }
        }
        if (!found) break;
        guard++;
      } while ((cx !== sx || cy !== sy) && guard < w * h * 4);
      if (contour.length >= 2) contours.push(contour);
    }
  }
  return contours;
};

const rdp = (pts: Pt[], eps: number): Pt[] => {
  if (pts.length < 3 || eps <= 0) return pts;
  const out: Pt[] = [];
  const rec = (a: number, b: number): void => {
    let maxD = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx >= 0) { rec(a, idx); rec(idx, b); }
    else out.push(pts[b]);
  };
  out.push(pts[0]);
  rec(0, pts.length - 1);
  return out;
};

// ---------- Zingl AA 라인 ----------
type SetPx = (x: number, y: number, cov: number) => void;

export const plotLineAA = (x0: number, y0: number, x1: number, y1: number, set: SetPx): void => {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const ed = dx + dy === 0 ? 1 : Math.sqrt(dx * dx + dy * dy);
  for (let guard = 0; guard < 100000; guard++) {
    set(x0, y0, 1 - Math.abs(err - dx + dy) / ed);
    const e2 = err;
    const x2 = x0;
    if (2 * e2 >= -dx) {
      if (x0 === x1) break;
      if (e2 + dy < ed) set(x0, y0 + sy, 1 - (e2 + dy) / ed);
      err -= dy; x0 += sx;
    }
    if (2 * e2 <= dy) {
      if (y0 === y1) break;
      if (dx - e2 < ed) set(x2 + sx, y0, 1 - (dx - e2) / ed);
      err += dx; y0 += sy;
    }
  }
};

export const plotLineWidth = (x0: number, y0: number, x1: number, y1: number, wd: number, set: SetPx): void => {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const ed = dx + dy === 0 ? 1 : Math.sqrt(dx * dx + dy * dy);
  const cov = (v: number): number => 1 - Math.max(0, Math.min(1, v));
  wd = (wd + 1) / 2;
  for (let guard = 0; guard < 100000; guard++) {
    set(x0, y0, cov(Math.abs(err - dx + dy) / ed - wd + 1));
    let e2 = err;
    const x2 = x0;
    if (2 * e2 >= -dx) {
      let y2 = y0;
      for (e2 += dy; e2 < ed * wd && (y1 !== y2 || dx > dy); e2 += dx) set(x0, (y2 += sy), cov(Math.abs(e2) / ed - wd + 1));
      if (x0 === x1) break;
      e2 = err; err -= dy; x0 += sx;
    }
    if (2 * e2 <= dy) {
      let x3 = x2;
      for (e2 = dx - e2; e2 < ed * wd && (x1 !== x3 || dx < dy); e2 += dy) set((x3 += sx), y0, cov(Math.abs(e2) / ed - wd + 1));
      if (y0 === y1) break;
      err += dx; y0 += sy;
    }
  }
};

// Catmull-Rom 스플라인을 짧은 AA 선분으로 근사
const catmullRomPoints = (pts: Pt[], closed: boolean, segs = 6): Pt[] => {
  const n = pts.length;
  if (n < 3) return pts;
  const out: Pt[] = [];
  const get = (i: number): Pt => pts[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < segs; s++) {
      const t = s / segs, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([Math.round(x), Math.round(y)]);
    }
  }
  out.push(closed ? get(0) : get(n - 1));
  return out;
};

export type BresenhamMode = 'aa_line' | 'thick' | 'curve' | 'clean_color' | 'clean_auto' | 'edge_aa';

/** 실루엣 가장자리에서 가장 흔한 색 (자동 외곽색 추정) */
const dominantEdgeColor = (img: Img, alphaThr: number): RGB | null => {
  const { width: w, height: h, data } = img;
  const votes = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = idx4(w, x, y);
      if (data[o + 3] < alphaThr) continue;
      const nb = [x > 0 ? o - 4 : -1, x < w - 1 ? o + 4 : -1, y > 0 ? o - w * 4 : -1, y < h - 1 ? o + w * 4 : -1];
      let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      for (const q of nb) if (q >= 0 && data[q + 3] < alphaThr) edge = true;
      if (!edge) continue;
      const k = rgbKey(data[o], data[o + 1], data[o + 2]);
      votes.set(k, (votes.get(k) || 0) + 1);
    }
  }
  let best = -1, bc = 0;
  for (const [k, c] of votes) if (c > bc) { bc = c; best = k; }
  return best >= 0 ? keyToRgb(best) : null;
};

export const bresenhamOutline = (img: Img, mode: BresenhamMode, thickness: number, color: RGB | null, tolerance: number, alphaThr: number): Img => {
  const { width: w, height: h, data } = img;
  if (mode === 'clean_color' || mode === 'clean_auto') {
    const target = mode === 'clean_color' ? color : dominantEdgeColor(img, alphaThr);
    if (!target) return img;
    return pixelLines(img, Math.max(1, Math.round(thickness)), target);
  }
  if (mode === 'edge_aa') {
    // 색 경계 픽셀을 이웃색과 섞어 부드럽게
    const out = cloneImg(img);
    const amt = Math.max(0, Math.min(1, tolerance)) * 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = idx4(w, x, y);
        if (data[o + 3] < alphaThr) continue;
        let r = 0, g = 0, b = 0, c = 0;
        const nb = [x > 0 ? o - 4 : -1, x < w - 1 ? o + 4 : -1, y > 0 ? o - w * 4 : -1, y < h - 1 ? o + w * 4 : -1];
        for (const q of nb) {
          if (q < 0 || data[q + 3] < alphaThr) continue;
          if (data[q] === data[o] && data[q + 1] === data[o + 1] && data[q + 2] === data[o + 2]) continue;
          r += data[q]; g += data[q + 1]; b += data[q + 2]; c++;
        }
        if (c === 0) continue;
        out.data[o] = data[o] + (r / c - data[o]) * amt;
        out.data[o + 1] = data[o + 1] + (g / c - data[o + 1]) * amt;
        out.data[o + 2] = data[o + 2] + (b / c - data[o + 2]) * amt;
      }
    }
    return out;
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = data[i * 4 + 3] >= alphaThr ? 1 : 0;
  const contours = traceContours(mask, w, h);
  if (contours.length === 0) return img;
  const lineColor: RGB = color ?? dominantEdgeColor(img, alphaThr) ?? [0, 0, 0];
  const out = cloneImg(img);
  const cov = new Float32Array(w * h);
  const set = (x: number, y: number, c: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h || c <= 0) return;
    const i = y * w + x;
    if (c > cov[i]) cov[i] = Math.min(1, c);
  };
  const eps = Math.max(0.3, tolerance);
  for (const contour of contours) {
    let pts = rdp(contour, eps);
    if (pts.length < 2) continue;
    const closed = contour.length > 3;
    if (mode === 'curve') pts = catmullRomPoints(pts, closed, 5);
    const n = pts.length;
    const segs = closed && mode !== 'curve' ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if (mode === 'thick') plotLineWidth(a[0], a[1], b[0], b[1], Math.max(1, thickness), set);
      else plotLineAA(a[0], a[1], b[0], b[1], set);
    }
  }
  // 커버리지로 합성 (이미지 위에 선을 얹는다; 투명 영역에도 그린다)
  for (let i = 0; i < w * h; i++) {
    const c = cov[i];
    if (c <= 0) continue;
    const o = i * 4;
    const a = data[o + 3] / 255;
    const outA = c + a * (1 - c);
    if (outA <= 0) continue;
    for (let k = 0; k < 3; k++) out.data[o + k] = Math.round((lineColor[k] * c + data[o + k] * a * (1 - c)) / outA);
    out.data[o + 3] = Math.round(outA * 255);
  }
  return out;
};

/** 실루엣 대비 기준 자동 외곽색: 밝은 이미지는 어둡게, 어두운 이미지는 밝게 */
export const autoOutlineColor = (img: Img): RGB => {
  const { data } = img;
  let s = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] === 0) continue; s += luma(data[i], data[i + 1], data[i + 2]); n++; }
  return n > 0 && s / n < 100 ? [240, 240, 240] : [16, 16, 24];
};
