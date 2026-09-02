// 내장 프리셋 그래프 (PixelForge presets/ 와 동일 구성)
import { emptyGraph, addNode, addLink, type Graph } from './graph.ts';
import { NODE_DEF_MAP } from './node-defs.ts';

type NodeSpec = [type: string, x: number, y: number, params?: Record<string, unknown>];
type LinkSpec = [fromIdx: number, fromPin: string, toIdx: number, toPin: string];

const build = (nodes: NodeSpec[], links: LinkSpec[]): Graph => {
  const g = emptyGraph();
  const created = nodes.map(([type, x, y, params]) => {
    const n = addNode(g, NODE_DEF_MAP[type], x, y);
    if (params) Object.assign(n.params, params);
    return n;
  });
  for (const [f, fp, t, tp] of links) addLink(g, created[f].id, fp, created[t].id, tp);
  return g;
};

export interface BuiltinPreset {
  id: string;
  /** i18n 키 */
  label: string;
  build: () => Graph;
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'default',
    label: 'pfPreset_default',
    build: () => build(
      [
        ['input', 40, 160],
        ['downscale', 320, 120, { long_side: 128, method: 'dpid' }],
        ['palette_extract', 620, 330, { color_count: 32 }],
        ['dither', 620, 80, { method: 'none' }],
        ['output', 920, 140],
      ],
      [[0, 'image', 1, 'image'], [1, 'image', 2, 'image'], [1, 'image', 3, 'image'], [2, 'palette', 3, 'palette'], [3, 'image', 4, 'image']],
    ),
  },
  {
    id: 'pixel_snap',
    label: 'pfPreset_pixel_snap',
    build: () => build(
      [
        ['input', 40, 160],
        ['pixel_snap', 320, 120, { cell_size: 0, auto_offset: true, resample_int: false }],
        ['palette_extract', 620, 330, { color_count: 32, merge: 3 }],
        ['palette_map', 620, 80],
        ['output', 920, 140],
      ],
      [[0, 'image', 1, 'image'], [1, 'image', 2, 'image'], [1, 'image', 3, 'image'], [2, 'palette', 3, 'palette'], [3, 'image', 4, 'image']],
    ),
  },
  {
    id: 'line_cleanup',
    label: 'pfPreset_line_cleanup',
    build: () => build(
      [
        ['input', 40, 200],
        ['downscale', 300, 160, { long_side: 128, method: 'dpid' }],
        ['palette_extract', 580, 420, { color_count: 24, merge: 4 }],
        ['palette_map', 580, 120],
        ['de_antialias', 860, 120, { strength: 0.7 }],
        ['pixel_lines', 1120, 120, { iterations: 2 }],
        ['output', 1380, 140],
      ],
      [[0, 'image', 1, 'image'], [1, 'image', 2, 'image'], [1, 'image', 3, 'image'], [2, 'palette', 3, 'palette'], [3, 'image', 4, 'image'], [4, 'image', 5, 'image'], [5, 'image', 6, 'image']],
    ),
  },
  {
    id: 'pia_portrait',
    label: 'pfPreset_pia_portrait',
    build: () => build(
      [
        ['input', 60, 160],
        ['pia_auto', 340, 100, { long_side: 128, color_count: 32, iterations: 10, compactness: 20 }],
        ['output', 640, 160],
      ],
      [[0, 'image', 1, 'image'], [1, 'image', 2, 'image']],
    ),
  },
  {
    id: 'water_ripple',
    label: 'pfPreset_water_ripple',
    build: () => build(
      [
        ['input', 60, 160],
        ['noise', 340, 60, { noise_type: 'waves', noise_effect: 'displace', size: 24, octaves: 3, strength: 0.14, animate: true, frames: 16, speed: 1 }],
        ['output', 640, 160],
      ],
      [[0, 'image', 1, 'image'], [1, 'image', 2, 'image']],
    ),
  },
  {
    id: 'water_surface',
    label: 'pfPreset_water_surface',
    build: () => build(
      [
        ['noise', 40, 40, { noise_type: 'perlin', size: 40, octaves: 4, animate: true, frames: 16, speed: 1, strength: 1, width: 128, height: 96 }],
        ['noise', 40, 620, { noise_type: 'voronoi', size: 12, octaves: 1, animate: true, frames: 16, speed: 1, strength: 1, width: 128, height: 96 }],
        ['noise', 340, 620, { noise_type: 'waves', size: 22, octaves: 2, animate: true, frames: 16, speed: 2, strength: 1, width: 128, height: 96 }],
        ['mix', 340, 300, { blend_mode: 'screen', factor: 0.35 }],
        ['mix', 640, 300, { blend_mode: 'add', factor: 0.22 }],
        ['palette', 640, 620, { palette: { id: 'ocean', colors: [] } }],
        ['palette_map', 940, 300, { color_space: 'oklab' }],
        ['output', 1240, 320],
      ],
      [[0, 'image', 3, 'a'], [1, 'image', 3, 'b'], [3, 'image', 4, 'a'], [2, 'image', 4, 'b'], [4, 'image', 6, 'image'], [5, 'palette', 6, 'palette'], [6, 'image', 7, 'image']],
    ),
  },
];

export const findBuiltinPreset = (id: string): BuiltinPreset | undefined => BUILTIN_PRESETS.find((p) => p.id === id);
