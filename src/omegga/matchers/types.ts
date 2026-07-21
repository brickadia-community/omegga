import type Omegga from '@omegga/server';
export type MatchGenerator<T> = (omegga: Omegga) => {
  // logMatch is null when the line is not a generic console log
  pattern(line: string, logMatch: RegExpMatchArray | null): T | null | void;
  callback(match: T): void;
};
