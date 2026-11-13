// Bundles a TypeScript plugin entry into one CommonJS file, for both the safe
// (omegga.plugin.ts) and unsafe (omegga.main.ts) node loaders.

import Logger from '@/logger';
import { mkdir } from '@util/file';
import 'colors';
import fs from 'node:fs';
import path from 'node:path';
import webpack, { type ExternalItemFunctionData, type Stats } from 'webpack';

/** Where a plugin's build output and webpack cache live, inside the plugin. */
export const PLUGIN_BUILD_DIR = '.build';

interface PluginBuildMessage {
  moduleName?: string;
  file?: string;
  message: string;
}

interface PluginBuildResult {
  /** the bundle; written even when `errors` is non-empty, if webpack got that far */
  output: string;
  errors: PluginBuildMessage[];
  warnings: PluginBuildMessage[];
}

export interface PluginBuildOptions {
  /**
   * Hand back a bundle webpack reported errors for, as safe plugins always
   * have. Off, a bundle with errors is not started.
   */
  allowErrors?: boolean;
  /**
   * Name source map entries by the sources' absolute paths, so Node's own
   * source map support (unsafe plugins run in omegga's process) points stack
   * traces at the plugin's .ts files. Without it they read `webpack://...`.
   */
  absoluteSourcePaths?: boolean;
}

/**
 * Build a typed plugin for its loader: bundle `entry` (relative to the plugin)
 * into `.build/<outFile>`, log what webpack reports under the plugin's name,
 * and refresh the plugin's omegga.d.ts. Returns the bundle's path, or
 * undefined when there is nothing to run.
 *
 * The plugin's own sources (relative imports and the `src` alias) are compiled
 * into the bundle with swc, which strips types without checking them; bare
 * specifiers (node builtins and node_modules packages) stay runtime
 * `require`s, so native and wasm dependencies load through Node. Rebuilds hit
 * a filesystem cache in `.build/.cache`.
 */
export async function buildTypedPlugin(
  name: string,
  pluginPath: string,
  entry: string,
  outFile: string,
  { allowErrors = false, absoluteSourcePaths = false }: PluginBuildOptions = {},
): Promise<string | undefined> {
  let result: PluginBuildResult;
  try {
    result = await bundle(pluginPath, entry, outFile, absoluteSourcePaths);
  } catch (e) {
    Logger.errorp(name.brightRed, 'failed building typescript', e);
    return undefined;
  }
  for (const w of result.warnings)
    Logger.warnp(
      name.brightYellow,
      w.moduleName ?? '',
      w.file ?? '',
      w.message,
    );
  for (const e of result.errors)
    Logger.errorp(name.brightRed, e.moduleName ?? '', e.file ?? '', e.message);
  if (result.errors.length && !allowErrors) return undefined;

  try {
    updateOmeggaTypes(pluginPath);
  } catch (e) {
    Logger.warnp(
      name.brightYellow,
      'error copying latest omegga.d.ts to typescript plugin',
      e,
    );
  }
  return result.output;
}

