import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  Graph, GraphNode, GraphLink, NodeDef, ParamDef, PinKind, PaletteParam, ReplaceEntry,
  allInputs, paramVisible, addNode, addLink, removeNode, removeLink, wouldCycle, defaultParams,
} from './graph.ts';
import { NODE_DEF_MAP, NODE_DEFS, NODE_GROUPS } from './node-defs.ts';
import { BUILTIN_PALETTES, findBuiltinPalette } from './core/palettes.ts';
import { hexToRgb, rgbToHex } from './core/color.ts';
import type { RGB } from './core/types.ts';
import type { NodeInfo } from './engine.worker.ts';

export const NODE_W = 240;
const HEADER_H = 30;
const PIN_TOP = 8;
const PIN_ROW = 20;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

export interface EditorHandle {
  fitView: () => void;
  addNodeAt: (type: string) => void;
}

export interface EyedropperTarget { nodeId: number; index: number }

interface Props {
  graph: Graph;
  setGraph: (fn: (g: Graph) => Graph) => void;
  t: Record<string, string>;
  nodeInfo: Record<number, NodeInfo>;
  eyedropper: EyedropperTarget | null;
  onEyedropper: (target: EyedropperTarget | null) => void;
  onSavePalette: (colors: RGB[], name: string) => void;
  onLoadPalette: (nodeId: number) => void;
}

interface MenuState { x: number; y: number; wx: number; wy: number; kind: 'canvas' | 'node' | 'link'; id?: number }
interface TempLink { from: number; fromPin: string; kind: PinKind; x: number; y: number }
type Drag =
  | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { mode: 'node'; id: number; sx: number; sy: number; nx: number; ny: number }
  | { mode: 'link' }
  | { mode: 'pinch'; dist: number; z: number; cx: number; cy: number; vx: number; vy: number };

const pinY = (i: number): number => HEADER_H + PIN_TOP + i * PIN_ROW + PIN_ROW / 2;
const estimateHeight = (def: NodeDef, node: GraphNode): number => {
  const rows = Math.max(allInputs(def).length, def.outputs.length, 1);
  const params = def.params.filter((p) => paramVisible(p, node.params));
  let h = HEADER_H + PIN_TOP * 2 + rows * PIN_ROW + 30;
  for (const p of params) h += p.kind === 'palette' ? 130 : p.kind === 'replace' ? 60 : p.kind === 'range' || p.kind === 'int' ? 40 : 30;
  return h;
};

const linkPath = (x1: number, y1: number, x2: number, y2: number): string => {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

const fmt = (v: number, step: number): string => (step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.1 ? 1 : 2));

/**
 * 숫자 입력 필드 — 편집 중에는 입력한 문자열을 그대로 두고(키 입력마다 최소값으로 보정하지 않음),
 * 범위 안의 값이면 즉시 반영하며, 포커스를 잃거나 Enter를 누를 때만 범위로 맞춘다.
 */
