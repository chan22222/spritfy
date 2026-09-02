// 색공간 변환과 색차 — sRGB, 선형 RGB, CIELAB(D65), Oklab, HSL, HSLuv, LCh, Oklch
import type { ColorSpace, RGB } from './types.ts';

// ---------- sRGB <-> 선형 ----------
const SRGB_TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export const srgbToLinear = (v: number): number => SRGB_TO_LIN[v < 0 ? 0 : v > 255 ? 255 : Math.round(v)];

export const linearToSrgb = (c: number): number => {
  if (c <= 0) return 0;
  if (c >= 1) return 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return s * 255;
};

// ---------- CIELAB (D65) ----------
const XN = 0.95047, YN = 1.0, ZN = 1.08883;
const EPS = 0.008856, KAPPA = 903.3;

const fLab = (t: number): number => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

export const rgbToLab = (r: number, g: number, b: number, out?: Float32Array | number[]): [number, number, number] => {
  const rl = SRGB_TO_LIN[r | 0], gl = SRGB_TO_LIN[g | 0], bl = SRGB_TO_LIN[b | 0];
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / XN;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / YN;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / ZN;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  const L = 116 * fy - 16, A = 500 * (fx - fy), B = 200 * (fy - fz);
  if (out) { out[0] = L; out[1] = A; out[2] = B; }
  return [L, A, B];
};

export const labToRgb = (L: number, A: number, B: number): RGB => {
  const fy = (L + 16) / 116;
  const fx = A / 500 + fy;
  const fz = fy - B / 200;
  const fx3 = fx * fx * fx, fz3 = fz * fz * fz;
  const xr = fx3 > EPS ? fx3 : (116 * fx - 16) / KAPPA;
  const yr = L > KAPPA * EPS ? Math.pow((L + 16) / 116, 3) : L / KAPPA;
  const zr = fz3 > EPS ? fz3 : (116 * fz - 16) / KAPPA;
  const x = xr * XN, y = yr * YN, z = zr * ZN;
  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [Math.round(linearToSrgb(rl)), Math.round(linearToSrgb(gl)), Math.round(linearToSrgb(bl))];
};

// ---------- Oklab ----------
export const rgbToOklab = (r: number, g: number, b: number): [number, number, number] => {
  const rl = SRGB_TO_LIN[r | 0], gl = SRGB_TO_LIN[g | 0], bl = SRGB_TO_LIN[b | 0];
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

export const oklabToRgb = (L: number, a: number, b: number): RGB => {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [Math.round(linearToSrgb(rl)), Math.round(linearToSrgb(gl)), Math.round(linearToSrgb(bl))];
};

// ---------- HSL ----------
export const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
};

export const hslToRgb = (h: number, s: number, l: number): RGB => {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = ((h % 360) + 360) / 360 % 1;
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
};

// ---------- HSLuv ----------
const HSLUV_M = [
  [3.240969941904521, -1.537383177570093, -0.498610760293],
  [-0.96924363628087, 1.87596750150772, 0.041555057407175],
  [0.055630079696993, -0.20397695888897, 1.056971514242878],
];
const REF_U = 0.19783000664283, REF_V = 0.46831999493879;
const H_KAPPA = 903.2962962, H_EPS = 0.0088564516;

const hsluvBounds = (L: number): Array<[number, number]> => {
  const result: Array<[number, number]> = [];
  const sub1 = Math.pow(L + 16, 3) / 1560896;
  const sub2 = sub1 > H_EPS ? sub1 : L / H_KAPPA;
  for (let c = 0; c < 3; c++) {
    const m1 = HSLUV_M[c][0], m2 = HSLUV_M[c][1], m3 = HSLUV_M[c][2];
    for (let t = 0; t < 2; t++) {
      const top1 = (284517 * m1 - 94839 * m3) * sub2;
      const top2 = (838422 * m3 + 769860 * m2 + 731718 * m1) * L * sub2 - 769860 * t * L;
      const bottom = (632260 * m3 - 126452 * m2) * sub2 + 126452 * t;
      result.push([top1 / bottom, top2 / bottom]);
    }
  }
  return result;
};

const maxChromaForLH = (L: number, H: number): number => {
  const hrad = (H / 360) * Math.PI * 2;
  let min = Infinity;
  for (const [slope, intercept] of hsluvBounds(L)) {
    const len = intercept / (Math.sin(hrad) - slope * Math.cos(hrad));
    if (len >= 0 && len < min) min = len;
  }
  return min;
};

