// 리샘플링 — 다운스케일 10종, 스케일, 회전
import { Img, createImg, clamp255 } from './types.ts';
import { slic } from './slic.ts';

export type DownscaleMethod = 'box' | 'dpid' | 'bilateral' | 'ssim' | 'slic' | 'nearest' | 'median' | 'lanczos' | 'bicubic';

export interface DownscaleOptions {
  method: DownscaleMethod;
  /** DPID λ (0=박스, 1=기본, 2=디테일 강조) */
  detail?: number;
  /** bilateral: 가장자리 보존 0..1 */
  edge?: number;
  /** bilateral: 공간 확장 0..1 */
  smoothness?: number;
  /** ssim: 패치 반경 1..3 */
  radius?: number;
  /** ssim: 선명 0..1 */
  sharpness?: number;
  /** slic */
  iterations?: number;
  compactness?: number;
  smoothing?: number;
  /** 알파: 'opaque'면 커버리지 50% 기준으로 이진화, 'keep'이면 실제 커버리지 유지 */
  alphaMode?: 'opaque' | 'keep';
}

/** 긴 변 기준 목표 크기 (확대는 하지 않는다) */
export const fitLongSide = (w: number, h: number, longSide: number): [number, number] => {
  if (longSide <= 0) return [w, h];
  const s = longSide / Math.max(w, h);
  if (s >= 1) return [w, h];
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
};

// ---------- 분리형 필터 리샘플 (premultiplied alpha) ----------
type Filter = (x: number) => number;
const triangle: Filter = (x) => { x = Math.abs(x); return x < 1 ? 1 - x : 0; };
const catmullRom: Filter = (x) => {
  x = Math.abs(x);
  if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
  return 0;
};
const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos3: Filter = (x) => { x = Math.abs(x); return x < 3 ? sinc(x) * sinc(x / 3) : 0; };

interface AxisWeights { start: Int32Array; count: Int32Array; weights: Float32Array; maxCount: number }

const axisWeights = (srcLen: number, dstLen: number, filter: Filter | 'box', support: number): AxisWeights => {
  const scale = dstLen / srcLen;
  const fscale = scale < 1 ? 1 / scale : 1;
  const supp = support * fscale;
  const maxCount = Math.ceil(supp * 2) + 2;
  const start = new Int32Array(dstLen), count = new Int32Array(dstLen);
  const weights = new Float32Array(dstLen * maxCount);
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) / scale;
    const lo = Math.max(0, Math.floor(center - supp));
    const hi = Math.min(srcLen - 1, Math.ceil(center + supp));
    let sum = 0, c = 0;
    for (let j = lo; j <= hi && c < maxCount; j++) {
      let wgt: number;
      if (filter === 'box') {
        const half = fscale / 2;
        wgt = Math.max(0, Math.min(j + 1, center + half) - Math.max(j, center - half));
      } else {
        wgt = filter((j + 0.5 - center) / fscale);
      }
      if (wgt === 0 && c === 0) { continue; }
      if (c === 0) start[i] = j;
      weights[i * maxCount + c] = wgt;
      sum += wgt;
      c++;
    }
    while (c > 0 && weights[i * maxCount + c - 1] === 0) c--;
    if (c === 0) { start[i] = Math.min(srcLen - 1, Math.floor(center)); weights[i * maxCount] = 1; sum = 1; c = 1; }
    if (sum !== 0) for (let k = 0; k < c; k++) weights[i * maxCount + k] /= sum;
    count[i] = c;
  }
  return { start, count, weights, maxCount };
};

const toPremul = (img: Img): Float32Array => {
  const n = img.width * img.height;
  const out = new Float32Array(n * 4);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4, a = d[o + 3] / 255;
    out[o] = d[o] * a; out[o + 1] = d[o + 1] * a; out[o + 2] = d[o + 2] * a; out[o + 3] = d[o + 3];
  }
  return out;
};

const fromPremul = (buf: Float32Array, w: number, h: number): Img => {
  const img = createImg(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4, a = buf[o + 3];
    if (a <= 0.001) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
    const inv = 255 / a;
    d[o] = clamp255(Math.round(buf[o] * inv));
    d[o + 1] = clamp255(Math.round(buf[o + 1] * inv));
    d[o + 2] = clamp255(Math.round(buf[o + 2] * inv));
    d[o + 3] = clamp255(Math.round(a));
  }
  return img;
};

