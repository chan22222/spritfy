/**
 * 스프라이트 프레임 분석 유틸리티.
 *
 * 키프레임 선택 · 루프 이음새 탐지 · 크로마키 despill · 앵커 정렬 알고리즘은
 * gary149/h3-game-sprites (MIT, Copyright (c) 2026 Victor Mustar)의
 * sprite_cut.py / build_atlas.py를 브라우저용으로 옮긴 것이다.
 * https://github.com/gary149/h3-game-sprites
 *
 * 순수 함수만 두어 DOM 없이도 테스트할 수 있게 한다.
 */

/** 64x64로 축소한 프레임의 RGBA 바이트 배열 */
export type SmallFrame = Uint8ClampedArray;

/**
 * 이웃 프레임 간 평균 절대 차이 = 프레임별 모션량.
 * 첫 프레임은 비교 대상이 없으므로 0이다.
 */
export const motionEnergy = (smalls: SmallFrame[]): number[] => {
  const energy: number[] = [0];
  for (let i = 1; i < smalls.length; i++) {
    const cur = smalls[i];
    const prev = smalls[i - 1];
    let sum = 0;
    for (let p = 0; p < cur.length; p++) sum += Math.abs(cur[p] - prev[p]);
    energy.push(sum / cur.length);
  }
  return energy;
};

/**
 * 누적 모션량을 등분해 프레임을 고른다.
 *
 * 균등 간격 샘플링은 정지 구간을 과다 표집해 결과가 흐릿하고, 지역 극대값만
 * 고르면 반대로 정지 구간을 통째로 놓친다. 누적 모션을 등분하면 프레임이
 * 포즈가 크게 바뀌는 지점(동작의 극단)에 떨어진다.
 *
 * 첫 프레임과 마지막 프레임은 항상 포함한다.
 */
export const pickByMotionArcLength = (energy: number[], n: number): number[] => {
  const len = energy.length;
  if (len === 0) return [];
  if (n <= 0) return [];
  if (len <= n) return energy.map((_, i) => i);

  const cum: number[] = [];
  let running = 0;
  for (const e of energy) {
    running += e;
    cum.push(running);
  }

  const total = cum[len - 1];
  // 움직임이 전혀 없으면 등간격으로 되돌아간다
  if (total <= 0) return linspaceIndices(len, n);

  const picks = new Set<number>([0, len - 1]);
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1 || 1);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < len; i++) {
      const d = Math.abs(cum[i] - target);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    picks.add(best);
  }
  return [...picks].sort((a, b) => a - b);
};

/** 0..len-1을 n개로 균등 분할한 정수 인덱스 (중복 제거, 오름차순) */
export const linspaceIndices = (len: number, n: number): number[] => {
  if (len <= 0 || n <= 0) return [];
  if (n === 1) return [0];
  const out = new Set<number>();
  for (let k = 0; k < n; k++) {
    out.add(Math.round(((len - 1) * k) / (n - 1)));
  }
  return [...out].sort((a, b) => a - b);
};

export interface LoopSeam {
  /** 사이클 시작 프레임 */
  i: number;
  /** 사이클 끝 프레임 */
  j: number;
  /** 두 프레임의 평균 절대 차이 — 0에 가까울수록 매끄럽게 이어진다 */
  diff: number;
}

/**
 * 가장 닮은 프레임 쌍(사이클의 이음새)을 찾아 그 구간 안에서만 샘플링한다.
 *
 * 클립 전체를 쓰면 준비 동작과 마지막에 정지 자세로 돌아가는 구간이 섞여
 * 걷기 애니메이션이 루프하지 않고 눈에 띄게 리셋된다.
 *
 * 앞뒤 일부 구간은 준비/정착 동작이라 후보에서 제외한다.
 */
