import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crashReportArgs } from './server';

describe('crashReportArgs', () => {
  let dir: string;
  let binary: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'omegga-crash-'));
    binary = join(dir, 'BrickadiaServer-Linux-Shipping');
    // the build stamp as the game binary stores it, UTF-16LE
    writeFileSync(
      binary,
      Buffer.from('xxRelease-EA3 (PC-Shipping-CL16507)xx', 'utf16le'),
    );
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("passes Brickadia's switch with the binary's changelist", () => {
    expect(crashReportArgs(binary)).toEqual([
      '-nocrashreports',
      '-AllowCustomArchivesAndDisableCrashReporterForVersion=CL16507',
    ]);
  });

  it('falls back to -nocrashreports when the version is unknown', () => {
    expect(crashReportArgs(null)).toEqual(['-nocrashreports']);
    expect(crashReportArgs(join(dir, 'missing'))).toEqual(['-nocrashreports']);
  });
});
