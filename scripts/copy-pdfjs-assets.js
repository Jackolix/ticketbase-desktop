#!/usr/bin/env node

/**
 * Stages pdf.js's runtime assets under `public/` so the viewer can fetch them.
 *
 * The worker is imported through Vite (`?url`) and may be hashed like any other
 * asset. These directories cannot be: pdf.js is handed a base URL and appends
 * the filenames it wants at runtime, so those names have to survive the build
 * untouched. `public/` is the one place Vite copies verbatim.
 *
 * Runs on `postinstall` and before every build. The output is a copy of
 * whatever `pdfjs-dist` is installed, so it is ignored by git rather than
 * committed and left to drift.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = path.join(root, 'node_modules', 'pdfjs-dist');
const target = path.join(root, 'public', 'pdfjs');

/**
 * `wasm` holds the JBIG2 and JPEG2000 decoders that scanned documents need —
 * scanner output is a good share of what customers attach. `standard_fonts`
 * holds the 14 fonts a PDF is allowed to reference without embedding.
 *
 * `cmaps` is deliberately left out: 1.5 MB of CJK encodings this app will not
 * meet.
 */
const DIRECTORIES = ['wasm', 'standard_fonts'];

if (!fs.existsSync(source)) {
  // Nothing to copy yet — a `postinstall` that runs before the dependency is
  // on disk should not fail the install.
  console.warn('pdfjs-dist is not installed; skipped staging its assets.');
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });

for (const directory of DIRECTORIES) {
  fs.cpSync(path.join(source, directory), path.join(target, directory), { recursive: true });
}

console.log(`Staged pdf.js ${DIRECTORIES.join(' and ')} in public/pdfjs`);