export const findLoopSeam = (
  smalls: SmallFrame[],
  n: number,
  opts: { loFrac?: number; hiFrac?: number; minGap?: number; maxGap?: number } = {}
): { seam: LoopSeam | null; picks: number[] } => {
  const total = smalls.length;
  if (total === 0) return { seam: null, picks: [] };

  const { loFrac = 0.2, hiFrac = 0.85, minGap = 12, maxGap = 45 } = opts;
  const lo = Math.floor(total * loFrac);
  const hi = Math.floor(total * hiFrac);

  let best: LoopSeam | null = null;
  for (let i = lo; i < hi; i++) {
    for (let j = i + minGap; j < hi && j - i <= maxGap; j++) {
      const a = smalls[i];
      const b = smalls[j];
      let sum = 0;
      for (let p = 0; p < a.length; p++) sum += Math.abs(a[p] - b[p]);
      const d = sum / a.length;
      if (best === null || d < best.diff) best = { i, j, diff: d };
    }
  }

  if (best === null) return { seam: null, picks: linspaceIndices(total, n) };

  // 이음새 구간을 n등분한다 (끝점 j는 시작점과 겹치므로 포함하지 않는다)
  const span = best.j - best.i;
  const picks = new Set<number>();
  for (let k = 0; k < n; k++) {
    picks.add(best.i + Math.round((k * span) / n));
  }
  return { seam: best, picks: [...picks].sort((a, b) => a - b) };
};

/**
 * 크로마키 색번짐(spill) 제거.
 *
 * 키 색이 강한 채널을 나머지 채널 기준으로 **클램프**한다. 나머지 채널 쪽으로
 * 값을 섞으면(블렌딩) 캐릭터 전체에 색이 물들기 때문에 클램프여야 한다.
 *
 * @param data      RGBA 바이트 배열 (제자리 수정)
 * @param keyRgb    키 색 [r, g, b]
 * @param strength  0이면 적용하지 않음. 1이 기본 세기
 */
export const despill = (
  data: Uint8ClampedArray,
  keyRgb: [number, number, number],
  strength = 1
): void => {
  if (strength <= 0) return;

  const maxKey = Math.max(keyRgb[0], keyRgb[1], keyRgb[2]);
  if (maxKey <= 0) return;

  // 키 색에서 두드러지는 채널만 억제한다 (초록 배경 → G, 마젠타 배경 → R·B)
  const dominant = [0, 1, 2].filter(c => keyRgb[c] >= maxKey * 0.75);
  const off = [0, 1, 2].filter(c => !dominant.includes(c));
  if (dominant.length === 0 || off.length === 0) return;

  // 클램프 상한: 억제하지 않는 채널의 최댓값에 여유를 준 값.
  // 상수는 원본 구현 그대로 두고, strength는 상한까지 얼마나 당길지에만 쓴다.
  // (상한 자체를 strength로 흔들면 세기가 단조롭게 변하지 않는다.)
  const gain = 1.18;
  const bias = 30;
  const amount = Math.min(1, strength);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // 이미 투명한 배경은 건드리지 않는다

    let offMax = 0;
    for (const c of off) {
      const v = data[i + c];
      if (v > offMax) offMax = v;
    }
    const cap = offMax * gain + bias;

    for (const c of dominant) {
      const original = data[i + c];
      if (original > cap) {
        data[i + c] = original + (cap - original) * amount;
      }
    }
  }
};

export interface FrameMetrics {
  /** 불투명 픽셀의 가장 아래 행 = 발 위치 */
  baseline: number;
  /** 불투명 픽셀의 가장 위 행 */
  top: number;
  /** 불투명 픽셀 x 좌표의 평균 */
  cx: number;
  height: number;
  /** 전체 픽셀 중 불투명 비율 */
  coverage: number;
  /** 완전 투명 + 완전 불투명 비율 — 1에 가까울수록 배경 분리가 깨끗하다 */
  bgPurity: number;
}

/** 알파 채널만 훑어 프레임의 위치·크기 지표를 낸다. 불투명 픽셀이 없으면 null */
export const frameMetrics = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): FrameMetrics | null => {
  let minY = Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let opaque = 0;
  let clear = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a === 0) {
        clear++;
        continue;
      }
      if (a === 255) opaque++;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
    }
  }

  const solid = width * height - clear;
  if (solid === 0) return null;

  const total = width * height;
  return {
    baseline: maxY,
    top: minY,
    cx: sumX / solid,
    height: maxY - minY,
    coverage: solid / total,
    bgPurity: (clear + opaque) / total,
  };
};

