import Logger from '@/logger';
import soft, { METRICS_DEFAULTS } from '@/softconfig';
import { parseEnvBool } from '@util/env';
import 'colors';
import Configstore from 'configstore';
import fs from 'node:fs';
import path from 'node:path';
import format_js from './formats/format_js';
import format_yaml from './formats/format_yml';
import reader from './reader';
import { type IConfig, type IConfigFormat } from './types';
import writer from './writer';
export * from './types';

export const store = new Configstore(
  soft.PROJECT_NAME,
  {
    defaultOmegga: '.',
    legacyBin: '',
  },
  {
    globalConfigPath: true,
  },
);

// find all format_EXT.js files in the formats path
const formats: IConfigFormat[] = [format_js, format_yaml];

// create read/write funcs for the provided formats
export const defaultConfig: IConfig = {
  omegga: {
    webui: true,
    port: process.env.OMEGGA_PORT
      ? Number(process.env.OMEGGA_PORT)
      : soft.DEFAULT_PORT,
    https: true,
  },
  server: {
    port: process.env.BRICKADIA_PORT
      ? Number(process.env.BRICKADIA_PORT)
      : 7777,
    map: 'Plate',
  },
  metrics: {
    enabled: false,
    bind: METRICS_DEFAULTS.bind,
    port: METRICS_DEFAULTS.port,
  },
};

/** parse a port from the environment, warning (and ignoring) when it isn't one */
function parseEnvPort(name: string) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const port = Number(raw);
  if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  Logger.warnp(`Ignoring ${name.yellow}: ${raw.yellow} is not a port`);
  return undefined;
}

/** parse a positive number of seconds, warning (and ignoring) when it isn't one */
function parseEnvSeconds(name: string) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  Logger.warnp(`Ignoring ${name.yellow}: ${raw.yellow} is not a duration`);
  return undefined;
}

/** parse an http(s) URL, warning (and ignoring) when it isn't one */
function parseEnvUrl(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return raw;
  } catch {
    // fall through to the warning
  }
  Logger.warnp(`Ignoring ${name.yellow}: ${raw.yellow} is not an http URL`);
  return undefined;
}

/**
 * Parse a prometheus label value. The same restriction the config schema
 * applies, repeated here because environment overrides land after the schema
 * has already validated the file.
 */
function parseEnvLabel(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  if (/^[A-Za-z0-9_.:-]+$/.test(raw)) return raw;
  Logger.warnp(
    `Ignoring ${name.yellow}: ${raw.yellow} is not a valid label value`,
  );
  return undefined;
}

/**
 * Apply `OMEGGA_PORT` and `BRICKADIA_PORT` on top of a loaded config. A
 * container's config file lives in a mounted volume that can't be templated,
 * so the environment has to be able to win.
 */
export function applyPortOverrides(conf: IConfig): IConfig {
  const omeggaPort = parseEnvPort('OMEGGA_PORT');
  if (omeggaPort) conf.omegga = { ...conf.omegga, port: omeggaPort };

  const serverPort = parseEnvPort('BRICKADIA_PORT');
  if (serverPort) conf.server = { ...conf.server, port: serverPort };

  return conf;
}

/**
 * Apply `METRICS_ENABLED`, `METRICS_BIND`, and `METRICS_PORT` on top of a
 * loaded config, for the same reason `applyPortOverrides` exists: a container
 * can't template the config file in its mounted volume.
 */
export function applyMetricsOverrides(conf: IConfig): IConfig {
  const enabled = parseEnvBool('METRICS_ENABLED');
  if (enabled != null) conf.metrics = { ...conf.metrics, enabled };

  const bind = process.env.METRICS_BIND?.trim();
  if (bind) conf.metrics = { ...conf.metrics, bind };

  const port = parseEnvPort('METRICS_PORT');
  if (port) conf.metrics = { ...conf.metrics, port };

  const prometheus = { ...conf.metrics?.prometheus };
  let touched = false;
  const set = <K extends keyof typeof prometheus>(
    key: K,
    value: (typeof prometheus)[K] | undefined,
  ) => {
    if (value == null) return;
    prometheus[key] = value;
    touched = true;
  };

  set('enabled', parseEnvBool('METRICS_PROMETHEUS_ENABLED'));
  set('url', parseEnvUrl('METRICS_PROMETHEUS_URL'));
  set('instance', parseEnvLabel('METRICS_PROMETHEUS_INSTANCE'));
  set('timeout', parseEnvSeconds('METRICS_PROMETHEUS_TIMEOUT'));

  if (touched) conf.metrics = { ...conf.metrics, prometheus };

  return conf;
}

// Writes save data to a file
export const write = writer(formats);

// reads save data from a file
export const read = reader(formats);

// open config at a specified path
export const find = (dir = '.') => {
  // find the first config file matching these config file names
  for (const f of soft.CONFIG_FILENAMES) {
    for (const { extension } of formats) {
      const file = path.join(dir, f + '.' + extension);
      if (fs.existsSync(file)) return file;
    }
  }

  return undefined;
};

export * from './types';

export default {
  store,
  write,
  read,
  find,
  defaultConfig,
  formats,
  applyPortOverrides,
  applyMetricsOverrides,
};
