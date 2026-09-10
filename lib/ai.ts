import { createGoogleGenerativeAI, GoogleProvider } from '@ai-sdk/google';

export function getGeminiModel() {
	const apiKey: string = process.env.GEMINI_API_KEY as string;
	// Default to gemini-3.6-flash if GEMINI_MODEL is not explicitly set
	const geminiModel: string =
		(process.env.GEMINI_MODEL as string) || 'gemini-3.6-flash';

	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not defined in environment variables.');
	}

	const google: GoogleProvider = createGoogleGenerativeAI({ apiKey });
	return google(geminiModel);
}
