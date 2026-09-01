import { useState } from 'react';
import { formatCompact, niceCeiling, seriesColor } from './format';

export type Bar = { label: string; value: number };

/**
 * A bar per histogram bucket. Buckets are a distribution rather than a series
 * over time, so they get a category axis: the label is the band and the height
 * is how many observations landed in it.
 */
export const BarChart = ({
  bars,
  height = 180,
}: {
  bars: Bar[];
  height?: number;
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceCeiling(Math.max(...bars.map(b => b.value), 1));
  const color = seriesColor(0);

  return (
    <div className="bar-chart" style={{ height }}>
      <div className="bar-chart-axis">
        {[max, max / 2, 0].map(value => (
          <span key={value}>{formatCompact(value)}</span>
        ))}
      </div>
      <div className="bar-chart-plot">
        {bars.map((bar, index) => (
          <div
            key={bar.label}
            className={`bar-column ${hover === index ? 'hover' : ''}`}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  height: `${(bar.value / max) * 100}%`,
                  background: color,
                }}
              />
              {hover === index && (
                <div className="bar-tooltip">
                  <div className="bar-tooltip-value">
                    {formatCompact(bar.value)}
                  </div>
                  <div className="bar-tooltip-label">{bar.label}</div>
                </div>
              )}
            </div>
            <span className="bar-label">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