export const resampleFilter = (src: Img, dw: number, dh: number, kind: 'box' | 'bilinear' | 'bicubic' | 'lanczos'): Img => {
  const filter: Filter | 'box' = kind === 'box' ? 'box' : kind === 'bilinear' ? triangle : kind === 'bicubic' ? catmullRom : lanczos3;
  const support = kind === 'box' ? 0.5 : kind === 'bilinear' ? 1 : kind === 'bicubic' ? 2 : 3;
  const sw = src.width, sh = src.height;
  const wx = axisWeights(sw, dw, filter, support);
  const wy = axisWeights(sh, dh, filter, support);
  const pm = toPremul(src);
  const tmp = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const s = wx.start[x], c = wx.count[x];
      for (let k = 0; k < c; k++) {
        const wgt = wx.weights[x * wx.maxCount + k];
        const o = (y * sw + s + k) * 4;
        r += pm[o] * wgt; g += pm[o + 1] * wgt; b += pm[o + 2] * wgt; a += pm[o + 3] * wgt;
      }
      const o = (y * dw + x) * 4;
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
    }
  }
  const out = new Float32Array(dw * dh * 4);
  for (let x = 0; x < dw; x++) {
    for (let y = 0; y < dh; y++) {
      let r = 0, g = 0, b = 0, a = 0;
      const s = wy.start[y], c = wy.count[y];
      for (let k = 0; k < c; k++) {
        const wgt = wy.weights[y * wy.maxCount + k];
        const o = ((s + k) * dw + x) * 4;
        r += tmp[o] * wgt; g += tmp[o + 1] * wgt; b += tmp[o + 2] * wgt; a += tmp[o + 3] * wgt;
      }
      const o = (y * dw + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  return fromPremul(out, dw, dh);
};

export const resampleNearest = (src: Img, dw: number, dh: number): Img => {
  const out = createImg(dw, dh);
  const sw = src.width, sh = src.height;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
      const si = (sy * sw + sx) * 4, di = (y * dw + x) * 4;
      out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
};

// ---------- 블록 기반 방법들 ----------
interface Block { x0: number; x1: number; y0: number; y1: number }
const blockOf = (ox: number, oy: number, sw: number, sh: number, dw: number, dh: number): Block => {
  const x0 = Math.floor((ox * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * sw) / dw));
  const y0 = Math.floor((oy * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * sh) / dh));
  return { x0, x1: Math.min(sw, x1), y0, y1: Math.min(sh, y1) };
};

/** 블록 평균(불투명 가중) + 커버리지 알파. 반환: rgb(dw*dh*3), alpha(dw*dh) */
const blockMeans = (src: Img, dw: number, dh: number): { rgb: Float32Array; alpha: Float32Array } => {
  const rgb = new Float32Array(dw * dh * 3);
  const alpha = new Float32Array(dw * dh);
  const { width: sw, height: sh, data } = src;
  for (let oy = 0; oy < dh; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      const b = blockOf(ox, oy, sw, sh, dw, dh);
      let r = 0, g = 0, bl = 0, wa = 0, sa = 0, n = 0;
      for (let y = b.y0; y < b.y1; y++) {
        for (let x = b.x0; x < b.x1; x++) {
          const o = (y * sw + x) * 4, a = data[o + 3];
          r += data[o] * a; g += data[o + 1] * a; bl += data[o + 2] * a; wa += a; sa += a; n++;
        }
      }
      const oi = oy * dw + ox;
      if (wa > 0) { rgb[oi * 3] = r / wa; rgb[oi * 3 + 1] = g / wa; rgb[oi * 3 + 2] = bl / wa; }
      alpha[oi] = n > 0 ? sa / n : 0;
    }
  }
  return { rgb, alpha };
};

const finishAlpha = (a: number, mode: 'opaque' | 'keep'): number => (mode === 'keep' ? Math.round(a) : a >= 127.5 ? 255 : 0);

const downscaleMedian = (src: Img, dw: number, dh: number, alphaMode: 'opaque' | 'keep'): Img => {
  const out = createImg(dw, dh);
  const { width: sw, height: sh, data } = src;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let oy = 0; oy < dh; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      const b = blockOf(ox, oy, sw, sh, dw, dh);
      rs.length = 0; gs.length = 0; bs.length = 0;
      let sa = 0, n = 0;
      for (let y = b.y0; y < b.y1; y++) {
        for (let x = b.x0; x < b.x1; x++) {
          const o = (y * sw + x) * 4;
          sa += data[o + 3]; n++;
          if (data[o + 3] > 0) { rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2]); }
        }
      }
      const di = (oy * dw + ox) * 4;
      if (rs.length === 0) { out.data[di + 3] = 0; continue; }
      const med = (arr: number[]): number => { const s = arr.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
      const mr = med(rs), mg = med(gs), mb = med(bs);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < rs.length; i++) {
        const dr = rs[i] - mr, dg = gs[i] - mg, db = bs[i] - mb;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
      }
      out.data[di] = rs[best]; out.data[di + 1] = gs[best]; out.data[di + 2] = bs[best];
      out.data[di + 3] = finishAlpha(sa / n, alphaMode);
    }
  }
  return out;
};

