// SLIC 슈퍼픽셀 — 출력 격자(cellsX × cellsY)마다 하나의 클러스터를 둔다.
// 투명 픽셀은 색 거리 없이 공간 거리로만 배정하고 색 평균에서 제외한다 (배경색 누출 방지).
import type { Img } from './types.ts';
import { rgbToLab } from './color.ts';

export interface SlicResult {
  cellsX: number;
  cellsY: number;
  /** 픽셀별 클러스터 인덱스 (cy*cellsX+cx), 길이 w*h */
  labels: Int32Array;
  /** 클러스터별 평균 RGB (길이 cells*3), 불투명 픽셀 기준 */
  colors: Float32Array;
  /** 클러스터별 평균 알파 (0..255) — 실제 커버리지 */
  alpha: Float32Array;
  /** 클러스터별 불투명 픽셀 수 */
  count: Int32Array;
}

export const slic = (img: Img, cellsX: number, cellsY: number, iterations: number, compactness: number): SlicResult => {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const cells = cellsX * cellsY;
  const Sx = w / cellsX, Sy = h / cellsY;
  const S = Math.sqrt(Sx * Sy);

  // 픽셀 Lab (투명 픽셀은 NaN 대신 플래그로 관리)
  const lab = new Float32Array(n * 3);
  const opaque = new Uint8Array(n);
  const tmp: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (data[o + 3] > 0) {
      opaque[i] = 1;
      rgbToLab(data[o], data[o + 1], data[o + 2], tmp);
      lab[i * 3] = tmp[0]; lab[i * 3 + 1] = tmp[1]; lab[i * 3 + 2] = tmp[2];
    }
  }

  // 중심 초기화: 셀 중앙 근방의 불투명 픽셀 평균 Lab
  const cx = new Float32Array(cells), cy = new Float32Array(cells);
  const cl = new Float32Array(cells * 3);
  const cHas = new Uint8Array(cells);
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const k = j * cellsX + i;
      cx[k] = (i + 0.5) * Sx;
      cy[k] = (j + 0.5) * Sy;
      const x0 = Math.max(0, Math.floor(i * Sx)), x1 = Math.min(w, Math.ceil((i + 1) * Sx));
      const y0 = Math.max(0, Math.floor(j * Sy)), y1 = Math.min(h, Math.ceil((j + 1) * Sy));
      let sl = 0, sa = 0, sb = 0, c = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = y * w + x;
          if (!opaque[p]) continue;
          sl += lab[p * 3]; sa += lab[p * 3 + 1]; sb += lab[p * 3 + 2]; c++;
        }
      }
      if (c > 0) { cl[k * 3] = sl / c; cl[k * 3 + 1] = sa / c; cl[k * 3 + 2] = sb / c; cHas[k] = 1; }
    }
  }

  const labels = new Int32Array(n);
  const dist = new Float32Array(n);
  const m = Math.max(0.1, compactness);
  const sw = (m * m) / (S * S);
  const iters = Math.max(1, Math.min(30, iterations | 0));

  for (let it = 0; it < iters; it++) {
    dist.fill(Infinity);
    for (let k = 0; k < cells; k++) {
      const x0 = Math.max(0, Math.floor(cx[k] - Sx)), x1 = Math.min(w - 1, Math.ceil(cx[k] + Sx));
      const y0 = Math.max(0, Math.floor(cy[k] - Sy)), y1 = Math.min(h - 1, Math.ceil(cy[k] + Sy));
      const kl = cl[k * 3], ka = cl[k * 3 + 1], kb = cl[k * 3 + 2];
      const has = cHas[k];
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy[k];
        for (let x = x0; x <= x1; x++) {
          const p = y * w + x;
          const dx = x + 0.5 - cx[k];
          let d = (dx * dx + dy * dy) * sw;
          if (opaque[p] && has) {
            const dl = lab[p * 3] - kl, da = lab[p * 3 + 1] - ka, db = lab[p * 3 + 2] - kb;
            d += dl * dl + da * da + db * db;
          }
          if (d < dist[p]) { dist[p] = d; labels[p] = k; }
        }
      }
    }
    // 중심 갱신
    const sumL = new Float32Array(cells * 3);
    const sumX = new Float32Array(cells), sumY = new Float32Array(cells);
    const cntAll = new Int32Array(cells), cntOp = new Int32Array(cells);
    for (let p = 0; p < n; p++) {
      const k = labels[p];
      sumX[k] += p % w + 0.5; sumY[k] += Math.floor(p / w) + 0.5; cntAll[k]++;
      if (opaque[p]) { sumL[k * 3] += lab[p * 3]; sumL[k * 3 + 1] += lab[p * 3 + 1]; sumL[k * 3 + 2] += lab[p * 3 + 2]; cntOp[k]++; }
    }
    for (let k = 0; k < cells; k++) {
      if (cntAll[k] > 0) { cx[k] = sumX[k] / cntAll[k]; cy[k] = sumY[k] / cntAll[k]; }
      if (cntOp[k] > 0) { cl[k * 3] = sumL[k * 3] / cntOp[k]; cl[k * 3 + 1] = sumL[k * 3 + 1] / cntOp[k]; cl[k * 3 + 2] = sumL[k * 3 + 2] / cntOp[k]; cHas[k] = 1; }
    }
  }

  // 출력 색: 클러스터의 불투명 픽셀 RGB 평균, 알파: 실제 커버리지
  const colors = new Float32Array(cells * 3);
  const alpha = new Float32Array(cells);
  const count = new Int32Array(cells);
  const cntAll = new Int32Array(cells);
  for (let p = 0; p < n; p++) {
    const k = labels[p];
    const o = p * 4;
    cntAll[k]++;
    alpha[k] += data[o + 3];
    if (opaque[p]) { colors[k * 3] += data[o]; colors[k * 3 + 1] += data[o + 1]; colors[k * 3 + 2] += data[o + 2]; count[k]++; }
  }
  for (let k = 0; k < cells; k++) {
    if (count[k] > 0) { colors[k * 3] /= count[k]; colors[k * 3 + 1] /= count[k]; colors[k * 3 + 2] /= count[k]; }
    alpha[k] = cntAll[k] > 0 ? alpha[k] / cntAll[k] : 0;
  }
  return { cellsX, cellsY, labels, colors, alpha, count };
};
