import { describe, expect, it, vi } from 'vitest';
import { background, backgroundHandler } from './async';

const errors: unknown[][] = [];
const lastError = () => errors[errors.length - 1] ?? [];
vi.mock('@/logger', () => ({
  default: { errorp: (...args: unknown[]) => errors.push(args) },
}));

describe('background', () => {
  it('reports a rejection instead of letting it reach the process', async () => {
    const err = new Error('database is locked');
    background('Failed to log chat', Promise.reject(err));
    await new Promise(resolve => setImmediate(resolve));

    expect(lastError()).toContain('Failed to log chat');
    expect(lastError()).toContain(err);
  });
});

describe('backgroundHandler', () => {
  it('swallows a rejection from an event listener', async () => {
    const handler = backgroundHandler('Failed to log join', async () => {
      throw new Error('database is locked');
    });

    // an emitter calls a listener without awaiting it, so this must not throw
    // and must not leave a rejection behind
    expect(() => handler()).not.toThrow();
    await new Promise(resolve => setImmediate(resolve));
    expect(lastError()).toContain('Failed to log join');
  });

  it('passes its arguments through', async () => {
    const seen: unknown[] = [];
    const handler = backgroundHandler(
      'Failed',
      async (a: string, b: number) => {
        seen.push(a, b);
      },
    );
    handler('player', 2);
    await new Promise(resolve => setImmediate(resolve));

    expect(seen).toEqual(['player', 2]);
  });
});
