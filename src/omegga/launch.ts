import Logger from '@/logger';
import { type IPluginLaunch } from '@/plugin';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Runtime check of a doc.json `launch` block (see IPluginLaunch); doc.json is
 * plugin-supplied JSON, so the declared type alone proves nothing.
 */
export const PluginLaunchSchema: z.ZodType<IPluginLaunch> = z
  .object({
    wrapper: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export interface LaunchOptions {
  /** outermost first: each wrapper runs the rest of the command */
  wrappers: string[];
  args: string[];
  env: Record<string, string>;
}

export interface LaunchSource {
  name: string;
  /** absolute plugin directory */
  dir: string;
  /** plugin format; sandboxed formats can't change the launch */
  format: string;
  launch: unknown;
}

// a wrapper runs native code next to the game, which would let a sandboxed
// plugin escape its sandbox
const SANDBOXED_FORMATS = new Set(['node_safe']);

/** `${pluginDir}` and `${dataDir}` are the only placeholders. */
function expand(value: string, pluginDir: string, dataDir: string) {
  return value
    .split('${pluginDir}')
    .join(pluginDir)
    .split('${dataDir}')
    .join(dataDir);
}

/**
 * Merge the launch blocks of the given plugins, in load order. Invalid blocks
 * are logged and skipped rather than failing the server start. Later plugins
 * win on env conflicts; wrappers nest with the first plugin outermost.
 */
export function collectLaunchOptions(
  sources: LaunchSource[],
  dataDir: string,
): LaunchOptions {
  const options: LaunchOptions = { wrappers: [], args: [], env: {} };

  for (const source of sources) {
    if (source.launch === undefined) continue;

    if (SANDBOXED_FORMATS.has(source.format)) {
      Logger.warn(
        'Ignoring launch options from sandboxed plugin',
        source.name.yellow,
      );
      continue;
    }

    const parsed = PluginLaunchSchema.safeParse(source.launch);
    if (!parsed.success) {
      Logger.warn(
        'Ignoring invalid launch options from plugin',
        source.name.yellow,
        parsed.error.message,
      );
      continue;
    }
    const launch = parsed.data;
    const dir = path.resolve(source.dir);

    if (launch.wrapper) {
      const wrapper = path.resolve(dir, launch.wrapper);
      if (!wrapper.startsWith(dir + path.sep)) {
        Logger.warn(
          'Ignoring launch options from plugin',
          source.name.yellow,
          '(wrapper is outside the plugin directory)',
        );
        continue;
      }
      try {
        fs.accessSync(wrapper, fs.constants.X_OK);
      } catch {
        Logger.warn(
          'Ignoring launch options from plugin',
          source.name.yellow,
          `(wrapper ${launch.wrapper} is missing or not executable)`,
        );
        continue;
      }
      options.wrappers.push(wrapper);
    }

    for (const arg of launch.args ?? [])
      options.args.push(expand(arg, dir, dataDir));
    for (const [key, value] of Object.entries(launch.env ?? {}))
      options.env[key] = expand(value, dir, dataDir);
  }

  return options;
}
