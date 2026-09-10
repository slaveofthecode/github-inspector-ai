'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface RepoAnalysisProps {
	owner: string;
	repo: string;
}

export function RepoAnalysis({ owner, repo }: RepoAnalysisProps) {
	const [analysis, setAnalysis] = useState('');
	const [loading, setLoading] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
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

					{!error && !analysis && loading && (
						<p className="text-zinc-500 italic text-center animate-pulse">
							Generating insights from repository README...
						</p>
					)}

					{analysis && (
						<div className="prose prose-invert prose-xs max-w-none space-y-2">
							<ReactMarkdown>{analysis}</ReactMarkdown>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