export interface AnchorStats {
  /** [x0, y0, x1, y1) — 불투명 영역의 경계 상자 */
  bbox: [number, number, number, number];
  /** 발이 닿는 행 */
  baseline: number;
  /**
   * 자세의 중심이 되는 x. 경계 상자 중앙이 아니라 마스크 하단 22%(발목)의
   * 중심을 쓴다. 팔이나 꼬리가 크게 흔들려도 캐릭터가 옆으로 밀리지 않는다.
   */
  anchorX: number;
}

export const anchorStats = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): AnchorStats | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  const legTop = maxY - Math.floor((maxY - minY) * 0.22);
  let sumX = 0;
  let count = 0;
  for (let y = legTop; y <= maxY; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      sumX += x;
      count++;
    }
  }

  // 다리 영역이 비면 전체 마스크 중심으로 되돌아간다
  if (count === 0) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        sumX += x;
        count++;
      }
    }
  }

  return {
    bbox: [minX, minY, maxX + 1, maxY + 1],
    baseline: maxY,
    anchorX: sumX / count,
  };
};

export interface ExtractionQuality {
  /** 발 위치가 흔들린 폭(px) — 서 있는 동작에서 크면 의심스럽다 */
  baselineDriftPx: number;
  /** 중심이 이동한 폭(px) */
  centroidDriftPx: number;
  /** 키 높이가 변한 폭(px) */
  heightVarPx: number;
  /** 첫 프레임과 마지막 프레임의 차이 — 0에 가까울수록 루프가 매끄럽다 */
  loopDiff: number;
  /** 가장 나쁜 프레임의 배경 순도 */
  worstBgPurity: number;
}

export const extractionQuality = (
  metrics: FrameMetrics[],
  loopDiff: number
): ExtractionQuality | null => {
  if (metrics.length === 0) return null;
  const baselines = metrics.map(m => m.baseline);
  const cxs = metrics.map(m => m.cx);
  const heights = metrics.map(m => m.height);
  return {
    baselineDriftPx: Math.max(...baselines) - Math.min(...baselines),
    centroidDriftPx: Math.round((Math.max(...cxs) - Math.min(...cxs)) * 10) / 10,
    heightVarPx: Math.max(...heights) - Math.min(...heights),
    loopDiff: Math.round(loopDiff * 100) / 100,
    worstBgPurity: Math.min(...metrics.map(m => m.bgPurity)),
  };
};

/** 두 축소 프레임의 평균 절대 차이 */
export const frameDiff = (a: SmallFrame, b: SmallFrame): number => {
  let sum = 0;
  for (let p = 0; p < a.length; p++) sum += Math.abs(a[p] - b[p]);
  return sum / a.length;
};

/* ------------------------------------------------------------------------
 * 고정 부위 기준 정렬 (image registration)
 *
 * '마스크 하단 22% 중심'(발목) 앵커는 측면 뷰 · 발 고정 · 제자리 동작이라는
 * 전제에서만 성립한다. 다리가 들리거나 키잉 잡음이 섞이면 앵커가 프레임마다
 * 튀어 오히려 떨림을 만든다.
 *
 * 대신 "여러 프레임에 걸쳐 움직이지 않는 부위"(몸통 등)를 자동으로 찾아 그
 * 부위가 기준 프레임과 겹치도록 각 프레임을 평행이동한다. 팔·다리처럼 움직이는
 * 부위는 안정 마스크에서 빠지므로 정렬에 영향을 주지 않는다.
 * ---------------------------------------------------------------------- */

/** 정수 배율로 축소한 프레임. alpha 0..1, lum 0..255 (알파 가중 평균) */
export interface Plane {
  w: number;
  h: number;
  alpha: Float32Array;
  lum: Float32Array;
}

/** 프레임을 (dx, dy)만큼 옮겨 기준에 맞춘다는 뜻의 정수 이동량 */
export type Shift = [number, number];

