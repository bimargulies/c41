#!/usr/bin/env node
// Build the plugin and package dist/ into an installable .ccx.
//
// Unlike `pnpm build` alone, this collapses a single-element `host` array in
// the manifest to a bare object. Creative Cloud's installer (the thing that
// runs on double-click and via UnifiedPluginInstallerAgent) can't read the
// array form and fails mxi generation with `status = -267`. The UXP runtime
// and the UXP Developer Tool both accept either form, and UDT's own "Package"
// command performs the same collapse.
//
// Usage: node scripts/package-ccx.mjs [output.ccx]   (default: ./c41.ccx)

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(repoRoot, 'c41.ccx');

execFileSync('pnpm', ['build'], { cwd: repoRoot, stdio: 'inherit' });

const stage = mkdtempSync(join(tmpdir(), 'c41-ccx-'));
try {
	cpSync(join(repoRoot, 'dist'), stage, { recursive: true });

	const manifestPath = join(stage, 'manifest.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (Array.isArray(manifest.host) && manifest.host.length === 1) {
		manifest.host = manifest.host[0];
		writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
	}

	rmSync(outPath, { force: true });
	execFileSync('zip', ['-q', '-r', '-X', outPath, '.'], { cwd: stage, stdio: 'inherit' });
} finally {
	rmSync(stage, { recursive: true, force: true });
}

console.log(`\nPackaged ${outPath}`);
