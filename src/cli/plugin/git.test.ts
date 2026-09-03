import isoGit from 'isomorphic-git';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getPluginGit,
  hasGitBinary,
  resetPluginGit,
  type GitBackend,
} from './git';

const author = { name: 'omegga', email: 'omegga@example.com' };

/** a one-commit repo, built without either backend so both can be tested on it */
async function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omegga-git-test-'));
  await isoGit.init({ fs, dir, defaultBranch: 'main' });
  fs.writeFileSync(path.join(dir, 'plugin.js'), 'module.exports = {};\n');
  await isoGit.add({ fs, dir, filepath: 'plugin.js' });
  const sha = await isoGit.commit({ fs, dir, message: 'first', author });
  return { dir, sha };
}

const backends: GitBackend[] = hasGitBinary() ? ['js', 'bin'] : ['js'];

describe('plugin git backend selection', () => {
  beforeEach(() => resetPluginGit());
  afterEach(() => {
    delete process.env.OMEGGA_GIT;
    resetPluginGit();
  });

  it('honours OMEGGA_GIT', () => {
    process.env.OMEGGA_GIT = 'js';
    expect(getPluginGit().backend).toBe('js');
  });

  it('ignores a value that names no backend', () => {
    process.env.OMEGGA_GIT = 'maybe';
    expect(getPluginGit().backend).toBe(hasGitBinary() ? 'bin' : 'js');
  });

  it('prefers the binary when it is installed', () => {
    expect(getPluginGit().backend).toBe(hasGitBinary() ? 'bin' : 'js');
  });
});

describe.each(backends)('%s backend', backend => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;

  beforeEach(async () => {
    resetPluginGit();
    process.env.OMEGGA_GIT = backend;
    repo = await makeRepo();
  });

  afterEach(() => {
    delete process.env.OMEGGA_GIT;
    resetPluginGit();
    fs.rmSync(repo.dir, { recursive: true, force: true });
  });

  it('starts a repo in a plain directory', async () => {
    const git = getPluginGit();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omegga-init-'));
    expect(await git.isRepo(dir)).toBe(false);

    await git.init(dir);

    expect(await git.isRepo(dir)).toBe(true);
    // a fresh repo has a branch but no commit for HEAD to resolve to
    expect(await git.currentBranch(dir)).not.toBe(null);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recognises a repo and a plain directory', async () => {
    const git = getPluginGit();
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'omegga-plain-'));
    expect(await git.isRepo(repo.dir)).toBe(true);
    expect(await git.isRepo(plain)).toBe(false);
    fs.rmSync(plain, { recursive: true, force: true });
  });

  it('reports the checked out branch and commit', async () => {
    const git = getPluginGit();
    expect(await git.currentBranch(repo.dir)).toBe('main');
    expect(await git.headSha(repo.dir)).toBe(repo.sha);
  });

  it('counts a modified tracked file as dirty, but not an untracked one', async () => {
    const git = getPluginGit();
    expect(await git.isDirty(repo.dir)).toBe(false);

    fs.writeFileSync(path.join(repo.dir, 'notes.txt'), 'plugin scratch data\n');
    expect(await git.isDirty(repo.dir)).toBe(false);

    fs.appendFileSync(path.join(repo.dir, 'plugin.js'), '// edited\n');
    expect(await git.isDirty(repo.dir)).toBe(true);
  });

  it('counts a deleted tracked file as dirty', async () => {
    const git = getPluginGit();
    fs.rmSync(path.join(repo.dir, 'plugin.js'));
    expect(await git.isDirty(repo.dir)).toBe(true);
  });

  it('resets a modified tree back to a commit', async () => {
    const git = getPluginGit();
    const original = fs.readFileSync(path.join(repo.dir, 'plugin.js'), 'utf8');

    fs.appendFileSync(path.join(repo.dir, 'plugin.js'), '// edited\n');
    await git.resetTo(repo.dir, repo.sha);

    expect(await git.isDirty(repo.dir)).toBe(false);
    expect(await git.headSha(repo.dir)).toBe(repo.sha);
    expect(fs.readFileSync(path.join(repo.dir, 'plugin.js'), 'utf8')).toBe(
      original,
    );
  });
});