const downscaleDpid = (src: Img, dw: number, dh: number, lambda: number, alphaMode: 'opaque' | 'keep'): Img => {
  const guide = blockMeans(src, dw, dh);
  const out = createImg(dw, dh);
  const { width: sw, height: sh, data } = src;
  const maxD = Math.sqrt(3) * 255;
  for (let oy = 0; oy < dh; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      const oi = oy * dw + ox;
      const b = blockOf(ox, oy, sw, sh, dw, dh);
      const gr = guide.rgb[oi * 3], gg = guide.rgb[oi * 3 + 1], gb = guide.rgb[oi * 3 + 2];
      let r = 0, g = 0, bl = 0, ws = 0;
      for (let y = b.y0; y < b.y1; y++) {
        for (let x = b.x0; x < b.x1; x++) {
          const o = (y * sw + x) * 4, a = data[o + 3];
          if (a === 0) continue;
          const dr = data[o] - gr, dg = data[o + 1] - gg, db = data[o + 2] - gb;
          const d = Math.sqrt(dr * dr + dg * dg + db * db) / maxD;
          const wgt = (Math.pow(d, lambda) + 1e-4) * (a / 255);
          r += data[o] * wgt; g += data[o + 1] * wgt; bl += data[o + 2] * wgt; ws += wgt;
        }
      }
      const di = oi * 4;
      if (ws > 0) { out.data[di] = clamp255(Math.round(r / ws)); out.data[di + 1] = clamp255(Math.round(g / ws)); out.data[di + 2] = clamp255(Math.round(bl / ws)); }
      out.data[di + 3] = finishAlpha(guide.alpha[oi], alphaMode);
    }
  }
  return out;
};

const downscaleBilateral = (src: Img, dw: number, dh: number, edge: number, smooth: number, alphaMode: 'opaque' | 'keep'): Img => {
  const guide = blockMeans(src, dw, dh);
  const out = createImg(dw, dh);
  const { width: sw, height: sh, data } = src;
  const sigmaC = 6 + (1 - edge) * 100;
  const bw = sw / dw, bh = sh / dh;
  const sigmaS = Math.max(0.5, Math.max(bw, bh) * (0.5 + smooth));
  const invC = 1 / (2 * sigmaC * sigmaC), invS = 1 / (2 * sigmaS * sigmaS);
  const ext = Math.ceil(smooth * Math.max(bw, bh));
  for (let oy = 0; oy < dh; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      const oi = oy * dw + ox;
      const b = blockOf(ox, oy, sw, sh, dw, dh);
      const cxp = (b.x0 + b.x1) / 2, cyp = (b.y0 + b.y1) / 2;
      const gr = guide.rgb[oi * 3], gg = guide.rgb[oi * 3 + 1], gb = guide.rgb[oi * 3 + 2];
      let r = 0, g = 0, bl = 0, ws = 0;
      for (let y = Math.max(0, b.y0 - ext); y < Math.min(sh, b.y1 + ext); y++) {
        for (let x = Math.max(0, b.x0 - ext); x < Math.min(sw, b.x1 + ext); x++) {
          const o = (y * sw + x) * 4, a = data[o + 3];
          if (a === 0) continue;
          const dr = data[o] - gr, dg = data[o + 1] - gg, db = data[o + 2] - gb;
          const dx = x + 0.5 - cxp, dy = y + 0.5 - cyp;
          const wgt = Math.exp(-(dr * dr + dg * dg + db * db) * invC - (dx * dx + dy * dy) * invS) * (a / 255);
          r += data[o] * wgt; g += data[o + 1] * wgt; bl += data[o + 2] * wgt; ws += wgt;
        }
      }
      const di = oi * 4;
      if (ws > 1e-6) { out.data[di] = clamp255(Math.round(r / ws)); out.data[di + 1] = clamp255(Math.round(g / ws)); out.data[di + 2] = clamp255(Math.round(bl / ws)); }
      else { out.data[di] = Math.round(gr); out.data[di + 1] = Math.round(gg); out.data[di + 2] = Math.round(gb); }
      out.data[di + 3] = finishAlpha(guide.alpha[oi], alphaMode);
    }
  }
  return out;
};

