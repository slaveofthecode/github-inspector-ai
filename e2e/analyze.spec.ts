import { test, expect, Page } from '@playwright/test';

const REPOS_FIXTURE = {
	username: 'octocat',
	total: 1,
	repos: [
		{
			id: 1,
			name: 'hello-world',
			description: 'A repo with a vulnerability',
			createdAt: '2024-01-15T10:00:00Z',
			pushedAt: '2025-06-01T18:30:00Z',
			languages: ['TypeScript'],
			htmlUrl: 'https://github.com/octocat/hello-world',
		},
	],
};

const VULNS_META = '{"type":"vulns","manifestsAnalyzed":1,"vulnerabilities":[{"id":"GHSA-123","aliases":["CVE-2025-1234"],"severity":"CRITICAL","score":9.8,"summary":"Prototype pollution","affectedPackage":"lodash","affectedVersions":[">=4.0.0 <4.17.21"]}]}\n';

async function mockAnalyze(page: Page, body: string, status: number, headers: Record<string, string>) {
	await page.route('**/api/analyze', (route) =>
		route.fulfill({ status, contentType: 'text/plain; charset=utf-8', body, headers })
	);
}

async function openRepo(page: Page) {
	await page.route('**/api/repos*', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify(REPOS_FIXTURE),
		})
	);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');
	await expect(page.getByRole('link', { name: 'hello-world' })).toBeVisible();
}

test('analyze streams a summary and renders the vulnerability report', async ({ page }) => {
	await mockAnalyze(
		page,
		`${VULNS_META}## Analysis\n\nThe repository is small and well maintained.\n`,
		200,
		{}
	);
	await openRepo(page);

	await page.getByText('Analyze Repository with AI').click();

	await expect(page.getByText('Vulnerabilities (1)')).toBeVisible();
	await expect(page.getByText('GHSA-123')).toBeVisible();
	await expect(page.getByText('CVE-2025-1234')).toBeVisible();
	await expect(page.getByText('lodash')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
	await expect(page.getByText('AI Analysis Summary')).toBeVisible();
});

test('shows a cached-until note when the server marks the response as cached', async ({ page }) => {
	const until = new Date(Date.now() + 3600_000).toISOString();
	await mockAnalyze(
		page,
		`${VULNS_META}## Analysis\n`,
		200,
		{ 'x-cache-until': until }
	);
	await openRepo(page);

	await page.getByText('Analyze Repository with AI').click();
	await expect(page.getByText(/Cached until/)).toBeVisible();
});

test('shows the error message when the model is unavailable', async ({ page }) => {
	await mockAnalyze(
		page,
		JSON.stringify({ error: 'AI analysis is not configured on this server.' }),
		503,
		{ 'Content-Type': 'application/json' }
	);
	await openRepo(page);

	await page.getByText('Analyze Repository with AI').click();
	await expect(
		page.getByText('AI analysis is not configured on this server.')
	).toBeVisible();
});

test('toggles the analysis accordion open and closed', async ({ page }) => {
	await mockAnalyze(page, `${VULNS_META}## Analysis\n`, 200, {});
	await openRepo(page);

	await page.getByText('Analyze Repository with AI').click();
	await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();

	await page.getByText('AI Analysis Summary').click();
	await expect(page.getByRole('heading', { name: 'Analysis' })).not.toBeVisible();
});