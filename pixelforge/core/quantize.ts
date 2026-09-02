// 팔레트 추출(k-means / median cut / Orchard-Bouman PCA / 인기도), 팔레트 매핑, 디더링
import { Img, RGB, ColorSpace, rgbKey, keyToRgb, createImg, clamp255 } from './types.ts';
import { colorToVec, vecToRgb, paletteToVecs, nearestVec, colorDistance, rgbToLab, labToRgb, luma, type Metric } from './color.ts';

// ---------- 히스토그램 ----------
export interface ColorHist {
  keys: Int32Array;
  weights: Float32Array;
}

export const histogram = (imgs: Img[], maxPixels = 400000): ColorHist => {
  let total = 0;
  for (const im of imgs) total += im.width * im.height;
  const stride = Math.max(1, Math.ceil(total / maxPixels));
  const map = new Map<number, number>();
  let counter = 0;
  for (const im of imgs) {
    const d = im.data, n = im.width * im.height;
    for (let i = 0; i < n; i++) {
      if (counter++ % stride !== 0) continue;
      const o = i * 4;
      if (d[o + 3] < 128) continue;
      const k = rgbKey(d[o], d[o + 1], d[o + 2]);
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  const keys = new Int32Array(map.size), weights = new Float32Array(map.size);
  let i = 0;
  for (const [k, w] of map) { keys[i] = k; weights[i] = w; i++; }
  return { keys, weights };
};

/** 가장자리 픽셀에서 배경색 추정 (불투명 가장자리가 너무 적으면 null) */
export const estimateBgColor = (img: Img): RGB | null => {
  const { width: w, height: h, data } = img;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let opaque = 0, total = 0;
  const visit = (x: number, y: number): void => {
    const o = (y * w + x) * 4;
    total++;
    if (data[o + 3] < 128) return;
    opaque++;
    const k = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
    const e = bins.get(k);
    if (e) { e.n++; e.r += data[o]; e.g += data[o + 1]; e.b += data[o + 2]; }
    else bins.set(k, { n: 1, r: data[o], g: data[o + 1], b: data[o + 2] });
  };
  for (let x = 0; x < w; x++) { visit(x, 0); if (h > 1) visit(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { visit(0, y); if (w > 1) visit(w - 1, y); }
  if (total === 0 || opaque / total < 0.05) return null;
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
};

export const filterHistNearColor = (hist: ColorHist, color: RGB, tol: number): ColorHist => {
  const keep: number[] = [];
  for (let i = 0; i < hist.keys.length; i++) {
    if (colorDistance(keyToRgb(hist.keys[i]), color, 'rgb') > tol) keep.push(i);
  }
  if (keep.length === 0) return hist;
  return { keys: Int32Array.from(keep, (i) => hist.keys[i]), weights: Float32Array.from(keep, (i) => hist.weights[i]) };
};

/** 유사색 병합(응집형): 가중치 큰 색부터 대표색으로 삼고 임계 이내 색을 흡수 */
export const mergeHist = (hist: ColorHist, tol: number, metric: Metric, maxReps = 4096): ColorHist => {
  const n = hist.keys.length;
  if (n === 0 || tol <= 0) return hist;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => hist.weights[b] - hist.weights[a]);
  const repRgb: RGB[] = [];
  const repLab: Array<[number, number, number]> = [];
  const repW: number[] = [];
  const useLab = metric !== 'rgb';
  for (const i of order) {
    const rgb = keyToRgb(hist.keys[i]);
    const lab = useLab ? rgbToLab(rgb[0], rgb[1], rgb[2]) : null;
    let found = -1;
    for (let r = 0; r < repRgb.length; r++) {
      let d: number;
      if (metric === 'rgb') d = colorDistance(rgb, repRgb[r], 'rgb');
      else if (metric === 'lab') { const a = lab!, b = repLab[r]; const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2]; d = Math.sqrt(dl * dl + da * da + db * db); }
      else d = colorDistance(rgb, repRgb[r], 'de2000');
      if (d <= tol) { found = r; break; }
    }
    if (found >= 0) repW[found] += hist.weights[i];
    else if (repRgb.length < maxReps) { repRgb.push(rgb); repLab.push(lab ?? [0, 0, 0]); repW.push(hist.weights[i]); }
  }
  return {
    keys: Int32Array.from(repRgb, (c) => rgbKey(c[0], c[1], c[2])),
    weights: Float32Array.from(repW),
  };
};

// ---------- 추출 ----------
export type ExtractMethod = 'pca' | 'kmeans' | 'mediancut' | 'popularity';

export interface ExtractOptions {
  count: number;
  method: ExtractMethod;
  space: ColorSpace;
  /** 강한색 우선 0..1 (pca 전용) */
  vivid?: number;
}

const histToPoints = (hist: ColorHist, space: ColorSpace): Float32Array => {
  const pts = new Float32Array(hist.keys.length * 3);
  for (let i = 0; i < hist.keys.length; i++) {
    const k = hist.keys[i];
    colorToVec(space, (k >> 16) & 255, (k >> 8) & 255, k & 255, pts, i * 3);
  }
  return pts;
};

interface Cluster { idx: Int32Array; n: number; mean: [number, number, number]; lambda: number; axis: [number, number, number]; splittable: boolean }

const clusterStats = (pts: Float32Array, w: Float32Array, idx: Int32Array): Cluster => {
  let n = 0, mx = 0, my = 0, mz = 0;
  for (let t = 0; t < idx.length; t++) { const i = idx[t], wi = w[i]; n += wi; mx += pts[i * 3] * wi; my += pts[i * 3 + 1] * wi; mz += pts[i * 3 + 2] * wi; }
  if (n <= 0) return { idx, n: 0, mean: [0, 0, 0], lambda: 0, axis: [1, 0, 0], splittable: false };
  mx /= n; my /= n; mz /= n;
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
  for (let t = 0; t < idx.length; t++) {
    const i = idx[t], wi = w[i];
    const dx = pts[i * 3] - mx, dy = pts[i * 3 + 1] - my, dz = pts[i * 3 + 2] - mz;
    cxx += dx * dx * wi; cxy += dx * dy * wi; cxz += dx * dz * wi; cyy += dy * dy * wi; cyz += dy * dz * wi; czz += dz * dz * wi;
  }
  cxx /= n; cxy /= n; cxz /= n; cyy /= n; cyz /= n; czz /= n;
  // 거듭제곱 반복으로 주성분
  let vx = 1, vy = 1, vz = 1, lambda = 0;
  for (let it = 0; it < 24; it++) {
    const nx = cxx * vx + cxy * vy + cxz * vz;
    const ny = cxy * vx + cyy * vy + cyz * vz;
    const nz = cxz * vx + cyz * vy + czz * vz;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) { lambda = 0; break; }
    vx = nx / len; vy = ny / len; vz = nz / len; lambda = len;
  }
  return { idx, n, mean: [mx, my, mz], lambda, axis: [vx, vy, vz], splittable: idx.length > 1 && lambda > 1e-6 };
};

const orchardBouman = (pts: Float32Array, w: Float32Array, count: number, K: number): Cluster[] => {
  const all = new Int32Array(count);
  for (let i = 0; i < count; i++) all[i] = i;
  const clusters: Cluster[] = [clusterStats(pts, w, all)];
  while (clusters.length < K) {
    let best = -1, bestScore = 0;
    for (let c = 0; c < clusters.length; c++) {
      const cl = clusters[c];
      if (!cl.splittable) continue;
      const score = cl.n * cl.lambda;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best < 0) break;
    const cl = clusters[best];
    const left: number[] = [], right: number[] = [];
    for (let t = 0; t < cl.idx.length; t++) {
      const i = cl.idx[t];
      const proj = (pts[i * 3] - cl.mean[0]) * cl.axis[0] + (pts[i * 3 + 1] - cl.mean[1]) * cl.axis[1] + (pts[i * 3 + 2] - cl.mean[2]) * cl.axis[2];
      (proj <= 0 ? left : right).push(i);
    }
    if (left.length === 0 || right.length === 0) { cl.splittable = false; continue; }
    clusters.splice(best, 1, clusterStats(pts, w, Int32Array.from(left)), clusterStats(pts, w, Int32Array.from(right)));
  }
  return clusters;
};

const kmeansPP = (pts: Float32Array, w: Float32Array, count: number, K: number, iters = 12): Float32Array => {
  const centers = new Float32Array(K * 3);
  // 가중 k-means++ 초기화
  let totalW = 0;
  for (let i = 0; i < count; i++) totalW += w[i];
  let r = Math.random() * totalW, first = 0;
  for (let i = 0; i < count; i++) { r -= w[i]; if (r <= 0) { first = i; break; } }
  centers.set(pts.subarray(first * 3, first * 3 + 3), 0);
  const dist = new Float32Array(count).fill(Infinity);
  for (let k = 1; k < K; k++) {
    let sum = 0;
    const p = (k - 1) * 3;
    for (let i = 0; i < count; i++) {
      const dx = pts[i * 3] - centers[p], dy = pts[i * 3 + 1] - centers[p + 1], dz = pts[i * 3 + 2] - centers[p + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < dist[i]) dist[i] = d;
      sum += dist[i] * w[i];
    }
    if (sum <= 0) { centers.set(pts.subarray(0, 3), k * 3); continue; }
    let rr = Math.random() * sum, pick = count - 1;
    for (let i = 0; i < count; i++) { rr -= dist[i] * w[i]; if (rr <= 0) { pick = i; break; } }
    centers.set(pts.subarray(pick * 3, pick * 3 + 3), k * 3);
  }
  const sums = new Float32Array(K * 3), cnt = new Float32Array(K);
  for (let it = 0; it < iters; it++) {
    sums.fill(0); cnt.fill(0);
    for (let i = 0; i < count; i++) {
      const k = nearestVec(centers, K, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      sums[k * 3] += pts[i * 3] * w[i]; sums[k * 3 + 1] += pts[i * 3 + 1] * w[i]; sums[k * 3 + 2] += pts[i * 3 + 2] * w[i]; cnt[k] += w[i];
    }
    for (let k = 0; k < K; k++) {
      if (cnt[k] > 0) { centers[k * 3] = sums[k * 3] / cnt[k]; centers[k * 3 + 1] = sums[k * 3 + 1] / cnt[k]; centers[k * 3 + 2] = sums[k * 3 + 2] / cnt[k]; }
    }
  }
  return centers;
};

const medianCut = (pts: Float32Array, w: Float32Array, count: number, K: number): Float32Array => {
  type Box = { idx: number[] };
  let boxes: Box[] = [{ idx: Array.from({ length: count }, (_, i) => i) }];
  while (boxes.length < K) {
    let best = -1, bestRange = 0, bestAxis = 0;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (box.idx.length < 2) continue;
      for (let a = 0; a < 3; a++) {
        let lo = Infinity, hi = -Infinity;
        for (const i of box.idx) { const v = pts[i * 3 + a]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bestRange) { bestRange = hi - lo; best = b; bestAxis = a; }
      }
    }
    if (best < 0 || bestRange <= 1e-6) break;
    const box = boxes[best];
    box.idx.sort((p, q) => pts[p * 3 + bestAxis] - pts[q * 3 + bestAxis]);
    let total = 0;
    for (const i of box.idx) total += w[i];
    let acc = 0, cut = 0;
    for (; cut < box.idx.length - 1; cut++) { acc += w[box.idx[cut]]; if (acc >= total / 2) { cut++; break; } }
    if (cut <= 0 || cut >= box.idx.length) cut = box.idx.length >> 1;
    boxes.splice(best, 1, { idx: box.idx.slice(0, cut) }, { idx: box.idx.slice(cut) });
  }
  const centers = new Float32Array(boxes.length * 3);
  boxes.forEach((box, b) => {
    let n = 0, x = 0, y = 0, z = 0;
    for (const i of box.idx) { n += w[i]; x += pts[i * 3] * w[i]; y += pts[i * 3 + 1] * w[i]; z += pts[i * 3 + 2] * w[i]; }
    if (n > 0) { centers[b * 3] = x / n; centers[b * 3 + 1] = y / n; centers[b * 3 + 2] = z / n; }
  });
  return centers;
};

const dedupe = (colors: RGB[]): RGB[] => {
  const seen = new Set<number>();
  const out: RGB[] = [];
  for (const c of colors) { const k = rgbKey(c[0], c[1], c[2]); if (!seen.has(k)) { seen.add(k); out.push(c); } }
  return out;
};

export const extractPalette = (hist: ColorHist, opt: ExtractOptions): RGB[] => {
  const count = hist.keys.length;
  const K = Math.max(1, Math.min(256, opt.count | 0));
  if (count === 0) return [];
  if (count <= K) return Array.from(hist.keys, (k) => keyToRgb(k));
  const space = opt.space;
  if (opt.method === 'popularity') {
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => hist.weights[b] - hist.weights[a]);
    return order.slice(0, K).map((i) => keyToRgb(hist.keys[i]));
  }
  const pts = histToPoints(hist, space);
  const w = hist.weights;
  let centers: Float32Array;
  if (opt.method === 'kmeans') centers = kmeansPP(pts, w, count, K);
  else if (opt.method === 'mediancut') centers = medianCut(pts, w, count, K);
  else {
    const vivid = Math.max(0, Math.min(1, opt.vivid ?? 0));
    const reserve = vivid > 0 && K >= 4 ? Math.max(1, Math.round(vivid * K * 0.3)) : 0;
    const base = orchardBouman(pts, w, count, K - reserve);
    const list: number[] = [];
    for (const c of base) list.push(c.mean[0], c.mean[1], c.mean[2]);
    if (reserve > 0) {
      // 후보: 채도가 높고 기존 중심으로 잘 표현되지 않는 점들
      const baseVecs = Float32Array.from(list);
      const nb = base.length;
      const chroma = new Float32Array(count);
      let cw = 0, chromaMean = 0;
      for (let i = 0; i < count; i++) { chroma[i] = Math.hypot(pts[i * 3 + 1], pts[i * 3 + 2]); chromaMean += chroma[i] * w[i]; cw += w[i]; }
      chromaMean = cw > 0 ? chromaMean / cw : 0;
      const cand: number[] = [];
      for (let i = 0; i < count; i++) {
        if (chroma[i] < chromaMean * 1.3 + 4) continue;
        const k = nearestVec(baseVecs, nb, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
        const dx = pts[i * 3] - baseVecs[k * 3], dy = pts[i * 3 + 1] - baseVecs[k * 3 + 1], dz = pts[i * 3 + 2] - baseVecs[k * 3 + 2];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 6 + (1 - vivid) * 10) cand.push(i);
      }
      if (cand.length > 0) {
        const cIdx = Int32Array.from(cand);
        const sub = new Float32Array(cand.length * 3), subW = new Float32Array(cand.length);
        for (let t = 0; t < cand.length; t++) { sub.set(pts.subarray(cIdx[t] * 3, cIdx[t] * 3 + 3), t * 3); subW[t] = w[cIdx[t]] * (1 + chroma[cIdx[t]] / 20); }
        const extra = orchardBouman(sub, subW, cand.length, reserve);
        for (const c of extra) list.push(c.mean[0], c.mean[1], c.mean[2]);
      } else {
        // 후보가 없으면 남은 슬롯은 일반 분할로 채운다
        const more = orchardBouman(pts, w, count, K);
        list.length = 0;
        for (const c of more) list.push(c.mean[0], c.mean[1], c.mean[2]);
      }
    }
    centers = Float32Array.from(list);
  }
  const out: RGB[] = [];
  for (let k = 0; k < centers.length / 3; k++) out.push(vecToRgb(space, centers[k * 3], centers[k * 3 + 1], centers[k * 3 + 2]));
  return dedupe(out);
};

