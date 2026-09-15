'use client';

import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { OsvVulnerability, VulnSeverity } from '@/lib/osv';

interface RepoAnalysisProps {
	owner: string;
	repo: string;
}

const SEVERITY_STYLES: Record<string, string> = {
	CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/40',
	HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
	MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
	LOW: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40',
	UNKNOWN: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/40',
};

// GitHub-conventional severity palette for the distribution bar + legend.
const SEVERITY_ORDER: VulnSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const SEVERITY_META: Record<VulnSeverity, { label: string; color: string }> = {
	CRITICAL: { label: 'Critical', color: '#b91c1c' },
	HIGH: { label: 'High', color: '#f0883e' },
	MEDIUM: { label: 'Medium', color: '#d4a72c' },
	LOW: { label: 'Low', color: '#22d3ee' },
	UNKNOWN: { label: 'Unknown', color: '#8250df' },
};

function SeverityBadge({ severity }: { severity: string }) {
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
				SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.UNKNOWN
			}`}
		>
			{severity === 'UNKNOWN' ? 'Info' : severity}
		</span>
	);
}

export interface MarkdownSection {
	heading: string;
	body: string;
}

export function parseSections(md: string): MarkdownSection[] {
	const lines = md.split(/\r?\n/);
	const sections: MarkdownSection[] = [];
	const lead: string[] = [];
	let current: MarkdownSection | null = null;

	for (const line of lines) {
		const match = line.match(/^(#{1,4})\s+(.+)$/);
		if (match) {
			// Strip markdown emphasis (e.g. "## **Tech Stack**") from the tab label.
			const heading = match[2].replace(/\*+/g, '').trim();
			current = { heading, body: '' };
			sections.push(current);
		} else if (current) {
			current.body += `${line}\n`;
		} else {
			lead.push(line);
		}
	}

	if (sections.length > 0 && lead.length > 0 && sections[0]) {
		sections[0].body = `${lead.join('\n')}\n${sections[0].body}`;
	}

	return sections;
}

export function RepoAnalysis({ owner, repo }: RepoAnalysisProps) {
	const [analysis, setAnalysis] = useState('');
	const [loading, setLoading] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [vulnerabilities, setVulnerabilities] = useState<
		OsvVulnerability[] | null
	>(null);
	const [manifestsAnalyzed, setManifestsAnalyzed] = useState(0);
	const [dependenciesChecked, setDependenciesChecked] = useState(0);
	const [cachedUntil, setCachedUntil] = useState<string | null>(null);
	const [showDetails, setShowDetails] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [userPinned, setUserPinned] = useState(false);
	const inFlightRef = useRef(false);

	const severityCounts = useMemo(() => {
		const counts: Record<VulnSeverity, number> = {
			CRITICAL: 0,
			HIGH: 0,
			MEDIUM: 0,
			LOW: 0,
			UNKNOWN: 0,
		};
		for (const vuln of vulnerabilities ?? []) {
			counts[vuln.severity] = (counts[vuln.severity] ?? 0) + 1;
		}
		return counts;
	}, [vulnerabilities]);

	const sections = useMemo(() => {
		const parsed = parseSections(analysis);
		// Pin "Security Findings" as the first tab so it reads immediately after the severity bar.
		const secIdx = parsed.findIndex((s) => /security findings/i.test(s.heading));
		if (secIdx > 0) {
			const [security] = parsed.splice(secIdx, 1);
			parsed.unshift(security);
		}
		return parsed;
	}, [analysis]);
	const hasSections = sections.length > 0;

	const defaultIndex = useMemo(() => {
		const secIdx = sections.findIndex((s) => /security findings/i.test(s.heading));
		return secIdx >= 0 ? secIdx : 0;
	}, [sections]);
	const activeIndex = userPinned ? selectedIndex : defaultIndex;

	const severityAriaLabel = SEVERITY_ORDER.filter(
		(sev) => severityCounts[sev] > 0
	)
		.map((sev) => `${SEVERITY_META[sev].label}: ${severityCounts[sev]}`)
		.join(', ');

	const handleAnalyze = async () => {
		if (inFlightRef.current) return;

		// Toggle accordion if analysis was already fetched
		if (analysis && !loading) {
			setIsOpen(!isOpen);
			return;
		}

		inFlightRef.current = true;
		setLoading(true);
		setError(null);
		setIsOpen(true);
		setAnalysis('');
		setVulnerabilities(null);
		setManifestsAnalyzed(0);
		setDependenciesChecked(0);
		setCachedUntil(null);
		setShowDetails(false);
		setSelectedIndex(0);
		setUserPinned(false);

		try {
			const response = await fetch('/api/analyze', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ owner, repo }),
			});

			const serverCachedUntil = response.headers.get('x-cache-until');
			setCachedUntil(serverCachedUntil || null);

			if (!response.ok) {
				let message = 'Failed to analyze repository';
				try {
					const data = await response.json();
					if (typeof data?.error === 'string') {
						message = data.error;
					}
				} catch {
					// keep default message
				}
				throw new Error(message);
			}

			if (!response.body) {
				throw new Error('No response body received');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder('utf-8');
			let firstChunkHandled = false;

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });

				if (!firstChunkHandled) {
					firstChunkHandled = true;
					if (chunk.startsWith('{"type":"vulns"')) {
						const separator = chunk.indexOf('\n');
						const rawMeta =
							separator === -1 ? chunk : chunk.slice(0, separator);
						try {
							const meta = JSON.parse(rawMeta) as {
								manifestsAnalyzed?: number;
								dependenciesChecked?: number;
								vulnerabilities?: OsvVulnerability[];
							};
							setManifestsAnalyzed(meta.manifestsAnalyzed ?? 0);
							setDependenciesChecked(meta.dependenciesChecked ?? 0);
							setVulnerabilities(
								Array.isArray(meta.vulnerabilities)
									? meta.vulnerabilities
									: []
							);
						} catch {
							setVulnerabilities([]);
						}
						if (separator !== -1) {
							setAnalysis((prev) => prev + chunk.slice(separator + 1));
						}
						continue;
					}
					setVulnerabilities([]);
				}

				setAnalysis((prev) => prev + chunk);
			}
		} catch (err: unknown) {
			setCachedUntil(null);
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError('An error occurred during AI analysis.');
			}
		} finally {
			inFlightRef.current = false;
			setLoading(false);
		}
	};

	return (
		<div className="mt-3 border-t border-zinc-800/60 pt-3">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={handleAnalyze}
				disabled={loading}
				className="w-full flex items-center justify-between text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30 transition-colors cursor-pointer"
			>
				<span className="flex items-center gap-1.5 font-medium">
					{loading ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<Sparkles className="w-3.5 h-3.5" />
					)}
					{loading
						? 'Analyzing repository with AI...'
						: analysis
							? 'AI Analysis Summary'
							: 'Analyze Repository with AI'}
				</span>
				{analysis && !loading && (
					<span>
						{isOpen ? (
							<ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
						) : (
							<ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
						)}
					</span>
				)}
			</Button>

			{cachedUntil && !loading && (
				<p className="text-[11px] text-zinc-500 mt-1.5 ml-1">
					Cached until{' '}
					{new Date(cachedUntil).toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
					})}
				</p>
			)}

			{/* Analysis Output Container */}
			{isOpen && (
				<div className="mt-3 p-4 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs leading-relaxed text-zinc-300 space-y-2">
					{error && (
						<p className="text-red-400 text-center font-mono">{error}</p>
					)}

					{!error && vulnerabilities !== null && (
						<div className="space-y-2 border-b border-zinc-800 pb-3">
							<div className="flex items-center justify-between gap-2">
								<p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
									Vulnerabilities ({vulnerabilities.length})
								</p>
								{vulnerabilities.length > 0 && (
									<button
										type="button"
										onClick={() => setShowDetails((v) => !v)}
										aria-expanded={showDetails}
										className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
									>
										{showDetails ? (
											<>
												Hide Details <ChevronUp className="h-3 w-3" />
											</>
										) : (
											<>
												Details <ChevronDown className="h-3 w-3" />
											</>
										)}
									</button>
								)}
							</div>

							{vulnerabilities.length > 0 ? (
								<div className="space-y-2">
									{/* Severity distribution bar (GitHub-conventional colors) */}
									<div
										className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800/60"
										role="img"
										aria-label={`Severity distribution: ${severityAriaLabel}`}
									>
										{SEVERITY_ORDER.map((sev) =>
											severityCounts[sev] > 0 ? (
												<div
													key={sev}
													className="h-full first:rounded-l-full last:rounded-r-full"
													style={{
														width: `${(severityCounts[sev] / vulnerabilities.length) * 100}%`,
														backgroundColor: SEVERITY_META[sev].color,
													}}
													title={`${SEVERITY_META[sev].label}: ${severityCounts[sev]}`}
												/>
											) : null
										)}
									</div>

									{/* Legend */}
									<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
										{SEVERITY_ORDER.map((sev) =>
											severityCounts[sev] > 0 ? (
												<span
													key={sev}
													className="inline-flex items-center gap-1 text-[11px]"
													style={{ color: SEVERITY_META[sev].color }}
												>
													<span
														className="h-1.5 w-1.5 rounded-full"
														style={{
															backgroundColor: SEVERITY_META[sev].color,
														}}
													/>
													{SEVERITY_META[sev].label} ({severityCounts[sev]})
												</span>
											) : null
										)}
									</div>

									{showDetails && (
										<ul className="space-y-2 pt-1">
											{vulnerabilities.map((vuln) => (
												<li
													key={vuln.id}
													className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5"
												>
													<div className="flex items-center gap-2">
														<SeverityBadge severity={vuln.severity} />
														<span className="font-mono text-[11px] text-zinc-200">
															{vuln.id}
														</span>
													</div>
													{vuln.aliases.length > 0 && (
														<p className="mt-1 text-[11px] text-zinc-400">
															{vuln.aliases.join(', ')}
														</p>
													)}
													{vuln.affectedPackage !== null && (
														<p className="mt-1 text-[11px] text-zinc-400">
															<span className="text-zinc-300">
																{vuln.affectedPackage}
															</span>
															{vuln.affectedVersions.length > 0 && (
																<>
																	{' '}
																	— affected:{' '}
																	{vuln.affectedVersions.join(', ')}
																</>
															)}
														</p>
													)}
													{vuln.summary !== null && (
														<p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
															{vuln.summary}
														</p>
													)}
												</li>
											))}
										</ul>
									)}
								</div>
							) : (
								<p className="text-xs text-emerald-400/90">
									{manifestsAnalyzed === 0
										? 'No supported dependency manifests were detected in this repository.'
										: dependenciesChecked === 0
											? 'Dependency manifests were detected, but no declarable dependencies were found.'
											: `Checked ${dependenciesChecked} dependencies — no known vulnerabilities found in declared dependencies.`}
								</p>
							)}
						</div>
					)}

					{!error && !analysis && loading && (
						<p className="text-zinc-500 italic text-center animate-pulse">
							Generating insights... This can take 1-2 minutes depending on
							repository size.
						</p>
					)}

					{!error && analysis && (
						<div className="space-y-2">
							{vulnerabilities !== null &&
								vulnerabilities.length > 0 && (
									<p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
										AI analysis &amp; security explanations
									</p>
								)}
							{hasSections ? (
								<>
									<div
										className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-2 max-h-40 overflow-y-auto"
										role="tablist"
										aria-label="AI analysis sections"
									>
										{sections.map((section, i) => (
											<button
												key={`${section.heading}-${i}`}
												type="button"
												role="tab"
												aria-selected={activeIndex === i}
												onClick={() => {
													setSelectedIndex(i);
													setUserPinned(true);
												}}
												className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
													activeIndex === i
														? 'bg-indigo-600 text-white shadow-sm'
														: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
												}`}
											>
												{section.heading}
											</button>
										))}
									</div>
									<div key={activeIndex} className="animate-rise">
										<div className="prose prose-invert prose-xs max-w-none space-y-2">
											<ReactMarkdown>
												{`## ${sections[activeIndex].heading}\n\n${sections[activeIndex].body}`}
											</ReactMarkdown>
										</div>
									</div>
								</>
							) : (
								<div className="prose prose-invert prose-xs max-w-none space-y-2">
									<ReactMarkdown>{analysis}</ReactMarkdown>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}