/** RGBA → 축소 평면. factor=1이면 원본 해상도 */
export const toPlane = (
  data: Uint8ClampedArray,
  w: number,
  h: number,
  factor: number
): Plane => {
  const f = Math.max(1, Math.floor(factor));
  const pw = Math.ceil(w / f);
  const ph = Math.ceil(h / f);
  const alpha = new Float32Array(pw * ph);
  const lum = new Float32Array(pw * ph);

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      let aSum = 0;
      let lSum = 0;
      let n = 0;
      const y1 = Math.min(h, (py + 1) * f);
      const x1 = Math.min(w, (px + 1) * f);
      for (let y = py * f; y < y1; y++) {
        for (let x = px * f; x < x1; x++) {
          const i = (y * w + x) * 4;
          const a = data[i + 3] / 255;
          aSum += a;
          lSum += a * (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          n++;
        }
      }
      const idx = py * pw + px;
      alpha[idx] = n ? aSum / n : 0;
      lum[idx] = aSum > 0 ? lSum / aSum : 0;
    }
  }
  return { w: pw, h: ph, alpha, lum };
};

/** 알파 가중 중심. 불투명 픽셀이 없으면 null */
export const alphaCentroid = (p: Plane): { x: number; y: number } | null => {
  let sx = 0;
  let sy = 0;
  let sa = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const a = p.alpha[y * p.w + x];
      if (a <= 0) continue;
      sx += a * x;
      sy += a * y;
      sa += a;
    }
  }
  return sa > 0 ? { x: sx / sa, y: sy / sa } : null;
};

/**
 * 안정 마스크: 기준 좌표계에서 "대부분의 프레임에 걸쳐 불투명한" 픽셀.
 * 각 프레임은 shifts로 옮긴 위치에서 본다. 마스크가 너무 작으면(기준 알파의 5% 미만)
 * 기준 프레임의 알파를 그대로 쓴다.
 */
export const stabilityMask = (
  planes: Plane[],
  shifts: Shift[],
  refIndex: number,
  minFraction = 0.6
): Float32Array => {
  const ref = planes[refIndex];
  const { w, h } = ref;
  const count = new Float32Array(w * h);

  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    const [dx, dy] = shifts[i];
    for (let y = 0; y < h; y++) {
      const sy = y - dy;
      if (sy < 0 || sy >= p.h) continue;
      for (let x = 0; x < w; x++) {
        const sx = x - dx;
        if (sx < 0 || sx >= p.w) continue;
        if (p.alpha[sy * p.w + sx] > 0.5) count[y * w + x]++;
      }
    }
  }

  // 기준 프레임 자체가 불투명한 곳으로 제한한다. 초기 추정이 틀어져 있을 때 마스크가
  // 기준 개체 바깥으로 번지면, 그 틀어진 이동량이 마스크를 더 많이 덮어 스스로 굳어진다.
  const mask = new Float32Array(w * h);
  let maskArea = 0;
  let refArea = 0;
  for (let i = 0; i < w * h; i++) {
    if (ref.alpha[i] <= 0.5) continue;
    refArea++;
    if (count[i] / planes.length >= minFraction) {
      mask[i] = 1;
      maskArea++;
    }
  }
  if (maskArea < refArea * 0.05) {
    for (let i = 0; i < w * h; i++) mask[i] = ref.alpha[i] > 0.5 ? 1 : 0;
  }
  return mask;
};

/**
 * 각 프레임을 기준 프레임에 맞추는 이동량을 찾는다.
 *
 * 점수 = Σ_mask  alpha_frame(p − d) · (1 − |lum_frame(p − d) − lum_ref(p)| / 255)
 * 초기 추정값(initial) 주변 ±radius를 훑어 점수가 가장 높은 d를 고른다.
 * 후보는 초기값에서 가까운 순으로 보고 **점수가 엄격히 클 때만** 갈아타므로,
 * 움직이지 않는 개체는 정확히 0 이동으로 남는다.
 *
 * stride > 1이면 마스크 픽셀을 띄엄띄엄 표본해 큰 프레임에서 시간을 줄인다.
 */
