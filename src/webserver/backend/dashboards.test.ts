import { describe, expect, it } from 'vitest';
import {
  DASHBOARDS,
  getDashboard,
  queryContext,
  rateWindow,
} from './dashboards';
import { SCOPES } from './scopes';

describe('queryContext', () => {
  it('filters every selector by the configured instance', () => {
    const q = queryContext({ instance: 'server-1', rate: '2m', range: '24h' });
    expect(q.sel('brickadia_up')).toBe('brickadia_up{instance="server-1"}');
  });

  it('keeps the instance filter alongside a panel matcher', () => {
    const q = queryContext({ instance: 'server-1', rate: '2m', range: '24h' });
    expect(q.sel('omegga_plugin_loaded', 'plugin!=""')).toBe(
      'omegga_plugin_loaded{instance="server-1",plugin!=""}',
    );
  });

  it('leaves selectors unfiltered when no instance is configured', () => {
    const q = queryContext({ rate: '2m', range: '24h' });
    expect(q.sel('brickadia_up')).toBe('brickadia_up');
  });

  it('refuses an instance that could break out of the label matcher', () => {
    // the config schema rejects these first; this is the second line of defense
    for (const instance of [
      'a"} or up{',
      'a\\',
      'a b',
      'a"',
      '}',
      'a,job="x"',
    ]) {
      expect(() =>
        queryContext({ instance, rate: '2m', range: '24h' }),
      ).toThrow(/unsafe prometheus instance/);
    }
  });
});

describe('rateWindow', () => {
  it('never falls below a minute, so a fine step still resolves', () => {
    expect(rateWindow(15)).toBe('60s');
  });

  it('widens with the step so a long range keeps producing points', () => {
    expect(rateWindow(300)).toBe('1200s');
  });
});

describe('the panel catalog', () => {
  const panels = DASHBOARDS.flatMap(d =>
    d.panels.map(p => ({ dashboard: d.id, panel: p })),
  );

  it('gives every dashboard a scope that exists', () => {
    for (const d of DASHBOARDS) expect(SCOPES).toHaveProperty(d.scope);
  });

  it('keeps panel ids unique within a dashboard', () => {
    for (const d of DASHBOARDS) {
      const ids = d.panels.map(p => p.id);
      expect(new Set(ids).size, `duplicate panel id in ${d.id}`).toBe(
        ids.length,
      );
    }
  });

  it('builds every query with the instance filter applied', () => {
    const q = queryContext({ instance: 'server-1', rate: '2m', range: '24h' });
    for (const { dashboard, panel } of panels) {
      for (const query of panel.queries) {
        const promql = query.build(q);
        expect(
          promql,
          `${dashboard}/${panel.id}/${query.name} dropped the instance filter`,
        ).toContain('instance="server-1"');
      }
    }
  });

  it('reads histograms through their buckets', () => {
    const q = queryContext({ instance: 'server-1', rate: '2m', range: '24h' });
    for (const { panel } of panels) {
      for (const query of panel.queries) {
        const promql = query.build(q);
        if (!promql.includes('histogram_quantile')) continue;
        // a histogram exports no series under its base name, so selecting that
        // silently returns nothing; the quantile also has to aggregate by le
        expect(promql).toContain('sum by (le)');
        expect(promql).toMatch(/rate\(\w+_bucket\{/);
      }
    }
  });

  it('wraps every counter in rate(), since counters reset on restart', () => {
    const q = queryContext({ instance: 'server-1', rate: '2m', range: '24h' });
    for (const { dashboard, panel } of panels) {
      // stat panels read a counter's raw total on purpose ("joins since boot")
      if (panel.kind === 'stat') continue;
      for (const query of panel.queries) {
        const promql = query.build(q);
        const counters = promql.match(/\b\w+_total\b/g) ?? [];
        for (const counter of counters) {
          expect(
            promql,
            `${dashboard}/${panel.id} reads ${counter} without rate()`,
          ).toMatch(new RegExp(`rate\\(${counter}`));
        }
      }
    }
  });

  it('gives every stat tile a short label, since it renders without a title', () => {
    for (const { dashboard, panel } of panels) {
      if (panel.kind !== 'stat') continue;
      expect(panel.label, `${dashboard}/${panel.id} has no label`).toBeTruthy();
      expect(panel.label!.length).toBeLessThanOrEqual(12);
    }
  });

  it('totals histogram buckets over the whole range, grouped by le', () => {
    const q = queryContext({ instance: 'server-1', rate: '2m', range: '24h' });
    const seen: string[] = [];
    for (const { dashboard, panel } of panels) {
      if (panel.kind !== 'histogram') continue;
      seen.push(`${dashboard}/${panel.id}`);
      for (const query of panel.queries) {
        // the bars are counts across the whole range rather than a rate, and
        // the client needs the le label to place each bar in its bucket
        expect(query.build(q), `${dashboard}/${panel.id}`).toMatch(
          /^sum by \(le\) \(increase\(\w+_bucket\{instance="server-1"\}\[24h\]\)\)$/,
        );
        expect(query.legend, `${dashboard}/${panel.id}`).toBe('le');
      }
    }
    expect(seen).toEqual(['players/session-length', 'players/ping']);
  });

  it('resolves dashboards by id and rejects unknown ones', () => {
    expect(getDashboard('players')?.title).toBe('Players');
    expect(getDashboard('../../etc/passwd')).toBeUndefined();
    expect(getDashboard('')).toBeUndefined();
  });
});
