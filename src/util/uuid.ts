import { randomUUID } from 'node:crypto';

// explicitly typed (rather than a bare re-export) so the generated plugin
// d.ts emits `() => string` instead of an unresolvable
// `typeof import("crypto").randomUUID`, keeping the template self-contained
export const random: () => string = randomUUID;

// regex pattern that matches uuids
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const match = (str: string) => !!str.match(UUID_PATTERN);
