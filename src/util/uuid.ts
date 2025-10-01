export { randomUUID as random } from 'node:crypto';

// regex pattern that matches uuids
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const match = (str: string) => !!str.match(UUID_PATTERN);
