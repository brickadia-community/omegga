/*
  Prometheus text exposition format (version 0.0.4).

  Both the host registry and the snapshots plugins ship over their process
  bridge render through this one function, so a plugin metric is formatted
  exactly like a built-in one.
*/

import { type Labels, type MetricFamily } from './registry';

export const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

/** HELP text only escapes backslashes and newlines */
function escapeHelp(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

/** label values additionally escape double quotes */
function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

/** go-parseable float; JS number formatting is compatible apart from infinities */
export function formatValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

/** `{a="1",b="2"}`, or an empty string when there are no labels */
function formatLabels(labels: Labels, extra?: [string, string]): string {
  const parts = Object.keys(labels)
    .sort()
    .map(key => `${key}="${escapeLabel(String(labels[key]))}"`);
  if (extra) parts.push(`${extra[0]}="${escapeLabel(extra[1])}"`);
  if (parts.length === 0) return '';
  return `{${parts.join(',')}}`;
}

function renderFamily(family: MetricFamily, lines: string[]): void {
  lines.push(`# HELP ${family.name} ${escapeHelp(family.help)}`);
  lines.push(`# TYPE ${family.name} ${family.type}`);

  if (family.type !== 'histogram') {
    for (const sample of family.samples) {
      lines.push(
        `${family.name}${formatLabels(sample.labels)} ${formatValue(
          sample.value,
        )}`,
      );
    }
    return;
  }

  for (const sample of family.samples) {
    // the registry stores per-bucket counts; the wire format is cumulative
    let cumulative = 0;
    for (let i = 0; i < family.buckets.length; i++) {
      cumulative += sample.counts[i] ?? 0;
      lines.push(
        `${family.name}_bucket${formatLabels(sample.labels, [
          'le',
          formatValue(family.buckets[i]),
        ])} ${formatValue(cumulative)}`,
      );
    }
    // the trailing slot is the implicit +Inf bucket, which always equals _count
    lines.push(
      `${family.name}_bucket${formatLabels(sample.labels, [
        'le',
        '+Inf',
      ])} ${formatValue(sample.count)}`,
    );
    lines.push(
      `${family.name}_sum${formatLabels(sample.labels)} ${formatValue(
        sample.sum,
      )}`,
    );
    lines.push(
      `${family.name}_count${formatLabels(sample.labels)} ${formatValue(
        sample.count,
      )}`,
    );
  }
}

/**
 * Render metric families to the text exposition format. Families arrive
 * pre-sorted by name from `Registry.snapshot()`; duplicates (the same name
 * exported by two sources) would be a scrape error, so later families with an
 * already-seen name are dropped.
 */
export function render(families: MetricFamily[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const family of families) {
    if (seen.has(family.name)) continue;
    seen.add(family.name);
    renderFamily(family, lines);
  }
  // the format requires a trailing newline
  return lines.length === 0 ? '\n' : lines.join('\n') + '\n';
}
