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
  __LOCAL: z.boolean().optional(),
  __LEGACY: z.string().optional(),
});

export const CredentialsSchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
});

export const ConfigSchema = z.object({
  omegga: ServerConfigSchema.optional(),
  server: BrickadiaConfigSchema,
  credentials: CredentialsSchema.optional(),
  __STEAM: z.boolean().optional(),
});

export type IServerConfig = z.infer<typeof ServerConfigSchema>;
export type IBrickadiaConfig = z.infer<typeof BrickadiaConfigSchema>;
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
