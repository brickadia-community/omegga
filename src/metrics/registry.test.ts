import { describe, expect, it, vi } from 'vitest';
import {
  Counter,
  Gauge,
  Histogram,
  NO_LIMITS,
  PLUGIN_LIMITS,
  Registry,
} from './registry';

describe('Counter', () => {
  it('accumulates unlabelled increments', () => {
    const c = new Counter({ name: 'test_total' }, NO_LIMITS);
    c.inc();
    c.inc(4);
    expect(c.get()).toBe(5);
  });

  it('keeps each label combination on its own series', () => {
    const c = new Counter(
      { name: 'test_total', labels: ['weapon'] },
      NO_LIMITS,
    );
    c.inc({ weapon: 'pistol' });
    c.inc({ weapon: 'pistol' }, 2);
    c.inc({ weapon: 'rifle' });
    expect(c.get({ weapon: 'pistol' })).toBe(3);
    expect(c.get({ weapon: 'rifle' })).toBe(1);
    expect(c.snapshot().samples).toHaveLength(2);
  });

  it('treats label order as irrelevant to series identity', () => {
    const c = new Counter({ name: 't_total', labels: ['a', 'b'] }, NO_LIMITS);
    c.inc({ a: '1', b: '2' });
    c.inc({ b: '2', a: '1' });
    expect(c.snapshot().samples).toHaveLength(1);
    expect(c.get({ a: '1', b: '2' })).toBe(2);
  });

  it('refuses to decrease', () => {
    const c = new Counter({ name: 'test_total' }, NO_LIMITS);
    expect(() => c.inc(-1)).toThrow(/cannot decrease/);
  });

  it('rejects undeclared labels', () => {
    const c = new Counter({ name: 'test_total', labels: ['a'] }, NO_LIMITS);
    expect(() => c.inc({ b: '1' })).toThrow(/not declared/);
  });

  it('rejects an invalid metric name', () => {
    expect(() => new Counter({ name: '1bad-name' }, NO_LIMITS)).toThrow(
      /invalid metric name/,
    );
  });

  it('rejects reserved and malformed label names', () => {
    expect(
      () => new Counter({ name: 'ok', labels: ['__reserved'] }, NO_LIMITS),
    ).toThrow(/invalid label name/);
    expect(
      () => new Counter({ name: 'ok', labels: ['has-dash'] }, NO_LIMITS),
    ).toThrow(/invalid label name/);
  });
});

describe('Gauge', () => {
  it('sets, increments, and decrements', () => {
    const g = new Gauge({ name: 'test' }, NO_LIMITS);
    g.set(10);
    g.inc();
    g.dec(3);
    expect(g.get()).toBe(8);
  });

  it('goes negative, unlike a counter', () => {
    const g = new Gauge({ name: 'test' }, NO_LIMITS);
    g.dec(5);
    expect(g.get()).toBe(-5);
  });

  it('drops a single series with remove()', () => {
    const g = new Gauge({ name: 'test', labels: ['id'] }, NO_LIMITS);
    g.set({ id: 'a' }, 1);
    g.set({ id: 'b' }, 2);
    g.remove({ id: 'a' });
    expect(g.snapshot().samples).toHaveLength(1);
  });

  it('runs a numeric collect callback at snapshot time', () => {
    const g = new Gauge({ name: 'test' }, NO_LIMITS);
    let value = 1;
    g.collect(() => value);
    expect(g.snapshot().samples[0].value).toBe(1);
    value = 42;
    expect(g.snapshot().samples[0].value).toBe(42);
  });

  it('replaces every series when collect returns samples', () => {
    // this is what keeps per-player/per-plugin gauges from leaking series
    // after the underlying list shrinks
    const g = new Gauge({ name: 'test', labels: ['id'] }, NO_LIMITS);
    let ids = ['a', 'b'];
    g.collect(() => ids.map(id => ({ labels: { id }, value: 1 })));
    expect(g.snapshot().samples).toHaveLength(2);
    ids = ['a'];
    expect(g.snapshot().samples).toHaveLength(1);
  });
});

