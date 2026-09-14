import { test, expect, Page } from '@playwright/test';

const REPOS_FIXTURE = {
	username: 'octocat',
	total: 2,
	repos: [
		{
			id: 1,
			name: 'hello-world',
			description: 'My first repository',
			createdAt: '2024-01-15T10:00:00Z',
			pushedAt: '2025-06-01T18:30:00Z',
			languages: ['TypeScript', 'CSS'],
			htmlUrl: 'https://github.com/octocat/hello-world',
		},
		{
			id: 2,
			name: 'new-project',
			description: null,
			createdAt: '2025-08-20T08:00:00Z',
			pushedAt: '2025-09-01T12:00:00Z',
			languages: ['Ruby'],
			htmlUrl: 'https://github.com/octocat/new-project',
		},
	],
};

async function mockRepos(page: Page, url?: string) {
	await page.route('**/api/repos*', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify(url ?? REPOS_FIXTURE),
		})
	);
}

test('searching a valid username renders the repository cards', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');

	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(page.getByText('Repositories for')).toBeVisible();
	await expect(page.getByText('Total: 2')).toBeVisible();
	await expect(page.getByRole('link', { name: 'hello-world' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'new-project' })).toBeVisible();
	await expect(page.getByText('My first repository')).toBeVisible();
	await expect(page.getByText('No description provided.')).toBeVisible();
});

test('shows the sort toggles and renders language badges', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(page.getByText('Created Date')).toBeVisible();
	await expect(page.getByText('Last Commit')).toBeVisible();
	await expect(page.getByText('@octocat')).toBeVisible();
	await expect(page.getByText('TypeScript')).toBeVisible();
	await expect(page.getByText('Ruby')).toBeVisible();
});

test('shows the error message when the user is not found', async ({ page }) => {
	await page.route('**/api/repos*', (route) =>
		route.fulfill({
			status: 404,
			contentType: 'application/json',
			body: JSON.stringify({ error: 'User not found.' }),
		})
	);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('ghost-user');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(page.getByText('User not found.')).toBeVisible();
});

test('shows a validation error for invalid input', async ({ page }) => {
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('not a valid github');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(page.getByText(/Please enter a valid GitHub URL or username/)).toBeVisible();
});

test('past json your username as a github URL works', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('https://github.com/octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(page.getByText('Total: 2')).toBeVisible();
	await expect(page.getByText('@octocat')).toBeVisible();
});