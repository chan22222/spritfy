// 노드 그래프 모델 — UI와 워커가 공유한다 (DOM 의존 없음)
import type { RGB } from './core/types.ts';

export type PinKind = 'image' | 'palette' | 'number';

export interface PinDef {
  key: string;
  kind: PinKind;
  /** i18n 키 (pfPin_*) */
  label: string;
  optional?: boolean;
}

export type ParamKind = 'range' | 'int' | 'select' | 'bool' | 'color' | 'palette' | 'replace' | 'locked';

export interface ParamOption {
  value: string;
  /** i18n 키 */
  label: string;
  slow?: boolean;
}

export interface ParamDef {
  key: string;
  kind: ParamKind;
  /** i18n 키 (pfParam_*) */
  label: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: ParamOption[];
  /** 다른 파라미터 값 조건에 맞을 때만 표시 */
  showIf?: Record<string, unknown>;
  /** 숫자 입력 핀으로 노출 */
  pin?: boolean;
  /** 표시용 배율(예: 0..1 → %) */
  percent?: boolean;
}

export type NodeGroup = 'pixel_size' | 'palette_color' | 'parameters' | 'input_cleanup' | 'pixel_grid' | 'scale_effects' | 'composite';

export interface NodeDef {
  type: string;
  group: NodeGroup;
  inputs: PinDef[];
  outputs: PinDef[];
  params: ParamDef[];
  slow?: boolean;
  /** 그래프에 하나만 (input/output) */
  unique?: boolean;
}

export interface GraphNode {
  id: number;
  type: string;
  x: number;
  y: number;
  params: Record<string, unknown>;
}

export interface GraphLink {
  id: number;
  from: number;
  fromPin: string;
  to: number;
  toPin: string;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
  nextId: number;
}

export interface PaletteParam {
  id: string; // builtin id 또는 'custom'
  colors: RGB[];
}

export interface ReplaceEntry {
  from: RGB;
  to: RGB | null;
  tolerance: number;
}

export const GRAPH_FORMAT = 'spritfy-pixelforge-graph';
export const GRAPH_VERSION = 1;

export const defaultParams = (def: NodeDef): Record<string, unknown> => {
  const p: Record<string, unknown> = {};
  for (const d of def.params) p[d.key] = typeof d.default === 'object' && d.default !== null ? JSON.parse(JSON.stringify(d.default)) : d.default;
  return p;
};

/** 노드의 전체 입력 핀 (명시 핀 + 숫자 핀 파라미터) */
export const allInputs = (def: NodeDef): PinDef[] => [
  ...def.inputs,
  ...def.params.filter((p) => p.pin).map<PinDef>((p) => ({ key: p.key, kind: 'number', label: p.label, optional: true })),
];

export const paramVisible = (p: ParamDef, params: Record<string, unknown>): boolean => {
  if (!p.showIf) return true;
  for (const [k, v] of Object.entries(p.showIf)) {
    const cur = params[k];
    if (Array.isArray(v) ? !v.includes(cur) : cur !== v) return false;
  }
  return true;
};

export const emptyGraph = (): Graph => ({ nodes: [], links: [], nextId: 1 });

export const addNode = (g: Graph, def: NodeDef, x: number, y: number): GraphNode => {
  const node: GraphNode = { id: g.nextId++, type: def.type, x: Math.round(x), y: Math.round(y), params: defaultParams(def) };
  g.nodes.push(node);
  return node;
};

export const addLink = (g: Graph, from: number, fromPin: string, to: number, toPin: string): GraphLink => {
  // 같은 입력 핀에 들어오는 기존 링크는 교체
  g.links = g.links.filter((l) => !(l.to === to && l.toPin === toPin));
  const link: GraphLink = { id: g.nextId++, from, fromPin, to, toPin };
  g.links.push(link);
  return link;
};

export const removeNode = (g: Graph, id: number): void => {
  g.nodes = g.nodes.filter((n) => n.id !== id);
  g.links = g.links.filter((l) => l.from !== id && l.to !== id);
};

export const removeLink = (g: Graph, id: number): void => {
  g.links = g.links.filter((l) => l.id !== id);
};

