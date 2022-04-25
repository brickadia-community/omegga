import _debounce from 'lodash/debounce';

export interface DebouncedFunc<T extends (...args: any[]) => any> {
  /**
   * Call the original function, but applying the debounce rules.
   *
   * If the debounced function can be run immediately, this calls it and returns its return
   * value.
   *
   * Otherwise, it returns the return value of the last invocation, or undefined if the debounced
   * function was not invoked yet.
   */
  (...args: Parameters<T>): ReturnType<T> | undefined;

  /**
   * Throw away any pending invocation of the debounced function.
   */
  cancel(): void;

  /**
   * If there is a pending invocation of the debounced function, invoke it immediately and return
   * its return value.
   *
   * Otherwise, return the value from the last invocation, or undefined if the debounced function
   * was never invoked.
   */
  flush(): ReturnType<T> | undefined;
}
export interface DebouncedFuncLeading<T extends (...args: any[]) => any>
  extends DebouncedFunc<T> {
  (...args: Parameters<T>): ReturnType<T>;
  flush(): ReturnType<T>;
}
export interface DebounceSettings {
  leading?: boolean | undefined;
  maxWait?: number | undefined;
  trailing?: boolean | undefined;
}
export interface DebounceSettingsLeading extends DebounceSettings {
  leading: true;
}
export const debounce:
  | (<T extends (...args: any) => any>(
      func: T,
      wait: number | undefined,
      options?: DebounceSettingsLeading
    ) => DebouncedFuncLeading<T>)
  | (<T extends (...args: any) => any>(
      func: T,
      wait?: number,
      options?: DebounceSettings
    ) => DebouncedFunc<T>) = _debounce;

const UNIT_CONVERSION: Record<string, number> = {
  ms: 1, // milliseconds
  s: 1000, // seconds
  m: 60 * 1000, // minutes
  h: 60 * 60 * 1000, // hours
  d: 24 * 60 * 60 * 1000, // days
  w: 7 * 24 * 60 * 60 * 1000, // weeks
};

// sum duration from a string like '1d 4h 3m 25s 30ms'
export function parseDuration(str: string) {
  let total = 0;

  // split string by spaces (0m 35s) -> [0m, 35s]
  const chunks = str.split(' ');

  // parse each chunk
  for (const chunk of chunks) {
    // extract the duration and unit from the chunk
    const [, duration, unit] = chunk.match(/^(\d+)(\w+)$/) || [];

    // ignore invalid chunks
    if (!duration || !unit || !UNIT_CONVERSION[unit]) continue;

    // add to the total the duration in MS
    total += Number(duration) * UNIT_CONVERSION[unit];
  }

  return total;
}

// parse brickadia's time format (YYYY.MM.DD-HH-MM-SS) into a time object
export function parseBrickadiaTime(str: string) {
  const [date, time] = str.split('-');
  return new Date(
    date.replace(/\./g, '-') + 'T' + time.replace(/\./g, ':')
  ).getTime();
}
