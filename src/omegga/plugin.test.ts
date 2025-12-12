import { MockPlugin } from '@/test/mockPlugin';
import { mockOmegga } from '@/test/util';
import { describe, expect, it, test } from 'vitest';
import { PluginLoader } from './plugin';

describe('PluginLoader.calculateLoadOrder', () => {
  const omegga = mockOmegga();

  it('sorts unconfigured plugins by name', () => {
    const plugins = [
      new MockPlugin('h', omegga),
      new MockPlugin('g', omegga),
      new MockPlugin('d', omegga),
      new MockPlugin('f', omegga),
      new MockPlugin('e', omegga),
      new MockPlugin('c', omegga),
      new MockPlugin('b', omegga),
      new MockPlugin('a', omegga),
    ];
    const sorted = PluginLoader.calculateLoadOrder(plugins);

    // expect sorted to be ordered by name
    expect(sorted.map(p => p.getName())).toEqual(
      plugins.map(p => p.getName()).sort(),
    );
  });

  it('sorts unconfigured plugins by load priority', () => {
    const plugins = [
      new MockPlugin('a', omegga, { config: { loadPriority: 4 } }),
      new MockPlugin('b', omegga, { config: { loadPriority: 3 } }),
      new MockPlugin('c', omegga, { config: { loadPriority: 2 } }),
      new MockPlugin('d', omegga, { config: { loadPriority: 1 } }),
      new MockPlugin('e', omegga, { config: { loadPriority: 0 } }),
      new MockPlugin('f', omegga, { config: { loadPriority: -1 } }),
      new MockPlugin('g', omegga, { config: { loadPriority: -2 } }),
      new MockPlugin('h', omegga, { config: { loadPriority: -3 } }),
      new MockPlugin('i', omegga, { config: { loadPriority: -4 } }),
    ];
    const sorted = PluginLoader.calculateLoadOrder(plugins);

    expect(sorted.map(p => p.getName())).toEqual(
      plugins
        .slice()
        .sort(
          // ascending sort (lower loadPriority loads first)
          (a, b) => a.pluginConfig.loadPriority - b.pluginConfig.loadPriority,
        )
        .map(p => p.getName()),
    );
  });

  it('orders with loadBefore', () => {
    const plugins = [
      new MockPlugin('a', omegga, {}),
      new MockPlugin('b', omegga, { config: { loadBefore: ['a'] } }),
      new MockPlugin('c', omegga, { config: { loadBefore: ['b'] } }),
      new MockPlugin('d', omegga, { config: { loadBefore: ['c'] } }),
      new MockPlugin('e', omegga, { config: { loadBefore: ['d'] } }),
      new MockPlugin('f', omegga, { config: { loadBefore: ['e'] } }),
      new MockPlugin('g', omegga, { config: { loadBefore: ['f'] } }),
      new MockPlugin('h', omegga, { config: { loadBefore: ['g'] } }),
    ];
    const sorted = PluginLoader.calculateLoadOrder(plugins);

    expect(sorted.map(p => p.getName())).toEqual([
      'h',
      'g',
      'f',
      'e',
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  it('orders with loadAfter', () => {
    // reverse alphabetical order
    const plugins = [
      new MockPlugin('a', omegga, { config: { loadAfter: ['b'] } }),
      new MockPlugin('b', omegga, { config: { loadAfter: ['c'] } }),
      new MockPlugin('c', omegga, { config: { loadAfter: ['d'] } }),
      new MockPlugin('d', omegga, { config: { loadAfter: ['e'] } }),
      new MockPlugin('e', omegga, { config: { loadAfter: ['f'] } }),
      new MockPlugin('f', omegga, { config: { loadAfter: ['g'] } }),
      new MockPlugin('g', omegga, { config: { loadAfter: ['h'] } }),
      new MockPlugin('h', omegga, { config: { loadAfter: ['i'] } }),
      new MockPlugin('i', omegga, {}),
    ];
    const sorted = PluginLoader.calculateLoadOrder(plugins);

    expect(sorted.map(p => p.getName())).toEqual([
      'i',
      'h',
      'g',
      'f',
      'e',
      'd',
      'c',
      'b',
      'a',
    ]);
  });
});
