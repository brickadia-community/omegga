import { seriesColor } from './format';

const WIDTH = 120;
const HEIGHT = 16;

/**
 * A bare trend line for a table row, with no axes or labels.
 *
 * Pass an explicit domain for anything whose absolute value matters. Scaling to
 * the series' own range is right for an open-ended number, but it would draw a
 * plugin that stayed loaded and one that stayed unloaded as the same flat line.
 */
export const Sparkline = ({
  points,
  color = seriesColor(0),
  domain,
}: {
  points: [number, number][];
  color?: string;
  domain?: [min: number, max: number];
}) => {
  const values = points.map(p => p[1]).filter(Number.isFinite);
  if (values.length < 2) return <span className="sparkline-empty" />;

  const min = domain ? domain[0] : Math.min(...values);
  const max = domain ? domain[1] : Math.max(...values);
  const span = max - min || 1;
  const step = WIDTH / (values.length - 1);
  const y = (value: number) =>
    HEIGHT - 1 - ((value - min) / span) * (HEIGHT - 2);

  const path = values
    .map(
      (value, i) =>
        `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(value).toFixed(1)}`,
    )
    .join('');

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
    >
      <path
        d={`${path}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`}
        fill={color}
        fillOpacity={0.15}
        stroke="none"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
