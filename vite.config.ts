import { defineConfig } from 'vite';
import { uxp } from '@bubblydoo/vite-uxp-plugin';
import { manifest } from './uxp.config';

export default defineConfig({
	plugins: [uxp(manifest)],
	build: {
		rollupOptions: {
			input: 'src/index.ts',
			output: {
				format: 'cjs',
				entryFileNames: 'index.js',
			},
		},
	},
});
