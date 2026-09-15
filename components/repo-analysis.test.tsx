// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoAnalysis } from './repo-analysis';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

function streamResponse(
		meta: Record<string, unknown>,
		markdown: string,
		headers: Record<string, string> = {}
	) {
	const payload = `${JSON.stringify({ type: 'vulns', ...meta })}\n${markdown}`;
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(payload));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
	});
}

function errorResponse(status: number, body: { error: string }) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

beforeEach(() => {
	mockFetch.mockReset();
});

afterEach(() => cleanup());

describe('RepoAnalysis', () => {
	it('renders the analyze button in its initial state', () => {
		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		expect(screen.getByText('Analyze Repository with AI')).toBeInTheDocument();
		expect(screen.queryByText('AI Analysis Summary')).not.toBeInTheDocument();
	});

	it('renders the severity distribution bar and shows findings behind Details', async () => {
		const user = userEvent.setup();
		const vulns = [
			{
				id: 'GHSA-1',
				aliases: ['CVE-2021-1234'],
				severity: 'CRITICAL',
				score: 9.8,
				summary: 'Prototype pollution',
				affectedPackage: 'pkg-a',
				affectedVersions: ['<1.0'],
			},
			{
				id: 'GHSA-2',
				aliases: [],
				severity: 'MEDIUM',
				score: 5.0,
				summary: 'Medium bug',
				affectedPackage: 'pkg-b',
				affectedVersions: ['<2.0'],
			},
		];
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 1, vulnerabilities: vulns }, '## Security\nNo fixes needed.')
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));

		expect(mockFetch).toHaveBeenCalledWith('/api/analyze', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ owner: 'octocat', repo: 'Hello-World' }),
		});

		await waitFor(() => {
			expect(screen.getByText('Vulnerabilities (2)')).toBeInTheDocument();
		});

		// Distribution bar + legend, details hidden by default.
		expect(screen.getByRole('img', { name: /Critical: 1/ })).toBeInTheDocument();
		expect(screen.getByText('Critical (1)')).toBeInTheDocument();
		expect(screen.getByText('Medium (1)')).toBeInTheDocument();
		expect(screen.queryByText('GHSA-1')).not.toBeInTheDocument();
		expect(screen.queryByText('CVE-2021-1234')).not.toBeInTheDocument();

		// Details reveals the full list, Hide Details collapses it again.
		await user.click(screen.getByText('Details'));
		expect(screen.getByText('GHSA-1')).toBeInTheDocument();
		expect(screen.getByText('CVE-2021-1234')).toBeInTheDocument();
		expect(screen.getByText('GHSA-2')).toBeInTheDocument();
		expect(screen.getByText('pkg-a')).toBeInTheDocument();
		expect(screen.getByText(/prototype pollution/i)).toBeInTheDocument();

		await user.click(screen.getByText('Hide Details'));
		expect(screen.queryByText('GHSA-1')).not.toBeInTheDocument();

		// The streamed markdown still renders (single section selected by default).
		expect(screen.getByRole('heading', { name: 'Security' })).toBeInTheDocument();
		expect(screen.getByText('No fixes needed.')).toBeInTheDocument();
		expect(screen.getByText('AI Analysis Summary')).toBeInTheDocument();
	});

	it('shows "no vulnerabilities" when manifests > 0 but vulns empty', async () => {
		const user = userEvent.setup();
		mockFetch.mockResolvedValue(
			streamResponse(
				{ manifestsAnalyzed: 2, dependenciesChecked: 2, vulnerabilities: [] },
				'All clear.'
			)
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));
		await waitFor(() => {
			expect(screen.getByText('Vulnerabilities (0)')).toBeInTheDocument();
		});
		expect(
			screen.getByText(
				'Checked 2 dependencies — no known vulnerabilities found in declared dependencies.'
			)
		).toBeInTheDocument();
	});

	it('shows "no declarable dependencies" when manifests > 0 but no deps extracted', async () => {
		const user = userEvent.setup();
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 1, dependenciesChecked: 0, vulnerabilities: [] }, 'All clear.')
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));
		await waitFor(() => {
			expect(screen.getByText('Vulnerabilities (0)')).toBeInTheDocument();
		});
		expect(
			screen.getByText(
				'Dependency manifests were detected, but no declarable dependencies were found.'
			)
		).toBeInTheDocument();
	});

	it('shows the vulnerabilities panel when the repo has no supported manifests', async () => {
		const user = userEvent.setup();
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 0, vulnerabilities: [] }, 'All clear.')
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));
		await waitFor(() => {
			expect(screen.getByText('Vulnerabilities (0)')).toBeInTheDocument();
		});
		expect(
			screen.getByText(
				'No supported dependency manifests were detected in this repository.'
			)
		).toBeInTheDocument();
	});

	it('renders AI section tabs and lets the user switch sections', async () => {
		const user = userEvent.setup();
		const markdown =
			'## Overview\n\nIntro content here.\n\n## Key Features\n\n- Fast\n- Typed\n\n## Suggested Improvements & Fixes\n\nDo more.';
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 0, vulnerabilities: [] }, markdown)
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));

		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
		});
		expect(screen.getByText('Intro content here.')).toBeInTheDocument();
		expect(screen.queryByText('Fast')).not.toBeInTheDocument();

		await user.click(screen.getByRole('tab', { name: 'Key Features' }));
		expect(screen.getByRole('heading', { name: 'Key Features' })).toBeInTheDocument();
		expect(screen.getByText('Fast')).toBeInTheDocument();
		expect(screen.getByText('Typed')).toBeInTheDocument();
		expect(screen.queryByText('Intro content here.')).not.toBeInTheDocument();

		await user.click(screen.getByRole('tab', { name: 'Suggested Improvements & Fixes' }));
		expect(screen.getByRole('heading', { name: 'Suggested Improvements & Fixes' })).toBeInTheDocument();
		expect(screen.getByText('Do more.')).toBeInTheDocument();
	});

	it('opens the Security Findings section by default when present', async () => {
		const user = userEvent.setup();
		const markdown =
			'## Overview & Purpose\n\nDoes things.\n\n## Security Findings\n\nTwo vulnerabilities found.\n\n## Key Features\n\nFeatures.';
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 0, vulnerabilities: [] }, markdown)
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));

		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Security Findings' })).toBeInTheDocument();
		});
		expect(screen.getByText('Two vulnerabilities found.')).toBeInTheDocument();
		expect(screen.queryByText('Does things.')).not.toBeInTheDocument();

		const tabs = screen.getAllByRole('tab');
		expect(tabs[0]).toHaveAccessibleName('Security Findings');
	});

	it('strips bold markers from section headings in tabs (no-vulns case)', async () => {
		const user = userEvent.setup();
		const markdown = '## **Tech Stack**\n\n- React\n- TypeScript';
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 1, vulnerabilities: [] }, markdown)
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));

		await waitFor(() => {
			expect(screen.getByRole('tab', { name: 'Tech Stack' })).toBeInTheDocument();
		});
		expect(screen.queryByRole('tab', { name: /\*\*Tech Stack\*\*/ })).not.toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Tech Stack' })).toBeInTheDocument();
	});

	it('displays the error message from a non-OK response', async () => {
		const user = userEvent.setup();
		mockFetch.mockResolvedValue(errorResponse(429, { error: 'Too many analyses' }));

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));
		await waitFor(() => {
			expect(screen.getByText('Too many analyses')).toBeInTheDocument();
		});
	});

	it('shows "Cached until HH:MM" when the x-cache-until header is present', async () => {
		const user = userEvent.setup();
		const future = new Date(Date.now() + 3600_000).toISOString();
		mockFetch.mockResolvedValue(
			streamResponse(
				{ manifestsAnalyzed: 0, vulnerabilities: [] },
				'Done.',
				{ 'x-cache-until': future }
			)
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));
		await waitFor(() => {
			expect(screen.getByText(/Cached until/)).toBeInTheDocument();
		});
	});

	it('toggles the accordion on subsequent clicks', async () => {
		const user = userEvent.setup();
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 0, vulnerabilities: [] }, '## Summary')
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
		});

		await user.click(screen.getByText('AI Analysis Summary'));
		expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument();
	});
});