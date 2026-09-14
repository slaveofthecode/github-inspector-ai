import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { OsvVulnerability } from '@/lib/osv';

type PostHandler = (request: NextRequest) => Promise<Response>;

const aiMocks = vi.hoisted(() => ({
	streamText: vi.fn(),
	toTextStream: vi.fn(),
	createTextStreamResponse: vi.fn(),
	queryOsvDependencies: vi.fn(),
}));

vi.mock('ai', () => ({
	streamText: aiMocks.streamText,
	toTextStream: aiMocks.toTextStream,
	createTextStreamResponse: aiMocks.createTextStreamResponse,
}));

vi.mock('@/lib/osv', () => ({
	queryOsvDependencies: aiMocks.queryOsvDependencies,
}));

function seqReader(chunks: string[]) {
	let i = 0;
	return {
		read: async () =>
			i < chunks.length
				? { done: false as const, value: chunks[i++] }
				: { done: true as const, value: undefined },
		cancel: async () => undefined,
	};
}

async function loadPost(): Promise<PostHandler> {
	vi.resetModules();
	const mod = await import('./route');
	return mod.POST;
}

function postRequest(body: unknown): NextRequest {
	return new NextRequest('http://localhost/api/analyze', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

function jsonRes(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const VULN: OsvVulnerability = {
	id: 'GHSA-fjxv-7rqg-78g4',
	aliases: ['CVE-2025-7783'],
	severity: 'CRITICAL',
	score: 9.8,
	summary: 'prototype pollution',
	affectedPackage: 'form-data',
	affectedVersions: ['>=0', '<2.5.4'],
};

let gitHubFetch: ReturnType<typeof vi.fn>;
let lastRead: string[];

beforeEach(() => {
	lastRead = ['# Overview\n', '## More\n'];
	gitHubFetch = vi.fn(async (input: unknown) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: (input as Request).url;
		if (url.includes('/commits/')) {
			return jsonRes({ sha: 'b'.repeat(40) });
		}
		if (url.includes('/readme')) {
			return jsonRes({ content: Buffer.from('# Hello World').toString('base64') });
		}
		if (url.includes('/git/trees/')) {
			return jsonRes({ tree: [{ path: 'package.json', type: 'blob', size: 60 }] });
		}
		if (url.includes('/contents/package.json')) {
			return jsonRes({ content: Buffer.from('{"dependencies":{"react":"18.3.1"}}').toString('base64') });
		}
		if (/\/repos\/octocat\/[^/?#]+/.test(url)) {
			return jsonRes({ default_branch: 'main', pushed_at: '2025-01-01T00:00:00Z' });
		}
		return jsonRes({ error: 'unexpected url' }, 500);
	});

	vi.stubGlobal('fetch', gitHubFetch);

	vi.stubEnv('GEMINI_API_KEY', 'test-key');
	vi.stubEnv('GITHUB_TOKEN', 'test-token');

	aiMocks.streamText.mockReset();
	aiMocks.queryOsvDependencies.mockReset();
	aiMocks.queryOsvDependencies.mockResolvedValue([]);
	aiMocks.toTextStream.mockReset();
	aiMocks.toTextStream.mockImplementation(() => ({
		getReader: () => seqReader(lastRead),
	}));
	aiMocks.createTextStreamResponse.mockReset();
	aiMocks.createTextStreamResponse.mockImplementation(
		async ({ status, headers, stream }: { status: number; headers: Record<string, string>; stream: ReadableStream<string> }) => {
			const reader = stream.getReader();
			try {
				while (!(await reader.read()).done) {
					// drain
				}
			} catch {
				// stream errored (e.g. timeout paths); ignore in tests
			}
			return new NextResponse(null, { status, headers });
		}
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('POST /api/analyze', () => {
	it('returns 503 when GEMINI_API_KEY is not configured', async () => {
		vi.stubEnv('GEMINI_API_KEY', '');
		const POST = await loadPost();
		const res = await POST(postRequest({ owner: 'octocat', repo: 'Hello-World' }));
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: 'AI analysis is not configured on this server.' });
	});

	it('returns 400 for an invalid body', async () => {
		const POST = await loadPost();
		const res = await POST(postRequest({ owner: 'octocat' }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Invalid owner or repository name.' });
	});

	it('returns 400 for a malformed (non-JSON) body', async () => {
		const POST = await loadPost();
		const res = await POST(postRequest('not-json'));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Invalid request body.' });
	});

	it('returns 404 when the repository does not exist', async () => {
		const POST = await loadPost();
		gitHubFetch.mockResolvedValue(jsonRes({ message: 'Not Found' }, 404));
		const res = await POST(postRequest({ owner: 'octocat', repo: 'Hello-World' }));
		expect(res.status).toBe(404);
	});

	it('returns 403 when the repository is private or inaccessible', async () => {
		const POST = await loadPost();
		gitHubFetch.mockResolvedValue(jsonRes({ message: 'Forbidden' }, 403));
		const res = await POST(postRequest({ owner: 'octocat', repo: 'Hello-World' }));
		expect(res.status).toBe(403);
	});

	it('streams a MISS response and injects the deterministic scan into the prompt', async () => {
		aiMocks.queryOsvDependencies.mockResolvedValue([VULN]);
		const POST = await loadPost();
		const res = await POST(postRequest({ owner: 'octocat', repo: 'Hello-World' }));

		expect(res.status).toBe(200);
		expect(res.headers.get('X-Cache')).toBe('MISS');
		expect(res.headers.get('X-Cache-Until')).not.toBeNull();

		expect(aiMocks.queryOsvDependencies).toHaveBeenCalled();
		expect(aiMocks.streamText).toHaveBeenCalledOnce();
		const { system, prompt, model, abortSignal } = aiMocks.streamText.mock.calls[0][0];
		expect(model).toBeTruthy();
		expect(abortSignal).toBeDefined();
		expect(system).toContain('Security findings (deterministic scan)');
		expect(prompt).toContain('Repository: octocat/Hello-World');
		expect(prompt).toContain('GHSA-fjxv-7rqg-78g4');
		expect(prompt).toContain('README Content:');
	});

	it('serves the second identical request from cache with X-Cache: HIT', async () => {
		const POST = await loadPost();
		const first = await POST(postRequest({ owner: 'octocat', repo: 'Hello-World' }));
		expect(first.headers.get('X-Cache')).toBe('MISS');

		const second = await POST(postRequest({ owner: 'octocat', repo: 'Hello-World' }));
		expect(second.status).toBe(200);
		expect(second.headers.get('X-Cache')).toBe('HIT');
		expect(second.headers.get('X-Cache-Until')).not.toBeNull();
	});

	it('rejects with 409 when the same repo is already being analyzed', async () => {
		let release: ((v: { done: boolean; value?: string }) => void) | undefined;
		const hanging = new Promise<{ done: boolean; value?: string }>((r) => {
			release = r;
		});
		aiMocks.toTextStream.mockImplementation(() => ({
			getReader: () => ({ read: () => hanging, cancel: async () => undefined }),
		}));

		const POST = await loadPost();
		const body = postRequest({ owner: 'octocat', repo: 'Hello-World' });

		const firstPromise = POST(body);
		await new Promise((r) => setTimeout(r, 30)); // let the first request register in-flight

		const second = await POST(postRequest({ owner: 'octocat', repo: 'Hello-World' }));
		expect(second.status).toBe(409);

		release?.({ done: true, value: undefined });
		const first = await firstPromise;
		expect(first.status).toBe(200); // first request completes normally after dedupe releases
	});

	it('limits real analyses to 10/min per IP (cache misses only)', async () => {
		const POST = await loadPost();
		for (let i = 0; i < 10; i++) {
			const res = await POST(postRequest({ owner: 'octocat', repo: `repo-${i}` }));
			expect(res.status).toBe(200);
			expect(res.headers.get('X-Cache')).toBe('MISS');
		}
		const blocked = await POST(postRequest({ owner: 'octocat', repo: 'repo-10' }));
		expect(blocked.status).toBe(429);
	});
});