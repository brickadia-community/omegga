import type { PanelUnit } from '@backend/dashboards';

const SI = ['', 'k', 'M', 'G', 'T'];

/** compact number for an axis tick, where space is scarce */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs < 1000) {
    // keep a couple of decimals for small values, but never render "1.00"
    if (abs === 0) return '0';
    if (abs < 1) return value.toFixed(abs < 0.1 ? 3 : 2).replace(/\.?0+$/, '');
    return String(Math.round(value * 100) / 100);
  }
  let scaled = value;
  let unit = 0;
  while (Math.abs(scaled) >= 1000 && unit < SI.length - 1) {
    scaled /= 1000;
    unit++;
  }
  return `${Math.round(scaled * 10) / 10}${SI[unit]}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? Math.round(value) : (Math.round(value * 10) / 10).toFixed(1)} ${units[unit]}`;
}

/** a span of seconds as the largest two units that fit */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;

  const units: [label: string, size: number][] = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  const parts: string[] = [];
  let rest = Math.floor(seconds);
  for (const [label, size] of units) {
    const count = Math.floor(rest / size);
    rest -= count * size;
    if (count > 0 || parts.length > 0) parts.push(`${count}${label}`);
    if (parts.length === 2) break;
  }
  return parts.join(' ') || '0s';
}

export function formatValue(value: number, unit: PanelUnit): string {
  if (!Number.isFinite(value)) return 'n/a';
  switch (unit) {
    case 'bytes':
      return formatBytes(value);
    case 'bytesPerSecond':
      return `${formatBytes(value)}/s`;
    case 'seconds':
      return value < 1
        ? `${Math.round(value * 1000)}ms`
        : `${Math.round(value * 100) / 100}s`;
    case 'duration':
      return formatDuration(value);
    case 'ratio':
      return `${Math.round(value * 1000) / 10}%`;
    case 'perHour':
      return `${formatCompact(value)}/hr`;
    case 'bool':
      return value ? 'YES' : 'NO';
    case 'timestamp':
      return value > 0 ? new Date(value * 1000).toLocaleString() : 'never';
    default:
      return formatCompact(value);
  }
}

/** the same value with less room, for an axis tick */
export function formatTick(value: number, unit: PanelUnit): string {
  switch (unit) {
    case 'bytes':
    case 'bytesPerSecond':
      return formatBytes(value);
    case 'duration':
      return formatDuration(value);
    case 'ratio':
      return `${Math.round(value * 100)}%`;
    case 'seconds':
      return value !== 0 && value < 1
        ? `${Math.round(value * 1000)}ms`
        : `${formatCompact(value)}s`;
    case 'bool':
      // a bool axis only means anything at its ends; the ticks between them
      // are an artifact of the gridline spacing
      return value === 1 ? 'YES' : value === 0 ? 'NO' : '';
    default:
      return formatCompact(value);
  }
}

/**
 * Time formatter matched to the span on screen. A day of data wants clock time
 * and a month wants dates; showing both everywhere wastes the axis.
 */
export function timeFormatter(spanMs: number): (time: number) => string {
  if (spanMs <= 36 * 3600 * 1000)
    return time =>
      new Date(time).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
  if (spanMs <= 8 * 86400 * 1000)
    return time =>
      new Date(time).toLocaleString(undefined, {
        weekday: 'short',
        hour: '2-digit',
      });
  return time =>
    new Date(time).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
}

/** round a maximum up to a value that produces readable gridlines */
export function niceCeiling(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export const SERIES_COLORS = [
  '#4cb9f3',
  '#5da93d',
  '#ffa10b',
  '#e96c6c',
  '#b06cf3',
  '#00c2a8',
  '#f36cb9',
  '#a7bbce',
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
