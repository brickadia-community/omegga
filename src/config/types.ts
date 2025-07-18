export interface IServerConfig {
  webui?: boolean;
  port?: number;
  https?: boolean;
}

export interface IBrickadiaConfig {
  port: number;
  /** Map to load on startup if a world is not specified */
  map?: string;
  /** World file name to load on startup */
  world?: string;

  /** old launcher branch name */
  branch?: string;
  /** Steam beta name */
  steambeta?: string;
  /** Steam beta password */
  steambetaPassword?: string;

  name?: string;
  description?: string;
  password?: string;
  players?: number;

  publiclyListed?: boolean;
  welcomeMessage?: string;

  authDir?: string;
  savedDir?: string;
  launchArgs?: string;

  __LOCAL?: boolean;
  __LEGACY?: string;
}

export interface IConfig {
  omegga?: IServerConfig;
  server: IBrickadiaConfig;
  credentials?: {
    email?: string;
    password?: string;
    token?: string;
  };
}

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
