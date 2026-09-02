// 색보정, 색상 교체, 화면 효과, 믹스, 노이즈, 깜빡임 억제
import { Img, ImageSeq, RGB, createImg, cloneImg, clamp255 } from './types.ts';
import { rgbToHsl, hslToRgb, rgbToLab, luma } from './color.ts';
import { resampleNearest } from './resample.ts';

// ---------- 색보정 ----------
export const colorAdjust = (img: Img, brightness: number, contrast: number, saturation: number): Img => {
  const out = cloneImg(img);
  const d = out.data;
  const c = contrast; // 1 = 그대로
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];
    r = (r - 128) * c + 128 + brightness; g = (g - 128) * c + 128 + brightness; b = (b - 128) * c + 128 + brightness;
    if (saturation !== 1) {
      const l = luma(r, g, b);
      r = l + (r - l) * saturation; g = l + (g - l) * saturation; b = l + (b - l) * saturation;
    }
    d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b);
  }
  return out;
};

// ---------- 색상 교체 ----------
export interface ColorReplaceEntry { from: RGB; to: RGB | null; tolerance: number }

export const colorReplace = (img: Img, entries: ColorReplaceEntry[]): Img => {
  if (entries.length === 0) return img;
  const out = cloneImg(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    for (const e of entries) {
      const dr = d[i] - e.from[0], dg = d[i + 1] - e.from[1], db = d[i + 2] - e.from[2];
      if (dr * dr + dg * dg + db * db <= e.tolerance * e.tolerance) {
        if (e.to) { d[i] = e.to[0]; d[i + 1] = e.to[1]; d[i + 2] = e.to[2]; }
        else d[i + 3] = 0;
        break;
      }
    }
  }
  return out;
};

// ---------- 화면 효과 ----------
export const postFx = (img: Img, glow: number, scanline: number, vignette: number, legacyOutline = false): Img => {
  const { width: w, height: h, data } = img;
  const out = cloneImg(img);
  const d = out.data;
  if (legacyOutline) {
    // 구 외곽선: 실루엣에 맞닿은 투명 픽셀을 어두운 색으로 채운다 (캔버스 크기 유지)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (data[o + 3] >= 128) continue;
        const nb = [x > 0 ? o - 4 : -1, x < w - 1 ? o + 4 : -1, y > 0 ? o - w * 4 : -1, y < h - 1 ? o + w * 4 : -1];
        if (nb.some((q) => q >= 0 && data[q + 3] >= 128)) { d[o] = 16; d[o + 1] = 16; d[o + 2] = 24; d[o + 3] = 255; }
      }
    }
  }
  if (glow > 0) {
    // 밝은 영역 추출 → 분리형 박스 블러 2회 → 더하기
    const n = w * h;
    const bright = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (data[o + 3] === 0) continue;
      const l = luma(data[o], data[o + 1], data[o + 2]);
      const f = Math.max(0, (l - 140) / 115);
      bright[i * 3] = data[o] * f; bright[i * 3 + 1] = data[o + 1] * f; bright[i * 3 + 2] = data[o + 2] * f;
    }
    const r = Math.max(1, Math.round(1 + glow * 3));
    const blur = (src: Float32Array): Float32Array => {
      const tmp = new Float32Array(n * 3), res = new Float32Array(n * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let sr = 0, sg = 0, sb = 0, c = 0;
        for (let i = -r; i <= r; i++) { const xx = x + i; if (xx < 0 || xx >= w) continue; const p = (y * w + xx) * 3; sr += src[p]; sg += src[p + 1]; sb += src[p + 2]; c++; }
        const p = (y * w + x) * 3; tmp[p] = sr / c; tmp[p + 1] = sg / c; tmp[p + 2] = sb / c;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let sr = 0, sg = 0, sb = 0, c = 0;
        for (let j = -r; j <= r; j++) { const yy = y + j; if (yy < 0 || yy >= h) continue; const p = (yy * w + x) * 3; sr += tmp[p]; sg += tmp[p + 1]; sb += tmp[p + 2]; c++; }
        const p = (y * w + x) * 3; res[p] = sr / c; res[p + 1] = sg / c; res[p + 2] = sb / c;
      }
      return res;
    };
    const bl = blur(blur(bright));
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (d[o + 3] === 0) continue;
      d[o] = clamp255(d[o] + bl[i * 3] * glow); d[o + 1] = clamp255(d[o + 1] + bl[i * 3 + 1] * glow); d[o + 2] = clamp255(d[o + 2] + bl[i * 3 + 2] * glow);
    }
  }
  if (scanline > 0) {
    for (let y = 1; y < h; y += 2) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        d[o] *= 1 - scanline * 0.6; d[o + 1] *= 1 - scanline * 0.6; d[o + 2] *= 1 - scanline * 0.6;
      }
    }
  }
  if (vignette > 0) {
    const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxR;
        const f = 1 - vignette * Math.max(0, r - 0.35) / 0.65;
        const o = (y * w + x) * 4;
        d[o] *= f; d[o + 1] *= f; d[o + 2] *= f;
      }
    }
  }
  return out;
};

