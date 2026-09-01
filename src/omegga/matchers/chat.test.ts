import EventEmitter from 'node:events';
import { describe, expect, it } from 'vitest';
import type Omegga from '../server';
import chat from './chat';

/** the matcher reads nothing off a player but its id and display name */
type FakePlayer = { id: string; displayName: string };

function fakeOmegga(players: FakePlayer[] = []): Omegga {
  const omegga = new EventEmitter() as unknown as Omegga;
  Object.assign(omegga, { players });
  return omegga;
}

/** shape a LogChat line the way the log parser hands it to a matcher */
function logMatch(data: string): RegExpMatchArray {
  return {
    groups: { generator: 'LogChat', data },
  } as unknown as RegExpMatchArray;
}

/** run one log line through the matcher and collect what it emitted */
function feed(line: string, players: FakePlayer[] = []) {
  const omegga = fakeOmegga(players);
  const events: [string, unknown[]][] = [];
  omegga.emit = (event: string, ...args: unknown[]) => {
    events.push([event, args]);
    return true;
  };

  const matcher = chat(omegga);
  const match = matcher.pattern('', logMatch(line));
  if (match) matcher.callback(match);
  return events;
}

const ADMIN = { id: 'admin-id', displayName: 'Admin' };

describe('the ban matcher', () => {
  it('emits a ban from the line the game actually logs', () => {
    // captured from a live server:
    //   LogChat: Someone was banned by Admin (reason), expires in 1 minute
    const events = feed(
      'Someone was banned by Admin (being rude), expires in 1 minute',
      [ADMIN],
    );
    expect(events).toEqual([
      ['ban', ['Someone', 'Admin', 'being rude', '1 minute']],
    ]);
  });

  it('emits a ban with no duration when the line carries no expiry', () => {
    const events = feed('Someone was banned by Admin (being rude)', [ADMIN]);
    expect(events).toEqual([
      ['ban', ['Someone', 'Admin', 'being rude', undefined]],
    ]);
  });

  it('does not require the banned player to be connected', () => {
    // unlike a kick, a ban can name someone who has never joined
    const events = feed(
      'Absent was banned by Admin (preemptive), expires in 1 hour',
      [ADMIN],
    );
    expect(events[0][0]).toBe('ban');
  });

  it('ignores a ban attributed to an unknown banner', () => {
    expect(feed('Someone was banned by Ghost (reason)', [ADMIN])).toEqual([]);
  });
});

describe('the kick matcher', () => {
  it('still emits a kick', () => {
    const events = feed('Someone was kicked by Admin (spamming)', [
      ADMIN,
      { id: 'someone-id', displayName: 'Someone' },
    ]);
    expect(events).toEqual([['kick', ['Someone', 'Admin', 'spamming']]]);
  });

  it('does not count a ban as a kick', () => {
    // the whole reason brickadia_players_banned_total exists: the kick pattern
    // never matched a ban, so bans went uncounted
    const events = feed(
      'Someone was banned by Admin (being rude), expires in 1 minute',
      [ADMIN, { id: 'someone-id', displayName: 'Someone' }],
    );
    expect(events.map(([name]) => name)).toEqual(['ban']);
  });
});
