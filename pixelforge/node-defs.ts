// 노드 정의(스키마) — 파라미터/핀 구조만 담고 구현은 node-impl.ts (워커 전용)에 둔다
import type { NodeDef, ParamOption, ParamDef } from './graph.ts';

const opt = (values: string[], slow: string[] = []): ParamOption[] => values.map((v) => ({ value: v, label: `pfOpt_${v}`, slow: slow.includes(v) }));

export const DOWNSCALE_METHODS = opt(['box', 'dpid', 'bilateral', 'ssim', 'slic', 'nearest', 'median', 'lanczos', 'bicubic'], ['slic', 'bilateral']);
export const DITHER_METHODS = opt(['none', 'floyd', 'atkinson', 'jarvis', 'sierra', 'ordered4', 'ordered8', 'bluenoise', 'ostro']);
export const COLOR_SPACES = opt(['auto', 'lab', 'oklab', 'hsl', 'hsluv', 'lch', 'oklch', 'rgb']);
export const BLEND_MODES = opt(['normal', 'add', 'multiply', 'screen']);
export const METRICS = opt(['lab', 'de2000', 'rgb']);

const P = {
  range: (key: string, def: number, min: number, max: number, step = 0.01, extra: Partial<ParamDef> = {}): ParamDef => ({ key, kind: 'range', label: `pfParam_${key}`, default: def, min, max, step, ...extra }),
  int: (key: string, def: number, min: number, max: number, extra: Partial<ParamDef> = {}): ParamDef => ({ key, kind: 'int', label: `pfParam_${key}`, default: def, min, max, step: 1, ...extra }),
  select: (key: string, def: string, options: ParamOption[], extra: Partial<ParamDef> = {}): ParamDef => ({ key, kind: 'select', label: `pfParam_${key}`, default: def, options, ...extra }),
  bool: (key: string, def: boolean, extra: Partial<ParamDef> = {}): ParamDef => ({ key, kind: 'bool', label: `pfParam_${key}`, default: def, ...extra }),
  color: (key: string, def: string, extra: Partial<ParamDef> = {}): ParamDef => ({ key, kind: 'color', label: `pfParam_${key}`, default: def, ...extra }),
};

const imgIn = { key: 'image', kind: 'image', label: 'pfPin_input' } as const;
const imgOut = { key: 'image', kind: 'image', label: 'pfPin_output' } as const;
const palIn = { key: 'palette', kind: 'palette', label: 'pfPin_palette' } as const;
const palOut = { key: 'palette', kind: 'palette', label: 'pfPin_palette' } as const;

const frameParams = (): ParamDef[] => [
  P.bool('all_frames', true),
  P.int('frame', 0, 0, 999, { showIf: { all_frames: false } }),
];

