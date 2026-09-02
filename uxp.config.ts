import type { UXP_Config, UXP_Manifest } from 'vite-uxp-plugin';

const manifest: UXP_Manifest = {
	id: 'b7e22b3b',
	name: 'C41 tools',
	version: '1.4.0',
	main: 'index.js',
	manifestVersion: 5,
	host: [
		{
			app: 'PS',
			// Keep this low. Creative Cloud's .ccx installer has a long-standing bug where a
			// "real" minVersion (e.g. 24.0.0) is rejected as "no compatible version of
			// Photoshop installed" even on much newer builds. The plugin still needs a
			// modern Photoshop (UXP apiVersion 2 / manifestVersion 5 ~= PS 24.2+); that
			// floor is enforced at runtime rather than by this gate.
			// https://forums.creativeclouddeveloper.com/t/manifest-minversion-issue/2525
			minVersion: '22.0.0',
			data: {
				apiVersion: 2,
			},
		},
	],
	entrypoints: [
		{
			type: 'command',
			id: 'addC41AdjustmentLayers',
			label: {
				default: 'Add C41 Adjustment Layers',
			},
		},
		{
			type: 'command',
			id: 'exportChannelHistograms',
			label: {
				default: 'Export Channel Histograms...',
			},
		},
		{
			type: 'command',
			id: 'openC41Preferences',
			label: {
				default: 'Preferences...',
			},
		},
	],
	requiredPermissions: {
		localFileSystem: 'request',
	},
	icons: [
		{
			width: 23,
			height: 23,
			path: 'icons/plugin-dark.png',
			scale: [1, 2],
			theme: ['darkest', 'dark'],
		},
		{
			width: 23,
			height: 23,
			path: 'icons/plugin-light.png',
			scale: [1, 2],
			theme: ['lightest', 'light'],
		},
	],
};

// scripts/release.mjs bumps `manifest.version` above by text-substituting the
// first `version: '...'` in this file.
export const config: UXP_Config = {
	// Keep the packaged manifest id exactly as `manifest.id` above. By default
	// vite-uxp-plugin rewrites it to `<id>_<app>` per host, which makes a new
	// install register as a *different* plugin and sit alongside the old one
	// instead of replacing it. That id-mangling only earns its keep for a
	// multi-host plugin; c41 targets Photoshop only.
	uniqueIds: false,
	// Dev-only knobs (unused by `vite build` / `MODE=package`); vite-uxp-plugin
	// requires them to be present.
	hotReloadPort: 8080,
	webviewUi: false,
	webviewReloadPort: 8082,
	copyZipAssets: [],
	manifest,
};
