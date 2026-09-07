import { defineConfig } from 'vite';
import { uxp } from 'vite-uxp-plugin';
import { config } from './uxp.config';

// `MODE=package` (see the "package" npm script) makes vite-uxp-plugin emit a
// .ccx after the build. Plain `vite build` just writes dist/.
const mode = process.env.MODE;

export default defineConfig({
	plugins: [uxp(config, mode)],
	build: {
		rollupOptions: {
			// UXP supplies these at runtime - never bundle them. `adobe:photoshop`
			// is rewritten to a bare `photoshop` require in the CJS output below,
			// so source can keep using the explicit `adobe:` specifier.
			external: ['uxp', 'photoshop', 'adobe:photoshop'],
			input: 'src/index.ts',
			output: {
				format: 'cjs',
				entryFileNames: 'index.js',
				paths: { 'adobe:photoshop': 'photoshop' },
			},
		},
	},
});
