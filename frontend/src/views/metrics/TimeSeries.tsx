import type { PanelUnit } from '@backend/dashboards';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatTick,
  formatValue,
  niceCeiling,
  seriesColor,
  timeFormatter,
} from './format';

export type ChartSeries = {
  name: string;
  /** [milliseconds, value], ascending; a non-finite value breaks the line */
  points: [number, number][];
};

type Props = {
  series: ChartSeries[];
  unit: PanelUnit;
  kind: 'line' | 'area' | 'stacked';
  height?: number;
};

const PADDING = { top: 12, right: 12, bottom: 22, left: 48 };
const Y_TICKS = 4;

/** width of the drawing area, tracked so the SVG can use real pixel units */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Turn a series into SVG path data, starting a new subpath wherever a gap
 * appears. Prometheus omits points it has no samples for, and joining across
 * them would draw a straight line through an outage as though it were data.
 */
function splitRuns(
  points: [number, number][],
  gapMs: number,
): [number, number][][] {
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  let previousTime: number | null = null;

  for (const point of points) {
    const [time, value] = point;
    if (!Number.isFinite(value)) {
      if (run.length) runs.push(run);
      run = [];
      previousTime = null;
      continue;
    }
    if (previousTime != null && time - previousTime > gapMs) {
      if (run.length) runs.push(run);
      run = [];
    }
    run.push(point);
    previousTime = time;
  }
  if (run.length) runs.push(run);
  return runs;
}

type Scale = (value: number) => number;

function buildLine(runs: [number, number][][], x: Scale, y: Scale): string {
  return runs
    .map(run =>
      run
        .map(
          ([time, value], i) =>
            `${i === 0 ? 'M' : 'L'}${x(time).toFixed(1)},${y(value).toFixed(1)}`,
        )
        .join(''),
    )
    .join('');
}

/** each run gets its own closed shape, so a fill never spans a gap */
function buildArea(
  runs: [number, number][][],
  x: Scale,
  y: Scale,
  floor: number,
): string {
  return runs
    .filter(run => run.length > 1)
    .map(run => {
      const top = run
        .map(
          ([time, value], i) =>
            `${i === 0 ? 'M' : 'L'}${x(time).toFixed(1)},${y(value).toFixed(1)}`,
        )
        .join('');
      const last = x(run[run.length - 1][0]).toFixed(1);
      const first = x(run[0][0]).toFixed(1);
      return `${top}L${last},${floor.toFixed(1)}L${first},${floor.toFixed(1)}Z`;
    })
    .join('');
}

