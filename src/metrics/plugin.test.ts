import { describe, expect, it, vi } from 'vitest';
import {
  NOOP_PLUGIN_METRICS,
  PluginMetricsFacade,
  PluginMetricsHost,
  pluginSlug,
  sanitizeSnapshot,
} from './plugin';
import { PLUGIN_LIMITS, Registry, type MetricFamily } from './registry';
import { render } from './render';

describe('pluginSlug', () => {
  it('lowercases and collapses non-alphanumerics', () => {
    expect(pluginSlug('Cool Plugin!')).toBe('cool_plugin');
    expect(pluginSlug('my-plugin.v2')).toBe('my_plugin_v2');
    expect(pluginSlug('Already_Fine')).toBe('already_fine');
  });

  it('falls back to a usable name for a slug that would be empty', () => {
    // a metric name cannot be empty or start with a digit-only fragment
    expect(pluginSlug('!!!')).toBe('unnamed');
    expect(pluginSlug('')).toBe('unnamed');
  });
});

describe('PluginMetricsFacade', () => {
  const facade = (registry: Registry, name = 'Cool Plugin') =>
    new PluginMetricsFacade(registry, name);

  it('prefixes names and stamps the plugin label', () => {
    const registry = new Registry(PLUGIN_LIMITS);
    facade(registry).counter({ name: 'kills_total', help: 'kills' }).inc(2);
    expect(render(registry.snapshot())).toContain(
      'omegga_plugin_cool_plugin_kills_total{plugin="Cool Plugin"} 2',
    );
  });

  it('keeps user labels alongside the plugin label', () => {
    const registry = new Registry(PLUGIN_LIMITS);
    facade(registry)
      .counter({ name: 'kills_total', labels: ['weapon'] })
      .inc({ weapon: 'pistol' }, 3);
    expect(render(registry.snapshot())).toContain(
      'omegga_plugin_cool_plugin_kills_total{plugin="Cool Plugin",weapon="pistol"} 3',
    );
  });

  it('distinguishes two plugins that slug identically', () => {
    // the raw name is what tells "my plugin" and "my-plugin" apart
    const registry = new Registry();
    facade(registry, 'my plugin').counter({ name: 'a_total' }).inc();
    facade(registry, 'my-plugin').counter({ name: 'a_total' }).inc(5);
    const out = render(registry.snapshot());
    expect(out).toContain('a_total{plugin="my plugin"} 1');
    expect(out).toContain('a_total{plugin="my-plugin"} 5');
  });

  it('supports gauges and their collect callbacks', () => {
    const registry = new Registry(PLUGIN_LIMITS);
    let size = 3;
    facade(registry)
      .gauge({ name: 'queue_size' })
      .collect(() => size);
    expect(render(registry.snapshot())).toContain(
      'queue_size{plugin="Cool Plugin"} 3',
    );
    size = 9;
    expect(render(registry.snapshot())).toContain(
      'queue_size{plugin="Cool Plugin"} 9',
    );
  });

  it('supports histograms and startTimer', () => {
    const registry = new Registry(PLUGIN_LIMITS);
    const h = facade(registry).histogram({
      name: 'request_seconds',
      buckets: [1, 5],
    });
    h.observe(0.5);
    h.startTimer()();
    const out = render(registry.snapshot());
    expect(out).toContain('request_seconds_count{plugin="Cool Plugin"} 2');
  });

  it('returns a working no-op handle when registration is rejected', () => {
    // a plugin must not die in init() because it asked for a bad metric name
    const onError = vi.fn();
    const metrics = new PluginMetricsFacade(
      new Registry(PLUGIN_LIMITS),
      'p',
      onError,
    );
    const counter = metrics.counter({ name: 'has-a-dash' });
    expect(() => counter.inc()).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });

  it('no-ops rather than throwing once the metric cap is hit', () => {
    const registry = new Registry({ ...PLUGIN_LIMITS, maxMetrics: 1 });
    const metrics = facade(registry);
    metrics.counter({ name: 'a_total' }).inc();
    expect(() => metrics.counter({ name: 'b_total' }).inc()).not.toThrow();
    expect(registry.size).toBe(1);
  });
});

describe('NOOP_PLUGIN_METRICS', () => {
  it('accepts every call and reports itself disabled', () => {
    expect(NOOP_PLUGIN_METRICS.enabled).toBe(false);
    expect(() => {
      NOOP_PLUGIN_METRICS.counter({ name: 'a' }).inc({ x: '1' }, 2);
      NOOP_PLUGIN_METRICS.gauge({ name: 'b' }).collect(() => 1);
      NOOP_PLUGIN_METRICS.histogram({ name: 'c' }).startTimer()();
    }).not.toThrow();
  });
});

