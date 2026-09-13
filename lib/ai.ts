import { createGoogleGenerativeAI, GoogleProvider } from '@ai-sdk/google';
import type { OsvVulnerability } from './osv';

export const MAX_README_CHARS = 8_000;
export const MAX_OUTPUT_TOKENS = 8192;
export const MAX_VULNS_FOR_PROMPT = 45;

export const BASE_SYSTEM_PROMPT = `You are an expert software engineer and repository inspector.
Analyze the provided repository information and README content.
Provide a clear, concise, and structured summary in Markdown including:
- **Overview & Purpose**: What the project does.
- **Key Features**: Primary capabilities.
- **Tech Stack**: Main tools, frameworks, and languages identified.
- **Code Health & Assessment**: Brief feedback or observations based on the README.
- **Suggested Improvements & Fixes**: Concrete, actionable recommendations to improve the repository based only on what you can observe (e.g., missing or outdated documentation, empty/weak README sections, clear setup gaps, missing badges/CI references, dependency alignment, and similar). Present them as a short bulleted list.

Be concise, direct, and specific. Avoid unnecessary fluff.`;

const VULN_EXPLANATION_RULES = `
## Security findings (deterministic scan)

The repository's dependency manifests were checked against OSV.dev by code (not by you). The resulting vulnerability list is included in the prompt as JSON — that is the ONLY source of truth for vulnerabilities.

- Add a "**Security Findings**" section to your summary explaining each listed vulnerability in plain language: what the flaw is, why it matters for THIS repository, its severity, whether the declared dependency is affected, and a concrete recommended fix.
- HARD RULE: Only reference the CVE/GHSA IDs, aliases, severities, scores, summaries, and affected versions that appear in the provided JSON list. NEVER invent vulnerabilities, IDs, aliases, scores, or versions that are not in that list.
- Only claim a specific "fixed version" if it is directly evident from the affected version ranges (e.g. the upper bound of a range like "<2.5.4"). Otherwise recommend upgrading to the latest stable release or consulting the vendor advisory.
- If the list is empty, state briefly that no known vulnerabilities were found in the declared dependencies and do not fabricate any.`;

export function buildSystemPrompt(hasVulnerabilities: boolean): string {
	return hasVulnerabilities
		? `${BASE_SYSTEM_PROMPT}\n\n${VULN_EXPLANATION_RULES}`
		: BASE_SYSTEM_PROMPT;
}

export function formatVulnerabilitiesForPrompt(
	vulnerabilities: OsvVulnerability[]
): string {
	const trimmed = vulnerabilities
		.slice(0, MAX_VULNS_FOR_PROMPT)
		.map((vuln) => ({
			id: vuln.id,
			aliases: vuln.aliases,
			severity: vuln.severity,
			score: vuln.score,
			summary: vuln.summary,
			affectedPackage: vuln.affectedPackage,
			affectedVersions: vuln.affectedVersions,
		}));
	return JSON.stringify(trimmed, null, 2);
}

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
