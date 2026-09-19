#!/usr/bin/env node
// Announces a release to a Discord webhook, using the same CHANGELOG section
// the GitHub release body comes from.
//
//   tools/discord-release.mjs                 announce package.json's version
//   tools/discord-release.mjs v1.19.0         announce a specific version
//   tools/discord-release.mjs --dry-run       print the payload, send nothing
//
// Reads the webhook from DISCORD_WEBHOOK_URL and does nothing without it, so
// the release workflow can run unchanged on a fork or before the secret exists.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// https://discord.com/developers/docs/resources/message#embed-object-embed-limits
const DESCRIPTION_LIMIT = 4096;

// $br-info-normal, the web UI's link color
const COLOR = 0x009bee;

// Discord re-hosts an embed image when the message is posted, so a stable path
// on the default branch outlives the file moving later
const LOGO = 'docs/assets/logo.png';
const LOGO_REF = 'master';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const version = (args.find(a => !a.startsWith('-')) ?? pkg.version).replace(
  /^v/,
  '',
);

const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
if (!webhook && !dryRun) {
  console.log('>> DISCORD_WEBHOOK_URL is not set, skipping the announcement');
  process.exit(0);
}

// `git+https://github.com/owner/repo.git` is what npm stores
const repoUrl = pkg.repository.url
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
const [owner, repo] = new URL(repoUrl).pathname.slice(1).split('/');

const releaseUrl = `${repoUrl}/releases/tag/v${version}`;
const npmUrl = `https://www.npmjs.com/package/${pkg.name}/v/${version}`;
// ghcr publishes to ghcr.io/<owner>/<repo>; see .github/workflows/publish-image.yml
const ghcrUrl = `${repoUrl}/pkgs/container/${repo}`;
const logoUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${LOGO_REF}/${LOGO}`;
// the domain GitHub Pages serves the book from, rather than a second copy of it
const docsHost = readFileSync(join(root, 'docs', 'CNAME'), 'utf8').trim();

const name = pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1);
// a markdown heading is the only way to size text up; an embed title renders
// at a fixed size and takes no formatting
const heading = `# [${name} v${version}](${releaseUrl})`;

const body = execFileSync(
  'bash',
  [join(root, 'tools', 'release-notes.sh'), version, '--body'],
  { encoding: 'utf8' },
).trim();

/**
 * Discord rejects the whole message rather than truncating an over-long
 * description, so cut on a line boundary and point at the release for the rest.
 */
function fit(text, limit) {
  const more = `\n\n[Full release notes](${releaseUrl})`;
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - more.length);
  return cut.slice(0, cut.lastIndexOf('\n')).trimEnd() + more;
}

const payload = {
  embeds: [
    {
      description: `${heading}\n\n${fit(body, DESCRIPTION_LIMIT - heading.length - 2)}`,
      // an embed holds one image, so these are links rather than badge images.
      // the release is the heading's link, so it does not need a field too
      fields: [
        { name: 'Docs', value: `[${docsHost}](https://${docsHost})`, inline: true },
        { name: 'Package', value: `[npm](${npmUrl})`, inline: true },
        { name: 'Image', value: `[ghcr.io](${ghcrUrl})`, inline: true },
      ],
      thumbnail: { url: logoUrl },
      color: COLOR,
      timestamp: new Date().toISOString(),
    },
  ],
};

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

// ?wait=true makes Discord report a rejected payload instead of accepting it
// into a queue and dropping it silently
const res = await fetch(`${webhook}?wait=true`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  console.error(
    `!> Discord returned ${res.status} ${res.statusText}: ${await res.text()}`,
  );
  process.exit(1);
}

console.log(`>> announced ${name} v${version} to Discord`);
