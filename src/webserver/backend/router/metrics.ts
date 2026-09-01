import Logger from '@/logger';
import { PROMETHEUS_DEFAULTS } from '@/softconfig';
import { z } from 'zod/v4';
import {
  DASHBOARDS,
  getDashboard,
  queryContext,
  rateWindow,
  type Dashboard,
  type Panel,
} from '../dashboards';
import {
  PrometheusClient,
  PrometheusError,
  pickStep,
  type PrometheusSeries,
} from '../prometheus';
import { ScopeName, type Scope } from '../scopes';
import {
  anyScopeProcedure,
  filterScopes,
  getContextDeps,
  router,
} from '../trpc';

const METRICS_SCOPES: Scope[] = [
  ScopeName.MetricsPlayers,
  ScopeName.MetricsServer,
  ScopeName.MetricsPlugins,
  ScopeName.MetricsHost,
];

type PrometheusSettings = {
  enabled: boolean;
  url: string;
  instance?: string;
  timeout: number;
  cacheSeconds: number;
  retentionDays: number;
};

function settings(): PrometheusSettings {
  const { omegga } = getContextDeps();
  const conf = omegga.config.metrics?.prometheus ?? {};
  return {
    enabled: Boolean(conf.enabled),
    url: conf.url ?? PROMETHEUS_DEFAULTS.url,
    instance: conf.instance,
    timeout: conf.timeout ?? PROMETHEUS_DEFAULTS.timeout,
    cacheSeconds: conf.cacheSeconds ?? PROMETHEUS_DEFAULTS.cacheSeconds,
    retentionDays: conf.retentionDays ?? PROMETHEUS_DEFAULTS.retentionDays,
  };
}

let _client: PrometheusClient | null = null;
let _clientKey = '';

function client(conf: PrometheusSettings): PrometheusClient {
  const key = `${conf.url}|${conf.timeout}`;
  if (!_client || _clientKey !== key) {
    _client = new PrometheusClient({ url: conf.url, timeout: conf.timeout });
    _clientKey = key;
  }
  return _client;
}

