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

		// fetch languages for each repo and extract the top 5
		const reposWithLanguages = await Promise.all(
			reposData.map(async (repo: IGitHubRepo) => {
				const languagesResponse = await fetch(repo.languages_url);
				const languagesData = await languagesResponse.json();
				const languages = Object.keys(languagesData)
					.sort((a: string, b: string) => languagesData[b] - languagesData[a])
					.slice(0, 5);

				return {
					id: repo.id,
					name: repo.name,
					description: repo.description,
					createdAt: repo.created_at,
					pushedAt: repo.pushed_at,
					languages: languages,
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
