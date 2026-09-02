// 무손실 최적화 — 정확한 정수배 확대 이미지를 원래 격자 크기로 되돌린다 (메인 스레드에서도 가볍게 쓸 수 있도록 분리)
import { Img, createImg } from './types.ts';

/** 정확한 정수배 확대 이미지인지 검사해 배율을 돌려준다 (아니면 1) */
export const detectIntegerUpscale = (img: Img, maxK = 16): number => {
  const { width: w, height: h, data } = img;
  let best = 1;
  const cells = w * h;
  for (let k = 2; k <= maxK; k++) {
    if (w % k !== 0 || h % k !== 0 || w / k < 4 || h / k < 4) continue;
    let ok = true;
    // 전체 검사 전에 무작위 표본으로 빠르게 탈락시킨다 (사진은 첫 표본에서 끝난다)
    let seed = 12345 + k;
    for (let s = 0; s < 256 && ok; s++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const p = seed % cells;
      const x = p % w, y = (p / w) | 0;
      const bx = x - (x % k), by = y - (y % k);
      const o = p * 4, r = (by * w + bx) * 4;
      if (data[o] !== data[r] || data[o + 1] !== data[r + 1] || data[o + 2] !== data[r + 2] || data[o + 3] !== data[r + 3]) ok = false;
    }
    if (!ok) continue;
    for (let y = 0; y < h && ok; y++) {
      const by = y - (y % k);
      for (let x = 0; x < w; x++) {
        const bx = x - (x % k);
        if (bx === x && by === y) continue;
        const o = (y * w + x) * 4, r = (by * w + bx) * 4;
        if (data[o] !== data[r] || data[o + 1] !== data[r + 1] || data[o + 2] !== data[r + 2] || data[o + 3] !== data[r + 3]) { ok = false; break; }
      }
    }
    if (ok) best = k;
  }
  return best;
};

/** 정수배 확대 이미지를 무손실로 축소 (각 블록의 좌상단 픽셀) */
export const downsampleExact = (img: Img, k: number): Img => {
  const w = img.width / k, h = img.height / k;
  const out = createImg(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y * k) * img.width + x * k) * 4, di = (y * w + x) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
};
