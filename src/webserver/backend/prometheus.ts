/*
  A minimal client for the prometheus HTTP API, used to render the web UI's
  metrics dashboards.

  Deliberately small: it speaks only the two query endpoints a dashboard needs,
  and it never takes a query from a client. PromQL is assembled in dashboards.ts
  from a fixed catalog, because the prometheus scraping omegga generally scrapes
  the rest of its operator's infrastructure too, and a pass-through query
  parameter would expose all of it to anyone who can open the web UI.
*/

import { PROMETHEUS_DEFAULTS } from '@/softconfig';

export type PrometheusSample = { time: number; value: number };

export type PrometheusSeries = {
  /** the series' labels, minus `__name__` */
  labels: Record<string, string>;
  samples: PrometheusSample[];
};

export type QueryRangeOptions = {
  /** unix seconds */
  start: number;
  /** unix seconds */
  end: number;
  /** seconds between points */
  step: number;
};

/** a query that prometheus refused, or that never reached it */
export class PrometheusError extends Error {
  readonly kind: 'unreachable' | 'timeout' | 'http' | 'query';

  constructor(kind: PrometheusError['kind'], message: string) {
    super(message);
    this.name = 'PrometheusError';
    this.kind = kind;
  }
}

type ApiResult = {
  status?: string;
  errorType?: string;
  error?: string;
  data?: {
    resultType?: string;
    result?: {
      metric?: Record<string, string>;
      value?: [number, string];
      values?: [number, string][];
    }[];
  };
};

/** prometheus reports values as strings, including `NaN`, `+Inf`, and `-Inf` */
function parseValue(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

/** map prometheus' own errorType onto the distinction the UI cares about */
function errorKind(
  errorType: string | undefined,
  status: number,
): PrometheusError['kind'] {
  switch (errorType) {
    case 'bad_data':
    case 'execution':
    case 'not_found':
      return 'query';
    case 'timeout':
    case 'canceled':
      return 'timeout';
    case 'internal':
    case 'unavailable':
      return 'http';
    default:
      return status >= 400 && status < 500 ? 'query' : 'http';
  }
}

function stripName(metric: Record<string, string> = {}) {
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(metric)) {
    if (key !== '__name__') labels[key] = value;
  }
  return labels;
}

export class PrometheusClient {
  readonly url: string;
  readonly timeoutMs: number;

  constructor(options: { url?: string; timeout?: number } = {}) {
    // a trailing slash would double up against the /api/v1 paths below
    this.url = (options.url ?? PROMETHEUS_DEFAULTS.url).replace(/\/+$/, '');
    this.timeoutMs = (options.timeout ?? PROMETHEUS_DEFAULTS.timeout) * 1000;
  }

  private async request(
    path: string,
    params: Record<string, string>,
  ): Promise<ApiResult> {
    let res: Response;
    try {
      res = await fetch(this.url + path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timedOut =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new PrometheusError(
        timedOut ? 'timeout' : 'unreachable',
        timedOut
          ? `no response within ${this.timeoutMs / 1000}s`
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }

    let body: ApiResult;
    try {
      body = (await res.json()) as ApiResult;
    } catch {
      throw new PrometheusError(
        'http',
        `HTTP ${res.status} with an unreadable body`,
      );
    }

    // A failure carries the same shape as a success, on a 4xx or 5xx. The
    // status code cannot separate "this query is wrong", which is a bug in the
    // panel catalog, from "prometheus is unwell", which is an operator's
    // problem, so classify on errorType and fall back to the status code.
    if (body.status !== 'success') {
      throw new PrometheusError(
        errorKind(body.errorType, res.status),
        body.error ?? `HTTP ${res.status}`,
      );
    }

    return body;
  }

  /** a single value per series, for stat tiles */
  async query(promql: string, time?: number): Promise<PrometheusSeries[]> {
    const params: Record<string, string> = { query: promql };
    if (time != null) params.time = String(time);
    const body = await this.request('/api/v1/query', params);

    return (body.data?.result ?? []).flatMap(entry => {
      if (!entry.value) return [];
      return [
        {
          labels: stripName(entry.metric),
          samples: [
            { time: entry.value[0], value: parseValue(entry.value[1]) },
          ],
        },
      ];
    });
  }

  /** a series over time, for graphs */
  async queryRange(
    promql: string,
    { start, end, step }: QueryRangeOptions,
  ): Promise<PrometheusSeries[]> {
    const body = await this.request('/api/v1/query_range', {
      query: promql,
      start: String(start),
      end: String(end),
      step: String(step),
    });

    return (body.data?.result ?? []).map(entry => ({
      labels: stripName(entry.metric),
      samples: (entry.values ?? []).map(([time, value]) => ({
        time,
        value: parseValue(value),
      })),
    }));
  }

  /** whether prometheus answers at all, for the dashboard's error banner */
  async ping(): Promise<void> {
    await this.query('1');
  }
}

/**
 * Points to ask prometheus for over a range, at roughly one per few pixels of
 * chart width. Too fine a step over a long range makes prometheus work hard to
 * return more points than a chart can draw.
 */
export function pickStep(start: number, end: number): number {
  const span = Math.max(0, end - start);
  return Math.max(
    PROMETHEUS_DEFAULTS.minStep,
    Math.ceil(span / PROMETHEUS_DEFAULTS.maxPoints),
  );
}
