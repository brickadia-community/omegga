import type Omegga from '@omegga/server';
export type MatchGenerator<T> = (omegga: Omegga) => {
  pattern(line: string, logMatch: RegExpMatchArray): T;
  callback(match: T): void;
};
