import 'colors';
import { afterEach, describe, expect, it } from 'vitest';
import Logger from './logger';
import { type LogFileSink, type LogLevel } from '@util/logfile';

type Written = { level: LogLevel; text: string; when: Date };

const fakeSink = (written: Written[]): LogFileSink => ({
  write: (level, text, when) => written.push({ level, text, when }),
  close: () => {},
});

afterEach(() => {
  Logger.setFileSink(null);
  Logger.VERBOSE = false;
});

describe('Logger file capture', () => {
  it('records nothing until something asks it to', () => {
    const written: Written[] = [];
    Logger.record('log', ['dropped']);
    Logger.setFileSink(fakeSink(written));
    expect(written).toEqual([]);
  });

  it('replays what was buffered before the sink opened', () => {
    const written: Written[] = [];
    Logger.startCapture();
    Logger.record('log', ['first']);
    Logger.record('error', ['second']);
    Logger.setFileSink(fakeSink(written));

    expect(written.map(w => [w.level, w.text])).toEqual([
      ['log', 'first'],
      ['error', 'second'],
    ]);
  });

  it('keeps the time a buffered line happened, not the time it was flushed', async () => {
    const written: Written[] = [];
    Logger.startCapture();
    Logger.record('log', ['early']);
    const recordedAt = Date.now();
    await new Promise(resolve => setTimeout(resolve, 20));
    Logger.setFileSink(fakeSink(written));

    expect(written[0].when.getTime()).toBeLessThanOrEqual(recordedAt);
  });

  it('renders args at record time, before the caller can mutate them', () => {
    const written: Written[] = [];
    const args = { count: 1 };
    Logger.startCapture();
    Logger.record('log', ['count', args]);
    args.count = 2;
    Logger.setFileSink(fakeSink(written));

    expect(written[0].text).toBe('count { count: 1 }');
  });

  it('writes straight through once a sink exists', () => {
    const written: Written[] = [];
    Logger.setFileSink(fakeSink(written));
    Logger.record('warn', ['live']);
    expect(written).toEqual([
      expect.objectContaining({ level: 'warn', text: 'live' }),
    ]);
  });

  it('keeps buffered verbose lines only when the file asked for them', () => {
    const written: Written[] = [];
    Logger.startCapture();
    Logger.verbose('detail');
    Logger.log('ordinary');
    Logger.setFileSink(fakeSink(written), true);
    expect(written.map(w => w.text)).toEqual(['V> detail', 'ordinary']);
  });

  it('drops buffered verbose lines when the file did not', () => {
    const written: Written[] = [];
    Logger.startCapture();
    Logger.verbose('detail');
    Logger.log('ordinary');
    Logger.setFileSink(fakeSink(written));
    expect(written.map(w => w.text)).toEqual(['ordinary']);
  });

  it('records verbose straight through once the file asked for it', () => {
    const written: Written[] = [];
    Logger.setFileSink(fakeSink(written), true);
    Logger.verbose('detail');
    expect(written.map(w => w.text)).toEqual(['V> detail']);
  });

  it('records no verbose at all when neither side wants it', () => {
    const written: Written[] = [];
    Logger.setFileSink(fakeSink(written));
    Logger.verbose('detail');
    expect(written).toEqual([]);
  });

  it('drops the buffer when logging turns out to be disabled', () => {
    const written: Written[] = [];
    Logger.startCapture();
    Logger.record('log', ['dropped']);
    Logger.setFileSink(null);
    Logger.setFileSink(fakeSink(written));
    expect(written).toEqual([]);
  });
});