// ---------- 믹스 ----------
export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen';

export const mixImg = (a: Img, b: Img, mode: BlendMode, factor: number): Img => {
  const bb = b.width === a.width && b.height === a.height ? b : resampleNearest(b, a.width, a.height);
  const out = cloneImg(a);
  const d = out.data, da = a.data, db = bb.data;
  for (let i = 0; i < d.length; i += 4) {
    const fa = (db[i + 3] / 255) * factor;
    if (fa <= 0) continue;
    const aa = da[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const x = da[i + c], y = db[i + c];
      let v: number;
      switch (mode) {
        case 'add': v = x + y; break;
        case 'multiply': v = (x * y) / 255; break;
        case 'screen': v = 255 - ((255 - x) * (255 - y)) / 255; break;
        default: v = y;
      }
      if (aa <= 0) d[i + c] = clamp255(y);
      else d[i + c] = clamp255(x + (v - x) * fa);
    }
    d[i + 3] = clamp255(Math.round(255 * (fa + aa * (1 - fa))));
  }
  return out;
};

// ---------- 노이즈 ----------
export type NoiseType = 'perlin' | 'voronoi' | 'value' | 'turbulence' | 'waves';
export type NoiseEffect = 'overlay' | 'displace' | 'dissolve';

export interface NoiseParams {
  type: NoiseType;
  effect: NoiseEffect;
  size: number;      // 특징 크기(px)
  octaves: number;
  seed: number;
  levels: number;    // 0 = 연속, n = 계단화
  speed: number;
  frames: number;
  animate: boolean;
  strength: number;  // 효과 세기
  color: RGB;        // overlay 색
  blend: BlendMode;
  width: number;     // 입력 없을 때 생성 크기
  height: number;
}

const makePerm = (seed: number): Uint8Array => {
  const p = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = (): number => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
};

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const grad = (hash: number, x: number, y: number, z: number): number => {
  const h = hash & 15;
  const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

const perlin3 = (p: Uint8Array, x: number, y: number, z: number): number => {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
    w,
  );
};

const hash3 = (p: Uint8Array, x: number, y: number, z: number): number => p[(p[(p[x & 255] + y) & 255] + z) & 255] / 255;

const value3 = (p: Uint8Array, x: number, y: number, z: number): number => {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = fade(x - X), fy = fade(y - Y), fz = fade(z - Z);
  const c = (dx: number, dy: number, dz: number): number => hash3(p, X + dx, Y + dy, Z + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
};

const voronoi2 = (p: Uint8Array, x: number, y: number, t: number): number => {
  const X = Math.floor(x), Y = Math.floor(y);
  let best = Infinity;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = X + i, cy = Y + j;
      const h1 = hash3(p, cx, cy, 7), h2 = hash3(p, cx, cy, 13);
      const px = cx + 0.5 + 0.4 * Math.sin(t * 6.283 + h1 * 6.283), py = cy + 0.5 + 0.4 * Math.cos(t * 6.283 + h2 * 6.283);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) best = d;
    }
  }
  return Math.min(1, Math.sqrt(best));
};

