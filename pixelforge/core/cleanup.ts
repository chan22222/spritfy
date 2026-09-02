// 입력 정리 / 픽셀 격자 노드군 — 선명·노이즈, AI 디노이즈, 색 번짐 정리, 배경 제거,
// AA 제거, 1px 정리, 유사색 병합, 자동 자르기, 격자 복원, 픽셀 스냅
import { Img, RGB, ColorSpace, createImg, cloneImg, clamp255, rgbKey, keyToRgb } from './types.ts';
import { rgbToLab, labToRgb, luma, colorToVec, nearestVec, type Metric } from './color.ts';
import { histogram, mergeHist, estimateBgColor } from './quantize.ts';
import { resampleFilter, upscaleInt } from './resample.ts';

const idx4 = (w: number, x: number, y: number): number => (y * w + x) * 4;

// ---------- 선명 / 노이즈 ----------
const median3 = (img: Img): Img => {
  const { width: w, height: h, data } = img;
  const out = cloneImg(img);
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      rs.length = gs.length = bs.length = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(h - 1, Math.max(0, y + j));
        for (let i = -1; i <= 1; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          const o = idx4(w, xx, yy);
          if (data[o + 3] === 0) continue;
          rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2]);
        }
      }
      if (rs.length === 0) continue;
      rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
      const o = idx4(w, x, y), m = rs.length >> 1;
      out.data[o] = rs[m]; out.data[o + 1] = gs[m]; out.data[o + 2] = bs[m];
    }
  }
  return out;
};

const blur3 = (img: Img): Img => {
  const { width: w, height: h, data } = img;
  const out = cloneImg(img);
  const k = [1, 2, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, ws = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(h - 1, Math.max(0, y + j));
        for (let i = -1; i <= 1; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          const o = idx4(w, xx, yy);
          if (data[o + 3] === 0) continue;
          const wgt = k[i + 1] * k[j + 1];
          r += data[o] * wgt; g += data[o + 1] * wgt; b += data[o + 2] * wgt; ws += wgt;
        }
      }
      if (ws === 0) continue;
      const o = idx4(w, x, y);
      out.data[o] = r / ws; out.data[o + 1] = g / ws; out.data[o + 2] = b / ws;
    }
  }
  return out;
};

export const preprocess = (img: Img, sharpen: number, noise: number): Img => {
  let cur = img;
  if (noise > 0) {
    const med = median3(img);
    cur = cloneImg(img);
    for (let i = 0; i < cur.data.length; i += 4) {
      if (cur.data[i + 3] === 0) continue;
      for (let c = 0; c < 3; c++) cur.data[i + c] = img.data[i + c] + (med.data[i + c] - img.data[i + c]) * noise;
    }
  }
  if (sharpen > 0) {
    const bl = blur3(cur);
    const out = cloneImg(cur);
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) continue;
      for (let c = 0; c < 3; c++) out.data[i + c] = clamp255(cur.data[i + c] + (cur.data[i + c] - bl.data[i + c]) * sharpen * 1.5);
    }
    cur = out;
  }
  return cur;
};

// ---------- AI 디노이즈 (Lab 색차 채널 평활) ----------
const boxBlurPlane = (src: Float32Array, mask: Uint8Array, w: number, h: number, r: number): Float32Array => {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const cnt = new Float32Array(w * h), cnt2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i; if (xx < 0 || xx >= w) continue; const p = y * w + xx; if (!mask[p]) continue; s += src[p]; c++; }
      tmp[y * w + x] = s; cnt[y * w + x] = c;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let j = -r; j <= r; j++) { const yy = y + j; if (yy < 0 || yy >= h) continue; const p = yy * w + x; s += tmp[p]; c += cnt[p]; }
      out[y * w + x] = c > 0 ? s / c : src[y * w + x]; cnt2[y * w + x] = c;
    }
  }
  return out;
};

