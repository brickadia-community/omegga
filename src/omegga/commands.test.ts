import { afterEach, describe, expect, it, vi } from 'vitest';
import Logger from '@/logger';
import {
  EA2_VERSION,
  migrateConsoleCommand,
  PREFAB_VERSION,
  resolveConsoleCommands,
} from './commands';

const RENAME_VERSION = 14349;

describe('resolveConsoleCommands', () => {
  it('resolves legacy names before the br. rename', () => {
    const cmds = resolveConsoleCommands(14000);
    expect(cmds.Bricks.Clear).toBe('Bricks.Clear');
    expect(cmds.Chat.Broadcast).toBe('Chat.Broadcast');
  });

  it('resolves br. prefixed names after the rename', () => {
    const cmds = resolveConsoleCommands(RENAME_VERSION);
    expect(cmds.Bricks.Clear).toBe('br.Bricks.Clear');
    expect(cmds.Chat.Broadcast).toBe('br.Chat.Broadcast');
  });

  it('exposes the prefab and world clear commands', () => {
    const cmds = resolveConsoleCommands(PREFAB_VERSION);
    expect(cmds.Prefab.Load).toBe('br.Prefab.Load');
    expect(cmds.Prefab.SaveRegion).toBe('br.Prefab.SaveRegion');
    expect(cmds.Prefab.GiveToPlayer).toBe('br.Prefab.GiveToPlayer');
    expect(cmds.World.ClearRegion).toBe('BR.World.ClearRegion');
    expect(cmds.World.ClearAll).toBe('BR.World.ClearAll');
  });

  it('unknown version resolves to the newest name', () => {
    const cmds = resolveConsoleCommands(-1);
    expect(cmds.Bricks.Clear).toBe('br.Bricks.Clear');
  });
});

describe('migrateConsoleCommand', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rewrites a stale command name to the running version name', () => {
    expect(migrateConsoleCommand('Bricks.Clear uuid 1', RENAME_VERSION)).toBe(
      'br.Bricks.Clear uuid 1',
    );
  });

  it('leaves already-correct and unknown commands untouched', () => {
    expect(migrateConsoleCommand('br.Bricks.Clear uuid', RENAME_VERSION)).toBe(
      'br.Bricks.Clear uuid',
    );
    expect(migrateConsoleCommand('SomePluginCommand foo', RENAME_VERSION)).toBe(
      'SomePluginCommand foo',
    );
  });

  it('warns once when a removed command is invoked on a newer server', () => {
    const warn = vi.spyOn(Logger, 'warnp').mockImplementation(() => undefined);
    // unique command so the module-level dedupe set doesn't hide the warning
    migrateConsoleCommand('br.Bricks.Save "a"', PREFAB_VERSION);
    migrateConsoleCommand('br.Bricks.Save "b"', PREFAB_VERSION);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/removed in Brickadia/i);
  });

  it('does not warn about removed commands on older servers', () => {
    const warn = vi.spyOn(Logger, 'warnp').mockImplementation(() => undefined);
    migrateConsoleCommand('br.Bricks.SaveRegion "a" 0 0 0 1 1 1', 14400);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns for LoadTemplate removed at EA2 but not on pre-EA2 servers', () => {
    const warn = vi.spyOn(Logger, 'warnp').mockImplementation(() => undefined);
    migrateConsoleCommand('Bricks.LoadTemplate "a" 0 0 0', EA2_VERSION - 1);
    expect(warn).not.toHaveBeenCalled();
    migrateConsoleCommand('Bricks.LoadTemplate "a" 0 0 0', PREFAB_VERSION);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