// ---------- 팔레트 매핑 ----------
export const mapToPalette = (img: Img, palette: RGB[], space: ColorSpace, perceptual = false): Img => {
  if (palette.length === 0) return img;
  const out = createImg(img.width, img.height);
  const src = perceptual ? perceptualPrefilter(img) : img.data;
  const vecs = paletteToVecs(space, palette);
  const n = palette.length;
  const cache = new Map<number, number>();
  const tmp = new Float32Array(3);
  const d = img.data, o = out.data;
  for (let i = 0; i < img.width * img.height; i++) {
    const p = i * 4;
    const a = d[p + 3];
    if (a === 0) { o[p + 3] = 0; continue; }
    const k = rgbKey(src[p], src[p + 1], src[p + 2]);
    let idx = cache.get(k);
    if (idx === undefined) {
      colorToVec(space, src[p], src[p + 1], src[p + 2], tmp, 0);
      idx = nearestVec(vecs, n, tmp[0], tmp[1], tmp[2]);
      cache.set(k, idx);
    }
    const c = palette[idx];
    o[p] = c[0]; o[p + 1] = c[1]; o[p + 2] = c[2]; o[p + 3] = a;
  }
  return out;
};

/** S-CIELAB 근사: 색차(a,b) 채널만 3x3 가우시안으로 흐려 판단용 색을 만든다 */
const perceptualPrefilter = (img: Img): Uint8ClampedArray => {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const lab = new Float32Array(n * 3);
  const t: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) { rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], t); lab[i * 3] = t[0]; lab[i * 3 + 1] = t[1]; lab[i * 3 + 2] = t[2]; }
  const out = new Uint8ClampedArray(n * 4);
  const kern = [1, 2, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0, b = 0, ws = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = y + j; if (yy < 0 || yy >= h) continue;
        for (let i = -1; i <= 1; i++) {
          const xx = x + i; if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (data[q * 4 + 3] === 0) continue;
          const wgt = kern[i + 1] * kern[j + 1];
          a += lab[q * 3 + 1] * wgt; b += lab[q * 3 + 2] * wgt; ws += wgt;
        }
      }
      const p = y * w + x;
      const rgb = ws > 0 ? labToRgb(lab[p * 3], a / ws, b / ws) : [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
      out[p * 4] = rgb[0]; out[p * 4 + 1] = rgb[1]; out[p * 4 + 2] = rgb[2]; out[p * 4 + 3] = data[p * 4 + 3];
    }
  }
  return out;
};

