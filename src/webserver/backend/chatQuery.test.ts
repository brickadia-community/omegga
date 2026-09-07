import { describe, expect, it } from 'vitest';
import {
  formatChatFilter,
  isEmptyChatQuery,
  parseChatQuery,
  parseQueryDate,
  quoteChatValue,
} from './chatQuery';

describe('parseChatQuery', () => {
  it('treats bare words as search terms', () => {
    const q = parseChatQuery('hello there');
    expect(q.terms).toEqual(['hello', 'there']);
    expect(q.filters).toEqual([]);
  });

  it('keeps quoted phrases together', () => {
    expect(parseChatQuery('"hello there" world').terms).toEqual([
      'hello there',
      'world',
    ]);
  });

  it('parses from, before, after, and action', () => {
    const q = parseChatQuery('from:someone action:join after:2026-01-01 hi');
    expect(q.from).toEqual(['someone']);
    expect(q.actions).toEqual(['join']);
    expect(q.after).toBe(new Date(2026, 0, 1).getTime());
    expect(q.terms).toEqual(['hi']);
    expect(q.filters.map(f => f.key)).toEqual(['from', 'action', 'after']);
  });

  it('accepts a quoted value after a filter', () => {
    expect(parseChatQuery('from:"two words"').from).toEqual(['two words']);
  });

  it('keeps an unparseable filter as a search term', () => {
    const q = parseChatQuery('before:soon action:dance https://example.com');
    expect(q.before).toBeUndefined();
    expect(q.actions).toEqual([]);
    expect(q.terms).toEqual([
      'before:soon',
      'action:dance',
      'https://example.com',
    ]);
  });

  it('reads a trailing unterminated quote as the user types', () => {
    expect(parseChatQuery('"still typ').terms).toEqual(['still typ']);
  });

  it('ignores a filter key with nothing after it yet', () => {
    const q = parseChatQuery('from:');
    expect(q.terms).toEqual([]);
    expect(q.from).toEqual([]);
    expect(isEmptyChatQuery(q)).toBe(true);
  });

  it('keeps an unknown key with no value as a search term', () => {
    expect(parseChatQuery('http:').terms).toEqual(['http:']);
  });

  it('unions repeated filters instead of keeping only the last', () => {
    const q = parseChatQuery('from:one from:two action:join action:leave');
    expect(q.from).toEqual(['one', 'two']);
    expect(q.actions).toEqual(['join', 'leave']);
  });

  it('does not repeat a filter that was typed twice', () => {
    const q = parseChatQuery('action:join action:join');
    expect(q.actions).toEqual(['join']);
    expect(q.filters).toHaveLength(1);
  });

  it('collects role filters', () => {
    const q = parseChatQuery('role:Admin role:"Head Mod" hello');
    expect(q.roles).toEqual(['Admin', 'Head Mod']);
    expect(q.terms).toEqual(['hello']);
  });

  it('reads a bare admin: as any admin, unlike other bare filters', () => {
    const q = parseChatQuery('admin:');
    expect(q.adminAny).toBe(true);
    expect(q.admin).toEqual([]);
    expect(isEmptyChatQuery(q)).toBe(false);
    // every other filter key with nothing after it is still mid-typing
    expect(isEmptyChatQuery(parseChatQuery('from:'))).toBe(true);
  });

  it('collects admin names', () => {
    const q = parseChatQuery('admin:server admin:"Web Admin" hi');
    expect(q.admin).toEqual(['server', 'Web Admin']);
    expect(q.terms).toEqual(['hi']);
  });

  it('reports whether a query narrows anything', () => {
    expect(isEmptyChatQuery(parseChatQuery('   '))).toBe(true);
    expect(isEmptyChatQuery(parseChatQuery('from:x'))).toBe(false);
    expect(isEmptyChatQuery(parseChatQuery('word'))).toBe(false);
  });
});

describe('formatChatFilter', () => {
  it('round-trips a filter back through the parser', () => {
    const filter = parseChatQuery('from:Someone').filters[0];
    expect(formatChatFilter(filter)).toBe('from:Someone');
    expect(parseChatQuery(formatChatFilter(filter)).from).toEqual(['Someone']);
  });

  it('re-quotes a value that would otherwise split in two', () => {
    const filter = parseChatQuery('from:"two words"').filters[0];
    expect(formatChatFilter(filter)).toBe('from:"two words"');
    expect(parseChatQuery(formatChatFilter(filter)).from).toEqual([
      'two words',
    ]);
  });

  it('leaves a single word unquoted', () => {
    expect(quoteChatValue('word')).toBe('word');
  });
});

describe('parseQueryDate', () => {
  it('reads YYYY-MM-DD as local midnight', () => {
    expect(parseQueryDate('2026-03-04')).toBe(new Date(2026, 2, 4).getTime());
  });

  it('accepts a raw epoch', () => {
    expect(parseQueryDate('1700000000000')).toBe(1700000000000);
  });

  it('rejects nonsense', () => {
    expect(parseQueryDate('tomorrow')).toBeUndefined();
  });
});