describe('sanitizeSnapshot', () => {
  const good: MetricFamily[] = [
    {
      type: 'counter',
      name: 'omegga_plugin_p_kills_total',
      help: 'kills',
      samples: [{ labels: { plugin: 'p', weapon: 'axe' }, value: 4 }],
    },
  ];

  it('accepts a well-formed snapshot', () => {
    expect(sanitizeSnapshot('p', good, () => {})).toEqual(good);
  });

  it('rejects a metric outside the plugin prefix', () => {
    // otherwise a plugin could overwrite brickadia_up or another plugin
    const onDrop = vi.fn();
    const out = sanitizeSnapshot(
      'p',
      [{ ...good[0], name: 'brickadia_up' }],
      onDrop,
    );
    expect(out).toHaveLength(0);
    expect(onDrop).toHaveBeenCalledWith('brickadia_up', expect.any(String));
  });

  it('re-stamps the plugin label so a snapshot cannot impersonate another', () => {
    const out = sanitizeSnapshot(
      'p',
      [
        {
          ...good[0],
          samples: [{ labels: { plugin: 'someone-else' }, value: 1 }],
        },
      ],
      () => {},
    );
    expect(out[0].samples[0].labels).toEqual({ plugin: 'p' });
  });

  it('drops malformed samples but keeps the good ones', () => {
    const out = sanitizeSnapshot(
      'p',
      [
        {
          ...good[0],
          samples: [
            { labels: { plugin: 'p' }, value: 1 },
            { labels: { plugin: 'p' }, value: 'nope' },
            { labels: 'not-an-object', value: 2 },
          ],
        },
      ],
      () => {},
    );
    expect(out[0].samples).toHaveLength(1);
  });

  it('rejects reserved label names', () => {
    const out = sanitizeSnapshot(
      'p',
      [{ ...good[0], samples: [{ labels: { __proto: 'x' }, value: 1 }] }],
      () => {},
    );
    expect(out[0].samples).toHaveLength(0);
  });

  it('re-applies the series cap to an oversized snapshot', () => {
    const samples = Array.from(
      { length: PLUGIN_LIMITS.maxSeries + 50 },
      (_, i) => ({
        labels: { plugin: 'p', id: String(i) },
        value: 1,
      }),
    );
    const out = sanitizeSnapshot('p', [{ ...good[0], samples }], () => {});
    expect(out[0].samples).toHaveLength(PLUGIN_LIMITS.maxSeries);
  });

  it('re-applies the metric cap to an oversized snapshot', () => {
    const families = Array.from(
      { length: PLUGIN_LIMITS.maxMetrics + 10 },
      (_, i) => ({ ...good[0], name: `omegga_plugin_p_m${i}_total` }),
    );
    const out = sanitizeSnapshot('p', families, () => {});
    expect(out).toHaveLength(PLUGIN_LIMITS.maxMetrics);
  });

  it('drops a histogram whose counts do not match its buckets', () => {
    const out = sanitizeSnapshot(
      'p',
      [
        {
          type: 'histogram',
          name: 'omegga_plugin_p_t',
          help: 'h',
          buckets: [1, 2],
          samples: [
            { labels: {}, counts: [1, 2, 3], sum: 1, count: 6 },
            { labels: {}, counts: [1], sum: 1, count: 1 },
          ],
        },
      ],
      () => {},
    );
    expect(out[0].samples).toHaveLength(1);
  });

  it('ignores anything that is not an array', () => {
    expect(sanitizeSnapshot('p', null, () => {})).toEqual([]);
    expect(sanitizeSnapshot('p', { name: 'x' }, () => {})).toEqual([]);
    expect(sanitizeSnapshot('p', 'nope', () => {})).toEqual([]);
  });
});

