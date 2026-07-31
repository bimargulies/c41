#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('../uxp.config.ts', import.meta.url));

const bumpArg = process.argv[2];
if (!bumpArg) {
	console.error('Usage: pnpm release <patch|minor|major|X.Y.Z>');
	process.exit(1);
}

if (execSync('git status --porcelain').toString().trim()) {
	console.error('Working tree is not clean. Commit or stash changes first.');
	process.exit(1);
}

const source = readFileSync(configPath, 'utf8');
const match = source.match(/version:\s*'(\d+)\.(\d+)\.(\d+)'/);
if (!match) {
	console.error('Could not find a version field in uxp.config.ts');
	process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);

let newVersion;
if (/^\d+\.\d+\.\d+$/.test(bumpArg)) {
	newVersion = bumpArg;
} else if (bumpArg === 'patch') {
	newVersion = `${major}.${minor}.${patch + 1}`;
} else if (bumpArg === 'minor') {
	newVersion = `${major}.${minor + 1}.0`;
} else if (bumpArg === 'major') {
	newVersion = `${major + 1}.0.0`;
} else {
	console.error(`Unknown bump "${bumpArg}". Use patch, minor, major, or an explicit X.Y.Z.`);
	process.exit(1);
}

writeFileSync(configPath, source.replace(/version:\s*'\d+\.\d+\.\d+'/, `version: '${newVersion}'`));

const tag = `v${newVersion}`;
execSync('git add uxp.config.ts', { stdio: 'inherit' });
execSync(`git commit -m "release: ${tag}"`, { stdio: 'inherit' });
execSync(`git tag ${tag}`, { stdio: 'inherit' });

console.log(`\nCreated commit and tag ${tag}. Push with:\n  git push && git push origin ${tag}`);