export const TimeSeries = ({ series, unit, kind, height = 180 }: Props) => {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  // series the legend has narrowed to; empty means everything is shown
  const [focused, setFocused] = useState<ReadonlySet<number>>(new Set());

  // Colours come from a series' position in the full list, so filtering has to
  // carry the original index rather than reindexing, or hiding one series
  // recolours the rest.
  const shown = useMemo(
    () =>
      series
        .map((s, index) => ({ s, index }))
        .filter(({ index }) => focused.size === 0 || focused.has(index)),
    [series, focused],
  );

  // A refetch can return fewer series than the focus was built against, which
  // would leave the chart focused on nothing and looking broken.
  useEffect(() => {
    setFocused(current => {
      if (current.size === 0) return current;
      const valid = [...current].filter(index => index < series.length);
      return valid.length === current.size ? current : new Set(valid);
    });
  }, [series.length]);

  const toggleFocus = (index: number, additive: boolean) => {
    setFocused(current => {
      if (!additive) {
        // clicking the only focused series releases the focus entirely
        return current.size === 1 && current.has(index)
          ? new Set()
          : new Set([index]);
      }
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const chart = useMemo(() => {
    const series = shown.map(({ s }) => s);
    const times = series.flatMap(s => s.points.map(p => p[0]));
    if (times.length === 0) return null;

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    // stacked series are drawn as running totals, so the axis has to fit the
    // sum rather than the tallest single series
    const stacked = kind === 'stacked';
    const totals = new Map<number, number>();
    if (stacked) {
      for (const s of series) {
        for (const [time, value] of s.points) {
          if (Number.isFinite(value))
            totals.set(time, (totals.get(time) ?? 0) + value);
        }
      }
    }

    const values = stacked
      ? [...totals.values()]
      : series.flatMap(s => s.points.map(p => p[1]).filter(Number.isFinite));

    const rawMax = values.length ? Math.max(...values) : 1;
    const rawMin = values.length ? Math.min(...values) : 0;
    // anchor at zero unless the data sits well above it, where a zeroed axis
    // would flatten everything interesting into one line
    const zeroed = rawMin >= 0 && rawMin <= rawMax * 0.4;
    const max = niceCeiling(rawMax || 1);
    const min = zeroed ? 0 : rawMin;

    return { minTime, maxTime, min, max, stacked, totals };
  }, [shown, kind]);

  const innerWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const scaleX = useCallback(
    (time: number) => {
      if (!chart) return 0;
      const span = chart.maxTime - chart.minTime || 1;
      return PADDING.left + ((time - chart.minTime) / span) * innerWidth;
    },
    [chart, innerWidth],
  );

  const scaleY = useCallback(
    (value: number) => {
      if (!chart) return 0;
      const span = chart.max - chart.min || 1;
      return (
        PADDING.top + innerHeight - ((value - chart.min) / span) * innerHeight
      );
    },
    [chart, innerHeight],
  );

  // every point in a series shares a step, so anything wider than a couple of
  // steps is a genuine gap rather than the normal spacing
  const gapMs = useMemo(() => {
    const first = shown.find(({ s }) => s.points.length > 2)?.s;
    if (!first) return Infinity;
    const step = first.points[1][0] - first.points[0][0];
    return step * 2.5;
  }, [shown]);

  const onMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!chart || innerWidth <= 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientX - rect.left - PADDING.left) / innerWidth;
      if (ratio < 0 || ratio > 1) return setHover(null);
      setHover(chart.minTime + ratio * (chart.maxTime - chart.minTime));
    },
    [chart, innerWidth],
  );

  if (!chart)
    return (
      <div className="chart-empty" ref={ref}>
        No data in this range
      </div>
    );

  const formatTime = timeFormatter(chart.maxTime - chart.minTime);
  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    return chart.min + ((chart.max - chart.min) * i) / Y_TICKS;
  });
  const xTickCount = Math.max(2, Math.min(6, Math.floor(innerWidth / 90)));
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => {
    return chart.minTime + ((chart.maxTime - chart.minTime) * i) / xTickCount;
  });

  // stacking accumulates as it draws, so later series sit on top of earlier ones
  const baseline = new Map<number, number>();
  const drawn = shown.map(({ s, index }) => {
    const color = seriesColor(index);
    const points: [number, number][] = chart.stacked
      ? s.points.map(([time, value]) => {
          if (!Number.isFinite(value)) return [time, value];
          const bottom = baseline.get(time) ?? 0;
          baseline.set(time, bottom + value);
          return [time, bottom + value];
        })
      : s.points;
    return { series: s, color, points };
  });

  // the nearest real sample to the cursor. the tooltip shows each series' own
  // value while the marker sits on the drawn (stacked) position
  const hovered =
    hover == null
      ? null
      : drawn.map(({ series: s, color, points }) => {
          let index = -1;
          let bestDistance = Infinity;
          for (let i = 0; i < s.points.length; i++) {
            const distance = Math.abs(s.points[i][0] - hover);
            if (distance < bestDistance) {
              bestDistance = distance;
              index = i;
            }
          }
          return {
            name: s.name,
            color,
            point: index < 0 ? null : s.points[index],
            drawnPoint: index < 0 ? null : points[index],
          };
        });
  const hoverTime = hovered?.find(h => h.point)?.point?.[0] ?? null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map(value => (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={scaleY(value)}
                y2={scaleY(value)}
                className="chart-grid"
              />
              <text
                x={PADDING.left - 6}
                y={scaleY(value)}
                textAnchor="end"
                dominantBaseline="central"
                className="chart-label"
              >
                {formatTick(value, unit)}
              </text>
            </g>
          ))}

          {xTicks.map((time, i) => (
            <text
              key={time}
              x={scaleX(time)}
              y={height - 6}
              textAnchor={
                i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'
              }
              className="chart-label"
            >
              {formatTime(time)}
            </text>
          ))}

          {drawn.map(({ series: s, color, points }, index) => {
            const runs = splitRuns(points, gapMs);
            if (runs.length === 0) return null;
            const filled = kind === 'area' || kind === 'stacked';
            return (
              <g key={s.name + index}>
                {filled && (
                  <path
                    d={buildArea(runs, scaleX, scaleY, scaleY(chart.min))}
                    fill={color}
                    fillOpacity={0.15}
                    stroke="none"
                  />
                )}
                <path
                  d={buildLine(runs, scaleX, scaleY)}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {hoverTime != null && (
            <line
              x1={scaleX(hoverTime)}
              x2={scaleX(hoverTime)}
              y1={PADDING.top}
              y2={PADDING.top + innerHeight}
              className="chart-crosshair"
            />
          )}
          {hovered?.map(
            ({ name, color, drawnPoint }) =>
              drawnPoint &&
              Number.isFinite(drawnPoint[1]) && (
                <circle
                  key={name}
                  cx={scaleX(drawnPoint[0])}
                  cy={scaleY(drawnPoint[1])}
                  r={3}
                  fill={color}
                />
              ),
          )}
        </svg>
      )}

      {hovered && hoverTime != null && (
        // pinned to whichever side the cursor is not on, rather than centred on
        // it: a readout centred near an edge hangs outside the chart and makes
        // the page scroll sideways
        <div
          className={`chart-tooltip ${
            scaleX(hoverTime) > width / 2 ? 'left' : 'right'
          }`}
        >
          <div className="chart-tooltip-time">{formatTime(hoverTime)}</div>
          {hovered.map(({ name, color, point }) => (
            <div key={name} className="chart-tooltip-row">
              <span className="chart-swatch" style={{ background: color }} />
              <span className="chart-tooltip-name">{name}</span>
              <span className="chart-tooltip-value">
                {point ? formatValue(point[1], unit) : 'n/a'}
              </span>
            </div>
          ))}
        </div>
      )}

      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s, index) => {
            const dimmed = focused.size > 0 && !focused.has(index);
            return (
              <button
                type="button"
                key={s.name + index}
                className={`chart-legend-item ${dimmed ? 'dimmed' : ''}`}
                data-tooltip="Click to show only this series, shift-click to add another"
                onClick={event => toggleFocus(index, event.shiftKey)}
              >
                <span
                  className="chart-swatch"
                  style={{ background: seriesColor(index) }}
                />
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
