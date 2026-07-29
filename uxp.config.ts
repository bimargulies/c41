import type { UxpManifest } from '@bubblydoo/vite-uxp-plugin';

export const manifest: UxpManifest = {
	id: 'bimargulies.c41',
	name: 'C41 tools',
	version: '1.0.0',
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
};