export const registerToReference = (
  planes: Plane[],
  refIndex: number,
  opts: {
    radius: number;
    initial?: Shift[];
    mask?: Float32Array;
    stride?: number;
  }
): Shift[] => {
  const ref = planes[refIndex];
  const { w, h } = ref;
  const radius = Math.max(0, Math.floor(opts.radius));
  const stride = Math.max(1, Math.floor(opts.stride ?? 1));
  const mask = opts.mask ?? Float32Array.from(ref.alpha, a => (a > 0.5 ? 1 : 0));

  // 마스크 픽셀 목록. 내부는 stride 간격으로 표본하되 **경계 픽셀은 전부 포함**한다.
  // 경계가 표본에서 빠지면 1px 어긋난 후보와 점수가 같아져 정렬이 물러진다.
  const mx: number[] = [];
  const my: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] <= 0) continue;
      const boundary =
        x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
        mask[y * w + (x - 1)] <= 0 || mask[y * w + (x + 1)] <= 0 ||
        mask[(y - 1) * w + x] <= 0 || mask[(y + 1) * w + x] <= 0;
      if (boundary || (x % stride === 0 && y % stride === 0)) {
        mx.push(x);
        my.push(y);
      }
    }
  }

  const offsets: Shift[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) offsets.push([dx, dy]);
  }

  const score = (p: Plane, dx: number, dy: number): number => {
    let s = 0;
    for (let k = 0; k < mx.length; k++) {
      const sx = mx[k] - dx;
      const sy = my[k] - dy;
      if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) continue;
      const si = sy * p.w + sx;
      const a = p.alpha[si];
      if (a <= 0) continue;
      const ri = my[k] * w + mx[k];
      s += a * (1 - Math.abs(p.lum[si] - ref.lum[ri]) / 255);
    }
    return s;
  };

  const out: Shift[] = [];
  for (let i = 0; i < planes.length; i++) {
    if (i === refIndex || mx.length === 0) {
      out.push(opts.initial ? [...opts.initial[i]] as Shift : [0, 0]);
      continue;
    }
    const [ix, iy] = opts.initial ? opts.initial[i] : [0, 0];
    // 후보는 초기값 주변 창이지만, 순서는 **이동량 0에 가까운 순**으로 본다.
    // 점수가 같으면(정지한 개체) 움직이지 않는 쪽이 이긴다.
    const candidates: Shift[] = offsets.map(([ox, oy]) => [ix + ox, iy + oy]);
    candidates.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    let best: Shift = candidates[0];
    let bestScore = -Infinity;
    for (const [dx, dy] of candidates) {
      const s = score(planes[i], dx, dy);
      if (s > bestScore) {
        bestScore = s;
        best = [dx, dy];
      }
    }
    out.push(best);
  }
  return out;
};

/**
 * 잡음에 강한 발 baseline. 불투명 픽셀이 가로로 minCount개 이상 있는 가장 아래 행.
 * 키잉 찌꺼기 한두 픽셀이 발보다 아래에 남아도 흔들리지 않는다.
 */
export const robustBaseline = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minCount = 2
): number | null => {
  for (let y = height - 1; y >= 0; y--) {
    let n = 0;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0 && ++n >= minCount) return y;
    }
  }
  return null;
};

/** 알파 경계 상자 [x0, y0, x1, y1). 불투명 픽셀이 없으면 null */
export const alphaBounds = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number, number] | null => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : [minX, minY, maxX + 1, maxY + 1];
};

export interface AlignmentPlan {
  /** 프레임 i를 기준에 맞추기 위한 이동량 (원본 픽셀) */
  shifts: Shift[];
  /** 모든 프레임의 이동 후 경계를 담는 셀 크기 */
  cellW: number;
  cellH: number;
  /** 셀 안에서 프레임 (0,0)이 놓일 위치 = 이동량에 더할 원점 */
  originX: number;
  originY: number;
}

/**
 * 프레임 집합의 정렬 계획을 세운다.
 *
 * 1) 축소 해상도에서 알파 중심으로 초기 추정
 * 2) 기준 알파 전체와의 겹침을 최대화해 대략 정합 (팔다리보다 몸통이 이긴다)
 * 3) 그 정렬로 안정 마스크를 만들어 좁은 범위를 다듬는다
 * 4) 원본 해상도에서 ±factor 범위를 다시 훑어 다듬는다
 * 5) mode='feet'면 세로는 잡음에 강한 발 baseline으로 대체한다
 *
 * @param frames  원본 해상도 RGBA (전부 같은 크기일 필요는 없다)
 */
