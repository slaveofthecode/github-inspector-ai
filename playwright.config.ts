import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'line',
	timeout: 30_000,
	use: {
		baseURL: 'http://localhost:3000',
		viewport: { width: 1280, height: 800 },
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' },
		},
	],
	webServer: {
		command: 'bun run dev',
		url: 'http://localhost:3000',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});