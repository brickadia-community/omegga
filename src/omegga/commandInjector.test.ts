import { describe, expect, it } from 'vitest';
import commandInjector from './commandInjector';
import type LogWrangler from './logWrangler';
import { type IServerStatus } from './types';

/**
 * Run `getServerStatus` against a canned `br.Server.Status` transcript. The
 * command reads `l[1]` of each watched line, so each entry is faked as a match
 * whose first group is the log content.
 */
async function parseStatus(lines: string[]): Promise<IServerStatus | null> {
  const wrangler = {
    omegga: { Console: { Server: { Status: 'br.Server.Status' } } },
    watchLogChunk: async () =>
      lines.map(line => [line, line] as unknown as RegExpMatchArray),
  };
  const target = {} as { getServerStatus(): Promise<IServerStatus | null> };
  commandInjector(target as never, wrangler as unknown as LogWrangler);
  return target.getServerStatus();
}

// the current status header format, with synthetic values
const EMPTY_STATUS = [
  'Server Name: Test Server',
  'Description: ',
  'Bricks: 62575',
  'Components: 44993',
  'Time: 0m 53s',
  'Players (0/50):',
  '* Name | Ping | Time | Roles | Address | ID',
];

// the same format with one player connected. the table is fixed-width: each
// column is padded to its widest cell, and the parser derives the column
// widths from the header, so header and row padding have to agree
const POPULATED_STATUS = [
  'Server Name: Test Server',
  'Description: a description',
  'Bricks: 62575',
  'Components: 44993',
  'Time: 1m 47s',
  'Players (1/50):',
  '* Name       |  Ping |   Time | Roles                                      | Address  | ID                                  ',
  '* TestPlayer | 182ms | 0m 47s | Admin, Moderator, Builder, Trusted, Member | 12.3.4.5 | 00000000-0000-4000-8000-000000000001',
];

describe('getServerStatus', () => {
  it('parses the current status header', async () => {
    const status = await parseStatus(EMPTY_STATUS);
    expect(status).toMatchObject({
      serverName: 'Test Server',
      description: '',
      bricks: 62575,
      components: 44993,
      maxPlayers: 50,
    });
    // 53 seconds
    expect(status?.time).toBe(53000);
    expect(status?.players).toEqual([]);
  });

  it('collects every integer header line as a stat', async () => {
    const status = await parseStatus(EMPTY_STATUS);
    expect(status?.stats).toEqual({ bricks: 62575, components: 44993 });
  });

  it('picks up stats the game did not report before, like entities', async () => {
    // the whole point of parsing by key: a new header line becomes a metric
    // with no parser change
    const status = await parseStatus([
      'Server Name: test',
      'Description: ',
      'Bricks: 10',
      'Components: 20',
      'Entities: 30',
      'Wire Graphs: 40',
      'Time: 0m 1s',
      'Players (0/50):',
    ]);
    expect(status?.stats).toEqual({
      bricks: 10,
      components: 20,
      entities: 30,
      wire_graphs: 40,
    });
  });

  it('survives a header line being inserted before bricks', async () => {
    const status = await parseStatus([
      'Server Name: test',
      'Description: ',
      'Something New: hello',
      'Bricks: 10',
      'Components: 20',
      'Time: 0m 1s',
      'Players (0/50):',
    ]);
    expect(status?.serverName).toBe('test');
    expect(status?.bricks).toBe(10);
  });

  it('excludes the text and duration lines from stats', async () => {
    // a purely numeric description must not become a stat
    const status = await parseStatus([
      'Server Name: 12345',
      'Description: 67890',
      'Bricks: 10',
      'Time: 0m 1s',
      'Players (0/50):',
    ]);
    expect(status?.stats).toEqual({ bricks: 10 });
    expect(status?.description).toBe('67890');
  });

  it('parses the player table', async () => {
    const status = await parseStatus(POPULATED_STATUS);
    expect(status?.maxPlayers).toBe(50);
    expect(status?.players).toEqual([
      {
        name: 'TestPlayer',
        ping: 182,
        time: 47000,
        roles: ['Admin', 'Moderator', 'Builder', 'Trusted', 'Member'],
        address: '12.3.4.5',
        id: '00000000-0000-4000-8000-000000000001',
      },
    ]);
  });

  it('reports a missing stat as absent rather than as zero in stats', async () => {
    // `bricks`/`components` keep their zero fallback for existing consumers,
    // but the metrics exporter only emits gauges for stats actually present
    const status = await parseStatus([
      'Server Name: test',
      'Description: ',
      'Time: 0m 1s',
      'Players (0/50):',
    ]);
    expect(status?.bricks).toBe(0);
    expect(status?.stats).toEqual({});
  });

  it('returns null when the block never appeared', async () => {
    expect(await parseStatus([])).toBeNull();
    expect(await parseStatus(['something unrelated'])).toBeNull();
  });

  it('returns null when the uptime line is missing', async () => {
    expect(
      await parseStatus(['Server Name: test', 'Description: ', 'Bricks: 1']),
    ).toBeNull();
  });

  it('parses a header with no player table at all', async () => {
    const status = await parseStatus([
      'Server Name: test',
      'Description: ',
      'Bricks: 1',
      'Time: 0m 1s',
    ]);
    expect(status?.bricks).toBe(1);
    expect(status?.maxPlayers).toBeUndefined();
  });
});
