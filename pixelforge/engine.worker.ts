// 그래프 평가 워커 — 노드별 결과 캐시, 최신 작업 외 취소
import type { ImageSeq, Img, RGB } from './core/types.ts';
import { NODE_IMPL, NodeError, type Value } from './node-impl.ts';
import { NODE_DEF_MAP } from './node-defs.ts';
import { topoSort, ancestorsOfOutput, allInputs, hashString, type Graph } from './graph.ts';

export interface SourceMsg { type: 'source'; id: number; frames: Array<{ width: number; height: number; buffer: ArrayBuffer }>; delays: number[] }
export interface EvalMsg { type: 'eval'; jobId: number; graph: Graph; sourceId: number }
export type WorkerInMsg = SourceMsg | EvalMsg | { type: 'clear' };

export interface NodeInfo {
  error?: string;
  palette?: RGB[];
  size?: [number, number, number];
  number?: number;
  skipped?: boolean;
  ms?: number;
}

export type EvalStatus = 'ok' | 'cycle' | 'no_output' | 'not_connected' | 'no_source' | 'error' | 'cancelled';

export interface ResultMsg {
  type: 'result';
  jobId: number;
  status: EvalStatus;
  error?: string;
  output?: { frames: Array<{ width: number; height: number; buffer: ArrayBuffer }>; delays: number[] };
  nodeInfo: Record<number, NodeInfo>;
  stats: { cached: number; computed: number; ms: number };
}
export interface ProgressMsg { type: 'progress'; jobId: number; nodeId: number; done: number; total: number }
export type WorkerOutMsg = ResultMsg | ProgressMsg;

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerInMsg>) => void) | null;
  postMessage(msg: WorkerOutMsg, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

let source: ImageSeq | null = null;
let sourceId = 0;
let currentJob = 0;
const cache = new Map<number, { key: string; outputs: Record<string, Value> }>();

const CANCEL = new NodeError('cancelled');

const stableStringify = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
};

const cloneFrames = (seq: ImageSeq): Array<{ width: number; height: number; buffer: ArrayBuffer }> =>
  seq.frames.map((f) => ({ width: f.width, height: f.height, buffer: f.data.slice().buffer as ArrayBuffer }));

