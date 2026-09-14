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

	it('streams analysis and renders vulnerabilities', async () => {
		const user = userEvent.setup();
		const vuln = {
			id: 'GHSA-1',
			aliases: ['CVE-2021-1234'],
			severity: 'CRITICAL',
			score: 9.8,
			summary: 'Prototype pollution',
			affectedPackage: 'pkg-a',
			affectedVersions: ['<1.0'],
		};
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 1, vulnerabilities: [vuln] }, '## Security\nNo fixes needed.')
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));

		expect(mockFetch).toHaveBeenCalledWith('/api/analyze', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ owner: 'octocat', repo: 'Hello-World' }),
		});

		await waitFor(() => {
			expect(screen.getByText('Vulnerabilities (1)')).toBeInTheDocument();
		});
		expect(screen.getByText('GHSA-1')).toBeInTheDocument();
		expect(screen.getByText('CVE-2021-1234')).toBeInTheDocument();
		expect(screen.getByText('pkg-a')).toBeInTheDocument();
		expect(screen.getByText(/prototype pollution/i)).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Security' })).toBeInTheDocument();
		expect(screen.getByText('No fixes needed.')).toBeInTheDocument();
		expect(screen.getByText('AI Analysis Summary')).toBeInTheDocument();
	});

	it('shows "no vulnerabilities" when manifests > 0 but vulns empty', async () => {
		const user = userEvent.setup();
		mockFetch.mockResolvedValue(
			streamResponse({ manifestsAnalyzed: 2, vulnerabilities: [] }, 'All clear.')
		);

		render(<RepoAnalysis owner="octocat" repo="Hello-World" />);
		await user.click(screen.getByText('Analyze Repository with AI'));
		await waitFor(() => {
			expect(screen.getByText('Vulnerabilities (0)')).toBeInTheDocument();
		});
		expect(
			screen.getByText('No known vulnerabilities found in declared dependencies.')
		).toBeInTheDocument();
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