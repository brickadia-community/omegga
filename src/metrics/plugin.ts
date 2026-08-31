/*
  Plugin-facing metrics.

  Every plugin gets its own `Registry` under a `omegga_plugin_<slug>_` prefix,
  capped so a misbehaving plugin can't blow up the scrape. In-process (unsafe)
  plugins write to a registry the host holds directly; worker and RPC plugins
  keep a registry in their own process and periodically ship a serialized
  snapshot, which the host stores as an opaque blob and renders at scrape time.

  Snapshots are replaced wholesale rather than applied as deltas: idempotent, no
  ordering requirements, and the scrape path never waits on a plugin - a hung
  plugin's metrics go stale instead of stalling prometheus.
*/

import {
  type MetricFamily,
  type MetricOptions,
  type HistogramOptions,
  PLUGIN_LIMITS,
  Registry,
} from './registry';
import type {
  MetricCounter,
  MetricGauge,
  MetricHistogram,
  PluginMetricLabels,
  PluginMetrics,
} from '@/plugin';

export const PLUGIN_PREFIX = 'omegga_plugin_';

/**
 * Turn a plugin name into a metric name fragment. Two plugins can slug to the
 * same string, which is why the raw name is also attached as a `plugin` label.
 */
export function pluginSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'unnamed';
}

/** metrics handles that accept every call and record nothing */
const NOOP_COUNTER: MetricCounter = { inc: () => {}, reset: () => {} };
const NOOP_GAUGE: MetricGauge = {
  set: () => {},
  inc: () => {},
  dec: () => {},
  remove: () => {},
  collect: () => {},
  reset: () => {},
};
const NOOP_HISTOGRAM: MetricHistogram = {
  observe: () => {},
  startTimer: () => () => 0,
  reset: () => {},
};

/** used when the metrics endpoint is disabled */
export const NOOP_PLUGIN_METRICS: PluginMetrics = {
  enabled: false,
  counter: () => NOOP_COUNTER,
  gauge: () => NOOP_GAUGE,
  histogram: () => NOOP_HISTOGRAM,
};

/**
 * The plugin-facing API over a `Registry`. Names are prefixed and the `plugin`
 * label is stamped on automatically. Registration never throws: a name the
 * caps reject yields a no-op handle, so a plugin can't die in `init()` because
 * of a metric.
 */
export class PluginMetricsFacade implements PluginMetrics {
  readonly enabled = true;
  private registry: Registry;
  private pluginName: string;
  private prefix: string;
  private onError: (message: string) => void;

  constructor(
    registry: Registry,
    pluginName: string,
    onError: (message: string) => void = () => {},
  ) {
    this.registry = registry;
    this.pluginName = pluginName;
    this.prefix = PLUGIN_PREFIX + pluginSlug(pluginName) + '_';
    this.onError = onError;
  }

  /** prefix the name and reserve `plugin` as an automatic label */
  private options<T extends MetricOptions>(opts: T): T {
    return {
      ...opts,
      name: this.prefix + opts.name,
      labels: ['plugin', ...(opts.labels ?? [])],
    };
  }

  /** stamp the plugin label onto whatever labels the caller passed */
  private labels(labels?: PluginMetricLabels): PluginMetricLabels {
    return { ...labels, plugin: this.pluginName };
  }

