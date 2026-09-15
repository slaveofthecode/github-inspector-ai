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
			stargazerCount: 1200,
			forkCount: 45,
			isArchived: false,
			languages: ['TypeScript', 'CSS'],
			htmlUrl: 'https://github.com/octocat/hello-world',
		},
		{
			id: 2,
			name: 'new-project',
			description: null,
			createdAt: '2025-08-20T08:00:00Z',
			pushedAt: '2025-09-01T12:00:00Z',
			stargazerCount: 7,
			forkCount: 1,
			isArchived: true,
			languages: ['Ruby'],
			htmlUrl: 'https://github.com/octocat/new-project',
		},
	],
};

async function mockRepos(page: Page, url?: string | typeof REPOS_FIXTURE) {
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

	await expect(page.getByText('@octocat')).toBeVisible();
	await expect(page.getByText('Total: 2')).toBeVisible();
	await expect(page.getByRole('link', { name: 'hello-world' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'new-project' })).toBeVisible();
	await expect(page.getByText('My first repository')).toBeVisible();
	await expect(page.getByText('No description provided.')).toBeVisible();
});

test('renders star/fork counts and marks archived repos', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(page.getByText('1.2K')).toBeVisible();
	await expect(page.getByText('45')).toBeVisible();
	await expect(page.getByText('Archived')).toBeVisible();
});

test('filters results by technology while typing', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	const filter = page.getByPlaceholder(/Search by name or technology/);
	await filter.fill('ruby');

	await expect(page.getByRole('link', { name: 'new-project' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'hello-world' })).not.toBeVisible();

	await filter.fill('hello');
	await expect(page.getByRole('link', { name: 'hello-world' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'new-project' })).not.toBeVisible();

	await page.getByLabel('Clear filter').click();
	await expect(page.getByRole('link', { name: 'hello-world' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'new-project' })).toBeVisible();
});

test('shows a message when the filter has no matches', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await page.getByPlaceholder(/Search by name or technology/).fill('zzz-nothing');
	await expect(page.getByText('No repositories match your filter.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'hello-world' })).not.toBeVisible();
});

test('shows an empty state when the account has no public repositories', async ({ page }) => {
	await mockRepos(page, {
		username: 'octocat',
		total: 0,
		repos: [],
	});
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(
		page.getByText('This account has no public repositories.')
	).toBeVisible();
});

test('restores a search from the URL on load', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/?username=octocat');

	await expect(page.getByText('Total: 2')).toBeVisible();
	await expect(page.getByRole('link', { name: 'hello-world' })).toBeVisible();
	await expect(page.getByText('@octocat')).toBeVisible();
});

test('shows the sort toggles and renders language badges', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

	await expect(page.getByText('Created Date')).toBeVisible();
	await expect(page.getByText('Last Commit')).toBeVisible();
	await expect(page.getByText('@octocat')).toBeVisible();
	await expect(page.getByText('TypeScript').first()).toBeVisible();
	await expect(page.getByText('Ruby').first()).toBeVisible();
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

test('retry button appears on a 429 error and resubmits the search', async ({ page }) => {
	let calls = 0;
	await page.route('**/api/repos*', (route) => {
		calls++;
		if (calls === 1) {
			route.fulfill({
				status: 429,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Too many requests. Try again in a moment.' }),
			});
		} else {
			route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify(REPOS_FIXTURE),
			});
		}
	});
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');

await expect(page.getByText('Too many requests. Try again in a moment.')).toBeVisible();
	await page.getByRole('button', { name: /Retry/ }).click();

	await expect(page.getByText('Total: 2')).toBeVisible();
});

test('search input is cleared after a successful search', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	const input = page.getByPlaceholder(/github.com\/username/);
	await input.fill('octocat');
	await input.press('Enter');

	await expect(page.getByText('Total: 2')).toBeVisible();
	await expect(input).toHaveValue('');
});

test('clicking the GitHub Inspector header resets results and the URL', async ({ page }) => {
	await mockRepos(page);
	await page.goto('/');
	await page.getByPlaceholder(/github.com\/username/).fill('octocat');
	await page.getByPlaceholder(/github.com\/username/).press('Enter');
	await expect(page.getByText('Total: 2')).toBeVisible();
	await expect(page).toHaveURL(/\?username=octocat/);

	await page.getByRole('button', { name: /GitHub Inspector/ }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByText('Total: 2')).not.toBeVisible();
	await expect(page.getByText('@octocat')).not.toBeVisible();
});