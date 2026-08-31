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