export const rgbToHsluv = (r: number, g: number, b: number): [number, number, number] => {
  const rl = SRGB_TO_LIN[r | 0], gl = SRGB_TO_LIN[g | 0], bl = SRGB_TO_LIN[b | 0];
  const X = 0.41239079926595 * rl + 0.35758433938387 * gl + 0.18048078840183 * bl;
  const Y = 0.21263900587151 * rl + 0.71516867876775 * gl + 0.072192315360733 * bl;
  const Z = 0.019330818715591 * rl + 0.11919477979462 * gl + 0.95053215224966 * bl;
  const divider = X + 15 * Y + 3 * Z;
  let varU = 0, varV = 0;
  if (divider !== 0) { varU = (4 * X) / divider; varV = (9 * Y) / divider; }
  const L = Y > H_EPS ? 116 * Math.cbrt(Y) - 16 : Y * H_KAPPA;
  if (L < 1e-8) return [0, 0, 0];
  const U = 13 * L * (varU - REF_U);
  const V = 13 * L * (varV - REF_V);
  const C = Math.sqrt(U * U + V * V);
  let H = 0;
  if (C >= 1e-8) { H = (Math.atan2(V, U) * 180) / Math.PI; if (H < 0) H += 360; }
  if (L > 99.9999999) return [H, 0, 100];
  const max = maxChromaForLH(L, H);
  const S = max > 0 ? (C / max) * 100 : 0;
  return [H, S, L];
};

export const hsluvToRgb = (H: number, S: number, L: number): RGB => {
  let C = 0;
  if (L > 99.9999999) L = 100;
  else if (L < 1e-8) L = 0;
  else C = (maxChromaForLH(L, H) / 100) * S;
  const hrad = (H / 360) * Math.PI * 2;
  const U = Math.cos(hrad) * C, V = Math.sin(hrad) * C;
  if (L === 0) return [0, 0, 0];
  const varU = U / (13 * L) + REF_U;
  const varV = V / (13 * L) + REF_V;
  const Y = L > 8 ? Math.pow((L + 16) / 116, 3) : L / H_KAPPA;
  const X = -(9 * Y * varU) / ((varU - 4) * varV - varU * varV);
  const Z = (9 * Y - 15 * varV * Y - varV * X) / (3 * varV);
  const rl = HSLUV_M[0][0] * X + HSLUV_M[0][1] * Y + HSLUV_M[0][2] * Z;
  const gl = HSLUV_M[1][0] * X + HSLUV_M[1][1] * Y + HSLUV_M[1][2] * Z;
  const bl = HSLUV_M[2][0] * X + HSLUV_M[2][1] * Y + HSLUV_M[2][2] * Z;
  return [Math.round(linearToSrgb(rl)), Math.round(linearToSrgb(gl)), Math.round(linearToSrgb(bl))];
};

// ---------- 색차 ----------
export const deltaE76 = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
};

const DEG = Math.PI / 180;
export const ciede2000 = (lab1: ArrayLike<number>, lab2: ArrayLike<number>): number => {
  const L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
  const L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
  const C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cm = (C1 + C2) / 2;
  const Cm7 = Math.pow(Cm, 7);
  const G = 0.5 * (1 - Math.sqrt(Cm7 / (Cm7 + 6103515625)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2);
  let h1p = C1p === 0 ? 0 : Math.atan2(b1, a1p) / DEG; if (h1p < 0) h1p += 360;
  let h2p = C2p === 0 ? 0 : Math.atan2(b2, a2p) / DEG; if (h2p < 0) h2p += 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hmp: number;
  if (C1p * C2p === 0) hmp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hmp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hmp = (h1p + h2p + 360) / 2;
  else hmp = (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hmp - 30) * DEG) + 0.24 * Math.cos(2 * hmp * DEG) + 0.32 * Math.cos((3 * hmp + 6) * DEG) - 0.2 * Math.cos((4 * hmp - 63) * DEG);
  const dTheta = 30 * Math.exp(-Math.pow((hmp - 275) / 25, 2));
  const Cmp7 = Math.pow(Cmp, 7);
  const RC = 2 * Math.sqrt(Cmp7 / (Cmp7 + 6103515625));
  const Lm50 = (Lm - 50) * (Lm - 50);
  const SL = 1 + (0.015 * Lm50) / Math.sqrt(20 + Lm50);
  const SC = 1 + 0.045 * Cmp;
  const SH = 1 + 0.015 * Cmp * T;
  const RT = -Math.sin(2 * dTheta * DEG) * RC;
  const tL = dLp / SL, tC = dCp / SC, tH = dHp / SH;
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
};

export type Metric = 'lab' | 'de2000' | 'rgb';

