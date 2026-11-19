#!/usr/bin/env node
/**
 * Writes the updater manifest (`latest.json`) for a release, once, after
 * every platform has been built.
 *
 * tauri-action can do this itself, but each matrix job then downloads the
 * release's latest.json, adds its own platform and uploads it again. Four jobs
 * doing that at the same time race: v1.5.0's Windows job failed with "Not
 * Found" because another job had replaced the asset in between, which leaves
 * the manifest without Windows and Windows users without the update. The
 * build jobs now skip it and a final job runs this instead.
 *
 * Usage: node scripts/updater-manifest.js <tag> <dir with .sig files> <notes file>
 * Prints the manifest to stdout.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Which updater platform keys each signed bundle serves, in the shape
 * tauri-action produced up to 1.4.0, so existing installs read it unchanged.
 * Windows prefers the NSIS installer for the generic key, as
 * `updaterJsonPreferNsis` did.
 */
const PLATFORMS = [
  { match: /_x64-setup\.exe$/, keys: ['windows-x86_64', 'windows-x86_64-nsis'] },
  { match: /_x64_en-US\.msi$/, keys: ['windows-x86_64-msi'] },
  { match: /_aarch64\.app\.tar\.gz$/, keys: ['darwin-aarch64', 'darwin-aarch64-app'] },
  { match: /_x64\.app\.tar\.gz$/, keys: ['darwin-x86_64', 'darwin-x86_64-app'] },
  { match: /_amd64\.AppImage$/, keys: ['linux-x86_64', 'linux-x86_64-appimage'] },
  { match: /_amd64\.deb$/, keys: ['linux-x86_64-deb'] },
  { match: /\.x86_64\.rpm$/, keys: ['linux-x86_64-rpm'] },
];

/**
 * Every platform an install can update from. A manifest missing one of these
 * would strand those users, so it is refused rather than published.
 */
export const REQUIRED_PLATFORMS = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64'];

/**
 * @param {object} input
 * @param {string} input.tag            e.g. "v1.5.0"
 * @param {string} input.repository     "owner/name"
 * @param {Record<string, string>} input.signatures  bundle file name → .sig contents
 * @param {string} input.notes
 * @param {string} input.pubDate        ISO timestamp
 */
export function buildManifest({ tag, repository, signatures, notes, pubDate }) {
  const platforms = {};

  for (const [file, signature] of Object.entries(signatures)) {
    const platform = PLATFORMS.find(({ match }) => match.test(file));
    if (!platform) continue;
    const url = `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(file)}`;
    for (const key of platform.keys) {
      platforms[key] = { signature: signature.trim(), url };
    }
  }

  const missing = REQUIRED_PLATFORMS.filter((key) => !platforms[key]);
  if (missing.length > 0) {
    throw new Error(`release ${tag} has no signed bundle for: ${missing.join(', ')}`);
  }

  return {
    version: tag.replace(/^v/, ''),
    notes,
    pub_date: pubDate,
    platforms,
  };
}

function main([tag, sigDir, notesFile]) {
  if (!tag || !sigDir || !notesFile) {
    throw new Error('usage: updater-manifest.js <tag> <sig dir> <notes file>');
  }

  const signatures = {};
  for (const name of fs.readdirSync(sigDir)) {
    if (!name.endsWith('.sig')) continue;
    signatures[name.slice(0, -'.sig'.length)] = fs.readFileSync(path.join(sigDir, name), 'utf8');
  }

  const manifest = buildManifest({
    tag,
    repository: process.env.GITHUB_REPOSITORY || 'Jackolix/ticketbase-desktop',
    signatures,
    notes: fs.readFileSync(notesFile, 'utf8').trim(),
    pubDate: new Date().toISOString(),
  });

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
