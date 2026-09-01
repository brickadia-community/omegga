import { describe, expect, it } from 'vitest';
import type { PrometheusSeries } from '../prometheus';
import { nameSeries } from './metrics';

const series = (labels: Record<string, string>): PrometheusSeries => ({
  labels,
  samples: [{ time: 1, value: 1 }],
});

describe('nameSeries', () => {
  it('names a lone series after its query, whatever labels it carries', () => {
    // a relabelled scrape target stamps env/job/instance on everything, and
    // naming from those gave every series on a panel the same name
    expect(
      nameSeries([series({ instance: 'server-1', env: 'prod' })], 'up'),
    ).toEqual(['up']);
  });

  it('keeps two single-series queries on one panel distinct', () => {
    const up = nameSeries([series({ instance: 'a', env: 'prod' })], 'up');
    const responsive = nameSeries(
      [series({ instance: 'a', env: 'prod' })],
      'responsive',
    );
    expect([...up, ...responsive]).toEqual(['up', 'responsive']);
  });

  it('names a fanned-out query from the label that actually differs', () => {
    expect(
      nameSeries(
        [
          series({ instance: 'a', env: 'prod', plugin: 'first' }),
          series({ instance: 'a', env: 'prod', plugin: 'second' }),
        ],
        'errors',
      ),
    ).toEqual(['first', 'second']);
  });

  it('prefers the declared legend label when the panel names one', () => {
    expect(
      nameSeries(
        [series({ le: '60' }), series({ le: '+Inf' })],
        'sessions',
        'le',
      ),
    ).toEqual(['60', '+Inf']);
  });

  it('falls back to the query name when a legend label is missing', () => {
    expect(nameSeries([series({ le: '1' }), series({})], 'x', 'le')).toEqual([
      '1',
      'x',
    ]);
  });

  it('falls back when several series differ only by a scrape label', () => {
    // two omeggas answering the same unfiltered query; the names would
    // otherwise be the environment rather than the measurement
    expect(
      nameSeries([series({ env: 'prod' }), series({ env: 'staging' })], 'up'),
    ).toEqual(['up', 'up']);
  });

  it('returns nothing for a query that matched nothing', () => {
    expect(nameSeries([], 'up')).toEqual([]);
  });
});
