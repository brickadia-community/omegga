/*
  Process and plugin error tallies.

  These are module-level rather than methods on the metrics server because the
  sites that record them (the uncaughtException handler, plugin loaders) run
  whether or not metrics are enabled, and some of them run before the metrics
  server exists. Recording is always cheap; only the exporter reads them.
*/

let uncaughtExceptions = 0;
let unhandledRejections = 0;
const pluginErrors = new Map<string, number>();

/** an exception reached `process.on('uncaughtException')` */
export function recordUncaughtException(): void {
  uncaughtExceptions++;
}

/** a promise rejection reached `process.on('unhandledRejection')` */
export function recordUnhandledRejection(): void {
  unhandledRejections++;
}

/** a plugin failed to load, unload, or reported a failure from its runtime */
export function recordPluginError(plugin: string): void {
  pluginErrors.set(plugin, (pluginErrors.get(plugin) ?? 0) + 1);
}

export function getUncaughtExceptions(): number {
  return uncaughtExceptions;
}

export function getUnhandledRejections(): number {
  return unhandledRejections;
}

export function getPluginErrors(plugin: string): number {
  return pluginErrors.get(plugin) ?? 0;
}

/** every plugin that has errored, including ones no longer loaded */
export function getErroredPlugins(): string[] {
  return [...pluginErrors.keys()];
}

/** test helper; production code only ever increments */
export function resetErrorCounts(): void {
  uncaughtExceptions = 0;
  unhandledRejections = 0;
  pluginErrors.clear();
}
