import type { PluginHttpResponse } from '@/plugin';

/**
 * An answer from a plugin outside omegga's process (a worker or an RPC
 * plugin), checked field by field: a status outside 100-599 and header values
 * that aren't strings are dropped rather than handed to express, which would
 * throw on them. Null, undefined and non-objects mean the plugin had no answer.
 */
export function asHttpResponse(v: unknown): PluginHttpResponse | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const out: PluginHttpResponse = {};
  const status = 'status' in v ? v.status : undefined;
  if (
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
  )
    out.status = status;
  const headers = 'headers' in v ? v.headers : undefined;
  if (
    typeof headers === 'object' &&
    headers !== null &&
    !Array.isArray(headers)
  ) {
    out.headers = {};
    for (const [k, val] of Object.entries(headers))
      if (typeof val === 'string') out.headers[k] = val;
  }
  if ('body' in v) out.body = v.body;
  return out;
}