// ---------- 디더링 ----------
export type DitherMethod = 'none' | 'floyd' | 'atkinson' | 'jarvis' | 'sierra' | 'ordered4' | 'ordered8' | 'bluenoise' | 'ostro';

const KERNELS: Record<string, Array<[number, number, number]>> = {
  floyd: [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]],
  atkinson: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]],
  jarvis: [[1, 0, 7 / 48], [2, 0, 5 / 48], [-2, 1, 3 / 48], [-1, 1, 5 / 48], [0, 1, 7 / 48], [1, 1, 5 / 48], [2, 1, 3 / 48], [-2, 2, 1 / 48], [-1, 2, 3 / 48], [0, 2, 5 / 48], [1, 2, 3 / 48], [2, 2, 1 / 48]],
  sierra: [[1, 0, 5 / 32], [2, 0, 3 / 32], [-2, 1, 2 / 32], [-1, 1, 4 / 32], [0, 1, 5 / 32], [1, 1, 4 / 32], [2, 1, 2 / 32], [-1, 2, 2 / 32], [0, 2, 3 / 32], [1, 2, 2 / 32]],
};

// Ostromoukhov(2001) 가변 계수 — 어두운 영역의 키 값 + 중간톤은 FS 유사 계수로 보간한 근사 테이블
const OSTRO_KEYS: Array<[number, number, number, number]> = [
  [0, 13, 0, 5], [1, 13, 0, 5], [2, 21, 0, 10], [3, 7, 0, 4], [4, 8, 0, 5], [5, 47, 3, 28], [6, 23, 3, 13], [7, 15, 3, 8],
  [8, 22, 6, 11], [9, 43, 15, 20], [10, 7, 3, 3], [11, 501, 224, 211], [12, 249, 116, 103], [13, 318, 152, 126], [14, 91, 45, 35], [15, 79, 40, 29],
  [22, 5, 2, 2], [32, 4, 1, 1], [44, 7, 3, 5], [64, 7, 3, 5], [72, 3, 1, 3], [77, 4, 1, 3], [85, 3, 1, 2], [95, 7, 3, 5], [107, 4, 1, 3], [127, 7, 3, 5],
];
let ostroTable: Float32Array | null = null;
const getOstroTable = (): Float32Array => {
  if (ostroTable) return ostroTable;
  const t = new Float32Array(256 * 3);
  for (let v = 0; v < 128; v++) {
    let lo = OSTRO_KEYS[0], hi = OSTRO_KEYS[OSTRO_KEYS.length - 1];
    for (let i = 0; i < OSTRO_KEYS.length - 1; i++) {
      if (v >= OSTRO_KEYS[i][0] && v <= OSTRO_KEYS[i + 1][0]) { lo = OSTRO_KEYS[i]; hi = OSTRO_KEYS[i + 1]; break; }
    }
    const f = hi[0] === lo[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
    const a = lo[1] + (hi[1] - lo[1]) * f, b = lo[2] + (hi[2] - lo[2]) * f, c = lo[3] + (hi[3] - lo[3]) * f;
    const s = a + b + c;
    t[v * 3] = a / s; t[v * 3 + 1] = b / s; t[v * 3 + 2] = c / s;
    t[(255 - v) * 3] = a / s; t[(255 - v) * 3 + 1] = b / s; t[(255 - v) * 3 + 2] = c / s;
  }
  ostroTable = t;
  return t;
};

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// M(2n) = [[4M(n), 4M(n)+2], [4M(n)+3, 4M(n)+1]] 재귀로 8x8 Bayer 행렬 생성
const bayer8 = (): number[] => {
  let m: number[] = [0, 2, 3, 1];
  let size = 2;
  while (size < 8) {
    const next: number[] = new Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = m[y * size + x] * 4;
        next[y * size * 2 + x] = v;
        next[y * size * 2 + x + size] = v + 2;
        next[(y + size) * size * 2 + x] = v + 3;
        next[(y + size) * size * 2 + x + size] = v + 1;
      }
    }
    m = next;
    size *= 2;
  }
  return m;
};
const BAYER8 = bayer8();

