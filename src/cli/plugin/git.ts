import Logger from '@/logger';
import 'colors';
import hasbin from 'hasbin';
import isoGit from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';
import path from 'node:path';
import simpleGit, { ResetMode } from 'simple-git';

/**
 * Which implementation of git the plugin commands run on.
 *
 * `bin` shells out to the git binary, `js` uses isomorphic-git, which speaks
 * the same on-disk format: a plugin cloned by one can be updated by the other.
 */
export type GitBackend = 'bin' | 'js';

/** the git operations plugin install, update, and check need */
export interface PluginGit {
  backend: GitBackend;
  isRepo(dir: string): Promise<boolean>;
  /** start a repo in an existing directory, as `git init` does */
  init(dir: string): Promise<void>;
  clone(url: string, dir: string): Promise<void>;
  /**
   * Whether a tracked file has been modified, staged, or deleted. Untracked
   * files do not count: plugins routinely write next to their own source.
   */
  isDirty(dir: string): Promise<boolean>;
  currentBranch(dir: string): Promise<string | null>;
  headSha(dir: string): Promise<string>;
  /** bring remote refs up to date without touching the working tree */
  fetch(dir: string): Promise<void>;
  /**
   * How the checked out branch stands against its upstream, or null when it
   * has no upstream to stand against. Call `fetch` first.
   */
  compareUpstream(
    dir: string,
  ): Promise<{ ahead: boolean; behind: boolean } | null>;
  /** advance the checked out branch to its upstream, refusing to merge */
  fastForward(dir: string): Promise<void>;
  /** move the branch back to a commit and match the working tree to it */
  resetTo(dir: string, sha: string): Promise<void>;
}

const binGit: PluginGit = {
  backend: 'bin',

  async isRepo(dir) {
    if (!fs.existsSync(dir)) return false;
    try {
      return await simpleGit(dir).checkIsRepo();
    } catch {
      return false;
    }
  },

  async init(dir) {
    await simpleGit(dir).init();
  },

  async clone(url, dir) {
    await simpleGit(dir).clone(url, dir);
  },

  async isDirty(dir) {
    const status = await simpleGit(dir).status();
    return status.files.some(f => f.working_dir !== '?');
  },

  async currentBranch(dir) {
    const current = (await simpleGit(dir).branch()).current;
    if (current) return current;
    // a repo with no commits yet reports no branch, though HEAD still points
    // at the one the first commit would land on
    try {
      const ref = await simpleGit(dir).raw(['symbolic-ref', '--short', 'HEAD']);
      return ref.trim() || null;
    } catch {
      return null;
    }
  },

  async headSha(dir) {
    return (await simpleGit(dir).revparse(['HEAD'])).trim();
  },

  async fetch(dir) {
    await simpleGit(dir).fetch();
  },

  async compareUpstream(dir) {
    const status = await simpleGit(dir).status();
    if (!status.tracking) return null;
    return { ahead: status.ahead > 0, behind: status.behind > 0 };
  },

  async fastForward(dir) {
    await simpleGit(dir).pull(['--ff-only']);
  },

  async resetTo(dir, sha) {
    await simpleGit(dir).reset(ResetMode.HARD, [sha]);
  },
};

const jsGit: PluginGit = {
  backend: 'js',

  async isRepo(dir) {
    return fs.existsSync(path.join(dir, '.git'));
  },

  async init(dir) {
    await isoGit.init({ fs, dir });
  },

  async clone(url, dir) {
    await isoGit.clone({ fs, http, dir, url });
  },

  async isDirty(dir) {
    // rows are [filepath, head, workdir, stage]; head 0 means untracked
    const rows = await isoGit.statusMatrix({ fs, dir });
    return rows.some(
      ([, head, workdir, stage]) =>
        head !== 0 && (head !== workdir || head !== stage),
    );
  },

  async currentBranch(dir) {
    return (await isoGit.currentBranch({ fs, dir, fullname: false })) ?? null;
  },

  async headSha(dir) {
    return await isoGit.resolveRef({ fs, dir, ref: 'HEAD' });
  },

  async fetch(dir) {
    await isoGit.fetch({ fs, http, dir, singleBranch: true });
  },

  async compareUpstream(dir) {
    const branch = await this.currentBranch(dir);
    if (!branch) return null;

    const remotes = await isoGit.listRemotes({ fs, dir });
    if (remotes.length === 0) return null;

    let upstream: string;
    try {
      upstream = await isoGit.resolveRef({
        fs,
        dir,
        ref: `refs/remotes/origin/${branch}`,
      });
    } catch {
      // the branch has never been fetched, so there is nothing to compare to
      return null;
    }

    const head = await this.headSha(dir);
    if (head === upstream) return { ahead: false, behind: false };

    return {
      behind: await isoGit.isDescendent({
        fs,
        dir,
        oid: upstream,
        ancestor: head,
      }),
      ahead: await isoGit.isDescendent({
        fs,
        dir,
        oid: head,
        ancestor: upstream,
      }),
    };
  },

  async fastForward(dir) {
    await isoGit.fastForward({ fs, http, dir, singleBranch: false });
  },

  async resetTo(dir, sha) {
    const branch = await this.currentBranch(dir);
    // isomorphic-git has no `reset --hard`, so the branch is moved by hand
    // before the working tree is checked out against it
    if (branch) {
      await isoGit.writeRef({
        fs,
        dir,
        ref: `refs/heads/${branch}`,
        value: sha,
        force: true,
      });
    }
    await isoGit.checkout({ fs, dir, ref: branch ?? sha, force: true });
  },
};

/** whether the git binary is on PATH */
export const hasGitBinary = () => hasbin.sync('git');

let cached: PluginGit | undefined;

/**
 * The git binary is preferred when it is installed: it is faster and it is what
 * a plugin author's own checkout was made with. isomorphic-git covers hosts
 * without it, which is most container images.
 *
 * `OMEGGA_GIT` forces one or the other, so the implementation that is not
 * native to a machine can still be exercised there.
 */
export function getPluginGit(): PluginGit {
  if (cached) return cached;

  const override = process.env.OMEGGA_GIT?.trim().toLowerCase();
  if (override === 'bin' || override === 'js') {
    cached = override === 'bin' ? binGit : jsGit;
    Logger.verbose('Using', override.yellow, 'git backend from OMEGGA_GIT');
    return cached;
  }
  if (override) {
    Logger.warnp(
      `Ignoring ${'OMEGGA_GIT'.yellow}: ${override.yellow} is not ${'bin'.yellow} or ${'js'.yellow}`,
    );
  }

  cached = hasGitBinary() ? binGit : jsGit;
  Logger.verbose('Using', cached.backend.yellow, 'git backend');
  return cached;
}

/** only for tests, which need a fresh choice per case */
export function resetPluginGit() {
  cached = undefined;
}
