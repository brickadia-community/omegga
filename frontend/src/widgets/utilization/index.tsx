import { Loader } from '@components';
import { IconArrowDown, IconArrowUp, IconCpu } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RouterOutputs } from '../../trpc';
import { trpc } from '../../trpc';

type Utilization =
  RouterOutputs['server']['onUtilization'] extends AsyncIterable<infer T>
    ? T
    : never;

const HISTORY_LEN = 30;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 ** 2) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
}

function padHistory(arr: number[]): number[] {
  if (arr.length >= HISTORY_LEN) return arr;
  const pad = new Array(HISTORY_LEN - arr.length).fill(arr[0] ?? 0);
  return [...pad, ...arr];
}

// --- Donut Chart ---
const DonutChart = ({ value, color }: { value: number; color: string }) => {
  const r = 36;
  const c = Math.PI * 2 * r;
  const pct = Math.max(0, Math.min(100, value));

  return (
    <svg viewBox="0 0 100 100" className="donut-svg">
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="8"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        className="donut-pct"
      >
        {Math.round(pct) === 100 ? '100' : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
};

// --- Sparkline ---
const Sparkline = ({
  data,
  color,
  height = 32,
  width = 120,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) => {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`)
    .join(' ');
  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline"
      preserveAspectRatio="none"
    >
      <polygon points={fillPoints} fill={color} fillOpacity="0.12" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

// --- Widget ---
export const UtilizationWidget = () => {
  const [util, setUtil] = useState<Utilization | null>(null);
  const cpuHistory = useRef<number[]>([]);
  const netRxHistory = useRef<number[]>([]);
  const netTxHistory = useRef<number[]>([]);
  const [, tick] = useState(0);

  const handleData = useCallback((data: Utilization) => {
    setUtil(data);
    cpuHistory.current = [
      ...cpuHistory.current.slice(-(HISTORY_LEN - 1)),
      data.cpu,
    ];
    netRxHistory.current = [
      ...netRxHistory.current.slice(-(HISTORY_LEN - 1)),
      data.net.rxSec,
    ];
    netTxHistory.current = [
      ...netTxHistory.current.slice(-(HISTORY_LEN - 1)),
      data.net.txSec,
    ];
    tick(n => n + 1);
  }, []);

  const { data: queryUtil } = trpc.server.utilization.useQuery();

  useEffect(() => {
    if (!queryUtil) return;
    // Always seed history refs from query data — the subscription may have
    // already set util, but the history refs could still be empty if the
    // subscription won the startup race against the query.
    const hist = queryUtil.history;
    if (hist.length > 0) {
      cpuHistory.current = hist.map(h => h.cpu);
      netRxHistory.current = hist.map(h => h.net.rxSec);
      netTxHistory.current = hist.map(h => h.net.txSec);
    }
    if (queryUtil.current && !util) {
      setUtil(queryUtil.current);
    }
    tick(n => n + 1);
  }, [queryUtil]);

  trpc.server.onUtilization.useSubscription(undefined, {
    onData: handleData,
  });

  if (!util) {
    return (
      <div className="utilization-widget">
        <Loader blur size="huge">
          Waiting for metrics...
        </Loader>
      </div>
    );
  }

  const cpuColor =
    util.cpu > 80 ? '#e02d2d' : util.cpu > 50 ? '#ffa10b' : '#5da93d';
  const memPct = (util.mem.used / util.mem.total) * 100;
  const memColor =
    memPct > 80 ? '#e02d2d' : memPct > 50 ? '#ffa10b' : '#009bee';
  const diskPct = (util.disk.used / util.disk.total) * 100;
  const diskColor =
    diskPct > 90 ? '#e02d2d' : diskPct > 70 ? '#ffa10b' : '#009bee';

  return (
    <div className="utilization-widget">
      <div className="util-donuts">
        <div className="donut-row">
          <DonutChart value={util.cpu} color={cpuColor} />
          <div className="donut-detail">
            <b>CPU</b>
          </div>
        </div>
        <div className="donut-row">
          <DonutChart value={memPct} color={memColor} />
          <div className="donut-detail">
            <b>MEMORY</b>
            <div className="donut-detail-line">
              <span>{formatBytes(util.mem.used)}</span>
              <span className="donut-detail-sub">
                / {formatBytes(util.mem.total)}
              </span>
            </div>
          </div>
        </div>
        <div className="donut-row">
          <DonutChart value={diskPct} color={diskColor} />
          <div className="donut-detail">
            <b>STORAGE</b>
            <div className="donut-detail-line">
              <span>{formatBytes(util.disk.used)}</span>
              <span className="donut-detail-sub">
                / {formatBytes(util.disk.total)}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="util-sparklines">
        <div className="spark-row">
          <span className="spark-label">
            <IconCpu size={14} />
            CPU
          </span>
          <Sparkline data={padHistory(cpuHistory.current)} color={cpuColor} />
          <span className="spark-value">{util.cpu}%</span>
        </div>
        <div className="spark-row">
          <span className="spark-label">
            <IconArrowDown size={14} />
            RX
          </span>
          <Sparkline data={padHistory(netRxHistory.current)} color="#009bee" />
          <span className="spark-value">{formatRate(util.net.rxSec)}</span>
        </div>
        <div className="spark-row">
          <span className="spark-label">
            <IconArrowUp size={14} />
            TX
          </span>
          <Sparkline data={padHistory(netTxHistory.current)} color="#5da93d" />
          <span className="spark-value">{formatRate(util.net.txSec)}</span>
        </div>
      </div>
    </div>
  );
};