async function bundle(
  pluginPath: string,
  entry: string,
  outFile: string,
  absoluteSourcePaths: boolean,
): Promise<PluginBuildResult> {
  // webpack resolves a relative entry against `context`, which is omegga's
  pluginPath = path.resolve(pluginPath);
  const buildPath = path.join(pluginPath, PLUGIN_BUILD_DIR);
  mkdir(buildPath);
  mkdir(path.join(buildPath, '.cache'));

  const stats = await new Promise<Stats>((resolve, reject) => {
    webpack(
      Object.freeze({
        target: 'node',
        // loaders (swc-loader) resolve from omegga's own node_modules
        context: __dirname,
        mode: fs.existsSync(path.resolve(pluginPath, '.development'))
          ? 'development'
          : 'production',
        entry: path.join(pluginPath, entry),
        devtool: 'source-map',
        output: {
          iife: false,
          library: {
            type: 'commonjs',
          },
          path: buildPath,
          filename: outFile,
          ...(absoluteSourcePaths
            ? { devtoolModuleFilenameTemplate: '[absolute-resource-path]' }
            : {}),
        },
        externals: [
          function (
            { request }: ExternalItemFunctionData,
            callback: (err?: Error | null, result?: string) => void,
          ) {
            if (request === undefined) return callback();
            // native addons: resolve the .node binary relative to the plugin
            if (request.match(/\.node$/)) {
              return callback(
                null,
                'commonjs ' + path.resolve(pluginPath, request),
              );
            }
            // bundle the plugin's own sources: relative/absolute imports and
            // the `src` alias all stay in the bundle
            if (
              request.startsWith('.') ||
              request === 'src' ||
              request.startsWith('src/') ||
              path.isAbsolute(request)
            ) {
              return callback();
            }
            // everything else is a bare specifier (a node builtin or a
            // node_modules package). Leave it as a runtime require instead
            // of bundling it, so native/wasm dependencies (dockerode, ssh2,
            // grpc, ...) load via real node. A safe plugin's NodeVM permits
            // these via `external: true` and the plugin's access list.
            callback(null, 'commonjs ' + request);
          },
        ],
        resolve: {
          extensions: ['.ts', '.js', '.json', '.node'],
          alias: {
            // src is the only hard coded path
            src: path.resolve(pluginPath, 'src'),
          },
        },
        cache: {
          type: 'filesystem' as const,
          cacheLocation: path.join(buildPath, '.cache'),
          allowCollectingMemory: false,
          idleTimeout: 0,
          idleTimeoutForInitialStore: 0,
          // cache age is one week. plugins probably do not need
          // to be rebuilt every day
          maxAge: 1000 * 60 * 60 * 24 * 7,
          profile: true,
        },
        module: {
          rules: [
            {
              test: /\.[jt]s$/,
              exclude: /(node_modules)/,
              use: {
                loader: 'swc-loader',
                options: {
                  sourceMaps: true,
                  cwd: pluginPath,
                  isModule: true,
                  jsc: {
                    target: 'es2020',
                    parser: {
                      syntax: 'typescript',
                    },
                    transform: {},
                  },

                  module: {
                    type: 'commonjs',
                    strictMode: false,
                  },
                },
              },
            },
          ],
        },
      }),
      (err, stats) =>
        err || !stats
          ? reject(err ?? new Error('webpack produced no stats'))
          : resolve(stats),
    );
  });

  const json = stats.toJson({ errors: true, warnings: true });
  return {
    output: path.join(buildPath, outFile),
    errors: json.errors ?? [],
    warnings: json.warnings ?? [],
  };
}

/** omegga.d.ts as shipped with this omegga, for typed plugins. */
const OMEGGA_TYPES = path.join(
  __dirname,
  '../../../templates/safe-ts/omegga.d.ts',
);

/**
 * Copy this omegga's omegga.d.ts into a typed plugin, when the plugin's
 * .gitignore lists it (so it is a generated copy, not the plugin's own file)
 * and the plugin's copy is older.
 */
function updateOmeggaTypes(pluginPath: string) {
  const gitIgnore = path.join(pluginPath, '.gitignore');
  const dst = path.join(pluginPath, 'omegga.d.ts');
  if (!fs.existsSync(gitIgnore) || !fs.existsSync(OMEGGA_TYPES)) return;
  if (!fs.readFileSync(gitIgnore, 'utf8').match(/(\.\/)?omegga\.d\.ts/)) return;

  const srcModified = fs.statSync(OMEGGA_TYPES).mtime.getTime();
  const dstModified = fs.existsSync(dst)
    ? fs.statSync(dst).mtime.getTime()
    : null;
  if (!dstModified || srcModified > dstModified) {
    fs.copyFileSync(OMEGGA_TYPES, dst);
  }
}