const evaluate = async (jobId: number, graph: Graph): Promise<ResultMsg> => {
  const t0 = performance.now();
  const nodeInfo: Record<number, NodeInfo> = {};
  const stats = { cached: 0, computed: 0, ms: 0 };
  const done = (status: EvalStatus, extra: Partial<ResultMsg> = {}): ResultMsg => {
    stats.ms = Math.round(performance.now() - t0);
    return { type: 'result', jobId, status, nodeInfo, stats, ...extra };
  };

  // 그래프에서 사라진 노드의 캐시 정리
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const id of Array.from(cache.keys())) if (!ids.has(id)) cache.delete(id);

  const { order, cycle } = topoSort(graph);
  if (cycle) return done('cycle');
  const outNode = graph.nodes.find((n) => n.type === 'output');
  if (!outNode) return done('no_output');
  if (!graph.links.some((l) => l.to === outNode.id)) return done('not_connected');
  const active = ancestorsOfOutput(graph);

  const results = new Map<number, { key: string; outputs: Record<string, Value> }>();
  const tick = async (): Promise<void> => {
    await new Promise<void>((r) => setTimeout(r, 0));
    if (currentJob !== jobId) throw CANCEL;
  };

  let step = 0;
  for (const node of order) {
    if (!active.has(node.id)) { nodeInfo[node.id] = { skipped: true }; continue; }
    const def = NODE_DEF_MAP[node.type];
    const impl = NODE_IMPL[node.type];
    if (!def || !impl) { nodeInfo[node.id] = { error: 'unknown_node' }; return done('error', { error: `unknown node: ${node.type}` }); }

    const inputs: Record<string, Value | undefined> = {};
    const inputKeys: string[] = [];
    let missingUpstream = false;
    for (const link of graph.links) {
      if (link.to !== node.id) continue;
      const prod = results.get(link.from);
      if (!prod) { missingUpstream = true; continue; }
      const v = prod.outputs[link.fromPin];
      if (v) { inputs[link.toPin] = v; inputKeys.push(`${link.toPin}=${prod.key}.${link.fromPin}`); }
    }
    if (missingUpstream) return done('error', { error: 'upstream_failed' });
    // 필수 핀 확인
    for (const pin of allInputs(def)) {
      if (pin.kind === 'number' || pin.optional) continue;
      if (!inputs[pin.key]) { nodeInfo[node.id] = { error: 'missing_input' }; return done('error', { error: 'missing_input' }); }
    }

    const key = hashString(`${node.type}|${stableStringify(node.params)}|${inputKeys.sort().join(',')}|${node.type === 'input' ? 'src' + sourceId : ''}`);
    const cached = cache.get(node.id);
    let outputs: Record<string, Value>;
    if (cached && cached.key === key) {
      outputs = cached.outputs;
      stats.cached++;
    } else {
      const ts = performance.now();
      scope.postMessage({ type: 'progress', jobId, nodeId: node.id, done: step, total: active.size });
      try {
        outputs = await impl({ params: node.params, inputs, source, tick });
      } catch (err) {
        if (err === CANCEL || (err instanceof NodeError && err.code === 'cancelled')) return done('cancelled');
        const code = err instanceof NodeError ? err.code : 'error';
        nodeInfo[node.id] = { error: code };
        if (code === 'no_source') return done('no_source');
        return done('error', { error: err instanceof Error ? err.message : String(err) });
      }
      cache.set(node.id, { key, outputs });
      stats.computed++;
      nodeInfo[node.id] = { ...(nodeInfo[node.id] || {}), ms: Math.round(performance.now() - ts) };
      await tick();
    }
    results.set(node.id, { key, outputs });
    step++;
    const info = nodeInfo[node.id] || (nodeInfo[node.id] = {});
    for (const v of Object.values(outputs)) {
      if (v.kind === 'palette') info.palette = v.palette;
      else if (v.kind === 'image') { const f: Img = v.seq.frames[0]; info.size = [f.width, f.height, v.seq.frames.length]; }
      else if (v.kind === 'number') info.number = v.value;
    }
  }

  const outVal = results.get(outNode.id)?.outputs.image;
  if (!outVal || outVal.kind !== 'image') return done('not_connected');
  const frames = cloneFrames(outVal.seq);
  return done('ok', { output: { frames, delays: outVal.seq.delays.slice() } });
};

scope.onmessage = (e: MessageEvent<WorkerInMsg>) => {
  const msg = e.data;
  if (msg.type === 'source') {
    source = msg.frames.length
      ? { frames: msg.frames.map((f) => ({ width: f.width, height: f.height, data: new Uint8ClampedArray(f.buffer) })), delays: msg.delays }
      : null;
    sourceId = msg.id;
    cache.clear();
    return;
  }
  if (msg.type === 'clear') { cache.clear(); return; }
  if (msg.type === 'eval') {
    currentJob = msg.jobId;
    void (async () => {
      let res: ResultMsg;
      try {
        res = await evaluate(msg.jobId, msg.graph);
      } catch (err) {
        res = { type: 'result', jobId: msg.jobId, status: 'error', error: err instanceof Error ? err.message : String(err), nodeInfo: {}, stats: { cached: 0, computed: 0, ms: 0 } };
      }
      if (res.status === 'cancelled' || currentJob !== msg.jobId) {
        scope.postMessage({ ...res, status: 'cancelled', output: undefined });
        return;
      }
      const transfer = res.output ? res.output.frames.map((f) => f.buffer) : [];
      scope.postMessage(res, transfer);
    })();
  }
};