export const aiDenoise = (img: Img, strength: number, lumaPreserve: number): Img => {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  const mask = new Uint8Array(n);
  const t: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] === 0) continue;
    mask[i] = 1;
    rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], t);
    L[i] = t[0]; A[i] = t[1]; B[i] = t[2];
  }
  const r = Math.max(1, Math.round(1 + strength * 3));
  const A2 = boxBlurPlane(boxBlurPlane(A, mask, w, h, r), mask, w, h, r);
  const B2 = boxBlurPlane(boxBlurPlane(B, mask, w, h, r), mask, w, h, r);
  const lAmount = strength * (1 - lumaPreserve) * 0.6;
  const L2 = lAmount > 0.01 ? boxBlurPlane(L, mask, w, h, 1) : L;
  const out = cloneImg(img);
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const a = A[i] + (A2[i] - A[i]) * strength, b = B[i] + (B2[i] - B[i]) * strength;
    const l = L[i] + (L2[i] - L[i]) * lAmount;
    const rgb = labToRgb(l, a, b);
    out.data[i * 4] = rgb[0]; out.data[i * 4 + 1] = rgb[1]; out.data[i * 4 + 2] = rgb[2];
  }
  return out;
};

// ---------- 연결 성분 (색 허용치 기반 union-find) ----------
const components = (img: Img, tol: number): { parent: Int32Array; size: Int32Array } => {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const tol2 = tol * tol;
  const close = (a: number, b: number): boolean => {
    const oa = a * 4, ob = b * 4;
    if ((data[oa + 3] === 0) !== (data[ob + 3] === 0)) return false;
    if (data[oa + 3] === 0) return true;
    const dr = data[oa] - data[ob], dg = data[oa + 1] - data[ob + 1], db = data[oa + 2] - data[ob + 2];
    return dr * dr + dg * dg + db * db <= tol2;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0 && close(i, i - 1)) { const a = find(i), b = find(i - 1); if (a !== b) parent[a] = b; }
      if (y > 0 && close(i, i - w)) { const a = find(i), b = find(i - w); if (a !== b) parent[a] = b; }
    }
  }
  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) { parent[i] = find(i); size[parent[i]]++; }
  return { parent, size };
};

export const colorCleanup = (img: Img, radius: number, tol: number): Img => {
  const { width: w, height: h, data } = img;
  const minArea = Math.max(1, Math.round(radius * radius));
  const { parent, size } = components(img, tol);
  const out = cloneImg(img);
  const votes = new Map<number, Map<number, number>>();
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const root = parent[i];
    if (size[root] >= minArea || data[i * 4 + 3] === 0) continue;
    const x = i % w, y = (i / w) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || parent[j] === root || size[parent[j]] < minArea || data[j * 4 + 3] === 0) continue;
      const k = rgbKey(data[j * 4], data[j * 4 + 1], data[j * 4 + 2]);
      let m = votes.get(root);
      if (!m) { m = new Map(); votes.set(root, m); }
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  const choice = new Map<number, RGB>();
  for (const [root, m] of votes) {
    let bestK = -1, bestC = 0;
    for (const [k, c] of m) if (c > bestC) { bestC = c; bestK = k; }
    if (bestK >= 0) choice.set(root, keyToRgb(bestK));
  }
  for (let i = 0; i < n; i++) {
    const c = choice.get(parent[i]);
    if (!c) continue;
    out.data[i * 4] = c[0]; out.data[i * 4 + 1] = c[1]; out.data[i * 4 + 2] = c[2];
  }
  return out;
};