describe('Histogram', () => {
  it('places observations in the first bucket that fits', () => {
    const h = new Histogram({ name: 'test', buckets: [1, 5, 10] }, NO_LIMITS);
    h.observe(0.5); // <= 1
    h.observe(5); // <= 5, boundary is inclusive
    h.observe(7); // <= 10
    h.observe(100); // +Inf
    const family = h.snapshot();
    if (family.type !== 'histogram') throw new Error('wrong type');
    expect(family.samples[0].counts).toEqual([1, 1, 1, 1]);
    expect(family.samples[0].count).toBe(4);
    expect(family.samples[0].sum).toBe(112.5);
  });

  it('sorts buckets and drops +Inf from the declared list', () => {
    const h = new Histogram(
      { name: 'test', buckets: [10, 1, Infinity, 5] },
      NO_LIMITS,
    );
    expect(h.buckets).toEqual([1, 5, 10]);
  });

  it('rejects a histogram with no usable buckets', () => {
    expect(
      () => new Histogram({ name: 'test', buckets: [Infinity] }, NO_LIMITS),
    ).toThrow(/no buckets/);
  });

  it('observes elapsed seconds via startTimer', () => {
    const h = new Histogram({ name: 'test' }, NO_LIMITS);
    const done = h.startTimer();
    const elapsed = done();
    const family = h.snapshot();
    if (family.type !== 'histogram') throw new Error('wrong type');
    expect(family.samples[0].count).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(family.samples[0].sum).toBe(elapsed);
  });
});

describe('Registry', () => {
  it('returns the same instance when a name is registered twice', () => {
    // collectors re-register on reload; previously handed-out handles must
    // keep pointing at live state
    const r = new Registry();
    const a = r.counter({ name: 'test_total' });
    a.inc(3);
    const b = r.counter({ name: 'test_total' });
    expect(b).toBe(a);
    expect(b.get()).toBe(3);
  });

  it('does not fire a collect callback while re-registering', () => {
    // reading the type off a snapshot here would run the collector
    const r = new Registry();
    const collect = vi.fn(() => 1);
    r.gauge({ name: 'test' }).collect(collect);
    r.gauge({ name: 'test' });
    expect(r.seriesCount).toBe(0);
    expect(collect).not.toHaveBeenCalled();
    r.snapshot();
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('refuses to re-register a name as a different type', () => {
    const r = new Registry();
    r.counter({ name: 'test' });
    expect(() => r.gauge({ name: 'test' })).toThrow(/different type/);
  });

  it('sorts families by name for stable scrape output', () => {
    const r = new Registry();
    r.gauge({ name: 'zeta' });
    r.gauge({ name: 'alpha' });
    expect(r.snapshot().map(f => f.name)).toEqual(['alpha', 'zeta']);
  });

  it('drops a removed metric', () => {
    const r = new Registry();
    r.gauge({ name: 'test' });
    r.remove('test');
    expect(r.snapshot()).toHaveLength(0);
  });

  it('counts series across every metric', () => {
    const r = new Registry();
    r.counter({ name: 'a_total', labels: ['x'] }).inc({ x: '1' });
    r.counter({ name: 'a_total', labels: ['x'] }).inc({ x: '2' });
    r.gauge({ name: 'b' }).set(1);
    expect(r.seriesCount).toBe(3);
  });
});

describe('Registry limits', () => {
  it('throws and reports once the metric cap is reached', () => {
    const onDrop = vi.fn();
    const r = new Registry({ ...PLUGIN_LIMITS, maxMetrics: 2 });
    r.onDrop = onDrop;
    r.counter({ name: 'a_total' });
    r.counter({ name: 'b_total' });
    expect(() => r.counter({ name: 'c_total' })).toThrow(/metric limit/);
    expect(onDrop).toHaveBeenCalledWith('c_total', 'metric limit reached');
  });

  it('drops new series past the cap without throwing', () => {
    // a plugin blowing its series budget mid-event must not crash the plugin
    const onDrop = vi.fn();
    const r = new Registry({ ...PLUGIN_LIMITS, maxSeries: 2 });
    r.onDrop = onDrop;
    const c = r.counter({ name: 'a_total', labels: ['id'] });
    c.inc({ id: '1' });
    c.inc({ id: '2' });
    expect(() => c.inc({ id: '3' })).not.toThrow();
    expect(c.snapshot().samples).toHaveLength(2);
    expect(onDrop).toHaveBeenCalledWith('a_total', 'series limit reached');
  });

  it('still updates existing series after the cap is reached', () => {
    const r = new Registry({ ...PLUGIN_LIMITS, maxSeries: 1 });
    const c = r.counter({ name: 'a_total', labels: ['id'] });
    c.inc({ id: '1' });
    c.inc({ id: '2' });
    c.inc({ id: '1' });
    expect(c.get({ id: '1' })).toBe(2);
  });

  it('rejects a metric declaring too many labels', () => {
    const r = new Registry({ ...PLUGIN_LIMITS, maxLabels: 2 });
    expect(() => r.gauge({ name: 'a', labels: ['x', 'y', 'z'] })).toThrow(
      /more than 2 labels/,
    );
  });
});
