import type { PanelKind, PanelUnit } from '@backend/dashboards';
import { Loader } from '@components';
import { IconAlertTriangle } from '@tabler/icons-react';
import { BarChart } from './BarChart';
import { formatTick, formatValue } from './format';
import { Sparkline } from './Sparkline';
import { TimeSeries, type ChartSeries } from './TimeSeries';

export type PanelSummary = {
  id: string;
  title: string;
  label?: string;
  description?: string;
  kind: PanelKind;
  unit: PanelUnit;
};

export type PanelData = {
  id: string;
  series: {
    name: string;
    points: [number, number][];
    labels?: Record<string, string>;
  }[];
  error?: string;
};

// prometheus timestamps are unix seconds; charts and Date both want ms
const toChartSeries = (data: PanelData): ChartSeries[] =>
  data.series.map(s => ({
    name: s.name,
    points: s.points.map(([time, value]) => [time * 1000, value]),
  }));

const lastValue = (data: PanelData): number | null => {
  const points = data.series[0]?.points;
  if (!points?.length) return null;
  return points[points.length - 1][1];
};

/**
 * Turn a histogram's cumulative buckets into a count per bucket.
 *
 * Prometheus stores each bucket as "observations at or below this bound", so
 * every bucket includes the ones before it. Subtracting the previous bound
 * gives the count that belongs to the band alone, which is what a bar chart
 * should show.
 */
function toBars(data: PanelData, unit: PanelUnit) {
  const buckets = data.series
    .map(s => {
      const le = s.labels?.le ?? s.name;
      // the open-ended bucket is the literal string `+Inf`, which Number()
      // reads as NaN rather than as infinity
      return {
        le: le === '+Inf' ? Infinity : Number(le),
        total: s.points[s.points.length - 1]?.[1] ?? 0,
      };
    })
    .filter(b => !Number.isNaN(b.le) && Number.isFinite(b.total))
    .sort((a, b) => a.le - b.le);

  let previousBound = 0;
  let previousTotal = 0;
  const bars: { label: string; value: number }[] = [];
  for (const bucket of buckets) {
    bars.push({
      label: Number.isFinite(bucket.le)
        ? formatTick(bucket.le, unit)
        : `${formatTick(previousBound, unit)}+`,
      value: Math.max(0, bucket.total - previousTotal),
    });
    previousTotal = bucket.total;
    if (Number.isFinite(bucket.le)) previousBound = bucket.le;
  }
  return bars;
}

const Empty = ({ children = 'No data' }: { children?: string }) => (
  <div className="panel-empty">{children}</div>
);

const PanelBody = ({
  panel,
  data,
}: {
  panel: PanelSummary;
  data: PanelData;
}) => {
  if (panel.kind === 'stat') {
    const value = lastValue(data);
    const state = panel.unit === 'bool' ? (value ? 'good' : 'bad') : '';
    return (
      <div className="panel-stat">
        <div className={`panel-stat-value ${state}`}>
          {value == null ? '--' : formatValue(value, panel.unit)}
        </div>
        <div className="panel-stat-label">{panel.label ?? panel.title}</div>
      </div>
    );
  }

  if (panel.kind === 'table') {
    if (data.series.length === 0) return <Empty />;
    return (
      <table className="panel-table">
        <tbody>
          {[...data.series]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => {
              const value = s.points[s.points.length - 1]?.[1];
              const state =
                panel.unit === 'bool' ? (value ? 'good' : 'bad') : '';
              return (
                <tr key={s.name}>
                  <td className="panel-table-name">{s.name}</td>
                  <td className="panel-table-trend">
                    <Sparkline
                      points={s.points}
                      domain={panel.unit === 'bool' ? [0, 1] : undefined}
                      color={
                        state === 'bad' ? 'var(--trend-bad)' : 'var(--trend-ok)'
                      }
                    />
                  </td>
                  <td className={`panel-table-value ${state}`}>
                    {value == null ? 'n/a' : formatValue(value, panel.unit)}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    );
  }

  if (panel.kind === 'histogram') {
    const bars = toBars(data, panel.unit);
    if (bars.every(b => b.value === 0)) return <Empty />;
    return <BarChart bars={bars} />;
  }

  return (
    <TimeSeries
      series={toChartSeries(data)}
      unit={panel.unit}
      kind={
        panel.kind === 'stacked'
          ? 'stacked'
          : panel.kind === 'area'
            ? 'area'
            : 'line'
      }
    />
  );
};

export const Panel = ({
  panel,
  data,
  loading,
}: {
  panel: PanelSummary;
  data?: PanelData;
  loading: boolean;
}) => {
  // stat tiles read as one number with a caption, so a header bar on top would
  // be a second label for the same thing
  const showHeader = panel.kind !== 'stat';

  return (
    <div
      className={`metrics-panel kind-${panel.kind}`}
      // a stat tile has no header to hang the hint on, so the whole tile is
      // the hover target
      data-tooltip={showHeader ? undefined : panel.description}
    >
      {showHeader && (
        <div className="panel-header" data-tooltip={panel.description}>
          <span className="panel-title">{panel.title}</span>
        </div>
      )}
      <div className="panel-body">
        {loading && !data ? (
          <div className="panel-empty">
            <Loader size="small" />
          </div>
        ) : data?.error ? (
          // a panel that failed on its own says so in place, rather than
          // blanking the dashboard or pretending it has no data
          <div className="panel-error" title={data.error}>
            <IconAlertTriangle />
            <span>{data.error}</span>
          </div>
        ) : data ? (
          <PanelBody panel={panel} data={data} />
        ) : (
          <Empty />
        )}
      </div>
    </div>
  );
};