/** 노이즈 필드 (0..1), t는 0..1 루프 위상 */
export const noiseField = (prm: NoiseParams, w: number, h: number, t: number): Float32Array => {
  const perm = makePerm(prm.seed | 0);
  const out = new Float32Array(w * h);
  const size = Math.max(2, prm.size);
  const oct = Math.max(1, Math.min(8, prm.octaves | 0));
  // 시간축은 원형 경로로 돌려 N프레임 루프가 이어지게 한다
  const tz = Math.cos(t * Math.PI * 2) * prm.speed, tw = Math.sin(t * Math.PI * 2) * prm.speed;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      const nx = x / size, ny = y / size;
      switch (prm.type) {
        case 'perlin': {
          let amp = 1, freq = 1, sum = 0, norm = 0;
          for (let o = 0; o < oct; o++) { sum += perlin3(perm, nx * freq + tz, ny * freq + tw, (tz + tw) * 0.5 + o * 17.3) * amp; norm += amp; amp *= 0.5; freq *= 2; }
          v = sum / norm * 0.5 + 0.5;
          break;
        }
        case 'turbulence': {
          let amp = 1, freq = 1, sum = 0, norm = 0;
          for (let o = 0; o < oct; o++) { sum += Math.abs(perlin3(perm, nx * freq + tz, ny * freq + tw, o * 31.7 + tz)) * amp; norm += amp; amp *= 0.5; freq *= 2; }
          v = Math.min(1, (sum / norm) * 1.6);
          break;
        }
        case 'value': {
          let amp = 1, freq = 1, sum = 0, norm = 0;
          for (let o = 0; o < oct; o++) { sum += value3(perm, nx * freq + tz * 2, ny * freq + tw * 2, o * 5 + 3) * amp; norm += amp; amp *= 0.5; freq *= 2; }
          v = sum / norm;
          break;
        }
        case 'voronoi':
          v = voronoi2(perm, nx, ny, t * prm.speed);
          break;
        case 'waves': {
          const ph = t * Math.PI * 2 * Math.max(1, Math.round(prm.speed));
          let sum = 0;
          for (let o = 0; o < oct; o++) {
            const f = (o + 1) * 1.7;
            sum += (Math.sin(nx * 6.283 * f * 0.5 + ny * 2.1 * f + ph * (o + 1)) + Math.sin(ny * 6.283 * f * 0.35 - nx * 1.3 * f + ph * 1.3 * (o + 1))) / (o + 1);
          }
          v = Math.min(1, Math.max(0, sum / 4 + 0.5));
          break;
        }
      }
      if (prm.levels > 1) v = Math.round(v * (prm.levels - 1)) / (prm.levels - 1);
      out[y * w + x] = Math.min(1, Math.max(0, v));
    }
  }
  return out;
};

const applyNoiseToImg = (img: Img, field: Float32Array, prm: NoiseParams, t: number): Img => {
  const { width: w, height: h, data } = img;
  const out = cloneImg(img);
  const d = out.data;
  const s = prm.strength;
  if (prm.effect === 'overlay') {
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (d[o + 3] === 0) continue;
      const f = field[i] * s;
      for (let c = 0; c < 3; c++) {
        const x = data[o + c], y = prm.color[c];
        let v: number;
        switch (prm.blend) {
          case 'add': v = x + y; break;
          case 'multiply': v = (x * y) / 255; break;
          case 'screen': v = 255 - ((255 - x) * (255 - y)) / 255; break;
          default: v = y;
        }
        d[o + c] = clamp255(x + (v - x) * f);
      }
    }
  } else if (prm.effect === 'displace') {
    const amp = s * Math.max(1, prm.size) * 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const gx = (field[y * w + Math.min(w - 1, x + 1)] - field[y * w + Math.max(0, x - 1)]);
        const gy = (field[Math.min(h - 1, y + 1) * w + x] - field[Math.max(0, y - 1) * w + x]);
        const sx = Math.round(x + gx * amp * 4), sy = Math.round(y + gy * amp * 4);
        const cx = Math.min(w - 1, Math.max(0, sx)), cy = Math.min(h - 1, Math.max(0, sy));
        const so = (cy * w + cx) * 4, o = i * 4;
        d[o] = data[so]; d[o + 1] = data[so + 1]; d[o + 2] = data[so + 2]; d[o + 3] = data[so + 3];
      }
    }
  } else {
    // dissolve: 임계값이 시간에 따라 이동
    const thr = prm.animate ? (t + s) % 1 : s;
    for (let i = 0; i < w * h; i++) {
      if (field[i] < thr) d[i * 4 + 3] = 0;
    }
  }
  return out;
};