  private guard<T>(name: string, create: () => T, fallback: T): T {
    try {
      return create();
    } catch (err) {
      this.onError(
        `could not register metric "${name}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return fallback;
    }
  }

  counter(opts: MetricOptions): MetricCounter {
    return this.guard(
      opts.name,
      () => {
        const metric = this.registry.counter(this.options(opts));
        return {
          inc: (
            labelsOrValue?: PluginMetricLabels | number,
            value?: number,
          ) => {
            if (typeof labelsOrValue === 'object') {
              metric.inc(this.labels(labelsOrValue), value);
            } else {
              metric.inc(this.labels(), labelsOrValue ?? 1);
            }
          },
          reset: () => metric.reset(),
        };
      },
      NOOP_COUNTER,
    );
  }

  gauge(opts: MetricOptions): MetricGauge {
    return this.guard(
      opts.name,
      () => {
        const metric = this.registry.gauge(this.options(opts));
        return {
          set: (labelsOrValue: PluginMetricLabels | number, value?: number) => {
            if (typeof labelsOrValue === 'object') {
              metric.set(this.labels(labelsOrValue), value as number);
            } else {
              metric.set(this.labels(), labelsOrValue);
            }
          },
          inc: (
            labelsOrValue?: PluginMetricLabels | number,
            value?: number,
          ) => {
            if (typeof labelsOrValue === 'object') {
              metric.inc(this.labels(labelsOrValue), value);
            } else {
              metric.inc(this.labels(), labelsOrValue ?? 1);
            }
          },
          dec: (
            labelsOrValue?: PluginMetricLabels | number,
            value?: number,
          ) => {
            if (typeof labelsOrValue === 'object') {
              metric.dec(this.labels(labelsOrValue), value);
            } else {
              metric.dec(this.labels(), labelsOrValue ?? 1);
            }
          },
          remove: (labels?: PluginMetricLabels) =>
            metric.remove(this.labels(labels)),
          collect: (fn: () => number | void) =>
            metric.collect(() => {
              const value = fn();
              if (typeof value !== 'number') return;
              return [{ labels: this.labels(), value }];
            }),
          reset: () => metric.reset(),
        };
      },
      NOOP_GAUGE,
    );
  }

  histogram(opts: HistogramOptions): MetricHistogram {
    return this.guard(
      opts.name,
      () => {
        const metric = this.registry.histogram(this.options(opts));
        const observe = (
          labelsOrValue: PluginMetricLabels | number,
          value?: number,
        ) => {
          if (typeof labelsOrValue === 'object') {
            metric.observe(this.labels(labelsOrValue), value as number);
          } else {
            metric.observe(this.labels(), labelsOrValue);
          }
        };
        return {
          observe,
          startTimer: (labels?: PluginMetricLabels) =>
            metric.startTimer(this.labels(labels)),
          reset: () => metric.reset(),
        };
      },
      NOOP_HISTOGRAM,
    );
  }
}

/**
 * Host-side store of every plugin's metrics: a live registry for in-process
 * plugins, and the most recent snapshot for out-of-process ones.
 */
export class PluginMetricsHost {
  /** live registries, for plugins that run in omegga's own process */
  private local = new Map<string, Registry>();
  /** last snapshot received, for worker and rpc plugins */
  private remote = new Map<string, MetricFamily[]>();
  /** metrics rejected by the caps, per plugin */
  private dropped = new Map<string, number>();
  /** collect callbacks that threw, per plugin */
  private errors = new Map<string, number>();

  private log: (plugin: string, message: string) => void;

  constructor(log: (plugin: string, message: string) => void = () => {}) {
    this.log = log;
  }

  /** a facade writing into a registry the host owns (unsafe node plugins) */
  facade(plugin: string): PluginMetrics {
    let registry = this.local.get(plugin);
    if (!registry) {
      registry = new Registry(PLUGIN_LIMITS);
      registry.onDrop = (metric, reason) => {
        this.dropped.set(plugin, (this.dropped.get(plugin) ?? 0) + 1);
        this.log(plugin, `metric "${metric}" dropped: ${reason}`);
      };
      registry.onError = (metric, err) => {
        this.errors.set(plugin, (this.errors.get(plugin) ?? 0) + 1);
        this.log(
          plugin,
          `metric "${metric}" failed to collect: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      };
      this.local.set(plugin, registry);
    }
    return new PluginMetricsFacade(registry, plugin, message =>
      this.log(plugin, message),
    );
  }

  /**
   * Store a snapshot shipped by a plugin in another process. The payload is
   * untrusted: it is re-validated and re-capped here rather than trusting the
   * sender to have applied the limits.
   */
  setSnapshot(plugin: string, families: unknown): void {
    const sanitized = sanitizeSnapshot(plugin, families, (metric, reason) => {
      this.dropped.set(plugin, (this.dropped.get(plugin) ?? 0) + 1);
      this.log(plugin, `metric "${metric}" dropped: ${reason}`);
    });
    this.remote.set(plugin, sanitized);
  }

