'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { OsvVulnerability } from '@/lib/osv';

interface RepoAnalysisProps {
	owner: string;
	repo: string;
}

const SEVERITY_STYLES: Record<string, string> = {
	CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/40',
	HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
	MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
	LOW: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
	UNKNOWN: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/40',
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

export function RepoAnalysis({ owner, repo }: RepoAnalysisProps) {
	const [analysis, setAnalysis] = useState('');
	const [loading, setLoading] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [vulnerabilities, setVulnerabilities] = useState<
		OsvVulnerability[] | null
	>(null);
	const [manifestsAnalyzed, setManifestsAnalyzed] = useState(0);

	const handleAnalyze = async () => {
		// Toggle accordion if analysis was already fetched
		if (analysis && !loading) {
			setIsOpen(!isOpen);
			return;
		}

		setLoading(true);
		setError(null);
		setIsOpen(true);
		setAnalysis('');
		setVulnerabilities(null);
		setManifestsAnalyzed(0);

		try {
			const response = await fetch('/api/analyze', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ owner, repo }),
			});

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
								vulnerabilities?: OsvVulnerability[];
							};
							setManifestsAnalyzed(meta.manifestsAnalyzed ?? 0);
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
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError('An error occurred during AI analysis.');
			}
		} finally {
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

			{/* Analysis Output Container */}
			{isOpen && (
				<div className="mt-3 p-4 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs leading-relaxed text-zinc-300 space-y-2">
					{error && (
						<p className="text-red-400 text-center font-mono">{error}</p>
					)}

					{!error && vulnerabilities !== null && manifestsAnalyzed > 0 && (
						<div className="space-y-2 border-b border-zinc-800 pb-3">
							<p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
								Vulnerabilities ({vulnerabilities.length})
							</p>
							{vulnerabilities.length === 0 ? (
								<p className="text-xs text-emerald-400/90">
									No known vulnerabilities found in declared dependencies.
								</p>
							) : (
								<ul className="space-y-2">
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
					)}

					{!error && !analysis && loading && (
						<p className="text-zinc-500 italic text-center animate-pulse">
							Generating insights and security explanations from the
							repository...
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
							<div className="prose prose-invert prose-xs max-w-none space-y-2">
								<ReactMarkdown>{analysis}</ReactMarkdown>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