export const NumberField: React.FC<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number) => void;
  className?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
}> = ({ value, min, max, step = 1, onCommit, className, ariaLabel, title, disabled }) => {
  const [text, setText] = useState(() => fmt(value, step));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(fmt(value, step)); }, [value, step, focused]);
  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (raw: string): void => {
    const n = Number(raw);
    if (raw.trim() === '' || Number.isNaN(n)) { setText(fmt(value, step)); return; }
    const c = clamp(n);
    if (c !== value) onCommit(c);
    setText(fmt(c, step));
  };
  return (
    <input
      type="number"
      className={className}
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = Number(raw);
        if (raw.trim() !== '' && !Number.isNaN(n) && n === clamp(n) && n !== value) onCommit(n);
      }}
      onBlur={(e) => { setFocused(false); commit(e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); }
        else if (e.key === 'Escape') { setText(fmt(value, step)); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
};

// ---------- 파라미터 위젯 ----------
interface WidgetProps {
  def: ParamDef;
  value: unknown;
  linked: boolean;
  t: Record<string, string>;
  onChange: (v: unknown) => void;
  nodeId: number;
  eyedropper: EyedropperTarget | null;
  onEyedropper: (target: EyedropperTarget | null) => void;
  onSavePalette: (colors: RGB[], name: string) => void;
  onLoadPalette: (nodeId: number) => void;
}

const ParamWidget: React.FC<WidgetProps> = ({ def, value, linked, t, onChange, nodeId, eyedropper, onEyedropper, onSavePalette, onLoadPalette }) => {
  const label = t[def.label] || def.key;
  if (def.kind === 'range' || def.kind === 'int') {
    const v = Number(value) || 0;
    const step = def.step ?? (def.kind === 'int' ? 1 : 0.01);
    return (
      <div className={`pf-param${linked ? ' linked' : ''}`}>
        <div className="pf-param-row">
          <label>{label}</label>
          {linked ? (
            <span className="pf-param-linked">{t.pfLinked}</span>
          ) : def.percent ? (
            <span className="pf-param-val">{Math.round(v * 100)}%</span>
          ) : (
            <NumberField className="pf-param-num" value={v} min={def.min} max={def.max} step={step} ariaLabel={label} onCommit={(n) => onChange(n)} />
          )}
        </div>
        <input type="range" className="pf-range" min={def.min} max={def.max} step={step} value={v} disabled={linked} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      </div>
    );
  }
  if (def.kind === 'select') {
    return (
      <div className="pf-param pf-param-inline">
        <label>{label}</label>
        <select className="pf-select" value={String(value)} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {(def.options || []).map((o) => (
            <option key={o.value} value={o.value}>{t[o.label] || o.value}{o.slow ? ` ${t.pfSlow}` : ''}</option>
          ))}
        </select>
      </div>
    );
  }
  if (def.kind === 'bool') {
    return (
      <label className="pf-param pf-param-check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }
  if (def.kind === 'color') {
    const hex = String(value || '#000000');
    return (
      <div className="pf-param pf-param-inline">
        <label>{label}</label>
        <span className="pf-color-field">
          <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={label} />
          <input type="text" className="pf-hex" value={hex} onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
        </span>
      </div>
    );
  }
  if (def.kind === 'palette') {
    const pp = (value as PaletteParam) || { id: 'custom', colors: [] };
    const builtin = pp.id !== 'custom' ? findBuiltinPalette(pp.id) : undefined;
    const colors: RGB[] = builtin ? builtin.colors : pp.colors;
    const setCustom = (next: RGB[]): void => onChange({ id: 'custom', colors: next });
    return (
      <div className="pf-param pf-param-palette">
        <select
          className="pf-select" value={builtin ? pp.id : 'custom'} aria-label={label}
          onChange={(e) => {
            const id = e.target.value;
            if (id === 'custom') setCustom(colors.map((c) => [...c] as RGB));
            else { const b = findBuiltinPalette(id); onChange({ id, colors: b ? b.colors.map((c) => [...c] as RGB) : [] }); }
          }}
        >
          {BUILTIN_PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.colors.length})</option>)}
          <option value="custom">{t.pfCustomPalette}</option>
        </select>
        <div className="pf-swatches">
          {colors.map((c, i) => (
            <span key={i} className="pf-swatch" style={{ background: rgbToHex(c) }} title={rgbToHex(c)}>
              <input type="color" value={rgbToHex(c)} aria-label={`${label} ${i + 1}`} onChange={(e) => { const next = colors.map((x) => [...x] as RGB); next[i] = hexToRgb(e.target.value); setCustom(next); }} />
              <button type="button" className="pf-swatch-x" aria-label={t.pfRemoveColor} onClick={() => setCustom(colors.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
        </div>
        <div className="pf-param-actions">
          <button type="button" className="pf-mini-btn" onClick={() => setCustom([...colors.map((c) => [...c] as RGB), [255, 255, 255]])}>{t.pfAddColor}</button>
          <button type="button" className="pf-mini-btn" onClick={() => onSavePalette(colors, builtin ? builtin.id : 'custom')} disabled={colors.length === 0}>{t.pfSavePalette}</button>
          <button type="button" className="pf-mini-btn" onClick={() => onLoadPalette(nodeId)}>{t.pfLoadPalette}</button>
        </div>
        <div className="pf-param-hint">{(t.pfColorsCount || '%d colors').replace('%d', String(colors.length))}</div>
      </div>
    );
  }
  if (def.kind === 'locked') {
    const locked = (Array.isArray(value) ? value : []) as RGB[];
    return (
      <div className="pf-param pf-param-locked">
        <div className="pf-param-row">
          <label>{label}</label>
          <span className="pf-param-val">{locked.length}</span>
        </div>
        {locked.length > 0 && (
          <div className="pf-swatches">
            {locked.map((c, i) => (
              <span key={i} className="pf-swatch locked" style={{ background: rgbToHex(c) }} title={rgbToHex(c)}>
                <button type="button" className="pf-swatch-x" aria-label={t.pfRemoveColor} onClick={() => onChange(locked.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="pf-param-hint">{t.pfLockHint}</div>
        {locked.length > 0 && (
          <div className="pf-param-actions">
            <button type="button" className="pf-mini-btn" onClick={() => onChange([])}>{t.pfUnlockAll}</button>
          </div>
        )}
      </div>
    );
  }
  if (def.kind === 'replace') {
    const entries = (Array.isArray(value) ? value : []) as ReplaceEntry[];
    const update = (next: ReplaceEntry[]): void => onChange(next);
    return (
      <div className="pf-param pf-param-replace">
        {entries.map((e, i) => {
          const active = eyedropper && eyedropper.nodeId === nodeId && eyedropper.index === i;
          return (
            <div key={i} className="pf-replace-row">
              <div className="pf-replace-line">
                <button type="button" className={`pf-mini-btn pf-eyedrop${active ? ' active' : ''}`} title={t.pfEyedropperTip} aria-label={t.pfEyedropper} onClick={() => onEyedropper(active ? null : { nodeId, index: i })}>
                  <span className="material-symbols-outlined" aria-hidden="true">colorize</span>
                </button>
                <input type="color" value={rgbToHex(e.from)} aria-label={t.pfParam_from} onChange={(ev) => { const n = entries.map((x) => ({ ...x })); n[i].from = hexToRgb(ev.target.value); update(n); }} />
                <span className="pf-replace-arrow">→</span>
                {e.to ? (
                  <input type="color" value={rgbToHex(e.to)} aria-label={t.pfParam_to} onChange={(ev) => { const n = entries.map((x) => ({ ...x })); n[i].to = hexToRgb(ev.target.value); update(n); }} />
                ) : (
                  <span className="pf-swatch pf-swatch-transparent" title={t.pfOpt_transparent} />
                )}
                <label className="pf-param-check pf-replace-alpha">
                  <input type="checkbox" checked={!e.to} onChange={(ev) => { const n = entries.map((x) => ({ ...x })); n[i].to = ev.target.checked ? null : [...e.from] as RGB; update(n); }} />
                  <span>{t.pfOpt_transparent}</span>
                </label>
                <button type="button" className="pf-mini-btn pf-replace-x" aria-label={t.pfDelete} onClick={() => update(entries.filter((_, j) => j !== i))}>×</button>
              </div>
              <div className="pf-param-row">
                <label>{t.pfParam_tolerance}</label>
                <span className="pf-param-val">{Math.round(e.tolerance)}</span>
              </div>
              <input type="range" className="pf-range" min={0} max={96} step={1} value={e.tolerance} aria-label={t.pfParam_tolerance} onChange={(ev) => { const n = entries.map((x) => ({ ...x })); n[i].tolerance = Number(ev.target.value); update(n); }} />
            </div>
          );
        })}
        <div className="pf-param-actions">
          <button type="button" className="pf-mini-btn" onClick={() => update([...entries, { from: [255, 0, 255], to: null, tolerance: 8 }])}>{t.pfAddColor}</button>
        </div>
      </div>
    );
  }
  return null;
};

// ---------- 에디터 ----------
export const NodeEditor = forwardRef<EditorHandle, Props>(function NodeEditor(props, ref) {
  const { graph, setGraph, t, nodeInfo, eyedropper, onEyedropper, onSavePalette, onLoadPalette } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 40, y: 30, z: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const [sel, setSel] = useState<{ kind: 'node' | 'link'; id: number } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragPos, setDragPosState] = useState<{ id: number; x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const setDragPos = useCallback((v: { id: number; x: number; y: number } | null) => { dragPosRef.current = v; setDragPosState(v); }, []);
  const [temp, setTempState] = useState<TempLink | null>(null);
  const tempRef = useRef<TempLink | null>(null);
  const setTemp = useCallback((v: TempLink | null) => { tempRef.current = v; setTempState(v); }, []);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const toWorld = useCallback((cx: number, cy: number): { x: number; y: number } => {
    const rect = rootRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - (rect?.left ?? 0) - v.x) / v.z, y: (cy - (rect?.top ?? 0) - v.y) / v.z };
  }, []);

  const fitView = useCallback(() => {
    const g = graphRef.current;
    const root = rootRef.current;
    if (!root || g.nodes.length === 0) { setView({ x: 40, y: 30, z: 1 }); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of g.nodes) {
      const def = NODE_DEF_MAP[n.type];
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + NODE_W); y1 = Math.max(y1, n.y + (def ? estimateHeight(def, n) : 200));
    }
    const rw = root.clientWidth, rh = root.clientHeight;
    const z = Math.max(MIN_ZOOM, Math.min(1, Math.min(rw / (x1 - x0 + 80), rh / (y1 - y0 + 80))));
    setView({ x: (rw - (x1 - x0) * z) / 2 - x0 * z, y: (rh - (y1 - y0) * z) / 2 - y0 * z, z });
  }, []);

  const addNodeAtWorld = useCallback((type: string, wx: number, wy: number) => {
    const def = NODE_DEF_MAP[type];
    if (!def) return;
    const cur = graphRef.current;
    if (def.unique && cur.nodes.some((n) => n.type === type)) return;
    const newId = cur.nextId;
    setGraph((g) => {
      if (def.unique && g.nodes.some((n) => n.type === type)) return g;
      const ng: Graph = { ...g, nodes: [...g.nodes], links: [...g.links] };
      addNode(ng, def, wx, wy);
      return ng;
    });
    setSel({ kind: 'node', id: newId });
  }, [setGraph]);

  useImperativeHandle(ref, () => ({
    fitView,
    addNodeAt: (type: string) => {
      const root = rootRef.current;
      const v = viewRef.current;
      const cx = root ? root.clientWidth / 2 : 300, cy = root ? root.clientHeight / 2 : 200;
      addNodeAtWorld(type, (cx - v.x) / v.z - NODE_W / 2 + Math.random() * 40, (cy - v.y) / v.z - 60 + Math.random() * 40);
    },
  }), [fitView, addNodeAtWorld]);

  // 휠 줌 (passive: false 필요)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      setView((v) => {
        const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z;
        return { x: cx - wx * nz, y: cy - wy * nz, z: nz };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const deleteSelection = useCallback(() => {
    if (!sel) return;
    setGraph((g) => {
      const ng: Graph = { ...g, nodes: [...g.nodes], links: [...g.links] };
      if (sel.kind === 'node') removeNode(ng, sel.id); else removeLink(ng, sel.id);
      return ng;
    });
    setSel(null);
  }, [sel, setGraph]);

  const finishLink = useCallback((clientX: number, clientY: number, tl: TempLink) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest('[data-pin]') as HTMLElement | null;
    if (!el) return;
    const [dir, idStr, key, kind] = (el.dataset.pin || '').split(':');
    const toId = Number(idStr);
    if (dir !== 'in' || kind !== tl.kind || toId === tl.from) return;
    setGraph((g) => {
      if (wouldCycle(g, tl.from, toId)) return g;
      const ng: Graph = { ...g, nodes: [...g.nodes], links: [...g.links] };
      addLink(ng, tl.from, tl.fromPin, toId, key);
      return ng;
    });
  }, [setGraph]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-nodrag]') || target.closest('.pf-menu')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setMenu(null);
    rootRef.current?.focus({ preventScroll: true });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as Array<{ x: number; y: number }>;
      const v = viewRef.current;
      drag.current = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), z: v.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: v.x, vy: v.y };
      setDragPos(null); setTemp(null);
      return;
    }
    if (e.button === 2) return;
    rootRef.current?.setPointerCapture(e.pointerId);
    const pinEl = target.closest('[data-pin]') as HTMLElement | null;
    if (pinEl) {
      const [dir, idStr, key, kind] = (pinEl.dataset.pin || '').split(':');
      const id = Number(idStr);
      const w = toWorld(e.clientX, e.clientY);
      if (dir === 'out') {
        drag.current = { mode: 'link' };
        setTemp({ from: id, fromPin: key, kind: kind as PinKind, x: w.x, y: w.y });
      } else {
        // 입력 핀에 연결된 링크를 떼어내 다시 드래그
        const g = graphRef.current;
        const link = g.links.find((l) => l.to === id && l.toPin === key);
        if (link) {
          setGraph((gg) => { const ng: Graph = { ...gg, nodes: [...gg.nodes], links: [...gg.links] }; removeLink(ng, link.id); return ng; });
          drag.current = { mode: 'link' };
          setTemp({ from: link.from, fromPin: link.fromPin, kind: kind as PinKind, x: w.x, y: w.y });
        }
      }
      e.preventDefault();
      return;
    }
    const headerEl = target.closest('[data-node-header]') as HTMLElement | null;
    const nodeEl = target.closest('[data-node]') as HTMLElement | null;
    if (nodeEl) {
      const id = Number(nodeEl.dataset.node);
      setSel({ kind: 'node', id });
      if (headerEl || !target.closest('.pf-node-params')) {
        const n = graphRef.current.nodes.find((x) => x.id === id);
        if (n) { drag.current = { mode: 'node', id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y }; setDragPos({ id, x: n.x, y: n.y }); }
      }
      return;
    }
    const linkEl = target.closest('[data-link]') as HTMLElement | null;
    if (linkEl) { setSel({ kind: 'link', id: Number(linkEl.dataset.link) }); return; }
    setSel(null);
    const v = viewRef.current;
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()] as Array<{ x: number; y: number }>;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, d.z * (dist / Math.max(1, d.dist))));
      const rect = rootRef.current?.getBoundingClientRect();
      const cx = d.cx - (rect?.left ?? 0), cy = d.cy - (rect?.top ?? 0);
      const wx = (cx - d.vx) / d.z, wy = (cy - d.vy) / d.z;
      const mx = (a.x + b.x) / 2 - d.cx, my = (a.y + b.y) / 2 - d.cy;
      setView({ x: cx - wx * nz + mx, y: cy - wy * nz + my, z: nz });
      return;
    }
    if (d.mode === 'pan') { setView((v) => ({ ...v, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) })); return; }
    if (d.mode === 'node') {
      const z = viewRef.current.z;
      setDragPos({ id: d.id, x: Math.round(d.nx + (e.clientX - d.sx) / z), y: Math.round(d.ny + (e.clientY - d.sy) / z) });
      return;
    }
    if (d.mode === 'link') { const w = toWorld(e.clientX, e.clientY); const tl = tempRef.current; if (tl) setTemp({ ...tl, x: w.x, y: w.y }); }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pinch') { if (pointers.current.size === 0) drag.current = null; return; }
    drag.current = null;
    try { rootRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d.mode === 'node') {
      const p = dragPosRef.current;
      if (p) setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === p.id && (n.x !== p.x || n.y !== p.y) ? { ...n, x: p.x, y: p.y } : n)) }));
      setDragPos(null);
    } else if (d.mode === 'link') {
      const tl = tempRef.current;
      setTemp(null);
      if (tl) finishLink(e.clientX, e.clientY, tl);
    }
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    if (target.closest('[data-nodrag]')) return;
    const rect = rootRef.current!.getBoundingClientRect();
    const w = toWorld(e.clientX, e.clientY);
    const base = { x: e.clientX - rect.left, y: e.clientY - rect.top, wx: w.x, wy: w.y };
    const nodeEl = target.closest('[data-node]') as HTMLElement | null;
    if (nodeEl) { const id = Number(nodeEl.dataset.node); setSel({ kind: 'node', id }); setMenu({ ...base, kind: 'node', id }); return; }
    const linkEl = target.closest('[data-link]') as HTMLElement | null;
    if (linkEl) { const id = Number(linkEl.dataset.link); setSel({ kind: 'link', id }); setMenu({ ...base, kind: 'link', id }); return; }
    setMenu({ ...base, kind: 'canvas' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); e.preventDefault(); }
    else if (e.key === 'Escape') { setMenu(null); onEyedropper(null); }
    else if (e.key === 'f' || e.key === 'F') fitView();
  };

  const setParam = useCallback((id: number, key: string, value: unknown) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)) }));
  }, [setGraph]);

  const resetNode = useCallback((id: number) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => { const def = NODE_DEF_MAP[n.type]; return n.id === id && def ? { ...n, params: defaultParams(def) } : n; }) }));
  }, [setGraph]);

  const nodePos = (n: GraphNode): { x: number; y: number } => (dragPos && dragPos.id === n.id ? dragPos : n);
  const byId = new Map<number, GraphNode>(graph.nodes.map((n) => [n.id, n] as [number, GraphNode]));
  const linkedInputs = new Set(graph.links.map((l) => `${l.to}:${l.toPin}`));

  const pinWorld = (n: GraphNode, def: NodeDef, side: 'in' | 'out', key: string): { x: number; y: number } | null => {
    const list = side === 'in' ? allInputs(def) : def.outputs;
    const i = list.findIndex((p) => p.key === key);
    if (i < 0) return null;
    const p = nodePos(n);
    return { x: p.x + (side === 'in' ? 0 : NODE_W), y: p.y + pinY(i) };
  };

  const renderLink = (l: GraphLink): React.ReactNode => {
    const a = byId.get(l.from), b = byId.get(l.to);
    if (!a || !b) return null;
    const da = NODE_DEF_MAP[a.type], db = NODE_DEF_MAP[b.type];
    if (!da || !db) return null;
    const p1 = pinWorld(a, da, 'out', l.fromPin), p2 = pinWorld(b, db, 'in', l.toPin);
    if (!p1 || !p2) return null;
    const kind = da.outputs.find((p) => p.key === l.fromPin)?.kind || 'image';
    const d = linkPath(p1.x, p1.y, p2.x, p2.y);
    const selected = sel?.kind === 'link' && sel.id === l.id;
    return (
      <g key={l.id} className={`pf-link kind-${kind}${selected ? ' selected' : ''}`}>
        <path d={d} className="pf-link-hit" data-link={l.id} />
        <path d={d} className="pf-link-line" />
      </g>
    );
  };

  const tempPath = (): React.ReactNode => {
    if (!temp) return null;
    const a = byId.get(temp.from);
    const da = a ? NODE_DEF_MAP[a.type] : undefined;
    const p1 = a && da ? pinWorld(a, da, 'out', temp.fromPin) : null;
    if (!p1) return null;
    return <path className={`pf-link-line pf-link-temp kind-${temp.kind}`} d={linkPath(p1.x, p1.y, temp.x, temp.y)} />;
  };

  const addMenu = (m: MenuState): React.ReactNode => (
    <div className="pf-menu pf-add-menu" style={{ left: m.x, top: m.y }} data-nodrag role="menu">
      <div className="pf-menu-title">{t.pfAddNode}</div>
      <div className="pf-menu-scroll">
        {NODE_GROUPS.map((grp) => (
          <div key={grp.group} className="pf-menu-group">
            <div className={`pf-menu-group-title pf-group-${grp.group}`}>{t[grp.label]}</div>
            {NODE_DEFS.filter((d) => d.group === grp.group).map((d) => {
              const disabled = !!d.unique && graph.nodes.some((n) => n.type === d.type);
              return (
                <button key={d.type} type="button" role="menuitem" className="pf-menu-item" disabled={disabled} title={t[`pfNodeDesc_${d.type}`]} onClick={() => { addNodeAtWorld(d.type, m.wx, m.wy); setMenu(null); }}>
                  {t[`pfNode_${d.type}`] || d.type}{d.slow ? <span className="pf-badge">{t.pfSlow}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`pf-editor${temp ? ' linking' : ''}`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      onAuxClick={(e) => { if (e.button === 2 && !menu) onContextMenu(e); }}
      onKeyDown={onKeyDown}
      aria-label={t.pfNodeGraph}
    >
      <div className="pf-editor-bg" style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.z}px ${24 * view.z}px` }} />
      <svg className="pf-links-svg" aria-hidden="true">
        <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
          {graph.links.map(renderLink)}
          {tempPath()}
        </g>
      </svg>
      <div className="pf-nodes" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        {graph.nodes.map((n) => {
          const def = NODE_DEF_MAP[n.type];
          if (!def) return null;
          const p = nodePos(n);
          const inputs = allInputs(def);
          const rows = Math.max(inputs.length, def.outputs.length, 1);
          const info = nodeInfo[n.id];
          const selected = sel?.kind === 'node' && sel.id === n.id;
          const visible = def.params.filter((pd) => paramVisible(pd, n.params));
          return (
            <div key={n.id} className={`pf-node pf-group-${def.group}${selected ? ' selected' : ''}${info?.error ? ' has-error' : ''}`} style={{ left: p.x, top: p.y, width: NODE_W }} data-node={n.id}>
              <div className="pf-node-header" data-node-header={n.id} title={t[`pfNodeDesc_${n.type}`]}>
                <span className="pf-node-title">{t[`pfNode_${n.type}`] || n.type}</span>
                {def.slow ? <span className="pf-badge">{t.pfSlow}</span> : null}
                <button type="button" className="pf-node-close" data-nodrag aria-label={t.pfDeleteNode} onClick={() => { setGraph((g) => { const ng: Graph = { ...g, nodes: [...g.nodes], links: [...g.links] }; removeNode(ng, n.id); return ng; }); setSel(null); }}>×</button>
              </div>
              <div className="pf-node-pins" style={{ height: rows * PIN_ROW + PIN_TOP * 2 }}>
                {inputs.map((pin, i) => (
                  <div key={pin.key} className={`pf-pin pf-pin-in kind-${pin.kind}${linkedInputs.has(`${n.id}:${pin.key}`) ? ' connected' : ''}`} style={{ top: PIN_TOP + i * PIN_ROW }} data-pin={`in:${n.id}:${pin.key}:${pin.kind}`}>
                    <span className="pf-pin-dot" /><span className="pf-pin-label">{t[pin.label] || pin.key}</span>
                  </div>
                ))}
                {def.outputs.map((pin, i) => (
                  <div key={pin.key} className={`pf-pin pf-pin-out kind-${pin.kind}`} style={{ top: PIN_TOP + i * PIN_ROW }} data-pin={`out:${n.id}:${pin.key}:${pin.kind}`}>
                    <span className="pf-pin-label">{t[pin.label] || pin.key}</span><span className="pf-pin-dot" />
                  </div>
                ))}
              </div>
              {visible.length > 0 && (
                <div className="pf-node-params" data-nodrag>
                  {visible.map((pd) => (
                    <ParamWidget
                      key={pd.key} def={pd} value={n.params[pd.key]} linked={!!pd.pin && linkedInputs.has(`${n.id}:${pd.key}`)} t={t}
                      onChange={(v) => setParam(n.id, pd.key, v)} nodeId={n.id}
                      eyedropper={eyedropper} onEyedropper={onEyedropper} onSavePalette={onSavePalette} onLoadPalette={onLoadPalette}
                    />
                  ))}
                </div>
              )}
              {(info?.error || info?.size || info?.palette || typeof info?.number === 'number') && (
                <div className="pf-node-footer" data-nodrag>
                  {info.error && <div className="pf-node-error">{t[`pfErr_${info.error}`] || info.error}</div>}
                  {info.palette && (
                    <div className="pf-node-palette">
                      <div className="pf-swatches small">
                        {info.palette.slice(0, 64).map((c, i) => {
                          const lockable = def.params.some((pd) => pd.kind === 'locked');
                          if (!lockable) return <span key={i} className="pf-swatch" style={{ background: rgbToHex(c) }} title={rgbToHex(c)} />;
                          const lockedList = (Array.isArray(n.params.locked) ? n.params.locked : []) as RGB[];
                          const same = (l: RGB): boolean => l[0] === c[0] && l[1] === c[1] && l[2] === c[2];
                          const isLocked = lockedList.some(same);
                          return (
                            <button
                              key={i} type="button" className={`pf-swatch clickable${isLocked ? ' locked' : ''}`} style={{ background: rgbToHex(c) }}
                              title={`${rgbToHex(c)} · ${t.pfLockHint}`} aria-pressed={isLocked}
                              onClick={() => setParam(n.id, 'locked', isLocked ? lockedList.filter((l) => !same(l)) : [...lockedList, [c[0], c[1], c[2]] as RGB])}
                            />
                          );
                        })}
                      </div>
                      <div className="pf-node-meta">
                        <span>{(t.pfColorsCount || '%d colors').replace('%d', String(info.palette.length))}</span>
                        {def.outputs.some((o) => o.kind === 'palette') && n.type !== 'palette' && (
                          <button type="button" className="pf-mini-btn" onClick={() => onSavePalette(info.palette!, n.type)}>{t.pfSavePalette}</button>
                        )}
                      </div>
                    </div>
                  )}
                  {info.size && !info.error && (
                    <div className="pf-node-meta"><span>{info.size[0]}×{info.size[1]}{info.size[2] > 1 ? ` ×${info.size[2]}` : ''}</span>{typeof info.ms === 'number' ? <span>{info.ms} ms</span> : null}</div>
                  )}
                  {typeof info.number === 'number' && <div className="pf-node-meta"><span>= {info.number}</span></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pf-editor-tools" data-nodrag>
        <button type="button" className="pf-tool-btn" title={t.pfAddNode} aria-label={t.pfAddNode} onClick={() => { const root = rootRef.current!; const v = viewRef.current; setMenu({ x: 12, y: 44, wx: (root.clientWidth / 2 - v.x) / v.z - NODE_W / 2, wy: (root.clientHeight / 2 - v.y) / v.z - 80, kind: 'canvas' }); }}>
          <span className="material-symbols-outlined" aria-hidden="true">add_box</span>
        </button>
        <button type="button" className="pf-tool-btn" title={t.pfFitView} aria-label={t.pfFitView} onClick={fitView}><span className="material-symbols-outlined" aria-hidden="true">fit_screen</span></button>
        <button type="button" className="pf-tool-btn" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, z: Math.min(MAX_ZOOM, v.z * 1.2) }))}><span className="material-symbols-outlined" aria-hidden="true">zoom_in</span></button>
        <button type="button" className="pf-tool-btn" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, z: Math.max(MIN_ZOOM, v.z / 1.2) }))}><span className="material-symbols-outlined" aria-hidden="true">zoom_out</span></button>
        <span className="pf-tool-zoom">{Math.round(view.z * 100)}%</span>
        {sel && (
          <button type="button" className="pf-tool-btn danger" title={sel.kind === 'node' ? t.pfDeleteNode : t.pfDeleteLink} aria-label={sel.kind === 'node' ? t.pfDeleteNode : t.pfDeleteLink} onClick={deleteSelection}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button>
        )}
      </div>

      {menu && menu.kind === 'canvas' && addMenu(menu)}
      {menu && menu.kind !== 'canvas' && (
        <div className="pf-menu" style={{ left: menu.x, top: menu.y }} data-nodrag role="menu">
          {menu.kind === 'node' && typeof menu.id === 'number' && (
            <button type="button" role="menuitem" className="pf-menu-item" onClick={() => { resetNode(menu.id!); setMenu(null); }}>
              {t.pfNodeDefaults}
            </button>
          )}
          <button type="button" role="menuitem" className="pf-menu-item danger" onClick={() => { deleteSelection(); setMenu(null); }}>
            {menu.kind === 'node' ? t.pfDeleteNode : t.pfDeleteLink}
          </button>
        </div>
      )}
      {graph.nodes.length === 0 && <div className="pf-editor-empty">{t.pfGraphEmpty}</div>}
    </div>
  );
});
