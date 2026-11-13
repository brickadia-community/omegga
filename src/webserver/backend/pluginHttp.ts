import Logger from '@/logger';
import type {
  IPluginDocumentation,
  PluginHttpRequest,
  PluginHttpResponse,
} from '@/plugin';
import express from 'express';
import { asyncRoute, HttpError } from './middleware';

/** what the routes need from a plugin */
export interface HttpPlugin {
  getName(): string;
  isLoaded(): boolean;
  getDocumentation(): IPluginDocumentation | null;
  http(request: PluginHttpRequest): Promise<PluginHttpResponse | undefined>;
}

export interface PluginHttpDeps {
  findPlugin(name: string): HttpPlugin | undefined;
  /** the web UI user for a session's user id, as the rest of the API resolves it */
  findUser(
    id: string | undefined,
  ): Promise<{ id: string; username: string; isBanned?: boolean } | null>;
  /** how long a plugin has to answer; defaults to 10 seconds */
  timeoutMs?: number;
}

// methods a browser sends cross-site without asking first; a logged-in user's
// cookie rides along on them, so they are refused from another origin
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function headersOf(req: express.Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    // the session cookie would let a sandboxed plugin act as the user
    if (k === 'cookie' || v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

function queryOf(req: express.Request): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(req.query)) {
    // the query parser also builds nested objects from `a[b]=c`; plugins get
    // plain values only
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && v.every(x => typeof x === 'string'))
      out[k] = v;
  }
  return out;
}

// body-parser leaves `{}` on a request without a body, so the headers decide
const hasBody = (req: express.Request) =>
  req.headers['content-length'] !== undefined ||
  req.headers['transfer-encoding'] !== undefined;

/** whether a browser sent this from a page on another site */
function crossOrigin(req: express.Request) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

function send(res: express.Response, out: PluginHttpResponse) {
  res.status(out.status ?? 200);
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  const body = out.body;
  if (body === undefined || body === null) return res.end();
  if (typeof body === 'string') {
    if (!res.getHeader('content-type')) res.type('text/plain');
    return res.send(body);
  }
  if (body instanceof Uint8Array) return res.send(Buffer.from(body));
  return res.json(body);
}

function timeout(ms: number) {
  return new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new HttpError(504, 'the plugin did not answer in time')),
      ms,
    ).unref(),
  );
}

/**
 * Routes `/<plugin name>/<path>` (mounted under /api/v1/plugin) to the plugin's
 * `http` handler. A web UI login is required unless the plugin's doc.json sets
 * `http.public`; either way the handler is told who is logged in.
 */
export function pluginHttpRouter(deps: PluginHttpDeps): express.Router {
  const router = express.Router();
  const limit = deps.timeoutMs ?? 10_000;

  router.all(
    ['/:plugin', '/:plugin/*'],
    express.text({
      type: ['text/*', 'application/x-www-form-urlencoded'],
      limit: '1mb',
    }),
    asyncRoute(async (req, res) => {
      const plugin = deps.findPlugin(req.params.plugin);
      if (!plugin?.isLoaded()) throw new HttpError(404, 'no such plugin');

      const found = req.session?.mfaPending
        ? null
        : await deps.findUser(req.session?.userId);
      const user =
        found && !found.isBanned
          ? { id: found.id, username: found.username }
          : null;
      const isPublic = plugin.getDocumentation()?.http?.public === true;
      if (!isPublic && !user) throw new HttpError(401, 'unauthorized');
      if (!isPublic && UNSAFE.has(req.method) && crossOrigin(req))
        throw new HttpError(403, 'cross-origin request');

      const request: PluginHttpRequest = {
        method: req.method,
        path: '/' + (req.params[0] ?? ''),
        query: queryOf(req),
        headers: headersOf(req),
        body: hasBody(req) ? req.body : undefined,
        user,
        ip: req.ip ?? '',
      };

      let out: PluginHttpResponse | undefined;
      try {
        out = await Promise.race([plugin.http(request), timeout(limit)]);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        Logger.errorp(plugin.getName(), 'error in http handler', err);
        throw new HttpError(500, 'plugin error');
      }
      if (!out) throw new HttpError(404, 'not found');
      send(res, out);
    }),
  );
  return router;
}
