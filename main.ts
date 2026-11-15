// HILLBREAK — Dustline Yard: a three.js tactical FPS for make.fun's threejs-fps-02.
// Node 22, standard library only. The game is this directory's game/ folder: plain static
// files the browser loads as ES modules with three.js 0.187.0 from an import map, no build
// step, no network. This program hands it in: it copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// Screenshots are the entry's cover and proof: refuse to hand in an entry without them
// rather than ship a dossier whose images are missing.
const shots = join(here, 'screenshots');
if (!existsSync(shots) || readdirSync(shots).filter((name) => !name.startsWith('.')).length < 3) {
  throw new Error('screenshots/ must hold at least 3 real renders of the game');
}
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shots, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse (more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all: game/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

// Read the dossier back so a corrupt write fails loudly here instead of in the gate.
const dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
console.log(`HILLBREAK handed in: dossier ${readFileSync(dossierPath).length} bytes, ${dossier.images.length} screenshots, text ${Buffer.byteLength(dossier.text, 'utf8')} bytes`);
