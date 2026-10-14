import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REJOIN_DELAYS_MS, Rejoiner } from './rejoin';

describe('Rejoiner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rejoins after a delay that grows with each failed attempt', () => {
    const rejoin = vi.fn();
    const r = new Rejoiner(rejoin);
    r.schedule();
    r.schedule(); // already pending: no second timer
    vi.advanceTimersByTime(REJOIN_DELAYS_MS[0]);
    expect(rejoin).toHaveBeenCalledTimes(1);
    r.schedule();
    vi.advanceTimersByTime(REJOIN_DELAYS_MS[0]);
    expect(rejoin).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REJOIN_DELAYS_MS[1] - REJOIN_DELAYS_MS[0]);
    expect(rejoin).toHaveBeenCalledTimes(2);
  });

  it('does nothing once connected, and starts short again next time', () => {
    const rejoin = vi.fn();
    const r = new Rejoiner(rejoin);
    r.schedule();
    vi.advanceTimersByTime(REJOIN_DELAYS_MS[0]);
    r.schedule();
    r.ok();
    vi.advanceTimersByTime(60_000);
    expect(rejoin).toHaveBeenCalledTimes(1);
    r.schedule();
    vi.advanceTimersByTime(REJOIN_DELAYS_MS[0]);
    expect(rejoin).toHaveBeenCalledTimes(2);
  });

  it('rejoins straight away on now()', () => {
    const rejoin = vi.fn();
    const r = new Rejoiner(rejoin);
    r.schedule();
    r.now();
    expect(rejoin).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(rejoin).toHaveBeenCalledTimes(1);
  });
});