// Dashboard results are cached because the scrape interval is the real
// resolution limit: asking more often than prometheus is filled returns the
// same points, and several people with the UI open should not multiply load.
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlSeconds * 1000) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function describeError(err: unknown): string {
  if (err instanceof PrometheusError) {
    switch (err.kind) {
      case 'unreachable':
        return `could not reach prometheus: ${err.message}`;
      case 'timeout':
        return `prometheus did not answer: ${err.message}`;
      case 'query':
        return `prometheus rejected the query: ${err.message}`;
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

/** labels that say which target was scraped rather than what was measured */
const SCRAPE_LABELS = new Set(['instance', 'job', 'server', 'env']);

/**
 * Name the series a query returned.
 *
 * A query that returns one series is named after the query, whatever labels
 * came back with it. Only when a query fans out into several does a label have
 * to tell them apart, and then only labels that actually differ: relabelled
 * scrape targets attach the same `env` or `job` to every series, so naming from
 * those gives several series the same name.
 */
export function nameSeries(
  series: PrometheusSeries[],
  fallback: string,
  legend?: string,
): string[] {
  if (series.length <= 1) return series.map(() => fallback);

  return series.map(s => {
    if (legend) return s.labels[legend] || fallback;
    const distinguishing = Object.entries(s.labels).filter(
      ([key, value]) =>
        !SCRAPE_LABELS.has(key) &&
        series.some(other => other.labels[key] !== value),
    );
    if (distinguishing.length === 0) return fallback;
    return distinguishing.map(([, value]) => value).join(' ');
  });
}

export type PanelSeries = {
  name: string;
  points: [time: number, value: number][];
  /** labels of the underlying series, for info and table panels */
  labels?: Record<string, string>;
};

export type PanelResult = {
  id: string;
  series: PanelSeries[];
  error?: string;
};

// a table row shows a trend alongside its current value, so it needs the whole
// range rather than one instant
const INSTANT_KINDS = new Set(['stat', 'histogram']);

async function runPanel(
  panel: Panel,
  conf: PrometheusSettings,
  range: { start: number; end: number; step: number },
): Promise<PanelResult> {
  const prom = client(conf);
  const ctx = queryContext({
    instance: conf.instance,
    rate: rateWindow(range.step),
    range: `${range.end - range.start}s`,
  });
  const instant = INSTANT_KINDS.has(panel.kind);

  // one failing query should cost its own panel and nothing else, so results
  // are settled per query rather than awaited together
  const results = await Promise.allSettled(
    panel.queries.map(async q => {
      const promql = q.build(ctx);
      const series = instant
        ? await prom.query(promql, range.end)
        : await prom.queryRange(promql, range);
      return { q, series };
    }),
  );

  const out: PanelSeries[] = [];
  let error: string | undefined;

  for (const result of results) {
    if (result.status === 'rejected') {
      error ??= describeError(result.reason);
      continue;
    }
    const { q, series } = result.value;
    const names = nameSeries(series, q.name, q.legend);
    series.forEach((s, index) => {
      out.push({
        name: names[index],
        points: s.samples.map(p => [p.time, p.value]),
        labels: s.labels,
      });
    });
  }

  // a panel that produced nothing and failed is an error; one that produced
  // nothing without failing genuinely has no data in this range
  return out.length === 0 && error
    ? { id: panel.id, series: [], error }
    : { id: panel.id, series: out };
}

function panelSummary(panel: Panel) {
  return {
    id: panel.id,
    title: panel.title,
    label: panel.label,
    description: panel.description,
    kind: panel.kind,
    unit: panel.unit,
  };
}

function dashboardSummary(dashboard: Dashboard) {
  return {
    id: dashboard.id,
    title: dashboard.title,
    panels: dashboard.panels.map(panelSummary),
  };
}

/**
 * One shape for every outcome, rather than a union: the client renders the
 * banner from `error` and cannot narrow a union across the wire.
 */
export type Health = {
  ok: boolean;
  /** whether a prometheus is configured at all */
  configured: boolean;
  /** whether prometheus holds any series for this omegga */
  hasSeries: boolean;
  error?: string;
};

const rangeInput = z.object({
  /** how far back to look, in seconds */
  range: z.number().int().positive(),
});

export const metricsRouter = router({
  metrics: router({
    /**
     * What the caller may see. Safe for any metrics-scoped user: it carries no
     * infrastructure detail beyond whether the feature is on.
     */
    info: anyScopeProcedure(...METRICS_SCOPES).query(async ({ ctx }) => {
      const conf = settings();
      const allowed = await filterScopes(ctx.user, METRICS_SCOPES);
      return {
        enabled: conf.enabled,
        instance: conf.instance ?? null,
        retentionDays: conf.retentionDays,
        dashboards: DASHBOARDS.filter(d => allowed.has(d.scope)).map(
          dashboardSummary,
        ),
      };
    }),

    /** whether prometheus is answering, and whether it knows about this omegga */
    health: anyScopeProcedure(...METRICS_SCOPES).query(
      async (): Promise<Health> => {
        const conf = settings();
        if (!conf.enabled)
          return { ok: false, configured: false, hasSeries: false };

        return cached(`health:${conf.url}:${conf.instance}`, 10, async () => {
          const prom = client(conf);
          const ctx = queryContext({
            instance: conf.instance,
            rate: '1m',
            range: '1m',
          });
          try {
            // omegga_up exists whenever this omegga is being scraped, so an
            // empty result separates "prometheus is fine but isn't scraping
            // us" from "prometheus is down", which have different fixes
            const series = await prom.query(`count(${ctx.sel('omegga_up')})`);
            const count = series[0]?.samples[0]?.value ?? 0;
            return { ok: true, configured: true, hasSeries: count > 0 };
          } catch (err) {
            Logger.verbose('Prometheus health check failed', err);
            return {
              ok: false,
              configured: true,
              hasSeries: false,
              error: describeError(err),
            };
          }
        });
      },
    ),

    /** run every panel on one dashboard */
    dashboard: anyScopeProcedure(...METRICS_SCOPES)
      .input(rangeInput.extend({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const conf = settings();
        if (!conf.enabled) return { panels: [], step: 0 };

        const dashboard = getDashboard(input.id);
        if (!dashboard) return { panels: [], step: 0 };

        const allowed = await filterScopes(ctx.user, METRICS_SCOPES);
        if (!allowed.has(dashboard.scope)) return { panels: [], step: 0 };

        // clamp to retention: prometheus answers a longer range with partial
        // data and no error, which reads as a gap rather than a limit
        const maxRange = conf.retentionDays * 86400;
        const seconds = Math.min(input.range, maxRange);
        const end = Math.floor(Date.now() / 1000);
        const start = end - seconds;
        const step = pickStep(start, end);

        return cached(
          `dashboard:${dashboard.id}:${seconds}`,
          conf.cacheSeconds,
          async () => {
            const panels = await Promise.all(
              dashboard.panels.map(p =>
                runPanel(p, conf, { start, end, step }),
              ),
            );
            return { panels, step };
          },
        );
      }),
  }),
});