  /** forget a plugin's metrics, so an unloaded plugin's series disappear */
  drop(plugin: string): void {
    this.local.delete(plugin);
    this.remote.delete(plugin);
    this.errors.delete(plugin);
    this.dropped.delete(plugin);
  }

  seriesCount(plugin: string): number {
    const local = this.local.get(plugin)?.seriesCount ?? 0;
    const remote = (this.remote.get(plugin) ?? []).reduce(
      (total, family) => total + family.samples.length,
      0,
    );
    return local + remote;
  }

  droppedCount(plugin: string): number {
    return this.dropped.get(plugin) ?? 0;
  }

  /** number of times a plugin's collect callbacks have thrown */
  errorCount(plugin: string): number {
    return this.errors.get(plugin) ?? 0;
  }

  snapshot(): MetricFamily[] {
    const families: MetricFamily[] = [];
    for (const [plugin, registry] of this.local) {
      // in-process plugins run their collect callbacks here, so a plugin that
      // fails is skipped rather than allowed to take out the whole scrape
      try {
        families.push(...registry.snapshot());
      } catch (err) {
        this.errors.set(plugin, (this.errors.get(plugin) ?? 0) + 1);
        this.log(
          plugin,
          `snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // remote snapshots are stored data; rendering them runs no plugin code
    for (const stored of this.remote.values()) families.push(...stored);
    return families.sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }
}

const NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

/**
 * Validate a snapshot that arrived from another process, re-applying the caps.
 * Anything malformed is dropped rather than rejected wholesale, so one bad
 * metric doesn't take out a plugin's good ones.
 */
export function sanitizeSnapshot(
  plugin: string,
  input: unknown,
  onDrop: (metric: string, reason: string) => void,
): MetricFamily[] {
  if (!Array.isArray(input)) return [];
  const prefix = PLUGIN_PREFIX + pluginSlug(plugin) + '_';
  const out: MetricFamily[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (out.length >= PLUGIN_LIMITS.maxMetrics) {
      onDrop(String((raw as MetricFamily)?.name), 'metric limit reached');
      break;
    }
    const family = raw as MetricFamily;
    if (!family || typeof family.name !== 'string') continue;

    // a plugin may only publish under its own prefix, so it can't overwrite
    // omegga's metrics or another plugin's
    if (!family.name.startsWith(prefix) || !NAME_RE.test(family.name)) {
      onDrop(family.name, 'name outside the plugin prefix');
      continue;
    }
    if (seen.has(family.name)) {
      onDrop(family.name, 'duplicate metric name');
      continue;
    }
    if (!['counter', 'gauge', 'histogram'].includes(family.type)) continue;
    if (!Array.isArray(family.samples)) continue;

    seen.add(family.name);
    const help = typeof family.help === 'string' ? family.help : family.name;

    if (family.type === 'histogram') {
      if (!Array.isArray(family.buckets) || family.buckets.length === 0) {
        onDrop(family.name, 'histogram has no buckets');
        continue;
      }
      const buckets = family.buckets.filter(isFiniteNumber);
      const samples = family.samples
        .filter(
          s =>
            isLabels(s?.labels) &&
            Array.isArray(s?.counts) &&
            s.counts.length === buckets.length + 1 &&
            s.counts.every(isFiniteNumber) &&
            isFiniteNumber(s.sum) &&
            isFiniteNumber(s.count),
        )
        .slice(0, PLUGIN_LIMITS.maxSeries)
        .map(s => ({
          labels: { ...s.labels, plugin },
          counts: [...s.counts],
          sum: s.sum,
          count: s.count,
        }));
      out.push({
        type: 'histogram',
        name: family.name,
        help,
        buckets,
        samples,
      });
      continue;
    }

    const samples = family.samples
      .filter(s => isLabels(s?.labels) && typeof s?.value === 'number')
      .slice(0, PLUGIN_LIMITS.maxSeries)
      // re-stamp the plugin label so a snapshot can't claim to be another
      // plugin's metrics
      .map(s => ({ labels: { ...s.labels, plugin }, value: s.value }));
    out.push({ type: family.type, name: family.name, help, samples });
  }

  return out;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLabels(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, v]) =>
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) &&
      !key.startsWith('__') &&
      ['string', 'number', 'boolean'].includes(typeof v),
  );
}
