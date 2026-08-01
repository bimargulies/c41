import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			// UXP-native modules only resolve inside the real UXP runtime; point them at stubs
			// so Vite can resolve the import, then vi.mock() overrides the contents per test.
			'adobe:photoshop': new URL('./test/stubs/adobe-photoshop.ts', import.meta.url).pathname,
		},
	},
	test: {
		environment: 'jsdom',
	},
});
