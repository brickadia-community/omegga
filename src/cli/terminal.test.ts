import Omegga from '@omegga/server';
import EventEmitter from 'events';
import { describe, expect, it } from 'vitest';
import Terminal from './terminal';

const stubOmegga = () =>
  Object.assign(new EventEmitter(), { started: false }) as unknown as Omegga;

describe('terminal', () => {
  it('does not throw when logging after readline closes', () => {
    const omegga = stubOmegga();
    const terminal = new Terminal(omegga);
    terminal.rl.close();

    expect(() => terminal.log('after close')).not.toThrow();
    expect(() => terminal.error('after close')).not.toThrow();
    // the 'error' handler prints through the terminal - a throw here rejects
    // omegga's uncaughtException handler and loops back into it forever
    expect(() => omegga.emit('error', new Error('boom'))).not.toThrow();
  });
});
