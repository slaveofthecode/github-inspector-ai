import { NextRequest, NextResponse } from 'next/server';
import { githubUsernameSchema } from '@/lib/validation';

interface IGitHubRepo {
	id: number;
	name: string;
	description: string;
	html_url: string;
	stargazers_count: number;
	forks_count: number;
	created_at: string;
	updated_at: string;
	pushed_at: string;
	languages_url: string;
}

function getNextPageUrl(linkHeader: string | null): string | null {
	if (!linkHeader) return null;

	for (const part of linkHeader.split(',')) {
		const [urlPart, ...relParts] = part.split(';').map((s) => s.trim());
		if (
			relParts.some((rel) => rel.includes('rel="next"')) &&
			urlPart?.startsWith('<') &&
			urlPart.endsWith('>')
		) {
			return urlPart.slice(1, -1);
		}
	}
	return null;
}

export async function GET(request: NextRequest) {
	// get the username from the request
	const usernameParam = request.nextUrl.searchParams.get('username');
	if (!usernameParam) {
		return NextResponse.json(
			{ error: 'Username is required' },
			{ status: 400 }
		);
	}

	const githubUsername = githubUsernameSchema.safeParse(usernameParam);
	if (!githubUsername.success) {
		return NextResponse.json(
			{
				error: 'Invalid GitHub username',
			},
			{
				status: 400,
			}
		);
	}
	const username = githubUsername.data;

	try {
		// prepare the headers for the request
		const headers = new Headers();

		if (process.env.GITHUB_TOKEN) {
			headers.set('Authorization', `Bearer ${process.env.GITHUB_TOKEN}`);
		}
		headers.set('Content-Type', 'application/json');

		// fetch ALL the repos from the GitHub API (paginated, up to 100 per page)
		const allRepos: IGitHubRepo[] = [];
		let pageUrl: string | null =
			`https://api.github.com/users/${username}/repos?per_page=100`;

		// safety net: GitHub lists at most 100 repos per page; cap total pages
		let pagesFetched = 0;
		while (pageUrl && pagesFetched < 100) {
			const response = await fetch(pageUrl, { headers });
			if (!response.ok) {
				if (response.status === 404) {
					return NextResponse.json(
						{ error: 'GitHub user not found' },
						{ status: 404 }
					);
				}
				return NextResponse.json(
					{ error: 'Failed to fetch repos' },
					{ status: response.status }
				);
			}

			const pageData: IGitHubRepo[] = await response.json();
			allRepos.push(...pageData);
			pageUrl = getNextPageUrl(response.headers.get('link'));
			pagesFetched++;
		}

		const reposData = allRepos;

		// sort by created at descending
		reposData.sort(
			(a: IGitHubRepo, b: IGitHubRepo) =>
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);

		// 5. Fetch languages for each repository and extract the top 5
		const reposWithLanguages = await Promise.all(
			reposData.map(async (repo: IGitHubRepo) => {
				let topLanguages: string[] = [];

				try {
					// Build clean URL directly using repo owner and name
					const languagesApiUrl = `https://api.github.com/repos/${username}/${repo.name}/languages`;

					const langResponse = await fetch(languagesApiUrl, { headers });

					if (langResponse.ok) {
						const languagesData = await langResponse.json();

						// Ensure the response is a languages object and not an error response
						if (languagesData && !languagesData.message) {
							topLanguages = Object.keys(languagesData)
								.sort((a, b) => languagesData[b] - languagesData[a])
								.slice(0, 5);
						}
					}
				} catch {
					topLanguages = [];
				}

				return {
					id: repo.id,
					name: repo.name,
					description: repo.description,
					createdAt: repo.created_at,
					pushedAt: repo.pushed_at,
					languages: topLanguages,
					htmlUrl: repo.html_url,
				};
			})
		);

		return NextResponse.json({
			username,
			total: reposWithLanguages.length,
			repos: reposWithLanguages,
		});
	} catch {
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