// ---------- 배경 제거 ----------
export const removeBackground = (img: Img, tol: number, mode: 'flood' | 'global', color: RGB | null): Img => {
  const { width: w, height: h, data } = img;
  const bg = color ?? estimateBgColor(img);
  if (!bg) return img;
  const out = cloneImg(img);
  const tol2 = tol * tol;
  const match = (i: number): boolean => {
    const o = i * 4;
    if (data[o + 3] === 0) return true;
    const dr = data[o] - bg[0], dg = data[o + 1] - bg[1], db = data[o + 2] - bg[2];
    return dr * dr + dg * dg + db * db <= tol2;
  };
  const n = w * h;
  if (mode === 'global') {
    for (let i = 0; i < n; i++) if (match(i)) out.data[i * 4 + 3] = 0;
    return out;
  }
  const visited = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number): void => { if (!visited[i] && match(i)) { visited[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    out.data[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return out;
};

// ---------- AA 제거 ----------
export const deAntialias = (img: Img, strength: number, alphaThr: number): Img => {
  const { width: w, height: h, data } = img;
  const out = cloneImg(img);
  const n = w * h;
  if (alphaThr > 0) {
    for (let i = 0; i < n; i++) out.data[i * 4 + 3] = data[i * 4 + 3] >= alphaThr ? 255 : 0;
  }
  if (strength <= 0) return out;
  const src = out.data.slice();
  const maxRel = 0.12 + strength * 0.3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = idx4(w, x, y);
      if (src[o + 3] === 0) continue;
      const nbs: number[] = [];
      if (x > 0) nbs.push(o - 4);
      if (x < w - 1) nbs.push(o + 4);
      if (y > 0) nbs.push(o - w * 4);
      if (y < h - 1) nbs.push(o + w * 4);
      const pr = src[o], pg = src[o + 1], pb = src[o + 2];
      let bestSnap = -1, bestScore = Infinity;
      for (let a = 0; a < nbs.length; a++) {
        const oa = nbs[a];
        if (src[oa + 3] === 0) continue;
        for (let b = a + 1; b < nbs.length; b++) {
          const ob = nbs[b];
          if (src[ob + 3] === 0) continue;
          const ar = src[oa], ag = src[oa + 1], ab = src[oa + 2];
          const br = src[ob], bg = src[ob + 1], bb = src[ob + 2];
          const vx = br - ar, vy = bg - ag, vz = bb - ab;
          const len2 = vx * vx + vy * vy + vz * vz;
          if (len2 < 64) continue;
          const t = ((pr - ar) * vx + (pg - ag) * vy + (pb - ab) * vz) / len2;
          if (t < 0.08 || t > 0.92) continue;
          const cx = ar + vx * t - pr, cy = ag + vy * t - pg, cz = ab + vz * t - pb;
          const distSeg = Math.sqrt(cx * cx + cy * cy + cz * cz);
          const rel = distSeg / Math.sqrt(len2);
          if (rel < maxRel && rel < bestScore) { bestScore = rel; bestSnap = t < 0.5 ? oa : ob; }
        }
      }
      if (bestSnap >= 0) { out.data[o] = src[bestSnap]; out.data[o + 1] = src[bestSnap + 1]; out.data[o + 2] = src[bestSnap + 2]; }
    }
  }
  return out;
};

// ---------- 1px 정리 (pixel-perfect 라인 정리) ----------
const keyAt = (d: Uint8ClampedArray, o: number): number => (d[o + 3] === 0 ? -1 : rgbKey(d[o], d[o + 1], d[o + 2]));

export const pixelLines = (img: Img, iterations: number, onlyColor: RGB | null = null): Img => {
  const { width: w, height: h } = img;
  let cur = cloneImg(img);
  const onlyKey = onlyColor ? rgbKey(onlyColor[0], onlyColor[1], onlyColor[2]) : null;
  const iters = Math.max(1, Math.min(8, iterations | 0));
  for (let it = 0; it < iters; it++) {
    const src = cur.data;
    // 1) 1px 틈 메우기
    const filled = cloneImg(cur);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = idx4(w, x, y);
        const k = keyAt(src, o);
        const L = x > 0 ? keyAt(src, o - 4) : -2, R = x < w - 1 ? keyAt(src, o + 4) : -2;
        const U = y > 0 ? keyAt(src, o - w * 4) : -2, D = y < h - 1 ? keyAt(src, o + w * 4) : -2;
        let fill = -1;
        if (L >= 0 && L === R && L !== k && U !== L && D !== L) fill = L;
        else if (U >= 0 && U === D && U !== k && L !== U && R !== U) fill = U;
        if (fill < 0 || (onlyKey !== null && fill !== onlyKey)) continue;
        const c = keyToRgb(fill);
        filled.data[o] = c[0]; filled.data[o + 1] = c[1]; filled.data[o + 2] = c[2]; filled.data[o + 3] = 255;
      }
    }
    // 2) L자 모서리(더블) 제거
    const s2 = filled.data;
    const out = cloneImg(filled);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = idx4(w, x, y);
        const k = keyAt(s2, o);
        if (k < 0 || (onlyKey !== null && k !== onlyKey)) continue;
        const get = (dx: number, dy: number): number => {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) return -2;
          return keyAt(s2, idx4(w, xx, yy));
        };
        const L = get(-1, 0), R = get(1, 0), U = get(0, -1), D = get(0, 1);
        const UL = get(-1, -1), UR = get(1, -1), DL = get(-1, 1), DR = get(1, 1);
        const corner =
          (L === k && U === k && R !== k && D !== k && UL !== k) ||
          (U === k && R === k && L !== k && D !== k && UR !== k) ||
          (R === k && D === k && L !== k && U !== k && DR !== k) ||
          (D === k && L === k && R !== k && U !== k && DL !== k);
        if (!corner) continue;
        // 대체색: 8방향 이웃 중 k가 아닌 색의 최빈값 (투명 포함)
        const votes = new Map<number, number>();
        for (const nk of [L, R, U, D, UL, UR, DL, DR]) { if (nk === k || nk === -2) continue; votes.set(nk, (votes.get(nk) || 0) + 1); }
        let best = -2, bc = 0;
        for (const [nk, c] of votes) if (c > bc) { bc = c; best = nk; }
        if (best === -2) continue;
        if (best === -1) { out.data[o + 3] = 0; }
        else { const c = keyToRgb(best); out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; }
      }
    }
    cur = out;
  }
  return cur;
};

