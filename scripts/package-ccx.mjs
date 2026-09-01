#!/usr/bin/env node
// Build the plugin and copy the packaged .ccx to a chosen path.
//
// The packaging itself - collapsing the manifest's single-element `host` array
// to a bare object (Creative Cloud's installer chokes on the array form and
// fails mxi generation with `status = -267`) and zipping dist/ - is done by
// vite-uxp-plugin when vite runs with MODE=package. It writes ./ccx/<id>_PS.ccx;
// this wrapper just runs that build and copies the result to a friendlier path.
//
// Usage: node scripts/package-ccx.mjs [output.ccx]   (default: ./c41.ccx)

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(repoRoot, 'c41.ccx');
const ccxDir = join(repoRoot, 'ccx');

rmSync(ccxDir, { recursive: true, force: true });
mkdirSync(ccxDir, { recursive: true });

execFileSync('pnpm', ['exec', 'vite', 'build'], {
	cwd: repoRoot,
	stdio: 'inherit',
	env: { ...process.env, MODE: 'package' },
});

const built = readdirSync(ccxDir).filter((f) => f.endsWith('.ccx'));
if (built.length !== 1) {
	console.error(`package-ccx: expected exactly one .ccx in ${ccxDir}, found ${built.length}`);
	process.exit(1);
}

copyFileSync(join(ccxDir, built[0]), outPath);
console.log(`\nWrote ${outPath}`);