/** 두 RGB 색의 거리(지정 메트릭). 'lab'은 ΔE76, 'de2000'은 CIEDE2000, 'rgb'는 유클리드(0..441) */
export const colorDistance = (a: RGB, b: RGB, metric: Metric): number => {
  if (metric === 'rgb') {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  const la = rgbToLab(a[0], a[1], a[2]);
  const lb = rgbToLab(b[0], b[1], b[2]);
  return metric === 'lab' ? deltaE76(la, lb) : ciede2000(la, lb);
};

// ---------- 거리 계산용 벡터 임베딩 ----------
// 팔레트 매핑/군집화는 이 3차원 벡터의 유클리드 거리를 쓴다. 각 공간이 대략
// ΔE 0..100 스케일이 되도록 맞춰 임계값 파라미터를 공간 간에 재사용할 수 있게 한다.
export const resolveSpace = (space: ColorSpace): Exclude<ColorSpace, 'auto'> => (space === 'auto' ? 'oklab' : space);

export const colorToVec = (space: ColorSpace, r: number, g: number, b: number, out: Float32Array, o = 0): void => {
  switch (resolveSpace(space)) {
    case 'rgb':
      out[o] = r * 0.39; out[o + 1] = g * 0.39; out[o + 2] = b * 0.39;
      return;
    case 'lab': {
      const [L, A, B] = rgbToLab(r, g, b);
      out[o] = L; out[o + 1] = A; out[o + 2] = B;
      return;
    }
    case 'lch': {
      // Lab와 같은 좌표계이되 채도·색상 축을 강조한다 (색상 차이에 민감)
      const [L, A, B] = rgbToLab(r, g, b);
      out[o] = L; out[o + 1] = A * 1.3; out[o + 2] = B * 1.3;
      return;
    }
    case 'oklab': {
      const [L, A, B] = rgbToOklab(r, g, b);
      out[o] = L * 100; out[o + 1] = A * 100 * 2.2; out[o + 2] = B * 100 * 2.2;
      return;
    }
    case 'oklch': {
      const [L, A, B] = rgbToOklab(r, g, b);
      out[o] = L * 100; out[o + 1] = A * 100 * 2.9; out[o + 2] = B * 100 * 2.9;
      return;
    }
    case 'hsl': {
      const [h, s, l] = rgbToHsl(r, g, b);
      const rad = h * DEG;
      out[o] = l * 100; out[o + 1] = Math.cos(rad) * s * 60; out[o + 2] = Math.sin(rad) * s * 60;
      return;
    }
    case 'hsluv': {
      const [h, s, l] = rgbToHsluv(r, g, b);
      const rad = h * DEG;
      out[o] = l; out[o + 1] = (Math.cos(rad) * s) / 2; out[o + 2] = (Math.sin(rad) * s) / 2;
      return;
    }
  }
};

/** 벡터 임베딩의 역변환(군집 중심을 RGB로 되돌릴 때) */
export const vecToRgb = (space: ColorSpace, x: number, y: number, z: number): RGB => {
  switch (resolveSpace(space)) {
    case 'rgb':
      return [Math.round(Math.min(255, Math.max(0, x / 0.39))), Math.round(Math.min(255, Math.max(0, y / 0.39))), Math.round(Math.min(255, Math.max(0, z / 0.39)))];
    case 'lab':
      return labToRgb(x, y, z);
    case 'lch':
      return labToRgb(x, y / 1.3, z / 1.3);
    case 'oklab':
      return oklabToRgb(x / 100, y / (100 * 2.2), z / (100 * 2.2));
    case 'oklch':
      return oklabToRgb(x / 100, y / (100 * 2.9), z / (100 * 2.9));
    case 'hsl': {
      const s = Math.sqrt(y * y + z * z) / 60;
      const h = (Math.atan2(z, y) / DEG + 360) % 360;
      return hslToRgb(h, Math.min(1, s), Math.min(1, Math.max(0, x / 100)));
    }
    case 'hsluv': {
      const s = Math.sqrt(y * y + z * z) * 2;
      const h = (Math.atan2(z, y) / DEG + 360) % 360;
      return hsluvToRgb(h, Math.min(100, s), Math.min(100, Math.max(0, x)));
    }
  }
};

/** 팔레트를 벡터 배열로 (길이 3n) */
export const paletteToVecs = (space: ColorSpace, colors: RGB[]): Float32Array => {
  const out = new Float32Array(colors.length * 3);
  for (let i = 0; i < colors.length; i++) colorToVec(space, colors[i][0], colors[i][1], colors[i][2], out, i * 3);
  return out;
};

/** 벡터 v와 가장 가까운 팔레트 인덱스 */
export const nearestVec = (vecs: Float32Array, n: number, x: number, y: number, z: number): number => {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const dx = vecs[o] - x, dy = vecs[o + 1] - y, dz = vecs[o + 2] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};

/** 휘도(0..255) */
export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (Number.isNaN(v)) return [0, 0, 0];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export const rgbToHex = (c: RGB): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