// ---------- 유사색 병합 ----------
export const colorMerge = (imgs: Img[], tol: number, space: ColorSpace, metric: Metric): Img[] => {
  if (tol <= 0) return imgs;
  const hist = histogram(imgs, 1e9);
  const useMetric: Metric = space === 'rgb' ? 'rgb' : metric;
  // 병합 대표색 (rgb/lab/de2000 거리)
  const merged = mergeHist(hist, tol, useMetric, 8192);
  const reps: RGB[] = Array.from(merged.keys, (k) => keyToRgb(k));
  if (reps.length === hist.keys.length) return imgs;
  // 각 원본색 → 가장 가까운 대표색 (선택 색공간 벡터 기준)
  const vecs = new Float32Array(reps.length * 3);
  for (let i = 0; i < reps.length; i++) colorToVec(space, reps[i][0], reps[i][1], reps[i][2], vecs, i * 3);
  const map = new Map<number, RGB>();
  const tmp = new Float32Array(3);
  const lookup = (r: number, g: number, b: number): RGB => {
    const k = rgbKey(r, g, b);
    let c = map.get(k);
    if (!c) {
      colorToVec(space, r, g, b, tmp, 0);
      c = reps[nearestVec(vecs, reps.length, tmp[0], tmp[1], tmp[2])];
      map.set(k, c);
    }
    return c;
  };
  return imgs.map((img) => {
    const out = cloneImg(img);
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) continue;
      const c = lookup(out.data[i], out.data[i + 1], out.data[i + 2]);
      out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2];
    }
    return out;
  });
};

// ---------- 자동 자르기 ----------
export const cropImg = (img: Img, x0: number, y0: number, x1: number, y1: number): Img => {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(img.width, x1); y1 = Math.min(img.height, y1);
  if (x1 <= x0 || y1 <= y0) return img;
  const out = createImg(x1 - x0, y1 - y0);
  for (let y = y0; y < y1; y++) out.data.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1) * 4), (y - y0) * out.width * 4);
  return out;
};

export type CropMode = 'transparent' | 'solid' | 'subject';

export const autoCropBounds = (img: Img, mode: CropMode, alphaThr: number, colorTol: number, margin: number): [number, number, number, number] | null => {
  const { width: w, height: h, data } = img;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { hasAlpha = true; break; }
  const useAlpha = mode === 'transparent' || (mode === 'subject' && hasAlpha);
  const bg = useAlpha ? null : estimateBgColor(img);
  const tol2 = colorTol * colorTol;
  const fg = (i: number): boolean => {
    const o = i * 4;
    if (useAlpha) return data[o + 3] >= Math.max(1, alphaThr);
    if (data[o + 3] < 128) return false;
    if (!bg) return true;
    const dr = data[o] - bg[0], dg = data[o + 1] - bg[1], db = data[o + 2] - bg[2];
    return dr * dr + dg * dg + db * db > tol2;
  };
  const rows = new Int32Array(h), cols = new Int32Array(w);
  let any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fg(y * w + x)) { rows[y]++; cols[x]++; any = true; }
  if (!any) return null;
  const rowMin = mode === 'subject' ? Math.max(1, Math.floor(w * margin)) : 1;
  const colMin = mode === 'subject' ? Math.max(1, Math.floor(h * margin)) : 1;
  let y0 = 0, y1 = h, x0 = 0, x1 = w;
  while (y0 < h && rows[y0] < rowMin) y0++;
  while (y1 > y0 && rows[y1 - 1] < rowMin) y1--;
  while (x0 < w && cols[x0] < colMin) x0++;
  while (x1 > x0 && cols[x1 - 1] < colMin) x1--;
  if (x1 <= x0 || y1 <= y0) return null;
  return [x0, y0, x1, y1];
};

