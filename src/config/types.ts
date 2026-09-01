import { z } from 'zod';

export const ServerConfigSchema = z.object({
  webui: z.boolean().optional(),
  port: z.number().optional(),
  https: z.boolean().optional(),
  plugins: z.boolean().optional(),
  singleUser: z.boolean().optional(),
  debug: z.boolean().optional(),
});

export const BrickadiaConfigSchema = z.object({
  port: z.number(),
  map: z.string().optional(),
  world: z.string().optional(),
  branch: z.string().optional(),
  steambeta: z.string().optional(),
  steambetaPassword: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  password: z.string().optional(),
  players: z.number().optional(),
  publiclyListed: z.boolean().optional(),
  welcomeMessage: z.string().optional(),
  authDir: z.string().optional(),
  savedDir: z.string().optional(),
  launchArgs: z.string().optional(),
  remoteFiles: z.boolean().optional(),
  __LOCAL: z.boolean().optional(),
  __LEGACY: z.string().optional(),
});

export const TerminalConfigSchema = z.object({
  timestamp: z.string().optional(),
});

/**
 * Reading metrics back out of a prometheus that scrapes omegga, to render the
 * web UI's metrics dashboards. Independent of the endpoint omegga serves: the
 * scraper may live elsewhere, and the endpoint is useful without a dashboard.
 */
export const PrometheusConfigSchema = z.object({
  /** show the metrics dashboards in the web UI */
  enabled: z.boolean().optional(),
  /** base URL of the prometheus HTTP API */
  url: z.string().optional(),
  /**
   * value of the `instance` label identifying this omegga's series. Queries go
   * unfiltered without it, which renders every scraped server's numbers at
   * once. Restricted to label-safe characters because it is interpolated into
   * PromQL, and a prometheus generally scrapes far more than one omegga.
   */
  instance: z
    .string()
    .regex(
      /^[A-Za-z0-9_.:-]+$/,
      'must contain only letters, numbers, and _ . : -',
    )
    .optional(),
  /** seconds before a query is abandoned */
  timeout: z.number().positive().optional(),
  /** seconds a dashboard's results are reused between requests */
  cacheSeconds: z.number().nonnegative().optional(),
  /** how many days back the range picker may reach */
  retentionDays: z.number().positive().optional(),
});

export const MetricsConfigSchema = z.object({
  /** serve a prometheus scrape endpoint */
  enabled: z.boolean().optional(),
  /** address to bind; defaults to loopback since the endpoint is unauthenticated */
  bind: z.string().optional(),
  port: z.number().optional(),
  path: z.string().optional(),
  /** when set, scrapes must send `Authorization: Bearer <token>` */
  token: z.string().optional(),
  /** export the standard `process_` and `nodejs_` metrics for omegga itself */
  defaultMetrics: z.boolean().optional(),
  /** seconds a cached server status may age before a scrape refreshes it */
  statusMaxAge: z.number().optional(),
  /** allow plugins to register their own metrics */
  plugins: z.boolean().optional(),
  /** query a prometheus to power the web UI's metrics dashboards */
  prometheus: PrometheusConfigSchema.optional(),
});

export const CredentialsSchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
});

export const ConfigSchema = z.object({
  omegga: ServerConfigSchema.optional(),
  server: BrickadiaConfigSchema,
  terminal: TerminalConfigSchema.optional(),
  metrics: MetricsConfigSchema.optional(),
  credentials: CredentialsSchema.optional(),
  __STEAM: z.boolean().optional(),
});

export type IServerConfig = z.infer<typeof ServerConfigSchema>;
export type IBrickadiaConfig = z.infer<typeof BrickadiaConfigSchema>;
export type IMetricsConfig = z.infer<typeof MetricsConfigSchema>;
export type IPrometheusConfig = z.infer<typeof PrometheusConfigSchema>;
export type IConfig = z.infer<typeof ConfigSchema>;

export type IConfigFormat = {
  extension: string;
  writer: (blob: IConfig) => string;
} & (
  | {
      encoding: 'string';
      reader: (str: string) => IConfig;
    }
  | {
      encoding: 'buffer';
      reader: (str: Buffer) => IConfig;
    }
);