// 블루노이즈 (void-and-cluster, 64x64) — 최초 사용 시 1회 생성
let blueNoise: Float32Array | null = null;
const BN = 64;
const makeBlueNoise = (): Float32Array => {
  const N = BN, total = N * N;
  const sigma = 1.9, inv = 1 / (2 * sigma * sigma);
  const kernel = new Float32Array(total);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = Math.min(x, N - x), dy = Math.min(y, N - y);
    kernel[y * N + x] = Math.exp(-(dx * dx + dy * dy) * inv);
  }
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const bin = new Uint8Array(total);
  const energy = new Float32Array(total);
  const addE = (p: number, sign: number): void => {
    const px = p % N, py = (p / N) | 0;
    for (let y = 0; y < N; y++) {
      const ky = ((y - py) + N) % N;
      for (let x = 0; x < N; x++) energy[y * N + x] += sign * kernel[ky * N + ((x - px) + N) % N];
    }
  };
  let ones = 0;
  const target = Math.floor(total * 0.1);
  while (ones < target) { const p = Math.floor(rnd() * total); if (!bin[p]) { bin[p] = 1; addE(p, 1); ones++; } }
  const argOnes = (max: boolean): number => {
    let best = -1, bv = max ? -Infinity : Infinity;
    for (let p = 0; p < total; p++) { if (bin[p] !== 1) continue; if (max ? energy[p] > bv : energy[p] < bv) { bv = energy[p]; best = p; } }
    return best;
  };
  const argZeros = (max: boolean): number => {
    let best = -1, bv = max ? -Infinity : Infinity;
    for (let p = 0; p < total; p++) { if (bin[p] !== 0) continue; if (max ? energy[p] > bv : energy[p] < bv) { bv = energy[p]; best = p; } }
    return best;
  };
  for (let it = 0; it < total; it++) {
    const c = argOnes(true); bin[c] = 0; addE(c, -1);
    const v = argZeros(false);
    if (v === c) { bin[c] = 1; addE(c, 1); break; }
    bin[v] = 1; addE(v, 1);
  }
  const rank = new Int32Array(total);
  const initial = bin.slice();
  const initialE = energy.slice();
  // phase 1
  let count = ones;
  while (count > 0) { const p = argOnes(true); bin[p] = 0; addE(p, -1); count--; rank[p] = count; }
  // phase 2
  bin.set(initial); energy.set(initialE); count = ones;
  while (count < total / 2) { const p = argZeros(false); bin[p] = 1; addE(p, 1); rank[p] = count; count++; }
  // phase 3: 0을 소수로 보고 에너지 재계산
  energy.fill(0);
  for (let p = 0; p < total; p++) if (bin[p] === 0) addE(p, 1);
  while (count < total) { const p = argZeros(true); bin[p] = 1; addE(p, -1); rank[p] = count; count++; }
  const out = new Float32Array(total);
  for (let p = 0; p < total; p++) out[p] = (rank[p] + 0.5) / total;
  return out;
};
export const getBlueNoise = (): Float32Array => (blueNoise ??= makeBlueNoise());

