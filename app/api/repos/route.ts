import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
	// get the username from the request
	const username = request.nextUrl.searchParams.get('username');
	if (!username) {
		return NextResponse.json(
			{ error: 'Username is required' },
			{ status: 400 }
		);
	}

	try {
		// prepare the headers for the request
		const headers = new Headers();
		headers.set('Authorization', `Bearer ${process.env.GITHUB_TOKEN}`);
		headers.set('Content-Type', 'application/json');

		// fetch the repos from the GitHub API
		const response = await fetch(
			`https://api.github.com/users/${username}/repos?per_page=100`,
			{ headers }
		);
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

		// parse the response
		const reposData = await response.json();

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
