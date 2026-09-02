// PixelForge 코어 타입 — 워커/메인 양쪽에서 쓰이므로 DOM 의존이 없어야 한다.

export interface Img {
  width: number;
  height: number;
  /** RGBA, 길이 = width*height*4 */
  data: Uint8ClampedArray;
}

/** 이미지 핀을 흐르는 값. 정지 이미지는 frames.length === 1 */
export interface ImageSeq {
  frames: Img[];
  /** 프레임별 지연(ms). frames와 길이가 같다 */
  delays: number[];
}

export type RGB = [number, number, number];

export interface Palette {
  colors: RGB[];
  name?: string;
}

export type ColorSpace = 'auto' | 'rgb' | 'lab' | 'oklab' | 'hsl' | 'hsluv' | 'lch' | 'oklch';

export const createImg = (width: number, height: number): Img => ({
  width,
  height,
  data: new Uint8ClampedArray(Math.max(0, width * height * 4)),
});

export const cloneImg = (img: Img): Img => ({
  width: img.width,
  height: img.height,
  data: new Uint8ClampedArray(img.data),
});

export const isStatic = (seq: ImageSeq): boolean => seq.frames.length <= 1;

export const mapSeq = (seq: ImageSeq, fn: (img: Img, index: number) => Img): ImageSeq => ({
  frames: seq.frames.map(fn),
  delays: seq.delays.slice(),
});

export const singleSeq = (img: Img, delay = 100): ImageSeq => ({ frames: [img], delays: [delay] });

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

export const rgbKey = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;
export const keyToRgb = (k: number): RGB => [(k >> 16) & 255, (k >> 8) & 255, k & 255];
