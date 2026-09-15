import { NextRequest, NextResponse } from 'next/server';
import { streamText, toTextStream, createTextStreamResponse } from 'ai';
import {
	buildSystemPrompt,
	formatVulnerabilitiesForPrompt,
	GEMINI_TIMEOUT_MS,
	getGeminiModel,
	MAX_README_CHARS,
	MAX_OUTPUT_TOKENS,
} from '@/lib/ai';
import { analyzeBodySchema } from '@/lib/validation';
import { createCache } from '@/lib/cache';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import {
	KNOWN_MANIFESTS,
	MAX_MANIFEST_BYTES,
	MAX_MANIFESTS,
	parseManifest,
} from '@/lib/manifests';
import type { Dependency } from '@/lib/manifests';
import type { OsvVulnerability } from '@/lib/osv';
import { queryOsvDependencies } from '@/lib/osv';

const ANALYSIS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const analysisCache = createCache<string>({ ttlMs: ANALYSIS_CACHE_TTL_MS });
const rateLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const inFlightAnalyses = new Set<string>();

function jsonError(error: string, status: number) {
	return NextResponse.json({ error }, { status });
}

function githubHeaders(): Record<string, string> {
	return {
		Accept: 'application/vnd.github.v3+json',
		...(process.env.GITHUB_TOKEN
			? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
			: {}),
	};
}

async function fetchManifestContent(
	owner: string,
	repo: string,
	path: string,
	ref: string
): Promise<string | null> {
	const url = new URL(
		`https://api.github.com/repos/${owner}/${repo}/contents/${path
			.split('/')
			.map(encodeURIComponent)
			.join('/')}`
	);
	url.searchParams.set('ref', ref);
	const response = await fetch(url, { headers: githubHeaders() });
	if (!response.ok) return null;
	const data = await response.json();
	if (typeof data.content !== 'string') return null;
	const text = Buffer.from(data.content, 'base64').toString('utf-8');
	return text.length > MAX_MANIFEST_BYTES ? null : text;
}

async function collectVulnerabilities(
	owner: string,
	repo: string,
	ref: string
): Promise<{
	manifestsAnalyzed: number;
	dependenciesChecked: number;
	vulnerabilities: OsvVulnerability[];
}> {
	const url = new URL(
		`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
			ref
		)}`
	);
	url.searchParams.set('recursive', '1');
	const treeResponse = await fetch(url, { headers: githubHeaders() });
	if (!treeResponse.ok) {
		return { manifestsAnalyzed: 0, dependenciesChecked: 0, vulnerabilities: [] };
	}
	const treeData = await treeResponse.json();
	const tree: { path?: string; type?: string; size?: number }[] = Array.isArray(
		treeData.tree
	)
		? treeData.tree
		: [];

	const digest = new Map<string, Dependency>();
	let analyzed = 0;
	for (const entry of tree) {
		if (analyzed >= MAX_MANIFESTS) break;
		if (entry.type !== 'blob' || typeof entry.path !== 'string') continue;
		const basename = entry.path.split('/').pop() ?? '';
		if (!KNOWN_MANIFESTS.includes(basename)) continue;
		if (typeof entry.size === 'number' && entry.size > MAX_MANIFEST_BYTES) continue;

		const content = await fetchManifestContent(owner, repo, entry.path, ref);
		if (content === null) continue;
		for (const dep of parseManifest(entry.path, content)) {
			digest.set(`${dep.ecosystem}:${dep.name}@${dep.version}`, dep);
		}
		analyzed += 1;
	}

	const vulnerabilities =
		digest.size > 0 ? await queryOsvDependencies([...digest.values()]) : [];
	return {
		manifestsAnalyzed: analyzed,
		dependenciesChecked: digest.size,
		vulnerabilities,
	};
}

function stringToStream(text: string): ReadableStream<string> {
	return new ReadableStream<string>({
		start(controller) {
			controller.enqueue(text);
			controller.close();
		},
	});
}

function friendlyModelError(error: unknown): string {
	const apiError = error as { name?: string; statusCode?: number };
	if (apiError.name === 'AbortError' || apiError.name === 'TimeoutError') {
		return 'Analysis timed out after 90 seconds. The repository may be too large, or the AI service is busy. Please try again later.';
	}
	if (apiError.name === 'AI_APICallError') {
		if (apiError.statusCode === 429) return 'AI daily quota is exhausted. Try again later.';
		if (apiError.statusCode === 404)
			return 'AI analysis is temporarily unavailable. Please try again later.';
	}
	return 'AI analysis failed. Please try again.';
}