/** 주어진 경계로 자르고, 패딩이 이미지 밖으로 나가면 투명 여백을 덧댄다 */
export const cropToBounds = (img: Img, b: [number, number, number, number], padding: number): Img => {
  const [x0, y0, x1, y1] = b;
  const cropped = cropImg(img, x0 - padding, y0 - padding, x1 + padding, y1 + padding);
  if (padding <= 0) return cropped;
  // 패딩이 이미지 밖으로 나가면 투명 여백을 덧댄다
  const wantW = x1 - x0 + padding * 2, wantH = y1 - y0 + padding * 2;
  if (cropped.width === wantW && cropped.height === wantH) return cropped;
  const out = createImg(wantW, wantH);
  const offX = Math.max(0, padding - x0), offY = Math.max(0, padding - y0);
  for (let y = 0; y < cropped.height; y++) out.data.set(cropped.data.subarray(y * cropped.width * 4, (y + 1) * cropped.width * 4), ((y + offY) * wantW + offX) * 4);
  return out;
};

export const autoCrop = (img: Img, mode: CropMode, padding: number, alphaThr: number, colorTol: number, margin: number): Img => {
  const b = autoCropBounds(img, mode, alphaThr, colorTol, margin);
  if (!b) return img;
  return cropToBounds(img, b, padding);
};

export { detectIntegerUpscale, downsampleExact } from './lossless.ts';

// ---------- 격자 감지 ----------
export interface GridInfo { cell: number; phaseX: number; phaseY: number; score: number }

const edgeProfile = (img: Img, axis: 'x' | 'y'): Float64Array => {
  const { width: w, height: h, data } = img;
  const len = axis === 'x' ? w : h;
  const prof = new Float64Array(len);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = idx4(w, x, y);
      const px = axis === 'x' ? x - 1 : x, py = axis === 'x' ? y : y - 1;
      if (px < 0 || py < 0) continue;
      const q = idx4(w, px, py);
      const d = Math.abs(luma(data[o], data[o + 1], data[o + 2]) - luma(data[q], data[q + 1], data[q + 2])) + Math.abs(data[o + 3] - data[q + 3]);
      prof[axis === 'x' ? x : y] += d;
    }
  }
  return prof;
};

const combScore = (prof: Float64Array, p: number): { score: number; phase: number } => {
  let mean = 0;
  for (let i = 1; i < prof.length; i++) mean += prof[i];
  mean /= Math.max(1, prof.length - 1);
  if (mean <= 0) return { score: 0, phase: 0 };
  let best = 0, bestPhase = 0;
  for (let ph = 0; ph < p; ph++) {
    let s = 0, c = 0;
    for (let i = ph; i < prof.length; i += p) { if (i === 0) continue; s += prof[i]; c++; }
    if (c === 0) continue;
    const v = s / c / mean;
    if (v > best) { best = v; bestPhase = ph; }
  }
  return { score: best, phase: bestPhase };
};

/** 평균을 뺀 가장자리 프로파일의 정규화 자기상관 (lag별) */
const autocorr = (prof: Float64Array, maxLag: number): Float64Array => {
  const n = prof.length - 1;
  let mean = 0;
  for (let i = 1; i < prof.length; i++) mean += prof[i];
  mean /= Math.max(1, n);
  const c = new Float64Array(prof.length);
  let norm = 0;
  for (let i = 1; i < prof.length; i++) { c[i] = prof[i] - mean; norm += c[i] * c[i]; }
  const out = new Float64Array(maxLag + 1);
  if (norm <= 0) return out;
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0, cnt = 0;
    for (let i = 1; i + lag < prof.length; i++) { s += c[i] * c[i + lag]; cnt++; }
    // 겹치는 길이로 보정
    out[lag] = cnt > 0 ? (s / norm) * ((prof.length - 1) / cnt) : 0;
  }
  return out;
};

