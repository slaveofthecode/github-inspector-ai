import type { Dependency } from './manifests';

export type VulnSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface OsvVulnerability {
	id: string;
	aliases: string[];
	severity: VulnSeverity;
	score: number | null;
	summary: string | null;
	affectedPackage: string | null;
	affectedVersions: string[];
}

const MAX_OSV_QUERIES = 250;
const MAX_OSV_DETAILS = 30;
const OSV_DETAIL_CONCURRENCY = 6;

interface OsvAffected {
	package?: { name?: string };
	versions?: string[];
	ranges?: { events?: { introduced?: string; fixed?: string }[] }[];
}

interface OsvRawVuln {
	id?: string;
	aliases?: string[];
	summary?: string;
	database_specific?: { severity?: string; cvss?: { score?: number } };
	severity?: { type?: string; score?: string }[];
	affected?: OsvAffected[];
}

function severityFromScore(score: number): VulnSeverity {
	if (score >= 9) return 'CRITICAL';
	if (score >= 7) return 'HIGH';
	if (score >= 4) return 'MEDIUM';
	return 'LOW';
}

function severityFromRaw(vuln: OsvRawVuln): {
	severity: VulnSeverity;
	score: number | null;
} {
	const dbSeverity = vuln.database_specific?.severity;
	if (dbSeverity) {
		const upper = dbSeverity.toUpperCase();
		if (upper === 'MODERATE') return { severity: 'MEDIUM', score: null };
		if (upper === 'CRITICAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') {
			return { severity: upper, score: null };
		}
	}
	const dbScore = vuln.database_specific?.cvss?.score;
	if (typeof dbScore === 'number' && Number.isFinite(dbScore)) {
		return { severity: severityFromScore(dbScore), score: dbScore };
	}
	if (Array.isArray(vuln.severity) && vuln.severity.length > 0) {
		return { severity: 'UNKNOWN', score: null };
	}
	return { severity: 'UNKNOWN', score: null };
}

function affectedVersions(affected: OsvAffected | undefined): string[] {
	if (!affected) return [];
	const out: string[] = [...(affected.versions ?? [])];
	for (const range of affected.ranges ?? []) {
		const events = range.events ?? [];
		const introduced = events
			.filter((event) => event.introduced)
			.map((event) => event.introduced as string);
		const fixed = events
			.filter((event) => event.fixed)
			.map((event) => event.fixed as string);
		if (introduced.length || fixed.length) {
			const parts = introduced.map((v) => `>=${v}`);
			if (fixed.length) parts.push(`<${fixed[fixed.length - 1]}`);
			out.push(parts.join(' '));
		}
	}
	return Array.from(new Set(out)).slice(0, 5);
}

function normalizeVuln(raw: OsvRawVuln): OsvVulnerability | null {
	if (!raw.id) return null;
	const { severity, score } = severityFromRaw(raw);
	const firstAffected = raw.affected?.[0];
	return {
		id: raw.id,
		aliases: (raw.aliases ?? []).filter((alias) => alias.startsWith('CVE-')),
		severity,
		score,
		summary: raw.summary ?? null,
		affectedPackage: firstAffected?.package?.name ?? null,
		affectedVersions: affectedVersions(firstAffected),
	};
}

export async function queryOsvDependencies(
	deps: Dependency[]
): Promise<OsvVulnerability[]> {
	if (deps.length === 0) return [];

	const queries = deps.slice(0, MAX_OSV_QUERIES).map((dep) => ({
		package: { ecosystem: dep.ecosystem, name: dep.name },
		version: dep.version,
	}));

	const response = await fetch('https://api.osv.dev/v1/querybatch', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ queries }),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`OSV querybatch failed with status ${response.status}`);
	}

	const data = (await response.json()) as {
		results?: { vulns?: { id?: string }[] }[];
	};
	const ids: string[] = [];
	for (const result of data.results ?? []) {
		for (const summary of result?.vulns ?? []) {
			if (typeof summary.id === 'string') ids.push(summary.id);
		}
	}
	const uniqueIds = Array.from(new Set(ids)).slice(0, MAX_OSV_DETAILS);
	const details = await fetchOsvDetails(uniqueIds);

	const seen = new Set<string>();
	const found: OsvVulnerability[] = [];
	for (const raw of details) {
		const vuln = normalizeVuln(raw);
		if (!vuln || seen.has(vuln.id)) continue;
		seen.add(vuln.id);
		found.push(vuln);
	}

	const rank: Record<VulnSeverity, number> = {
		CRITICAL: 4,
		HIGH: 3,
		MEDIUM: 2,
		LOW: 1,
		UNKNOWN: 0,
	};
	return found.sort(
		(a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0)
	);
}

async function fetchOsvDetails(
	ids: string[]
): Promise<OsvRawVuln[]> {
	const details: OsvRawVuln[] = [];
	for (let i = 0; i < ids.length; i += OSV_DETAIL_CONCURRENCY) {
		const batch = ids.slice(i, i + OSV_DETAIL_CONCURRENCY);
		const results = await Promise.all(
			batch.map(async (id) => {
				try {
					const response = await fetch(
						`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
						{ signal: AbortSignal.timeout(10_000) }
					);
					if (!response.ok) return null;
					return (await response.json()) as OsvRawVuln;
				} catch {
					return null;
				}
			})
		);
		for (const detail of results) {
			if (detail) details.push(detail);
		}
	}
	return details;
}