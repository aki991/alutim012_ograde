import { useCallback, useEffect, useRef, useState } from 'react';
import { computeLayout, insertIndexForX } from '../domain/geometry/layout';
import type { Project } from '../domain/models/types';
import type { NewElementSpec } from '../store/useAppStore';

export type DragSource =
  | { kind: 'move'; id: string; label: string }
  | { kind: 'new'; spec: NewElementSpec; label: string };

export interface DragView {
  source: DragSource;
  x: number;
  y: number;
  /** true tek kad je pointer pomeren dovoljno daleko od početka (razlikuje klik od prevlačenja) */
  active: boolean;
  /** indeks stuba na kome se crta indikator ubacivanja, ili null ako je pointer van crteža */
  indicatorPost: number | null;
  /** indeks u nizu elemenata na koji će element biti postavljen */
  toIndex: number | null;
}

/** Površina na koju se može ispustiti element (2D crtež ili 3D scena) i način da se pointer prevede u mm duž trase. */
export interface DropTarget {
  el: HTMLElement;
  toMm: (clientX: number, clientY: number) => number | null;
}

const THRESHOLD = 5;

/**
 * Prevlačenje mišem i dodirom (Pointer Events). Isti mehanizam služi za promenu redosleda
 * postojećih elemenata i za ubacivanje novih iz kataloga, i u 2D i u 3D prikazu.
 * Pan platna je zasebna interakcija.
 */
export function useDragController(opts: {
  project: Project | undefined;
  getTargets: () => DropTarget[];
  onDrop: (source: DragSource, toIndex: number) => void;
}) {
  const [view, setView] = useState<DragView | null>(null);
  const ref = useRef<DragView | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const compute = useCallback((source: DragSource, cx: number, cy: number): { indicatorPost: number | null; toIndex: number | null } => {
    const { project, getTargets } = optsRef.current;
    if (!project) return { indicatorPost: null, toIndex: null };
    const target = getTargets().find((t) => {
      const r = t.el.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    });
    if (!target) return { indicatorPost: null, toIndex: null };
    const xMm = target.toMm(cx, cy);
    if (xMm === null) return { indicatorPost: null, toIndex: null };
    const layout = computeLayout(project);
    if (source.kind === 'move') {
      const from = project.items.findIndex((i) => i.id === source.id);
      const to = insertIndexForX(layout, xMm, source.id);
      if (to === from) return { indicatorPost: null, toIndex: null };
      return { indicatorPost: to <= from ? to : to + 1, toIndex: to };
    }
    const to = insertIndexForX(layout, xMm);
    return { indicatorPost: to, toIndex: to };
  }, []);

  const cancel = useCallback(() => {
    ref.current = null;
    startRef.current = null;
    setView(null);
  }, []);

  const begin = useCallback((source: DragSource, e: { clientX: number; clientY: number }) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    ref.current = { source, x: e.clientX, y: e.clientY, active: false, indicatorPost: null, toIndex: null };
    setView(ref.current);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const cur = ref.current;
      const start = startRef.current;
      if (!cur || !start) return;
      const active = cur.active || Math.hypot(e.clientX - start.x, e.clientY - start.y) > THRESHOLD;
      const pos = active ? compute(cur.source, e.clientX, e.clientY) : { indicatorPost: null, toIndex: null };
      ref.current = { ...cur, x: e.clientX, y: e.clientY, active, ...pos };
      setView(ref.current);
    };
    const onUp = () => {
      const cur = ref.current;
      if (!cur) return;
      ref.current = null;
      startRef.current = null;
      setView(null);
      if (cur.active && cur.toIndex !== null) optsRef.current.onDrop(cur.source, cur.toIndex);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && ref.current) cancel(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', cancel);
    };
  }, [compute, cancel]);

  return { drag: view, begin, cancel };
}
