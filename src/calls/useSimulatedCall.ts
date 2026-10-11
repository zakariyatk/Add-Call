import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { callReducer, IDLE, toRecord, type CallControl } from './callMachine';
import type { CallRecord, Peer } from './types';

/** Timings for the simulated network; a real backend replaces these events. */
const RING_AFTER_MS = 900;
const ANSWER_AFTER_MS = 3200;
const CLEAR_AFTER_MS = 1600;

/**
 * Drives the call reducer with simulated network events. There is no media or
 * signalling yet — this keeps the UI fully usable until a calling backend is wired in.
 */
export function useSimulatedCall(onEnded: (record: CallRecord) => void) {
  const [state, dispatch] = useReducer(callReducer, IDLE);
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef<number[]>([]);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const start = useCallback((peer: Peer, video = false) => {
    clearTimers();
    dispatch({ type: 'dial', peer, at: Date.now(), video });
    timers.current.push(
      window.setTimeout(() => dispatch({ type: 'ring' }), RING_AFTER_MS),
      window.setTimeout(() => dispatch({ type: 'connect', at: Date.now() }), ANSWER_AFTER_MS),
    );
  }, []);

  const hangUp = useCallback(() => {
    clearTimers();
    dispatch({ type: 'hangup', at: Date.now() });
  }, []);

  const toggle = useCallback((control: CallControl) => dispatch({ type: 'toggle', control }), []);

  // Tick the in-call timer once a second while connected.
  useEffect(() => {
    if (state.status !== 'connected') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  // Log the finished call, then clear the call screen.
  useEffect(() => {
    if (state.status !== 'ended') return;
    const record = toRecord(state, `call-${state.startedAt}`);
    if (record) onEndedRef.current(record);
    const id = window.setTimeout(() => dispatch({ type: 'reset' }), CLEAR_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  return { state, now: Math.max(now, state.connectedAt ?? 0), start, hangUp, toggle };
}
