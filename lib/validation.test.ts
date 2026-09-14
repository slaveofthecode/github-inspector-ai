import { describe, it, expect } from 'vitest';
import {
	githubUsernameSchema,
	repoNameSchema,
	analyzeBodySchema,
	parseGithubInput,
} from '@/lib/validation';

describe('githubUsernameSchema', () => {
	it('accepts valid usernames', () => {
		for (const name of ['octocat', 'slaveofthecode', 'a', 'git-consortium', 'Ab1-Cd2', 'x'.repeat(39)]) {
			expect(githubUsernameSchema.safeParse(name).success).toBe(true);
		}
	});

	it('rejects invalid usernames', () => {
		for (const name of ['', '-leading', 'trailing-', 'double--dash', 'with space', 'with/slash', 'ümlaut', 'x'.repeat(40)]) {
			expect(githubUsernameSchema.safeParse(name).success).toBe(false);
		}
	});

	it('trims surrounding whitespace before validating', () => {
		expect(githubUsernameSchema.safeParse('  octocat  ').success).toBe(true);
		expect(githubUsernameSchema.parse('  octocat  ')).toBe('octocat');
	});
});

describe('repoNameSchema', () => {
	it('accepts valid repository names', () => {
		for (const name of ['hello', 'my-repo', 'my.repo', 'my_repo', 'a', 'repo.v2', 'A-B.c_d']) {
			expect(repoNameSchema.safeParse(name).success).toBe(true);
		}
	});

	it('rejects invalid repository names', () => {
		for (const name of ['', '-leading', 'trailing-', '.leading', 'trailing.', '_leading', 'has space', 'has/slash', 'a'.repeat(101)]) {
			expect(repoNameSchema.safeParse(name).success).toBe(false);
		}
	});
});

describe('analyzeBodySchema', () => {
	it('accepts a valid owner/repo/sha body', () => {
		const parsed = analyzeBodySchema.safeParse({
			owner: 'octocat',
			repo: 'Hello-World',
			sha: '610bccd0d05608b8ef8f6e91e0a89403f38389ae',
		});
		expect(parsed.success).toBe(true);
	});

	it('allows sha to be omitted', () => {
		const parsed = analyzeBodySchema.safeParse({ owner: 'octocat', repo: 'Hello-World' });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.sha).toBeUndefined();
	});

	it('rejects extra fields or invalid owner/repo', () => {
		expect(analyzeBodySchema.safeParse({ owner: 'octocat' }).success).toBe(false);
		expect(analyzeBodySchema.safeParse({ owner: '', repo: 'Hello-World' }).success).toBe(false);
		expect(analyzeBodySchema.safeParse({ owner: 'octocat', repo: 'bad repo!' }).success).toBe(false);
		expect(analyzeBodySchema.safeParse({ owner: 'octocat', repo: 'Hello-World', sha: 'x'.repeat(41) }).success).toBe(false);
	});
});

describe('parseGithubInput', () => {
	it('returns the username for a plain valid input', () => {
		expect(parseGithubInput('octocat')).toBe('octocat');
		expect(parseGithubInput('  slaveofthecode  ')).toBe('slaveofthecode');
		expect(parseGithubInput('GitHubUser')).toBe('GitHubUser');
	});

	it('extracts the owner from a github.com URL', () => {
		expect(parseGithubInput('https://github.com/octocat')).toBe('octocat');
		expect(parseGithubInput('https://github.com/octocat/Hello-World')).toBe('octocat');
		expect(parseGithubInput('http://github.com/user')).toBe('user');
	});

	it('rejects non-github hosts and empty input', () => {
		expect(parseGithubInput('https://example.com/user')).toBeNull();
		expect(parseGithubInput('')).toBeNull();
		expect(parseGithubInput('   ')).toBeNull();
	});

	it('rejects invalid usernames or malformed URLs', () => {
		expect(parseGithubInput('not a user')).toBeNull();
		expect(parseGithubInput('https://')).toBeNull();
		expect(parseGithubInput('https://github.com/-bad')).toBeNull();
		expect(parseGithubInput('https://github.com/')).toBeNull();
	});
});