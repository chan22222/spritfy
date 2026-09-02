// 메인 스레드용 워커 래퍼
import type { ImageSeq } from './core/types.ts';
import type { Graph } from './graph.ts';
import type { WorkerInMsg, WorkerOutMsg, ResultMsg, NodeInfo, EvalStatus } from './engine.worker.ts';

export interface EvalResult {
  status: EvalStatus;
  error?: string;
  output: ImageSeq | null;
  nodeInfo: Record<number, NodeInfo>;
  stats: { cached: number; computed: number; ms: number };
}

export class EngineClient {
  private worker: Worker;
  private jobSeq = 0;
  private sourceSeq = 0;
  private pending = new Map<number, (r: EvalResult) => void>();
  onProgress: ((nodeId: number, done: number, total: number) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        if (msg.jobId === this.jobSeq) this.onProgress?.(msg.nodeId, msg.done, msg.total);
        return;
      }
      this.settle(msg);
    };
    this.worker.onerror = (ev) => {
      for (const [, resolve] of this.pending) resolve({ status: 'error', error: ev.message, output: null, nodeInfo: {}, stats: { cached: 0, computed: 0, ms: 0 } });
      this.pending.clear();
    };
  }

  private settle(msg: ResultMsg): void {
    const resolve = this.pending.get(msg.jobId);
    if (!resolve) return;
    this.pending.delete(msg.jobId);
    const output: ImageSeq | null = msg.output
      ? { frames: msg.output.frames.map((f) => ({ width: f.width, height: f.height, data: new Uint8ClampedArray(f.buffer) })), delays: msg.output.delays }
      : null;
    resolve({ status: msg.status, error: msg.error, output, nodeInfo: msg.nodeInfo, stats: msg.stats });
  }

  /** 원본 이미지를 워커에 전달한다. 반환값은 sourceId */
  setSource(seq: ImageSeq | null): number {
    const id = ++this.sourceSeq;
    const frames = seq ? seq.frames.map((f) => ({ width: f.width, height: f.height, buffer: f.data.slice().buffer as ArrayBuffer })) : [];
    const msg: WorkerInMsg = { type: 'source', id, frames, delays: seq ? seq.delays.slice() : [] };
    this.worker.postMessage(msg, frames.map((f) => f.buffer));
    return id;
  }

  evaluate(graph: Graph, sourceId: number): Promise<EvalResult> {
    const jobId = ++this.jobSeq;
    // 이전 작업은 취소 처리
    for (const [id, resolve] of this.pending) {
      if (id !== jobId) resolve({ status: 'cancelled', output: null, nodeInfo: {}, stats: { cached: 0, computed: 0, ms: 0 } });
    }
    this.pending.clear();
    return new Promise<EvalResult>((resolve) => {
      this.pending.set(jobId, resolve);
      const msg: WorkerInMsg = { type: 'eval', jobId, graph: { nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, x: 0, y: 0, params: n.params })), links: graph.links, nextId: graph.nextId }, sourceId };
      this.worker.postMessage(msg);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
