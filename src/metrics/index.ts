/*
  The prometheus scrape endpoint.

  This is a standalone http server rather than a route on the web UI, so that
  metrics work with `omegga.webui: false` and can be bound to an interface (and
  a port) separate from the UI.
*/

import Logger from '@/logger';
import { type IMetricsConfig } from '@config/types';
import type Omegga from '@omegga/server';
import { METRICS_DEFAULTS } from '@/softconfig';
import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import {
  registerBrickadiaMetrics,
  type BrickadiaCollector,
} from './collectors/brickadia';
import { registerOmeggaMetrics } from './collectors/omegga';
import {
  registerChildProcessMetrics,
  registerDefaultMetrics,
} from './collectors/process';
import { PluginMetricsHost } from './plugin';
import { CONTENT_TYPE, render } from './render';
import { Registry, type ScalarSample } from './registry';

/** addresses that keep an unauthenticated endpoint off the network */
const LOOPBACK = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'];

export default class MetricsServer {
  omegga: Omegga;
  config: IMetricsConfig;
  registry = new Registry();
  plugins = new PluginMetricsHost((plugin, message) =>
    Logger.verbose('Plugin metrics'.grey, plugin.yellow, message),
  );
  /** collect failures in omegga's own metrics, counted rather than thrown */
  private collectErrors = 0;

  readonly bind: string;
  readonly port: number;
  readonly path: string;

  private server: http.Server | undefined;
  private brickadia: BrickadiaCollector | undefined;
  started = false;

  constructor(omegga: Omegga, config: IMetricsConfig) {
    this.omegga = omegga;
    this.config = config;
    this.bind = config.bind || METRICS_DEFAULTS.bind;
    this.port = config.port || METRICS_DEFAULTS.port;
    this.path = config.path || METRICS_DEFAULTS.path;
  }

  /** register every collector; separated from start() so tests can scrape */
  setup(): void {
    this.registry.onError = (metric, err) => {
      this.collectErrors++;
      Logger.verbose(
        'Metrics'.grey,
        `collector "${metric}" failed:`,
        err instanceof Error ? err.message : String(err),
      );
    };
    registerOmeggaMetrics(this.registry, this.omegga);
    this.brickadia = registerBrickadiaMetrics(
      this.registry,
      this.omegga,
      this.config,
    );
    registerChildProcessMetrics(this.registry, () => this.omegga.gamePid);
    if (this.config.defaultMetrics !== false) {
      registerDefaultMetrics(this.registry);
    }
    this.registerSelfMetrics();
  }

  private registerSelfMetrics(): void {
    this.scrapes = this.registry.counter({
      name: 'omegga_scrapes_total',
      help: 'Number of metrics scrapes served',
    });
    this.scrapeDuration = this.registry.histogram({
      name: 'omegga_scrape_duration_seconds',
      help: 'Time taken to collect and render a scrape',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
    });

    const pluginNames = () =>
      (this.omegga.pluginLoader?.plugins ?? []).map(p => p.getName());

    this.registry
      .gauge({
        name: 'omegga_plugin_metrics_series',
        help: 'Number of metric series each plugin is exporting',
        labels: ['plugin'],
      })
      .collect((): ScalarSample[] =>
        pluginNames().map(plugin => ({
          labels: { plugin },
          value: this.plugins.seriesCount(plugin),
        })),
      );

    this.registry
      .counter({
        name: 'omegga_plugin_metrics_dropped_total',
        help: 'Plugin metrics rejected for exceeding the cardinality limits',
        labels: ['plugin'],
      })
      .collect((): ScalarSample[] =>
        pluginNames().map(plugin => ({
          labels: { plugin },
          value: this.plugins.droppedCount(plugin),
        })),
      );

    this.registry
      .counter({
        name: 'omegga_plugin_metrics_errors_total',
        help: 'Plugin metric collect callbacks that threw and were skipped',
        labels: ['plugin'],
      })
      .collect((): ScalarSample[] =>
        pluginNames().map(plugin => ({
          labels: { plugin },
          value: this.plugins.errorCount(plugin),
        })),
      );

    this.registry
      .counter({
        name: 'omegga_metrics_collect_errors_total',
        help: 'Collectors that threw during a scrape and were skipped',
      })
      .collect(() => this.collectErrors);
  }

  private scrapes!: ReturnType<Registry['counter']>;
  private scrapeDuration!: ReturnType<Registry['histogram']>;

  async collect(): Promise<string> {
    const done = this.scrapeDuration.startTimer();
    // the only await here is the very first scrape, which may wait briefly for
    // an initial server status; every later one reads a cache
    await this.brickadia?.beforeScrape();
    // sort across both sources so scrape output is stable and grouped
    const families = [
      ...this.registry.snapshot(),
      ...(this.config.plugins === false ? [] : this.plugins.snapshot()),
    ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const body = render(families);
    done();
    this.scrapes.inc();
    return body;
  }

  private authorized(req: http.IncomingMessage): boolean {
    const { token } = this.config;
    if (!token) return true;
    const header = req.headers.authorization ?? '';
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(header);
    // timingSafeEqual throws on a length mismatch, which is itself a leak of
    // sorts, but a token's length is not the secret
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const path = (req.url ?? '').split('?')[0];
    if (path !== this.path || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found\n');
      return;
    }

    if (!this.authorized(req)) {
      res.writeHead(401, {
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Bearer',
      });
      res.end('unauthorized\n');
      return;
    }

    try {
      const body = await this.collect();
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPE,
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
      Logger.error('!>'.red, 'Error collecting metrics', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('error collecting metrics\n');
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.setup();

    if (!LOOPBACK.includes(this.bind) && !this.config.token) {
      Logger.warnp(
        'Metrics endpoint is bound to',
        this.bind.yellow,
        'without a token - anyone who can reach it can read your server metrics.',
      );
      Logger.warn(
        '  ',
        'Set',
        'metrics.token'.yellow,
        'or bind to',
        '127.0.0.1'.yellow,
        'and use a reverse proxy.',
      );
    }

    const server = http.createServer((req, res) => {
      this.handle(req, res).catch(err =>
        Logger.error('!>'.red, 'Unhandled metrics request error', err),
      );
    });
    this.server = server;

    await new Promise<void>(resolve => {
      // a metrics port clash must never stop a game server from booting
      server.once('error', (err: NodeJS.ErrnoException) => {
        Logger.errorp(
          'Could not start metrics server on',
          `${this.bind}:${this.port}`.yellow + ':',
          err.code === 'EADDRINUSE' ? 'address already in use' : err.message,
        );
        this.server = undefined;
        resolve();
      });
      server.listen(this.port, this.bind, () => {
        this.started = true;
        Logger.logp(
          'Metrics available at',
          `http://${this.bind}:${this.port}${this.path}`.green,
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    this.started = false;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
