import type Omegga from 'lib';
export type MatchGenerator<T> = (omegga: Omegga) => {
  pattern(line: string, logMatch: RegExpMatchArray): T;
  callback(match: T): void;
};
