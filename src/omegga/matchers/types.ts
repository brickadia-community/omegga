import type Omegga from '@omegga/server';
export type MatchGenerator<T> = (omegga: Omegga) => {
  pattern(line: string, logMatch: RegExpMatchArray): T | void;
  callback(match: T): void;
};