export const applyNoise = (input: ImageSeq | null, prm: NoiseParams): ImageSeq => {
  const frames = Math.max(1, Math.min(120, prm.animate ? prm.frames | 0 : 1));
  const delay = 1000 / 12;
  if (!input) {
    const w = Math.max(1, prm.width | 0), h = Math.max(1, prm.height | 0);
    const out: Img[] = [];
    for (let f = 0; f < frames; f++) {
      const field = noiseField(prm, w, h, f / frames);
      const img = createImg(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = field[i];
        img.data[i * 4] = clamp255(prm.color[0] * v); img.data[i * 4 + 1] = clamp255(prm.color[1] * v); img.data[i * 4 + 2] = clamp255(prm.color[2] * v); img.data[i * 4 + 3] = 255;
      }
      out.push(img);
    }
    return { frames: out, delays: out.map(() => delay) };
  }
  if (input.frames.length > 1 || !prm.animate) {
    const total = input.frames.length;
    return {
      frames: input.frames.map((img, i) => applyNoiseToImg(img, noiseField(prm, img.width, img.height, prm.animate ? i / total : 0), prm, i / total)),
      delays: input.delays.slice(),
    };
  }
  const base = input.frames[0];
  const out: Img[] = [];
  for (let f = 0; f < frames; f++) out.push(applyNoiseToImg(base, noiseField(prm, base.width, base.height, f / frames), prm, f / frames));
  return { frames: out, delays: out.map(() => delay) };
};

// ---------- 깜빡임 억제 ----------
export const deflicker = (seq: ImageSeq, threshold: number): ImageSeq => {
  if (seq.frames.length < 2 || threshold <= 0) return seq;
  const out: Img[] = [cloneImg(seq.frames[0])];
  const t1: [number, number, number] = [0, 0, 0], t2: [number, number, number] = [0, 0, 0];
  for (let f = 1; f < seq.frames.length; f++) {
    const cur = cloneImg(seq.frames[f]);
    const prev = out[f - 1];
    if (prev.width === cur.width && prev.height === cur.height) {
      const d = cur.data, p = prev.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0 || p[i + 3] === 0) continue;
        if (d[i] === p[i] && d[i + 1] === p[i + 1] && d[i + 2] === p[i + 2]) continue;
        rgbToLab(d[i], d[i + 1], d[i + 2], t1); rgbToLab(p[i], p[i + 1], p[i + 2], t2);
        const dl = t1[0] - t2[0], da = t1[1] - t2[1], db = t1[2] - t2[2];
        if (Math.sqrt(dl * dl + da * da + db * db) < threshold) { d[i] = p[i]; d[i + 1] = p[i + 1]; d[i + 2] = p[i + 2]; }
      }
    }
    out.push(cur);
  }
  return { frames: out, delays: seq.delays.slice() };
};

/** 입력 노드: 격자 위상 오프셋 (양수면 왼쪽/위 픽셀을 잘라내고 투명으로 채움) */
export const shiftImg = (img: Img, ox: number, oy: number): Img => {
  if (!ox && !oy) return img;
  const out = createImg(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    const sy = y + oy;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < img.width; x++) {
      const sx = x + ox;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4, di = (y * img.width + x) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
};

export { rgbToHsl, hslToRgb };
