import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryOsvDependencies } from '@/lib/osv';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('queryOsvDependencies', () => {
	it('returns [] for an empty dependency array', async () => {
		const spy = vi.spyOn(globalThis, 'fetch');
		const result = await queryOsvDependencies([]);
		expect(result).toEqual([]);
		expect(spy).not.toHaveBeenCalled();
	});

	it('returns a sorted vulnerability list with severity and aliases', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string | Request) => {
			const href = typeof url === 'string' ? url : url.url;
			if (href.includes('querybatch')) {
				return jsonResponse({ results: [{ vulns: [{ id: 'GHSA-1' }, { id: 'GHSA-2' }] }] });
			}
			if (href.includes('/vulns/GHSA-1')) {
				return jsonResponse({
					id: 'GHSA-1',
					aliases: ['CVE-2021-1234', 'GHSA-1'],
					summary: 'Remote code execution',
					database_specific: { severity: 'CRITICAL' },
					affected: [{ package: { name: 'pkg-a' }, versions: ['1.0.0'], ranges: [{ events: [{ introduced: '0', fixed: '1.2.5' }] }] }],
				});
			}
			if (href.includes('/vulns/GHSA-2')) {
				return jsonResponse({
					id: 'GHSA-2',
					aliases: ['GHSA-2'],
					summary: 'Moderate issue',
					database_specific: { severity: 'MODERATE' },
					affected: [{ package: { name: 'pkg-b' }, ranges: [{ events: [{ introduced: '2.0' }, { fixed: '3.0' }] }] }],
				});
			}
			return jsonResponse({ error: 'unexpected url' }, 404);
		}));

		const result = await queryOsvDependencies([
			{ name: 'pkg-a', version: '1.0.0', ecosystem: 'npm' },
			{ name: 'pkg-b', version: '2.5.0', ecosystem: 'npm' },
		]);

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe('GHSA-1');
		expect(result[0].severity).toBe('CRITICAL');
		expect(result[0].aliases).toEqual(['CVE-2021-1234']);
		expect(result[0].affectedVersions).toEqual(
			expect.arrayContaining(['1.0.0', '>=0 <1.2.5'])
		);
		expect(result[0].affectedPackage).toBe('pkg-a');

		expect(result[1].id).toBe('GHSA-2');
		expect(result[1].severity).toBe('MEDIUM'); // MODERATE → MEDIUM
		expect(result[1].affectedVersions).toEqual(['>=2.0 <3.0']);
		expect(result[1].affectedPackage).toBe('pkg-b');
	});

	it('deduplicates vulnerabilities by id', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			if (url.includes('querybatch')) {
				return jsonResponse({ results: [{ vulns: [{ id: 'A' }, { id: 'A' }] }] });
			}
			if (url.includes('/vulns/A')) {
				return jsonResponse({ id: 'A', aliases: [], affected: [] });
			}
			return jsonResponse({ error: '' }, 404);
		}));
		const result = await queryOsvDependencies([{ name: 'x', version: '1.0', ecosystem: 'npm' }]);
		expect(result).toHaveLength(1);
	});

	it('uses severity from CVSS score when database_specific.severity is absent', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			if (url.includes('querybatch')) return jsonResponse({ results: [{ vulns: [{ id: 'V' }] }] });
			if (url.includes('/vulns/V')) {
				return jsonResponse({ id: 'V', database_specific: { cvss: { score: 7.5 } }, affected: [] });
			}
			return jsonResponse({ error: '' }, 404);
		}));
		const result = await queryOsvDependencies([{ name: 'x', version: '1.0', ecosystem: 'npm' }]);
		expect(result[0].severity).toBe('HIGH');
		expect(result[0].score).toBe(7.5);
	});

	it('returns UNKNOWN severity as fallback when no severity/score is present', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			if (url.includes('querybatch')) return jsonResponse({ results: [{ vulns: [{ id: 'U' }] }] });
			if (url.includes('/vulns/U')) return jsonResponse({ id: 'U', affected: [] });
			return jsonResponse({ error: '' }, 404);
		}));
		const result = await queryOsvDependencies([{ name: 'x', version: '1.0', ecosystem: 'npm' }]);
		expect(result[0].severity).toBe('UNKNOWN');
		expect(result[0].score).toBeNull();
	});

	it('throws when querybatch returns a non-OK status', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
		await expect(
			queryOsvDependencies([{ name: 'x', version: '1.0', ecosystem: 'npm' }])
		).rejects.toThrow('OSV querybatch failed with status 429');
	});

	it('returns null for a raw vuln without an id', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			if (url.includes('querybatch')) return jsonResponse({ results: [{ vulns: [{}] }] });
			return jsonResponse({ error: '' }, 404);
		}));
		const result = await queryOsvDependencies([{ name: 'x', version: '1.0', ecosystem: 'npm' }]);
		expect(result).toEqual([]);
	});

	it('filters aliases to only CVE-* entries', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			if (url.includes('querybatch')) return jsonResponse({ results: [{ vulns: [{ id: 'X' }] }] });
			if (url.includes('/vulns/X')) {
				return jsonResponse({ id: 'X', aliases: ['CVE-2023-99999', 'GHSA-xxxx', 'PYSEC-2023-1'], affected: [] });
			}
			return jsonResponse({ error: '' }, 404);
		}));
		const result = await queryOsvDependencies([{ name: 'x', version: '1.0', ecosystem: 'npm' }]);
		expect(result[0].aliases).toEqual(['CVE-2023-99999']);
	});
});