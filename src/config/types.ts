export interface IServerConfig {
  webui?: boolean;
  port?: number;
  https?: boolean;
}

export interface IBrickadiaConfig {
  port: number;
  map?: string;
  branch?: string;
  name?: string;
  description?: string;
  password?: string;
  players?: number;
  publiclyListed?: boolean;
  welcomeMessage?: string;

  __LOCAL?: boolean;
  __LEGACY?: string;
}

export interface IConfig {
  omegga?: IServerConfig;
  server: IBrickadiaConfig;
  credentials?: {
    email: string;
    password: string;
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
