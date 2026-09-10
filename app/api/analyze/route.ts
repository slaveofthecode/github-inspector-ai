import { NextRequest, NextResponse } from 'next/server';
import { streamText, toTextStream, createTextStreamResponse } from 'ai';
import {
	getGeminiModel,
	MAX_README_CHARS,
	MAX_OUTPUT_TOKENS,
} from '@/lib/ai';
import { analyzeBodySchema } from '@/lib/validation';
import { createCache } from '@/lib/cache';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const analysisCache = createCache<string>();
const rateLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });

const SYSTEM_PROMPT = `You are an expert software engineer and repository inspector.
Analyze the provided repository information and README content.
Provide a clear, concise, and structured summary in Markdown including:
- **Overview & Purpose**: What the project does.
- **Key Features**: Primary capabilities.
- **Tech Stack**: Main tools, frameworks, and languages identified.
- **Code Health & Assessment**: Brief feedback or observations based on the README.
- **Suggested Improvements & Fixes**: Concrete, actionable recommendations to improve the repository based only on what you can observe (e.g., missing or outdated documentation, empty/weak README sections, clear setup gaps, missing badges/CI references, dependency alignment, and similar). Present them as a short bulleted list.

Be concise, direct, and specific. Avoid unnecessary fluff.`;

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

	const clientIp = getClientIp(request);
	if (!rateLimiter.check(clientIp).ok) {
		return jsonError('Too many analyses. Try again in a moment.', 429);
	}

	let owner: string;
	let repo: string;
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
					headers: { 'Cache-Control': 'no-store' },
					stream: stringToStream(cached),
				});
			}
		}

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

		const userPrompt = `${truncated ? 'Note: the README was truncated for length.\n' : ''}Repository: ${owner}/${repo}\n\nREADME Content:\n${
			readmeContent || 'No README file found for this repository.'
		}`;

		const result = streamText({
			model: getGeminiModel(),
			system: SYSTEM_PROMPT,
			prompt: userPrompt,
			maxOutputTokens: MAX_OUTPUT_TOKENS,
		});

		const textStream = toTextStream(result);
		const reader = textStream.getReader();

		let firstRead: Awaited<ReturnType<typeof reader.read>> | undefined;
		try {
			firstRead = await reader.read();
		} catch (error) {
			return jsonError(friendlyModelError(error), 507);
		}
		if (!firstRead) {
			return jsonError('AI analysis failed. Please try again.', 500);
		}

		let full = firstRead.done ? '' : firstRead.value;
		const replayStream = new ReadableStream<string>({
			start(controller) {
				if (firstRead.done) {
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
							controller.close();
						} else {
							full += value;
							controller.enqueue(value);
						}
					},
					(error: unknown) => {
						controller.error(new Error(friendlyModelError(error)));
					}
				);
			},
			cancel() {
				reader.cancel().catch(() => undefined);
			},
		});

		return createTextStreamResponse({
			status: 200,
			headers: { 'Cache-Control': 'no-store' },
			stream: replayStream,
		});
	} catch {
		return jsonError('AI analysis failed. Please try again.', 500);
	}
}