/** 팔레트 색 간 평균 최근접 거리(RGB) — 순서 디더의 진폭 */
const paletteSpread = (palette: RGB[]): number => {
  if (palette.length < 2) return 64;
  let sum = 0;
  for (let i = 0; i < palette.length; i++) {
    let best = Infinity;
    for (let j = 0; j < palette.length; j++) { if (i === j) continue; const d = colorDistance(palette[i], palette[j], 'rgb'); if (d < best) best = d; }
    sum += best;
  }
  return Math.max(8, Math.min(110, (sum / palette.length) * 0.9));
};

export const dither = (img: Img, palette: RGB[], method: DitherMethod, strength: number, space: ColorSpace): Img => {
  if (palette.length === 0) return img;
  if (method === 'none' || strength <= 0) return mapToPalette(img, palette, space);
  const { width: w, height: h, data } = img;
  const out = createImg(w, h);
  const vecs = paletteToVecs(space, palette);
  const n = palette.length;
  const tmp = new Float32Array(3);
  const nearest = (r: number, g: number, b: number): number => {
    colorToVec(space, clamp255(r), clamp255(g), clamp255(b), tmp, 0);
    return nearestVec(vecs, n, tmp[0], tmp[1], tmp[2]);
  };
  if (method === 'ordered4' || method === 'ordered8' || method === 'bluenoise') {
    const spread = paletteSpread(palette) * strength;
    const bn = method === 'bluenoise' ? getBlueNoise() : null;
    const cache = new Map<number, number>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        if (data[p + 3] === 0) continue;
        let t: number;
        if (bn) t = bn[(y % BN) * BN + (x % BN)];
        else if (method === 'ordered4') t = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        else t = (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
        const off = (t - 0.5) * spread;
        const r = clamp255(Math.round(data[p] + off)), g = clamp255(Math.round(data[p + 1] + off)), b = clamp255(Math.round(data[p + 2] + off));
        const k = rgbKey(r, g, b);
        let idx = cache.get(k);
        if (idx === undefined) { idx = nearest(r, g, b); cache.set(k, idx); }
        const c = palette[idx];
        out.data[p] = c[0]; out.data[p + 1] = c[1]; out.data[p + 2] = c[2]; out.data[p + 3] = data[p + 3];
      }
    }
    return out;
  }
  // 오차 확산 (serpentine)
  const buf = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { buf[i * 3] = data[i * 4]; buf[i * 3 + 1] = data[i * 4 + 1]; buf[i * 3 + 2] = data[i * 4 + 2]; }
  const kernel = method === 'ostro' ? null : KERNELS[method];
  const ostro = method === 'ostro' ? getOstroTable() : null;
  for (let y = 0; y < h; y++) {
    const ltr = (y & 1) === 0;
    for (let xi = 0; xi < w; xi++) {
      const x = ltr ? xi : w - 1 - xi;
      const i = y * w + x;
      const p = i * 4;
      if (data[p + 3] === 0) continue;
      const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
      const idx = nearest(r, g, b);
      const c = palette[idx];
      out.data[p] = c[0]; out.data[p + 1] = c[1]; out.data[p + 2] = c[2]; out.data[p + 3] = data[p + 3];
      const er = (r - c[0]) * strength, eg = (g - c[1]) * strength, eb = (b - c[2]) * strength;
      const dir = ltr ? 1 : -1;
      let taps: Array<[number, number, number]>;
      if (ostro) {
        const lv = clamp255(Math.round(luma(r, g, b)));
        taps = [[1, 0, ostro[lv * 3]], [-1, 1, ostro[lv * 3 + 1]], [0, 1, ostro[lv * 3 + 2]]];
      } else taps = kernel!;
      for (const [dx, dy, wgt] of taps) {
        const xx = x + dx * dir, yy = y + dy;
        if (xx < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (data[j * 4 + 3] === 0) continue;
        buf[j * 3] += er * wgt; buf[j * 3 + 1] += eg * wgt; buf[j * 3 + 2] += eb * wgt;
      }
    }
  }
  return out;
};

/** 이미지의 고유색이 limit 이하이면 그 색들을, 아니면 자동 추출 팔레트를 돌려준다 */
export const implicitPalette = (img: Img, limit = 256, fallbackCount = 32): RGB[] => {
  const hist = histogram([img], 1e9);
  if (hist.keys.length <= limit) return Array.from(hist.keys, (k) => keyToRgb(k));
  return extractPalette(hist, { count: fallbackCount, method: 'pca', space: 'oklab' });
};
