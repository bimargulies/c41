import type { UxpManifest } from '@bubblydoo/vite-uxp-plugin';

export const manifest: UxpManifest = {
	id: 'b7e22b3b',
	name: 'C41 tools',
	version: '1.0.2',
	main: 'index.js',
	manifestVersion: 5,
	host: [
		{
			app: 'PS',
			minVersion: '24.0.0',
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
	],
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