/** 위상 정렬. 사이클이 있으면 cycle=true */
export const topoSort = (g: Graph): { order: GraphNode[]; cycle: boolean } => {
  const indeg = new Map<number, number>();
  const out = new Map<number, number[]>();
  for (const n of g.nodes) { indeg.set(n.id, 0); out.set(n.id, []); }
  for (const l of g.links) {
    if (!indeg.has(l.from) || !indeg.has(l.to)) continue;
    indeg.set(l.to, (indeg.get(l.to) || 0) + 1);
    out.get(l.from)!.push(l.to);
  }
  const queue = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order: GraphNode[] = [];
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const to of out.get(id) || []) {
      const d = (indeg.get(to) || 0) - 1;
      indeg.set(to, d);
      if (d === 0) queue.push(to);
    }
  }
  return { order, cycle: order.length !== g.nodes.length };
};

/** 링크가 사이클을 만들지 검사 (from→to 연결 시 to에서 from으로 도달 가능하면 사이클) */
export const wouldCycle = (g: Graph, from: number, to: number): boolean => {
  if (from === to) return true;
  const out = new Map<number, number[]>();
  for (const l of g.links) { if (!out.has(l.from)) out.set(l.from, []); out.get(l.from)!.push(l.to); }
  const stack = [to];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const n of out.get(id) || []) stack.push(n);
  }
  return false;
};

/** 출력 노드의 조상 집합 (출력 노드 포함) */
export const ancestorsOfOutput = (g: Graph): Set<number> => {
  const outNode = g.nodes.find((n) => n.type === 'output');
  const set = new Set<number>();
  if (!outNode) return set;
  const into = new Map<number, number[]>();
  for (const l of g.links) { if (!into.has(l.to)) into.set(l.to, []); into.get(l.to)!.push(l.from); }
  const stack = [outNode.id];
  while (stack.length) {
    const id = stack.pop()!;
    if (set.has(id)) continue;
    set.add(id);
    for (const f of into.get(id) || []) stack.push(f);
  }
  return set;
};

/** 위치를 제외한 의미 키 — 이 값이 바뀔 때만 재평가한다 */
export const semanticKey = (g: Graph): string =>
  JSON.stringify({
    n: g.nodes.map((n) => [n.id, n.type, n.params]),
    l: g.links.map((l) => [l.from, l.fromPin, l.to, l.toPin]),
  });

export interface SerializedGraph {
  format: typeof GRAPH_FORMAT;
  version: number;
  name?: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

export const serializeGraph = (g: Graph, name?: string): SerializedGraph => ({
  format: GRAPH_FORMAT,
  version: GRAPH_VERSION,
  name,
  nodes: g.nodes.map((n) => ({ ...n, params: { ...n.params } })),
  links: g.links.map((l) => ({ ...l })),
});

/** 직렬화 데이터 → Graph. 알 수 없는 노드 타입은 버리고 파라미터는 기본값으로 보정한다 */
export const deserializeGraph = (raw: unknown, defs: Record<string, NodeDef>): Graph | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SerializedGraph>;
  if (!Array.isArray(r.nodes) || !Array.isArray(r.links)) return null;
  const nodes: GraphNode[] = [];
  const ids = new Set<number>();
  let maxId = 0;
  for (const n of r.nodes as GraphNode[]) {
    const def = defs[n?.type];
    if (!def || typeof n.id !== 'number' || ids.has(n.id)) continue;
    const params = defaultParams(def);
    if (n.params && typeof n.params === 'object') {
      for (const p of def.params) if (p.key in n.params) params[p.key] = (n.params as Record<string, unknown>)[p.key];
    }
    nodes.push({ id: n.id, type: n.type, x: Number(n.x) || 0, y: Number(n.y) || 0, params });
    ids.add(n.id);
    maxId = Math.max(maxId, n.id);
  }
  const links: GraphLink[] = [];
  for (const l of r.links as GraphLink[]) {
    if (!l || typeof l.id !== 'number' || !ids.has(l.from) || !ids.has(l.to)) continue;
    const fromDef = defs[nodes.find((n) => n.id === l.from)!.type];
    const toDef = defs[nodes.find((n) => n.id === l.to)!.type];
    const fromPin = fromDef.outputs.find((p) => p.key === l.fromPin);
    const toPin = allInputs(toDef).find((p) => p.key === l.toPin);
    if (!fromPin || !toPin || fromPin.kind !== toPin.kind) continue;
    if (links.some((x) => x.to === l.to && x.toPin === l.toPin)) continue;
    links.push({ id: l.id, from: l.from, fromPin: l.fromPin, to: l.to, toPin: l.toPin });
    maxId = Math.max(maxId, l.id);
  }
  return { nodes, links, nextId: maxId + 1 };
};

/** 빠른 문자열 해시 (cyrb53) */
export const hashString = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
};