export const NODE_DEFS: NodeDef[] = [
  // ----- 합성 -----
  { type: 'input', group: 'composite', unique: true, inputs: [], outputs: [imgOut], params: [P.int('offset_x', 0, -64, 64), P.int('offset_y', 0, -64, 64)] },
  { type: 'output', group: 'composite', unique: true, inputs: [imgIn], outputs: [], params: [] },
  { type: 'mix', group: 'composite', inputs: [{ key: 'a', kind: 'image', label: 'pfPin_input_a' }, { key: 'b', kind: 'image', label: 'pfPin_input_b' }], outputs: [imgOut], params: [P.select('blend_mode', 'normal', BLEND_MODES), P.range('factor', 0.5, 0, 1, 0.01, { pin: true, percent: true })] },

  // ----- 픽셀 크기 -----
  {
    type: 'downscale', group: 'pixel_size', inputs: [imgIn], outputs: [imgOut],
    params: [
      P.int('long_side', 128, 8, 1024, { pin: true }),
      P.select('method', 'dpid', DOWNSCALE_METHODS),
      P.range('detail', 1, 0, 2, 0.05, { showIf: { method: 'dpid' } }),
      P.range('edge', 0.6, 0, 1, 0.01, { showIf: { method: 'bilateral' }, percent: true }),
      P.range('smoothness', 0.3, 0, 1, 0.01, { showIf: { method: 'bilateral' }, percent: true }),
      P.int('radius', 1, 1, 3, { showIf: { method: 'ssim' } }),
      P.range('sharpness', 1, 0, 1, 0.01, { showIf: { method: 'ssim' }, percent: true }),
      P.int('iterations', 8, 1, 20, { showIf: { method: 'slic' } }),
      P.range('compactness', 25, 1, 40, 1, { showIf: { method: 'slic' } }),
      P.range('smoothing', 0, 0, 1, 0.01, { showIf: { method: 'slic' }, percent: true }),
      P.select('alpha', 'opaque', opt(['opaque', 'keep'])),
    ],
  },
  { type: 'pixel_snap', group: 'pixel_size', inputs: [imgIn], outputs: [imgOut], params: [P.int('cell_size', 0, 0, 64), P.bool('auto_offset', true), P.bool('resample_int', false), P.range('inner', 0.6, 0, 1, 0.05, { percent: true }), P.int('ref_frame', 0, 0, 999)] },
  { type: 'grid_restore', group: 'pixel_size', inputs: [imgIn], outputs: [imgOut], params: [P.int('scale', 0, 0, 32), P.range('inner', 0.5, 0, 1, 0.05, { percent: true }), P.int('ref_frame', 0, 0, 999)] },
  { type: 'scale', group: 'pixel_size', inputs: [imgIn], outputs: [imgOut], params: [P.range('x', 2, 0.1, 8, 0.1, { pin: true }), P.range('y', 2, 0.1, 8, 0.1, { pin: true }), P.select('method', 'nearest', opt(['nearest', 'bilinear']))] },
  {
    type: 'pia_auto', group: 'pixel_size', slow: true, inputs: [imgIn], outputs: [imgOut, palOut],
    params: [
      P.int('long_side', 128, 16, 512, { pin: true }),
      P.int('color_count', 16, 2, 64, { pin: true }),
      P.int('iterations', 10, 1, 20),
      P.range('compactness', 20, 1, 40, 1),
      P.bool('fixed_frame', true),
      P.int('frame', 0, 0, 999, { showIf: { fixed_frame: true } }),
      P.select('dither', 'none', DITHER_METHODS),
      P.range('strength', 1, 0, 1, 0.01, { showIf: { dither: ['floyd', 'atkinson', 'jarvis', 'sierra', 'ordered4', 'ordered8', 'bluenoise', 'ostro'] }, percent: true }),
    ],
  },
  {
    type: 'pixelize_legacy', group: 'pixel_size', inputs: [imgIn, { ...palIn, optional: true }], outputs: [imgOut],
    params: [P.int('long_side', 128, 8, 1024, { pin: true }), P.select('method', 'box', DOWNSCALE_METHODS), P.select('dither', 'none', DITHER_METHODS), P.range('strength', 1, 0, 1, 0.01, { percent: true }), P.select('color_space', 'auto', COLOR_SPACES)],
  },

  // ----- 팔레트 · 색 -----
  { type: 'palette', group: 'palette_color', inputs: [], outputs: [palOut], params: [{ key: 'palette', kind: 'palette', label: 'pfParam_palette', default: { id: 'endesga-32', colors: [] } }] },
  { type: 'palette_map', group: 'palette_color', inputs: [imgIn, palIn], outputs: [imgOut], params: [P.select('color_space', 'auto', COLOR_SPACES), P.bool('perceptual', false)] },
  { type: 'dither', group: 'palette_color', inputs: [imgIn, { ...palIn, optional: true }], outputs: [imgOut], params: [P.select('method', 'floyd', DITHER_METHODS), P.range('strength', 1, 0, 1, 0.01, { percent: true }), P.select('color_space', 'auto', COLOR_SPACES)] },
  {
    type: 'palette_extract', group: 'palette_color', inputs: [imgIn], outputs: [palOut],
    params: [
      P.int('color_count', 32, 2, 256, { pin: true }),
      P.select('criterion', 'pca', opt(['pca', 'kmeans', 'mediancut', 'popularity'])),
      P.select('color_space', 'oklab', COLOR_SPACES),
      P.range('merge', 0, 0, 40, 0.5),
      P.select('merge_mode', 'post', opt(['post', 'pre']), { showIf: { merge_mode_dummy: undefined } }),
      P.select('merge_metric', 'lab', METRICS),
      P.bool('bg_ignore', false),
      ...frameParams(),
      { key: 'locked', kind: 'locked', label: 'pfParam_locked', default: [] },
    ],
  },
  { type: 'palette_extract_exp', group: 'palette_color', inputs: [imgIn], outputs: [palOut], params: [P.int('color_count', 16, 2, 256, { pin: true }), P.range('vivid', 0.5, 0, 1, 0.01, { percent: true }), P.bool('bg_ignore', false), ...frameParams(), { key: 'locked', kind: 'locked', label: 'pfParam_locked', default: [] }] },
  { type: 'color_replace', group: 'palette_color', inputs: [imgIn], outputs: [imgOut], params: [{ key: 'entries', kind: 'replace', label: 'pfParam_entries', default: [] }] },
  { type: 'color_adjust', group: 'palette_color', inputs: [imgIn], outputs: [imgOut], params: [P.range('brightness', 0, -100, 100, 1, { pin: true }), P.range('contrast', 1, 0, 2, 0.01, { pin: true }), P.range('saturation', 1, 0, 2, 0.01, { pin: true })] },
  { type: 'color_merge', group: 'palette_color', inputs: [imgIn], outputs: [imgOut], params: [P.range('merge_tol', 6, 0, 40, 0.5), P.select('color_space', 'oklab', COLOR_SPACES), P.select('merge_metric', 'lab', METRICS)] },

  // ----- 파라미터 -----
  { type: 'value', group: 'parameters', inputs: [], outputs: [{ key: 'number', kind: 'number', label: 'pfPin_number' }], params: [P.range('value', 128, -1000, 1000, 1)] },

  // ----- 입력 정리 -----
  { type: 'preprocess', group: 'input_cleanup', inputs: [imgIn], outputs: [imgOut], params: [P.range('sharpen', 0.3, 0, 1, 0.01, { percent: true }), P.range('noise', 0.3, 0, 1, 0.01, { percent: true })] },
  { type: 'ai_denoise', group: 'input_cleanup', inputs: [imgIn], outputs: [imgOut], params: [P.range('strength', 0.5, 0, 1, 0.01, { percent: true }), P.range('luma_preserve', 0.7, 0, 1, 0.01, { percent: true })] },
  { type: 'color_cleanup', group: 'input_cleanup', inputs: [imgIn], outputs: [imgOut], params: [P.int('radius', 2, 1, 8), P.range('color_delta', 24, 0, 96, 1)] },
  { type: 'remove_background', group: 'input_cleanup', inputs: [imgIn], outputs: [imgOut], params: [P.range('tolerance', 30, 0, 160, 1), P.select('bg_mode', 'flood', opt(['flood', 'global'])), P.bool('auto_color', true), P.color('color', '#ffffff', { showIf: { auto_color: false } }), P.int('ref_frame', 0, 0, 999, { showIf: { auto_color: true } })] },
  { type: 'rotate', group: 'input_cleanup', inputs: [imgIn], outputs: [imgOut], params: [P.range('angle', 0, -180, 180, 1, { pin: true }), P.bool('expand', true)] },
  {
    type: 'auto_crop', group: 'input_cleanup', inputs: [imgIn], outputs: [imgOut],
    params: [P.select('crop_mode', 'transparent', opt(['transparent', 'solid', 'subject'])), P.int('padding', 0, 0, 64), P.int('alpha_threshold', 1, 1, 255, { showIf: { crop_mode: ['transparent', 'subject'] } }), P.range('tolerance', 24, 0, 128, 1, { showIf: { crop_mode: ['solid', 'subject'] } }), P.range('margin', 0.02, 0, 0.3, 0.01, { showIf: { crop_mode: 'subject' }, percent: true }), P.select('crop_ref', 'union', opt(['union', 'frame'])), P.int('ref_frame', 0, 0, 999, { showIf: { crop_ref: 'frame' } })],
  },

  // ----- 픽셀 격자 -----
  { type: 'de_antialias', group: 'pixel_grid', inputs: [imgIn], outputs: [imgOut], params: [P.range('strength', 0.6, 0, 1, 0.01, { percent: true }), P.int('alpha_threshold', 128, 0, 255)] },
  { type: 'pixel_lines', group: 'pixel_grid', inputs: [imgIn], outputs: [imgOut], params: [P.int('iterations', 2, 1, 8)] },
  { type: 'outline', group: 'pixel_grid', inputs: [imgIn], outputs: [imgOut], params: [P.select('outline_mode', 'silhouette', opt(['silhouette', 'edges'])), P.color('color', '#101018'), P.int('thickness', 1, 1, 8, { showIf: { outline_mode: 'silhouette' } }), P.bool('expand', true, { showIf: { outline_mode: 'silhouette' } }), P.int('alpha_threshold', 128, 1, 255)] },
  {
    type: 'bresenham', group: 'pixel_grid', inputs: [imgIn], outputs: [imgOut],
    params: [P.select('bz_mode', 'aa_line', opt(['aa_line', 'thick', 'curve', 'clean_color', 'clean_auto', 'edge_aa'])), P.range('thickness', 1.5, 1, 6, 0.5, { showIf: { bz_mode: ['thick', 'clean_color', 'clean_auto'] } }), P.bool('auto_color', true, { showIf: { bz_mode: ['aa_line', 'thick', 'curve', 'clean_color'] } }), P.color('color', '#101018', { showIf: { auto_color: false } }), P.range('tolerance', 1.2, 0, 4, 0.1), P.int('alpha_threshold', 128, 1, 255)],
  },

  // ----- 크기 · 효과 -----
  { type: 'post_fx', group: 'scale_effects', inputs: [imgIn], outputs: [imgOut], params: [P.range('glow', 0, 0, 1, 0.01, { percent: true }), P.range('scanline', 0, 0, 1, 0.01, { percent: true }), P.range('vignette', 0, 0, 1, 0.01, { percent: true }), P.bool('legacy_outline', false)] },
  {
    type: 'noise', group: 'scale_effects', inputs: [{ ...imgIn, optional: true }], outputs: [imgOut],
    params: [
      P.select('noise_type', 'perlin', opt(['perlin', 'voronoi', 'value', 'turbulence', 'waves'])),
      P.select('noise_effect', 'overlay', opt(['overlay', 'displace', 'dissolve'])),
      P.range('size', 24, 2, 256, 1, { pin: true }),
      P.int('octaves', 3, 1, 8),
      P.int('seed', 1, 0, 9999),
      P.int('levels', 0, 0, 16),
      P.range('strength', 0.5, 0, 1, 0.01, { percent: true }),
      P.color('color', '#ffffff', { showIf: { noise_effect: 'overlay' } }),
      P.select('blend_mode', 'normal', BLEND_MODES, { showIf: { noise_effect: 'overlay' } }),
      P.bool('animate', false),
      P.int('frames', 12, 1, 60, { showIf: { animate: true } }),
      P.range('speed', 1, 0, 4, 0.1, { showIf: { animate: true } }),
      P.int('width', 128, 8, 1024),
      P.int('height', 128, 8, 1024),
    ],
  },
  { type: 'deflicker', group: 'scale_effects', inputs: [imgIn], outputs: [imgOut], params: [P.range('threshold', 4, 0, 30, 0.5)] },
];

// merge_mode 는 항상 표시 (임시 showIf 제거)
for (const d of NODE_DEFS) for (const p of d.params) if (p.key === 'merge_mode') delete p.showIf;

export const NODE_DEF_MAP: Record<string, NodeDef> = Object.fromEntries(NODE_DEFS.map((d) => [d.type, d]));

export const NODE_GROUPS: Array<{ group: NodeDef['group']; label: string }> = [
  { group: 'pixel_size', label: 'pfGroup_pixel_size' },
  { group: 'palette_color', label: 'pfGroup_palette_color' },
  { group: 'input_cleanup', label: 'pfGroup_input_cleanup' },
  { group: 'pixel_grid', label: 'pfGroup_pixel_grid' },
  { group: 'scale_effects', label: 'pfGroup_scale_effects' },
  { group: 'composite', label: 'pfGroup_composite' },
  { group: 'parameters', label: 'pfGroup_parameters' },
];
