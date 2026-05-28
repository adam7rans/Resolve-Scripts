import { useCallback, useRef, useState } from 'react';

const MAX = 60;

/**
 * Debounced undo/redo stack with correct pre-change semantics.
 *
 * The stack stores the state BEFORE each change batch, not after.
 * stableRef — last state that was committed to history.
 * pendingFromRef — the pre-change state for the in-flight debounce window.
 *
 * push(getLatest):
 *   First call in a new batch captures stableRef as pendingFrom.
 *   Debounce fires after 400ms: pushes pendingFrom to past, updates stableRef.
 *   Subsequent pushes within the same window just extend the timer.
 *
 * undo/redo(getLatest, restore):
 *   Flush any in-flight batch first (so immediate Cmd+Z works correctly),
 *   then step through the stack.
 */
export function useUndoHistory<T>() {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [counts, setCounts] = useState({ p: 0, f: 0 });
  const restoring = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // last state that was fully committed (= stable baseline)
  const stableRef = useRef<T | null>(null);
  // pre-change state for the current in-flight debounce window
  const pendingFromRef = useRef<T | null>(null);

  const syncCounts = () =>
    setCounts({ p: past.current.length, f: future.current.length });

  const flushPending = (getLatest: () => T) => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    if (pendingFromRef.current !== null) {
      const arr = [...past.current, pendingFromRef.current];
      past.current = arr.length > MAX ? arr.slice(-MAX) : arr;
      future.current = [];
    }
    stableRef.current = getLatest();
    pendingFromRef.current = null;
  };

  const push = useCallback((getLatest: () => T) => {
    if (restoring.current) return;
    // First push in this batch: capture the pre-change state now.
    if (!timer.current) {
      pendingFromRef.current = stableRef.current;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pendingFromRef.current !== null) {
        const arr = [...past.current, pendingFromRef.current];
        past.current = arr.length > MAX ? arr.slice(-MAX) : arr;
        future.current = [];
      }
      stableRef.current = getLatest();
      pendingFromRef.current = null;
      syncCounts();
    }, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = useCallback((getLatest: () => T, restore: (s: T) => void) => {
    flushPending(getLatest);
    if (!past.current.length) return;
    const snap = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    const current = getLatest();
    future.current = [current, ...future.current].slice(0, MAX);
    restoring.current = true;
    restore(snap);
    stableRef.current = snap;
    setTimeout(() => { restoring.current = false; }, 500);
    syncCounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const redo = useCallback((getLatest: () => T, restore: (s: T) => void) => {
    flushPending(getLatest);
    if (!future.current.length) return;
    const snap = future.current[0];
    future.current = future.current.slice(1);
    const current = getLatest();
    past.current = [...past.current, current].slice(-MAX);
    restoring.current = true;
    restore(snap);
    stableRef.current = snap;
    setTimeout(() => { restoring.current = false; }, 500);
    syncCounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    past.current = [];
    future.current = [];
    stableRef.current = null;
    pendingFromRef.current = null;
    setCounts({ p: 0, f: 0 });
  }, []);

  return { canUndo: counts.p > 0, canRedo: counts.f > 0, push, undo, redo, clear };
}
