import { NextRequest, NextResponse } from 'next/server';
import { githubUsernameSchema } from '@/lib/validation';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const reposRateLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const REPOS_PER_PAGE = 100;
const MAX_PAGES = 100;

const REPOS_QUERY = `query GetRepos($login: String!, $after: String) {
	user(login: $login) {
		repositories(
			first: ${REPOS_PER_PAGE}
			after: $after
			orderBy: { field: CREATED_AT, direction: DESC }
			ownerAffiliations: [OWNER, ORGANIZATION_MEMBER]
			privacy: PUBLIC
		) {
			pageInfo {
				hasNextPage
				endCursor
			}
			nodes {
				databaseId
				name
				description
				createdAt
				pushedAt
				url
				languages(
					first: 5
					orderBy: { field: SIZE, direction: DESC }
				) {
					nodes {
						name
					}
				}
			}
		}
	}
}`;

interface GraphQLRepo {
	databaseId: number;
	name: string;
	description: string | null;
	createdAt: string;
	pushedAt: string;
	url: string;
	languages: { nodes: { name: string }[] } | null;
}

interface GraphQLResponse {
	data?: {
		user?: {
			repositories?: {
				pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
				nodes?: GraphQLRepo[] | null;
			} | null;
		} | null;
	};
	errors?: { type?: string; message?: string }[];
}

function jsonError(error: string, status: number) {
	return NextResponse.json({ error }, { status });
}

export async function GET(request: NextRequest) {
	const ipLimiter = reposRateLimiter.check(getClientIp(request));
	if (!ipLimiter.ok) {
		return jsonError('Too many requests. Try again in a moment.', 429);
	}

	// get the username from the request
	const usernameParam = request.nextUrl.searchParams.get('username');
	if (!usernameParam) {
		return jsonError('Username is required', 400);
	}

	const githubUsername = githubUsernameSchema.safeParse(usernameParam);
	if (!githubUsername.success) {
		return jsonError('Invalid GitHub username', 400);
	}
	const username = githubUsername.data;

	if (!process.env.GITHUB_TOKEN) {
		return jsonError(
			'GitHub API token is not configured on this server.',
			503
		);
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
	};

	try {
		const allRepos: GraphQLRepo[] = [];
		let after: string | null = null;
		let pages = 0;

		while (pages < MAX_PAGES) {
			const response = await fetch('https://api.github.com/graphql', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					query: REPOS_QUERY,
					variables: { login: username, after },
				}),
			});

			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					return jsonError(
						'GitHub API token is invalid or expired.',
						503
					);
				}
				return jsonError('Failed to fetch repos', response.status);
			}

			const body: GraphQLResponse = await response.json();

			if (!body.data?.user?.repositories?.nodes) {
				const errors = body.errors ?? [];
				if (
					errors.some(
						(e) =>
							e.type === 'NOT_FOUND' ||
							/Could not resolve to a User/.test(e.message ?? '')
					)
				) {
					return jsonError('GitHub user not found', 404);
				}
				if (errors.some((e) => e.type === 'RATE_LIMITED')) {
					return jsonError(
						'GitHub API rate limit reached. Try again later.',
						429
					);
				}
				return jsonError('Failed to fetch repos', 502);
			}

			allRepos.push(...body.data.user.repositories.nodes);

			if (!body.data.user.repositories.pageInfo?.hasNextPage) break;
			after = body.data.user.repositories.pageInfo.endCursor ?? null;
			pages++;
		}

		allRepos.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);

		const repos = allRepos.map((repo) => ({
			id: repo.databaseId,
			name: repo.name,
			description: repo.description,
			createdAt: repo.createdAt,
			pushedAt: repo.pushedAt,
			languages: (repo.languages?.nodes ?? []).map((n) => n.name),
			htmlUrl: repo.url,
		}));

		return NextResponse.json({
			username,
			total: repos.length,
			repos,
		});
	} catch {
		return jsonError('Internal server error', 500);
	}
}