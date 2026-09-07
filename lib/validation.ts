import { z } from 'zod';

export const githubUsernameSchema = z
	.string()
	.trim()
	.min(1, 'Please enter a GitHub URL or username.')
	.regex(
		/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i,
		"That doesn't look like a valid GitHub username."
	);

export function parseGithubInput(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	try {
		if (/^https?:\/\//i.test(trimmed)) {
			const url = new URL(trimmed);
			if (!url.hostname.toLowerCase().endsWith('github.com')) return null;

			const [owner] = url.pathname.split('/').filter(Boolean);
			return owner && githubUsernameSchema.safeParse(owner).success
				? owner
				: null;
		}
	} catch {
		return null;
	}

	return githubUsernameSchema.safeParse(trimmed).success ? trimmed : null;
}
