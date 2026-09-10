import { NextRequest, NextResponse } from 'next/server';
import { streamText, toTextStream, createTextStreamResponse } from 'ai';
import { getGeminiModel } from '@/lib/ai';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { owner, repo } = body;

		if (!owner || !repo) {
			return NextResponse.json(
				{ error: "Both 'owner' and 'repo' are required" },
				{ status: 400 }
			);
		}

		// 1. Prepare headers for GitHub API
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github.v3+json',
			...(process.env.GITHUB_TOKEN && {
				Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
			}),
		};

		// 2. Fetch README content from GitHub API
		const readmeResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repo}/readme`,
			{ headers }
		);

		let readmeContent = '';

		if (readmeResponse.ok) {
			const readmeData = await readmeResponse.json();
			// Decode base64 README content
			if (readmeData.content) {
				readmeContent = Buffer.from(readmeData.content, 'base64').toString(
					'utf-8'
				);
			}
		}

		// 3. Prepare prompt for Gemini
		const systemPrompt = `You are an expert software engineer and repository inspector.
Analyze the provided repository information and README content.
Provide a clear, concise, and structured summary in Markdown including:
- **Overview & Purpose**: What the project does.
- **Key Features**: Primary capabilities.
- **Tech Stack**: Main tools, frameworks, and languages identified.
- **Code Health & Assessment**: Brief feedback or observations based on the README.

Be concise and direct. Avoid unnecessary fluff.`;

		const userPrompt = `Repository: ${owner}/${repo}\n\nREADME Content:\n${
			readmeContent || 'No README file found for this repository.'
		}`;

		// 4. Stream response using Gemini via Vercel AI SDK
		const model = getGeminiModel();
		const result = streamText({
			model,
			system: systemPrompt,
			prompt: userPrompt,
		});

		return createTextStreamResponse({ stream: toTextStream(result) });
	} catch (error: unknown) {
		if (error instanceof Error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
		return NextResponse.json(
			{ error: 'An unexpected error occurred during analysis' },
			{ status: 500 }
		);
	}
}
