import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname),
		},
	},
	test: {
		environment: 'node',
		include: ['{lib,app,components}/**/*.test.{ts,tsx}'],
		setupFiles: ['test/setup.ts'],
	},
});