/** Öztireli & Gross (2015) 지각 기반 다운스케일의 근사 구현 */
const downscaleSsim = (src: Img, dw: number, dh: number, radius: number, sharp: number, alphaMode: 'opaque' | 'keep'): Img => {
  const { width: sw, height: sh, data } = src;
  const n = dw * dh;
  const L = new Float32Array(n * 3), L2 = new Float32Array(n * 3), alpha = new Float32Array(n);
  for (let oy = 0; oy < dh; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      const b = blockOf(ox, oy, sw, sh, dw, dh);
      let r = 0, g = 0, bl = 0, r2 = 0, g2 = 0, b2 = 0, wa = 0, sa = 0, cnt = 0;
      for (let y = b.y0; y < b.y1; y++) {
        for (let x = b.x0; x < b.x1; x++) {
          const o = (y * sw + x) * 4, a = data[o + 3] / 255;
          const pr = data[o] / 255, pg = data[o + 1] / 255, pb = data[o + 2] / 255;
          r += pr * a; g += pg * a; bl += pb * a; r2 += pr * pr * a; g2 += pg * pg * a; b2 += pb * pb * a; wa += a; sa += data[o + 3]; cnt++;
        }
      }
      const oi = oy * dw + ox;
      if (wa > 0) { L[oi * 3] = r / wa; L[oi * 3 + 1] = g / wa; L[oi * 3 + 2] = bl / wa; L2[oi * 3] = r2 / wa; L2[oi * 3 + 1] = g2 / wa; L2[oi * 3 + 2] = b2 / wa; }
      alpha[oi] = cnt ? sa / cnt : 0;
    }
  }
  const rad = Math.max(1, Math.min(3, radius | 0));
  const P = (inp: Float32Array): Float32Array => {
    const out = new Float32Array(n * 3);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        let r = 0, g = 0, b = 0, c = 0;
        for (let yy = Math.max(0, y - rad); yy <= Math.min(dh - 1, y + rad); yy++) {
          for (let xx = Math.max(0, x - rad); xx <= Math.min(dw - 1, x + rad); xx++) {
            const o = (yy * dw + xx) * 3;
            r += inp[o]; g += inp[o + 1]; b += inp[o + 2]; c++;
          }
        }
        const o = (y * dw + x) * 3;
        out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c;
      }
    }
    return out;
  };
  const Lsq = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) Lsq[i] = L[i] * L[i];
  const M = P(L), PL2 = P(Lsq), PH2 = P(L2);
  const R = new Float32Array(n * 3), RM = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    const Sl = PL2[i] - M[i] * M[i];
    const Sh = PH2[i] - M[i] * M[i];
    let r = 0;
    if (Sl > 1e-6) r = Math.sqrt(Math.max(0, Sh) / Sl);
    if (r > 4) r = 4;
    R[i] = r; RM[i] = r * M[i];
  }
  const T = P(RM), Mm = P(M), Rm = P(R);
  const out = createImg(dw, dh);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const idx = i * 3 + c;
      const D = Mm[idx] + Rm[idx] * L[idx] - T[idx];
      const v = L[idx] + sharp * (D - L[idx]);
      out.data[i * 4 + c] = clamp255(Math.round(v * 255));
    }
    out.data[i * 4 + 3] = finishAlpha(alpha[i], alphaMode);
  }
  return out;
};

const downscaleSlic = (src: Img, dw: number, dh: number, iterations: number, compactness: number, smoothing: number, alphaMode: 'opaque' | 'keep'): Img => {
  const res = slic(src, dw, dh, iterations, compactness);
  const box = blockMeans(src, dw, dh);
  const out = createImg(dw, dh);
  for (let i = 0; i < dw * dh; i++) {
    const di = i * 4;
    let r: number, g: number, b: number;
    if (res.count[i] > 0) {
      r = res.colors[i * 3] * (1 - smoothing) + box.rgb[i * 3] * smoothing;
      g = res.colors[i * 3 + 1] * (1 - smoothing) + box.rgb[i * 3 + 1] * smoothing;
      b = res.colors[i * 3 + 2] * (1 - smoothing) + box.rgb[i * 3 + 2] * smoothing;
    } else { r = box.rgb[i * 3]; g = box.rgb[i * 3 + 1]; b = box.rgb[i * 3 + 2]; }
    out.data[di] = clamp255(Math.round(r)); out.data[di + 1] = clamp255(Math.round(g)); out.data[di + 2] = clamp255(Math.round(b));
    out.data[di + 3] = finishAlpha(res.count[i] > 0 || res.alpha[i] > 0 ? res.alpha[i] : box.alpha[i], alphaMode);
  }
  return out;
};