export async function POST(request: NextRequest) {
	if (!process.env.GEMINI_API_KEY) {
		return jsonError('AI analysis is not configured on this server.', 503);
	}

	let owner: string;
	let repo: string;
	let dedupeKey = '';
	try {
		const parsed = analyzeBodySchema.safeParse(await request.json());
		if (!parsed.success) {
			return jsonError('Invalid owner or repository name.', 400);
		}
		owner = parsed.data.owner;
		repo = parsed.data.repo;
	} catch {
		return jsonError('Invalid request body.', 400);
	}

	try {
		let defaultBranch = 'main';
		let revision = '';
		let cacheable = false;

		const repoResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repo}`,
			{ headers: githubHeaders() }
		);
		if (repoResponse.status === 404) {
			return jsonError('Repository not found.', 404);
		}
		if (repoResponse.status === 403) {
			return jsonError('Repository is private or not accessible.', 403);
		}
		if (!repoResponse.ok) {
			return jsonError('Failed to fetch the repository.', repoResponse.status);
		}
		const repoData = await repoResponse.json();
		if (typeof repoData.default_branch === 'string') {
			defaultBranch = repoData.default_branch;
		}

		const commitResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repo}/commits/${defaultBranch}`,
			{ headers: githubHeaders() }
		);
		if (commitResponse.ok) {
			const commitData = await commitResponse.json();
			if (typeof commitData.sha === 'string') {
				revision = commitData.sha;
				cacheable = true;
			}
		}
		if (!cacheable && typeof repoData.pushed_at === 'string') {
			revision = repoData.pushed_at;
			cacheable = true;
		}

		const cacheKey = `${owner}/${repo}@${revision}`;
		if (cacheable) {
			const cached = analysisCache.get(cacheKey);
			if (cached !== null) {
				return createTextStreamResponse({
					status: 200,
					headers: {
						'Cache-Control': 'no-store',
						'X-Cache': 'HIT',
						'X-Cache-Until': new Date(cached.expiresAt).toISOString(),
					},
					stream: stringToStream(cached.value),
				});
			}
		}

		dedupeKey = `${owner}/${repo}`;
		if (inFlightAnalyses.has(dedupeKey)) {
			return jsonError(
				'This repository is already being analyzed. Please wait.',
				409
			);
		}
		inFlightAnalyses.add(dedupeKey);

		const clientIp = getClientIp(request);
		if (!rateLimiter.check(clientIp).ok) {
			return jsonError('Too many analyses. Try again in a moment.', 429);
		}

		const treeRef = /^[0-9a-f]{40}$/.test(revision)
			? revision
			: defaultBranch;
		let vulnerabilitiesPayload: {
			manifestsAnalyzed: number;
			dependenciesChecked: number;
			vulnerabilities: OsvVulnerability[];
		};
		try {
			vulnerabilitiesPayload = await collectVulnerabilities(
				owner,
				repo,
				treeRef
			);
		} catch {
			vulnerabilitiesPayload = {
				manifestsAnalyzed: 0,
				dependenciesChecked: 0,
				vulnerabilities: [],
			};
		}
		const metadataHeader = `${JSON.stringify({
			type: 'vulns',
			...vulnerabilitiesPayload,
		})}\n`;

		let readmeContent = '';
		let truncated = false;
		const readmeResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repo}/readme`,
			{ headers: githubHeaders() }
		);
		if (readmeResponse.ok) {
			try {
				const readmeData = await readmeResponse.json();
				if (typeof readmeData.content === 'string') {
					readmeContent = Buffer.from(readmeData.content, 'base64').toString(
						'utf-8'
					);
					if (readmeContent.length > MAX_README_CHARS) {
						readmeContent = readmeContent.slice(0, MAX_README_CHARS);
						truncated = true;
					}
				}
			} catch {
				readmeContent = '';
			}
		}

		const hasVulnerabilities =
			vulnerabilitiesPayload.vulnerabilities.length > 0;
		const vulnerabilitiesBlock = hasVulnerabilities
			? `\n\nDeterministic dependency scan (source: OSV.dev, authoritative — do not add or modify anything):\n${formatVulnerabilitiesForPrompt(
					vulnerabilitiesPayload.vulnerabilities
				)}`
			: '';

		const userPrompt = `${truncated ? 'Note: the README was truncated for length.\n' : ''}Repository: ${owner}/${repo}${vulnerabilitiesBlock}\n\nREADME Content:\n${
			readmeContent || 'No README file found for this repository.'
		}`;

		const result = streamText({
			model: getGeminiModel(),
			system: buildSystemPrompt(hasVulnerabilities),
			prompt: userPrompt,
			maxOutputTokens: MAX_OUTPUT_TOKENS,
			abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
		});

		const textStream = toTextStream(result);
		const reader = textStream.getReader();

		let firstRead: Awaited<ReturnType<typeof reader.read>> | undefined;
		try {
			firstRead = await reader.read();
		} catch (error) {
			inFlightAnalyses.delete(dedupeKey);
			return jsonError(friendlyModelError(error), 507);
		}
		if (!firstRead) {
			inFlightAnalyses.delete(dedupeKey);
			return jsonError('AI analysis failed. Please try again.', 500);
		}

		let full = metadataHeader + (firstRead.done ? '' : firstRead.value);
		const replayStream = new ReadableStream<string>({
			start(controller) {
				controller.enqueue(metadataHeader);
				if (firstRead.done) {
					inFlightAnalyses.delete(dedupeKey);
					controller.close();
					return;
				}
				controller.enqueue(firstRead.value);
			},
			pull(controller) {
				return reader.read().then(
					({ done, value }) => {
						if (done) {
							if (cacheable) {
								analysisCache.set(cacheKey, full);
							}
							inFlightAnalyses.delete(dedupeKey);
							controller.close();
						} else {
							full += value;
							controller.enqueue(value);
						}
					},
					(error: unknown) => {
						inFlightAnalyses.delete(dedupeKey);
						controller.error(new Error(friendlyModelError(error)));
					}
				);
			},
			cancel() {
				inFlightAnalyses.delete(dedupeKey);
				reader.cancel().catch(() => undefined);
			},
		});

		return createTextStreamResponse({
			status: 200,
			headers: {
				'Cache-Control': 'no-store',
				'X-Cache': 'MISS',
				...(cacheable
					? { 'X-Cache-Until': new Date(Date.now() + ANALYSIS_CACHE_TTL_MS).toISOString() }
					: {}),
			},
			stream: replayStream,
		});
	} catch {
		if (dedupeKey) inFlightAnalyses.delete(dedupeKey);
		return jsonError('AI analysis failed. Please try again.', 500);
	}
}