export const planAlignment = (
  frames: { data: Uint8ClampedArray; w: number; h: number }[],
  opts: { mode: 'stable' | 'feet'; refIndex?: number; pad?: number; onProgress?: (p: number) => void }
): AlignmentPlan | null => {
  if (frames.length === 0) return null;
  const refIndex = Math.min(frames.length - 1, Math.max(0, opts.refIndex ?? 0));
  const pad = opts.pad ?? 4;
  const report = opts.onProgress ?? (() => {});

  const maxDim = Math.max(...frames.map(f => Math.max(f.w, f.h)));
  const factor = Math.max(1, Math.ceil(maxDim / 96));

  // 1) 축소 평면 + 알파 중심으로 초기 추정
  const coarse = frames.map(f => toPlane(f.data, f.w, f.h, factor));
  const refC = alphaCentroid(coarse[refIndex]);
  if (!refC) return null;
  const initial: Shift[] = coarse.map(p => {
    const c = alphaCentroid(p);
    return c ? [Math.round(refC.x - c.x), Math.round(refC.y - c.y)] : [0, 0];
  });
  report(0.2);

  // 2) 1차: 기준 프레임 알파 전체와의 겹침을 최대화한다.
  //    몸통이 면적을 지배하므로 팔다리가 움직여도 몸통이 맞는 자리가 이긴다.
  //    (안정 마스크를 먼저 만들면 초기 추정 오차가 마스크에 스며들어 틀린 정렬이 굳어진다)
  const refMask = Float32Array.from(coarse[refIndex].alpha, a => (a > 0.5 ? 1 : 0));
  const rough = registerToReference(coarse, refIndex, { radius: 8, initial, mask: refMask });
  report(0.35);

  // 3) 2차: 1차 정렬에서 안정 마스크(움직이지 않는 부위)를 만들어 좁은 범위만 다듬는다
  const mask = stabilityMask(coarse, rough, refIndex, 0.6);
  const coarseShifts = registerToReference(coarse, refIndex, { radius: 3, initial: rough, mask });
  report(0.5);

  // 3) 원본 해상도에서 다듬기 (마스크·초기값을 factor배로 올린다)
  let shifts: Shift[] = coarseShifts.map(([x, y]) => [x * factor, y * factor]);
  if (factor > 1) {
    const full = frames.map(f => toPlane(f.data, f.w, f.h, 1));
    const ref = full[refIndex];
    // 다듬기는 기준 알파 전체로 점수를 매긴다. 안정 마스크는 개체 내부만 남아
    // 민무늬 스프라이트에서 경계 정보가 사라지고, ±factor px 수준의 미세 조정에서는
    // 팔다리 편향이 문제되지 않는다.
    const fullMask = Float32Array.from(ref.alpha, a => (a > 0.5 ? 1 : 0));
    let maskCount = 0;
    for (let i = 0; i < fullMask.length; i++) if (fullMask[i] > 0) maskCount++;
    const stride = Math.max(1, Math.ceil(Math.sqrt(maskCount / 4000)));
    // 축소 단계 오차는 최대 ±factor px 이므로 그보다 한 칸 넓게 훑는다
    shifts = registerToReference(full, refIndex, { radius: factor + 1, initial: shifts, mask: fullMask, stride });
  }
  report(0.8);

  // 4) 발 기준이면 세로는 baseline으로
  if (opts.mode === 'feet') {
    const refBase = robustBaseline(frames[refIndex].data, frames[refIndex].w, frames[refIndex].h);
    if (refBase !== null) {
      shifts = shifts.map(([dx, dy], i) => {
        const b = robustBaseline(frames[i].data, frames[i].w, frames[i].h);
        return [dx, b === null ? dy : refBase - b];
      });
    }
  }

  // 셀 크기: 이동 후 알파 경계의 합집합
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  frames.forEach((f, i) => {
    const b = alphaBounds(f.data, f.w, f.h);
    if (!b) return;
    const [dx, dy] = shifts[i];
    minX = Math.min(minX, b[0] + dx);
    minY = Math.min(minY, b[1] + dy);
    maxX = Math.max(maxX, b[2] + dx);
    maxY = Math.max(maxY, b[3] + dy);
  });
  if (!Number.isFinite(minX)) return null;
  report(1);

  return {
    shifts,
    cellW: maxX - minX + pad * 2,
    cellH: maxY - minY + pad * 2,
    originX: pad - minX,
    originY: pad - minY,
  };
};
