import Logger from '@/logger';

/**
 * Report a rejection from a promise nobody awaits. Without this the rejection
 * reaches omegga's `unhandledRejection` handler, which rethrows to keep the
 * crash behaviour of an uncaught exception: a failed chat log write would stop
 * the game server.
 */
export function background(what: string, promise: Promise<unknown>) {
  promise.catch(err => Logger.errorp(what, err));
}

/** An async event listener whose rejection is reported rather than thrown. */
export function backgroundHandler<A extends unknown[]>(
  what: string,
  fn: (...args: A) => Promise<unknown>,
): (...args: A) => void {
  return (...args: A) => background(what, fn(...args));
}
