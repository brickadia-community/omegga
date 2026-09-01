import { describe, expect, it } from 'vitest';
import { render } from './render';
import { Registry } from './registry';

describe('render', () => {
  it('emits HELP and TYPE before each family', () => {
    const r = new Registry();
    r.counter({ name: 'brickadia_players_joined_total', help: 'joins' }).inc(3);
    expect(render(r.snapshot())).toBe(
      [
        '# HELP brickadia_players_joined_total joins',
        '# TYPE brickadia_players_joined_total counter',
        'brickadia_players_joined_total 3',
        '',
      ].join('\n'),
    );
  });

  it('renders labels sorted and quoted', () => {
    const r = new Registry();
    r.gauge({ name: 'test', help: 'h', labels: ['b', 'a'] }).set(
      { b: '2', a: '1' },
      7,
    );
    expect(render(r.snapshot())).toContain('test{a="1",b="2"} 7');
  });

  it('escapes backslashes, quotes, and newlines in label values', () => {
    const r = new Registry();
    r.gauge({ name: 'test', help: 'h', labels: ['name'] }).set(
      { name: 'a"b\\c\nd' },
      1,
    );
    expect(render(r.snapshot())).toContain('test{name="a\\"b\\\\c\\nd"} 1');
  });

  it('escapes backslashes and newlines in help text but not quotes', () => {
    const r = new Registry();
    r.gauge({ name: 'test', help: 'a "quoted" \\ line\nbreak' }).set(1);
    expect(render(r.snapshot())).toContain(
      '# HELP test a "quoted" \\\\ line\\nbreak',
    );
  });

  it('emits HELP and TYPE for a family with no samples', () => {
    // a registered-but-never-touched metric still declares itself
    const r = new Registry();
    r.counter({ name: 'test_total', help: 'h' });
    expect(render(r.snapshot())).toBe(
      '# HELP test_total h\n# TYPE test_total counter\n',
    );
  });

  it('renders histograms with cumulative buckets, +Inf, sum, and count', () => {
    const r = new Registry();
    const h = r.histogram({ name: 'test', help: 'h', buckets: [1, 5] });
    h.observe(0.5);
    h.observe(3);
    h.observe(100);
    expect(render(r.snapshot())).toBe(
      [
        '# HELP test h',
        '# TYPE test histogram',
        'test_bucket{le="1"} 1',
        'test_bucket{le="5"} 2',
        'test_bucket{le="+Inf"} 3',
        'test_sum 103.5',
        'test_count 3',
        '',
      ].join('\n'),
    );
  });

  it('appends le to a labelled histogram rather than replacing labels', () => {
    const r = new Registry();
    r.histogram({
      name: 'test',
      help: 'h',
      labels: ['route'],
      buckets: [1],
    }).observe({ route: 'a' }, 0.5);
    const out = render(r.snapshot());
    expect(out).toContain('test_bucket{route="a",le="1"} 1');
    expect(out).toContain('test_bucket{route="a",le="+Inf"} 1');
    expect(out).toContain('test_sum{route="a"} 0.5');
    expect(out).toContain('test_count{route="a"} 1');
  });

  it('formats infinities and NaN the way the format requires', () => {
    const r = new Registry();
    const g = r.gauge({ name: 'test', help: 'h', labels: ['k'] });
    g.set({ k: 'pos' }, Infinity);
    g.set({ k: 'neg' }, -Infinity);
    const out = render(r.snapshot());
    expect(out).toContain('test{k="pos"} +Inf');
    expect(out).toContain('test{k="neg"} -Inf');
  });

  it('drops a duplicate family name, which would be a scrape error', () => {
    const r = new Registry();
    r.gauge({ name: 'test', help: 'first' }).set(1);
    const families = r.snapshot();
    const out = render([...families, ...families]);
    expect(out.match(/# TYPE test gauge/g)).toHaveLength(1);
  });

  it('returns a bare newline for an empty registry', () => {
    expect(render([])).toBe('\n');
  });

  it('always ends with exactly one trailing newline', () => {
    const r = new Registry();
    r.gauge({ name: 'test', help: 'h' }).set(1);
    const out = render(r.snapshot());
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});