describe('PluginMetricsHost', () => {
  it('merges local registries and remote snapshots', () => {
    const host = new PluginMetricsHost();
    host.facade('local').counter({ name: 'a_total' }).inc();
    host.setSnapshot('remote', [
      {
        type: 'gauge',
        name: 'omegga_plugin_remote_b',
        help: 'b',
        samples: [{ labels: { plugin: 'remote' }, value: 7 }],
      },
    ]);
    const out = render(host.snapshot());
    expect(out).toContain('omegga_plugin_local_a_total{plugin="local"} 1');
    expect(out).toContain('omegga_plugin_remote_b{plugin="remote"} 7');
  });

  it('reuses one registry per plugin across facade calls', () => {
    // load/reload hands out a fresh facade; the counts must survive
    const host = new PluginMetricsHost();
    host.facade('p').counter({ name: 'a_total' }).inc(2);
    host.facade('p').counter({ name: 'a_total' }).inc(3);
    expect(render(host.snapshot())).toContain('a_total{plugin="p"} 5');
  });

  it('forgets a plugin when it unloads', () => {
    const host = new PluginMetricsHost();
    host.facade('p').counter({ name: 'a_total' }).inc();
    host.setSnapshot('p', []);
    host.drop('p');
    expect(host.snapshot()).toHaveLength(0);
    expect(host.seriesCount('p')).toBe(0);
  });

  it('counts series and drops per plugin', () => {
    const host = new PluginMetricsHost();
    const metrics = host.facade('p');
    metrics.counter({ name: 'a_total', labels: ['id'] }).inc({ id: '1' });
    metrics.counter({ name: 'a_total', labels: ['id'] }).inc({ id: '2' });
    expect(host.seriesCount('p')).toBe(2);
    expect(host.droppedCount('p')).toBe(0);
  });

  it('records a drop when a plugin exceeds the series cap', () => {
    const host = new PluginMetricsHost();
    const counter = host
      .facade('p')
      .counter({ name: 'a_total', labels: ['id'] });
    for (let i = 0; i < PLUGIN_LIMITS.maxSeries + 5; i++) {
      counter.inc({ id: String(i) });
    }
    expect(host.seriesCount('p')).toBe(PLUGIN_LIMITS.maxSeries);
    expect(host.droppedCount('p')).toBeGreaterThan(0);
  });

  it('renders plugin metrics sorted by name', () => {
    const host = new PluginMetricsHost();
    host.facade('b').gauge({ name: 'x' }).set(1);
    host.facade('a').gauge({ name: 'x' }).set(1);
    expect(host.snapshot().map(f => f.name)).toEqual([
      'omegga_plugin_a_x',
      'omegga_plugin_b_x',
    ]);
  });
});

describe('worker snapshot round trip', () => {
  /** exactly what a worker ships: its own registry, serialized over postMessage */
  function workerSnapshot(
    plugin: string,
    build: (m: PluginMetricsFacade) => void,
  ) {
    const registry = new Registry(PLUGIN_LIMITS);
    build(new PluginMetricsFacade(registry, plugin));
    // structured clone / JSON is what actually crosses the process boundary
    return JSON.parse(JSON.stringify(registry.snapshot()));
  }

  it('survives the trip from a worker registry to the host renderer', () => {
    const snapshot = workerSnapshot('Cool Plugin', m => {
      m.counter({ name: 'kills_total', help: 'kills', labels: ['weapon'] }).inc(
        { weapon: 'axe' },
        3,
      );
      m.gauge({ name: 'queue_size', help: 'queued' }).set(7);
      const h = m.histogram({
        name: 'lookup_seconds',
        help: 'lookups',
        buckets: [0.1, 1],
      });
      h.observe(0.05);
      h.observe(5);
    });

    const host = new PluginMetricsHost();
    host.setSnapshot('Cool Plugin', snapshot);
    const out = render(host.snapshot());

    expect(out).toContain(
      'omegga_plugin_cool_plugin_kills_total{plugin="Cool Plugin",weapon="axe"} 3',
    );
    expect(out).toContain(
      'omegga_plugin_cool_plugin_queue_size{plugin="Cool Plugin"} 7',
    );
    // one observation under 0.1, one over the top bucket
    expect(out).toContain(
      'omegga_plugin_cool_plugin_lookup_seconds_bucket{plugin="Cool Plugin",le="0.1"} 1',
    );
    expect(out).toContain(
      'omegga_plugin_cool_plugin_lookup_seconds_bucket{plugin="Cool Plugin",le="+Inf"} 2',
    );
    expect(out).toContain(
      'omegga_plugin_cool_plugin_lookup_seconds_count{plugin="Cool Plugin"} 2',
    );
  });

  it('keeps histogram bucket counts intact across the boundary', () => {
    // the +Inf slot is implicit in counts[], so a mismatch here would be
    // silently dropped by the host validator
    const snapshot = workerSnapshot('p', m => {
      m.histogram({ name: 't', help: 'h', buckets: [1, 2, 3] }).observe(2.5);
    });
    const host = new PluginMetricsHost();
    host.setSnapshot('p', snapshot);
    expect(host.snapshot()).toHaveLength(1);
    expect(host.seriesCount('p')).toBe(1);
  });

  it('replaces the previous snapshot rather than accumulating', () => {
    const host = new PluginMetricsHost();
    host.setSnapshot(
      'p',
      workerSnapshot('p', m => m.counter({ name: 'a_total' }).inc(1)),
    );
    host.setSnapshot(
      'p',
      workerSnapshot('p', m => m.counter({ name: 'a_total' }).inc(9)),
    );
    expect(render(host.snapshot())).toContain(
      'omegga_plugin_p_a_total{plugin="p"} 9',
    );
  });
});