export const detectGrid = (img: Img, fixedCell = 0): GridInfo => {
  const px = edgeProfile(img, 'x'), py = edgeProfile(img, 'y');
  const maxP = Math.max(2, Math.min(64, Math.floor(Math.min(img.width, img.height) / 3)));
  let cell = fixedCell > 1 ? Math.round(fixedCell) : 0;
  let score = 0;
  if (!cell) {
    const ax = autocorr(px, maxP), ay = autocorr(py, maxP);
    const ac = new Float64Array(maxP + 1);
    for (let p = 2; p <= maxP; p++) ac[p] = (ax[p] + ay[p]) / 2;
    let bestP = 0, bestV = -Infinity;
    for (let p = 2; p <= maxP; p++) if (ac[p] > bestV) { bestV = ac[p]; bestP = p; }
    if (bestP === 0 || bestV < 0.25) return { cell: 1, phaseX: 0, phaseY: 0, score: Math.max(0, bestV) };
    // 가장 작은 기본 주기: 최대 피크의 약수 중 국소 최대이면서 충분히 높은 것
    let chosen = bestP;
    for (let p = 2; p < bestP; p++) {
      if (bestP % p !== 0) continue;
      const localMax = ac[p] >= (ac[p - 1] ?? -Infinity) && ac[p] >= (ac[p + 1] ?? -Infinity);
      if (localMax && ac[p] >= bestV * 0.6) { chosen = p; break; }
    }
    cell = chosen; score = ac[chosen];
  } else {
    score = (combScore(px, cell).score + combScore(py, cell).score) / 2;
  }
  return { cell, phaseX: combScore(px, cell).phase % cell, phaseY: combScore(py, cell).phase % cell, score };
};

/** 셀 단위 샘플링: inner 비율(0=중심 픽셀, 1=셀 전체)의 알파 가중 평균 */
const sampleCells = (img: Img, cell: number, offX: number, offY: number, inner: number): Img => {
  const { width: w, height: h, data } = img;
  const cellsX = Math.max(1, Math.round((w - offX) / cell)), cellsY = Math.max(1, Math.round((h - offY) / cell));
  const out = createImg(cellsX, cellsY);
  const shrink = ((1 - Math.max(0, Math.min(1, inner))) * cell) / 2;
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const x0 = offX + cx * cell, y0 = offY + cy * cell;
      let sx0 = Math.floor(x0 + shrink), sx1 = Math.ceil(x0 + cell - shrink), sy0 = Math.floor(y0 + shrink), sy1 = Math.ceil(y0 + cell - shrink);
      if (sx1 <= sx0) { sx0 = Math.floor(x0 + cell / 2); sx1 = sx0 + 1; }
      if (sy1 <= sy0) { sy0 = Math.floor(y0 + cell / 2); sy1 = sy0 + 1; }
      let r = 0, g = 0, b = 0, wa = 0, sa = 0, n = 0;
      for (let y = Math.max(0, sy0); y < Math.min(h, sy1); y++) {
        for (let x = Math.max(0, sx0); x < Math.min(w, sx1); x++) {
          const o = idx4(w, x, y), a = data[o + 3];
          r += data[o] * a; g += data[o + 1] * a; b += data[o + 2] * a; wa += a; sa += a; n++;
        }
      }
      const di = (cy * cellsX + cx) * 4;
      if (n === 0) continue;
      if (wa > 0) { out.data[di] = Math.round(r / wa); out.data[di + 1] = Math.round(g / wa); out.data[di + 2] = Math.round(b / wa); }
      out.data[di + 3] = sa / n >= 127.5 ? 255 : 0;
    }
  }
  return out;
};

export const gridRestore = (img: Img, scale: number, tolerance: number, info?: GridInfo): Img => {
  info ??= detectGrid(img, scale);
  if (info.cell <= 1) return img;
  return sampleCells(img, info.cell, 0, 0, tolerance);
};

export const pixelSnap = (img: Img, cell: number, autoOffset: boolean, resampleInt: boolean, tolerance: number, info?: GridInfo): Img => {
  info ??= detectGrid(img, cell);
  if (info.cell <= 1) return img;
  const offX = autoOffset ? info.phaseX : 0, offY = autoOffset ? info.phaseY : 0;
  const small = sampleCells(img, info.cell, offX, offY, tolerance);
  if (!resampleInt) return small;
  const up = upscaleInt(small, info.cell);
  if (up.width === img.width && up.height === img.height) return up;
  // 크기가 다르면 원본 크기로 맞춘다 (nearest)
  return resampleFilter(up, img.width, img.height, 'box');
};
