import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrometheusClient, PrometheusError, pickStep } from './prometheus';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function mockFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PrometheusClient.query', () => {
  it('parses the string values prometheus returns', async () => {
    mockFetch(async () =>
      json({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            {
              metric: { __name__: 'brickadia_up', instance: 'server-1' },
              value: [1700000000, '1'],
            },
          ],
        },
      }),
    );

    const series = await new PrometheusClient().query('brickadia_up');
    expect(series).toEqual([
      {
        labels: { instance: 'server-1' },
        samples: [{ time: 1700000000, value: 1 }],
      },
    ]);
  });

  it('turns NaN and infinities into NaN rather than a bogus number', async () => {
    mockFetch(async () =>
      json({
        status: 'success',
        data: {
          result: [
            { metric: {}, value: [1, 'NaN'] },
            { metric: {}, value: [2, '+Inf'] },
          ],
        },
      }),
    );

    const series = await new PrometheusClient().query('x');
    expect(series[0].samples[0].value).toBeNaN();
    expect(series[1].samples[0].value).toBeNaN();
  });

  it('reports a rejected query with prometheus own message', async () => {
    mockFetch(async () =>
      json(
        {
          status: 'error',
          errorType: 'bad_data',
          error: 'parse error: unexpected }',
        },
        400,
      ),
    );

    const err = await new PrometheusClient()
      .query('}')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrometheusError);
    expect((err as PrometheusError).kind).toBe('query');
    expect((err as PrometheusError).message).toContain('parse error');
  });

  it('reports an unreachable prometheus rather than hanging', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed');
    });

    const err = await new PrometheusClient()
      .query('x')
      .catch((e: unknown) => e);
    expect((err as PrometheusError).kind).toBe('unreachable');
  });

  it('reports a timeout distinctly, since the fix is different', async () => {
    mockFetch(async () => {
      const abort = new Error('signal timed out');
      abort.name = 'TimeoutError';
      throw abort;
    });

    const err = await new PrometheusClient({ timeout: 2 })
      .query('x')
      .catch((e: unknown) => e);
    expect((err as PrometheusError).kind).toBe('timeout');
    expect((err as PrometheusError).message).toContain('2s');
  });

  it('does not put the query in the URL, so a long one still fits', async () => {
    const spy = mockFetch(async () =>
      json({ status: 'success', data: { result: [] } }),
    );

    await new PrometheusClient({ url: 'http://prometheus:9090/' }).query('up');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://prometheus:9090/api/v1/query');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('query=up');
  });
});

describe('PrometheusClient.queryRange', () => {
  it('returns a point list per series', async () => {
    mockFetch(async () =>
      json({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { plugin: 'example' },
              values: [
                [1, '0'],
                [2, '1.5'],
              ],
            },
          ],
        },
      }),
    );

    const series = await new PrometheusClient().queryRange('x', {
      start: 1,
      end: 2,
      step: 1,
    });
    expect(series[0].labels).toEqual({ plugin: 'example' });
    expect(series[0].samples).toEqual([
      { time: 1, value: 0 },
      { time: 2, value: 1.5 },
    ]);
  });

  it('sends the range parameters prometheus expects', async () => {
    const spy = mockFetch(async () =>
      json({ status: 'success', data: { result: [] } }),
    );

    await new PrometheusClient().queryRange('up', {
      start: 100,
      end: 200,
      step: 15,
    });
    const body = new URLSearchParams(String(spy.mock.calls[0][1].body));
    expect(body.get('start')).toBe('100');
    expect(body.get('end')).toBe('200');
    expect(body.get('step')).toBe('15');
  });
});

describe('pickStep', () => {
  it('never asks for a finer step than the scrape interval', () => {
    expect(pickStep(0, 60)).toBe(15);
  });

  it('keeps a long range down to a drawable number of points', () => {
    const fifteenDays = 15 * 86400;
    const step = pickStep(0, fifteenDays);
    expect(fifteenDays / step).toBeLessThanOrEqual(400);
  });
});
