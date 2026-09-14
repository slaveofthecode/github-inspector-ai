import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

type GetHandler = (request: NextRequest) => Promise<Response>;

async function loadGet(): Promise<GetHandler> {
	vi.resetModules();
	const mod = await import('./route');
	return mod.GET;
}

function makeRequest(username?: string): NextRequest {
	const url = new URL('http://localhost/api/repos');
	if (username !== undefined) url.searchParams.set('username', username);
	return new NextRequest(url);
}

function graphqlNode(id: number, name: string, createdAt: string, languages: string[] = []) {
	return {
		databaseId: id,
		name,
		description: `${name} desc`,
		createdAt,
		pushedAt: '2025-01-01T00:00:00Z',
		url: `https://github.com/octocat/${name}`,
		languages: { nodes: languages.map((name) => ({ name })) },
	};
}

function graphqlResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function okBody(nodes: unknown[], pageInfo?: unknown) {
	return {
		data: {
			user: { repositories: { pageInfo: pageInfo ?? { hasNextPage: false, endCursor: null }, nodes } },
		},
	};
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubEnv('GITHUB_TOKEN', 'test-token');
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('GET /api/repos', () => {
	it('returns 400 when username is missing', async () => {
		const GET = await loadGet();
		const res = await GET(makeRequest());
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Username is required' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns 400 for an invalid username', async () => {
		const GET = await loadGet();
		const res = await GET(makeRequest('invalid user!'));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Invalid GitHub username' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns 503 when GITHUB_TOKEN is not configured', async () => {
		vi.stubEnv('GITHUB_TOKEN', '');
		const GET = await loadGet();
		const res = await GET(makeRequest('octocat'));
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: 'GitHub API token is not configured on this server.' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a mapped, created-at-desc sorted repo list on success', async () => {
		fetchMock.mockResolvedValue(
			graphqlResponse(
				okBody([
					graphqlNode(1, 'older', '2020-01-01T00:00:00Z', ['Ruby']),
					graphqlNode(2, 'newer', '2024-06-01T00:00:00Z', ['TypeScript', 'CSS']),
					graphqlNode(3, 'middle', '2022-03-15T00:00:00Z'),
				])
			)
		);
		const GET = await loadGet();
		const res = await GET(makeRequest('octocat'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.username).toBe('octocat');
		expect(body.total).toBe(3);
		expect(body.repos.map((r: { id: number }) => r.id)).toEqual([2, 3, 1]);
		expect(body.repos[0]).toEqual({
			id: 2,
			name: 'newer',
			description: 'newer desc',
			createdAt: '2024-06-01T00:00:00Z',
			pushedAt: '2025-01-01T00:00:00Z',
			languages: ['TypeScript', 'CSS'],
			htmlUrl: 'https://github.com/octocat/newer',
		});
		expect(body.repos[1].languages).toEqual([]); // 'middle' repo (id 3)
		expect(body.repos[2].languages).toEqual(['Ruby']); // 'older' repo (id 1)
	});

	it('requests further pages with the endCursor until hasNextPage is false', async () => {
		fetchMock
			.mockResolvedValueOnce(
				graphqlResponse(
					okBody([graphqlNode(1, 'page1-a', '2020-01-01T00:00:00Z')], {
						hasNextPage: true,
						endCursor: 'cursor-123',
					})
				)
			)
			.mockResolvedValueOnce(
				graphqlResponse(okBody([graphqlNode(2, 'page2-b', '2021-01-01T00:00:00Z')]))
			);

		const GET = await loadGet();
		const res = await GET(makeRequest('octocat'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.total).toBe(2);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const firstInit = fetchMock.mock.calls[0][1];
		const secondInit = fetchMock.mock.calls[1][1];
		expect(JSON.parse(firstInit.body).variables.after).toBeNull();
		expect(JSON.parse(secondInit.body).variables.after).toBe('cursor-123');
	});

	it('maps a NOT_FOUND GraphQL error to 404', async () => {
		fetchMock.mockResolvedValue(
			graphqlResponse({
				data: { user: null },
				errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a User' }],
			})
		);
		const GET = await loadGet();
		const res = await GET(makeRequest('ghost-user'));
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: 'GitHub user not found' });
	});

	it('maps a RATE_LIMITED GraphQL error to 429', async () => {
		fetchMock.mockResolvedValue(
			graphqlResponse({
				data: { user: null },
				errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
			})
		);
		const GET = await loadGet();
		const res = await GET(makeRequest('octocat'));
		expect(res.status).toBe(429);
	});

	it('maps GitHub HTTP 401/403 to 503 (invalid/expired token)', async () => {
		fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
		const GET = await loadGet();
		const res = await GET(makeRequest('octocat'));
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.error).toMatch(/invalid or expired/i);
	});

	it('rate-limits the endpoint at 10 requests/min per IP', async () => {
		fetchMock.mockImplementation(async () => graphqlResponse(okBody([])));
		const GET = await loadGet();
		for (let i = 0; i < 10; i++) {
			const res = await GET(makeRequest('octocat'));
			expect(res.status).toBe(200);
		}
		const blocked = await GET(makeRequest('octocat'));
		expect(blocked.status).toBe(429);
	});
});