import { NextResponse } from 'next/server';

export async function GET() {
	return NextResponse.json({
		status: 'ok',
		geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
		geminiModel: process.env.GEMINI_MODEL || null,
		githubConfigured: Boolean(process.env.GITHUB_TOKEN),
		environment: process.env.NODE_ENV,
	});
}