const applyAlphaMode = (img: Img, mode: 'opaque' | 'keep'): Img => {
  if (mode === 'keep') return img;
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  return img;
};

export const downscale = (src: Img, dw: number, dh: number, opt: DownscaleOptions): Img => {
  dw = Math.max(1, dw | 0); dh = Math.max(1, dh | 0);
  const alphaMode = opt.alphaMode ?? 'opaque';
  switch (opt.method) {
    case 'nearest': return applyAlphaMode(resampleNearest(src, dw, dh), alphaMode);
    case 'box': return applyAlphaMode(resampleFilter(src, dw, dh, 'box'), alphaMode);
    case 'bicubic': return applyAlphaMode(resampleFilter(src, dw, dh, 'bicubic'), alphaMode);
    case 'lanczos': return applyAlphaMode(resampleFilter(src, dw, dh, 'lanczos'), alphaMode);
    case 'median': return downscaleMedian(src, dw, dh, alphaMode);
    case 'dpid': return downscaleDpid(src, dw, dh, opt.detail ?? 1, alphaMode);
    case 'bilateral': return downscaleBilateral(src, dw, dh, opt.edge ?? 0.6, opt.smoothness ?? 0.3, alphaMode);
    case 'ssim': return downscaleSsim(src, dw, dh, opt.radius ?? 1, opt.sharpness ?? 1, alphaMode);
    case 'slic': return downscaleSlic(src, dw, dh, opt.iterations ?? 8, opt.compactness ?? 25, opt.smoothing ?? 0, alphaMode);
  }
};

/** 배율 스케일 (nearest / bilinear) */
export const scaleImg = (src: Img, sx: number, sy: number, method: 'nearest' | 'bilinear'): Img => {
  const dw = Math.max(1, Math.round(src.width * sx)), dh = Math.max(1, Math.round(src.height * sy));
  if (dw === src.width && dh === src.height) return src;
  if (method === 'nearest') return resampleNearest(src, dw, dh);
  return resampleFilter(src, dw, dh, dw < src.width || dh < src.height ? 'box' : 'bilinear');
};

/** 정수배 업스케일(nearest) */
export const upscaleInt = (src: Img, k: number): Img => {
  k = Math.max(1, Math.round(k));
  if (k === 1) return src;
  const out = createImg(src.width * k, src.height * k);
  const dw = out.width;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      for (let yy = 0; yy < k; yy++) {
        for (let xx = 0; xx < k; xx++) {
          const di = ((y * k + yy) * dw + x * k + xx) * 4;
          out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
        }
      }
    }
  }
  return out;
};

/** 회전 — 90도 배수는 정확히, 그 외는 이중선형 역매핑 + 캔버스 확장 */
export const rotateImg = (src: Img, angleDeg: number, expand = true): Img => {
  const a = ((angleDeg % 360) + 360) % 360;
  const { width: w, height: h, data } = src;
  if (a === 0) return src;
  if (a === 90 || a === 180 || a === 270) {
    const dw = a === 180 ? w : h, dh = a === 180 ? h : w;
    const out = createImg(dw, dh);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let dx: number, dy: number;
        if (a === 90) { dx = h - 1 - y; dy = x; }
        else if (a === 180) { dx = w - 1 - x; dy = h - 1 - y; }
        else { dx = y; dy = w - 1 - x; }
        const si = (y * w + x) * 4, di = (dy * dw + dx) * 4;
        out.data[di] = data[si]; out.data[di + 1] = data[si + 1]; out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
      }
    }
    return out;
  }
  const rad = (a * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dw = expand ? Math.ceil(Math.abs(w * cos) + Math.abs(h * sin)) : w;
  const dh = expand ? Math.ceil(Math.abs(w * sin) + Math.abs(h * cos)) : h;
  const out = createImg(dw, dh);
  const cx = w / 2, cy = h / 2, ox = dw / 2, oy = dh / 2;
  const pm = toPremul(src);
  const outF = new Float32Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const rx = x + 0.5 - ox, ry = y + 0.5 - oy;
      const sx = rx * cos + ry * sin + cx - 0.5, sy = -rx * sin + ry * cos + cy - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        let v = 0;
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            const px = x0 + i, py = y0 + j;
            if (px < 0 || py < 0 || px >= w || py >= h) continue;
            v += pm[(py * w + px) * 4 + c] * (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
          }
        }
        outF[o + c] = v;
      }
    }
  }
  const res = fromPremul(outF, dw, dh);
  out.data.set(res.data);
  return out;
};
