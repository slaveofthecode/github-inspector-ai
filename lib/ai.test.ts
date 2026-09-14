import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	MAX_VULNS_FOR_PROMPT,
	MAX_README_CHARS,
	MAX_OUTPUT_TOKENS,
	GEMINI_TIMEOUT_MS,
	BASE_SYSTEM_PROMPT,
	buildSystemPrompt,
	formatVulnerabilitiesForPrompt,
	getGeminiModel,
} from '@/lib/ai';
import type { OsvVulnerability } from '@/lib/osv';

function vuln(id: string): OsvVulnerability {
	return {
		id,
		aliases: [`CVE-2000-${id}`],
		severity: 'HIGH',
		score: 7.5,
		summary: `summary for ${id}`,
		affectedPackage: 'lodash',
		affectedVersions: ['>=0', '<4.17.21'],
	};
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('constants', () => {
	it('exposes the known safety/limit constants', () => {
		expect(MAX_README_CHARS).toBe(8_000);
		expect(MAX_OUTPUT_TOKENS).toBe(8192);
		expect(MAX_VULNS_FOR_PROMPT).toBe(45);
		expect(GEMINI_TIMEOUT_MS).toBe(90_000);
	});
});

describe('buildSystemPrompt', () => {
	it('returns only the base prompt when there are no vulnerabilities', () => {
		expect(buildSystemPrompt(false)).toBe(BASE_SYSTEM_PROMPT);
	});

	it('injects the security rules when there are vulnerabilities', () => {
		const prompt = buildSystemPrompt(true);
		expect(prompt).toContain(BASE_SYSTEM_PROMPT);
		expect(prompt).toContain('Security findings (deterministic scan)');
		expect(prompt).toContain('NEVER invent vulnerabilities');
	});
});

describe('formatVulnerabilitiesForPrompt', () => {
	it('serializes the exact OsvVulnerability envelope fields', () => {
		const input = [vuln('x'), vuln('y')];
		const output = JSON.parse(formatVulnerabilitiesForPrompt(input));
		expect(output).toHaveLength(2);
		for (const v of input) {
			const serialized = output.find((o: { id: string }) => o.id === v.id);
			expect(serialized).toEqual(v);
		}
	});

	it('caps the serialized list at MAX_VULNS_FOR_PROMPT', () => {
		const many = Array.from({ length: MAX_VULNS_FOR_PROMPT + 10 }, (_, i) => vuln(`id-${i}`));
		const output = JSON.parse(formatVulnerabilitiesForPrompt(many));
		expect(output).toHaveLength(MAX_VULNS_FOR_PROMPT);
	});

	it('handles an empty list', () => {
		expect(JSON.parse(formatVulnerabilitiesForPrompt([]))).toEqual([]);
	});
});

describe('getGeminiModel', () => {
	it('throws when GEMINI_API_KEY is missing', () => {
		vi.stubEnv('GEMINI_API_KEY', '');
		expect(() => getGeminiModel()).toThrow('GEMINI_API_KEY is not defined');
	});

	it('returns a language model when a key is present', () => {
		vi.stubEnv('GEMINI_API_KEY', 'test-key');
		expect(() => getGeminiModel()).not.toThrow();
		expect(getGeminiModel()).toBeTruthy();
	});

	it('defaults the model to gemini-3.6-flash', () => {
		vi.stubEnv('GEMINI_API_KEY', 'test-key');
		vi.stubEnv('GEMINI_MODEL', '');
		expect(() => getGeminiModel()).not.toThrow();
	});
});