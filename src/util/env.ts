import Logger from '@/logger';
import 'colors';

/** parse a boolean from the environment, warning (and ignoring) when it isn't one */
export function parseEnvBool(name: string) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  Logger.warnp(`Ignoring ${name.yellow}: ${raw.yellow} is not a boolean`);
  return undefined;
}

/**
 * Whether omegga is allowed to block on an interactive prompt.
 *
 * Prompts are driven by raw key input, so anything that cannot deliver it
 * (a service manager with stdin on /dev/null, a panel console that submits
 * whole lines) waits at the prompt forever instead of failing. Callers that
 * would prompt should refuse instead when this is true.
 *
 * OMEGGA_NONINTERACTIVE overrides the guess in both directions: hosts that
 * allocate a real TTY but still cannot answer a prompt have to say so, and a
 * caller that really does feed stdin can set it to false.
 */
export function isNonInteractive(): boolean {
  return parseEnvBool('OMEGGA_NONINTERACTIVE') ?? !process.stdin.isTTY;
}
