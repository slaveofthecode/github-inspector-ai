'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';

interface Repository {
	id: number;
	name: string;
	description: string | null;
	createdAt: string;
	pushedAt: string;
	languages: string[];
}

export default function Home() {
	const [inputUrl, setInputUrl] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const [allRepos, setAllRepos] = useState<Repository[]>([]);
	const [visibleCount, setVisibleCount] = useState(10);
	const [searchedUser, setSearchedUser] = useState<string | null>(null);

	const [showScrollTop, setShowScrollTop] = useState(false);
	const observerRef = useRef<HTMLDivElement | null>(null);

	// Helper to extract username from input URL or string
	const extractUsername = (input: string): string | null => {
		const trimmed = input.trim();
		if (!trimmed) return null;

		try {
			if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
				const url = new URL(trimmed);
				if (url.hostname.includes('github.com')) {
					const pathParts = url.pathname.split('/').filter(Boolean);
					return pathParts[0] || null;
				}
				return null;
			}
			// If entered plain username
			const githubUsernameRegex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
			return githubUsernameRegex.test(trimmed) ? trimmed : null;
		} catch {
			return null;
		}
	};

	const handleSearch = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);

		const username = extractUsername(inputUrl);

		if (!username) {
			setError(
				'Please enter a valid GitHub URL or username (e.g., https://github.com/username)'
			);
			return;
		}

		setLoading(true);
		setAllRepos([]);
		setVisibleCount(10);
		setSearchedUser(null);

		try {
			const res = await fetch(
				`/api/repos?username=${encodeURIComponent(username)}`
			);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to fetch repositories');
			}

			setAllRepos(data.repos);
			setSearchedUser(data.username);
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'An unexpected error occurred'
			);
		} finally {
			setLoading(false);
		}
	};

	// Scroll Listener for "Scroll To Top" button
	useEffect(() => {
		const handleScroll = () => {
			setShowScrollTop(window.scrollY > 300);
		};
		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	// Intersection Observer for Infinite Scroll
	useEffect(() => {
		if (!observerRef.current || visibleCount >= allRepos.length) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					setVisibleCount((prev) => Math.min(prev + 10, allRepos.length));
				}
			},
			{ threshold: 1.0 }
		);

		observer.observe(observerRef.current);

		return () => observer.disconnect();
	}, [allRepos, visibleCount]);

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const visibleRepos = allRepos.slice(0, visibleCount);

	return (
		<main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 relative">
			<div className="max-w-4xl mx-auto space-y-8">
				{/* Header */}
				<header className="text-center space-y-2">
					<h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-indigo-400">
						GitHub Inspector
					</h1>
					<p className="text-slate-400 text-sm md:text-base">
						Inspect public repositories, technologies, and metadata instantly.
					</p>
				</header>

				{/* Search Form */}
				<form
					onSubmit={handleSearch}
					className="flex flex-col sm:flex-row gap-3"
				>
					<input
						type="text"
						placeholder="https://github.com/username or username"
						value={inputUrl}
						onChange={(e) => setInputUrl(e.target.value)}
						className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-100 placeholder-slate-500"
					/>
					<button
						type="submit"
						disabled={loading}
						className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold rounded-lg transition-colors cursor-pointer"
					>
						{loading ? 'Searching...' : 'Search'}
					</button>
				</form>

				{/* Error Alert */}
				{error && (
					<div className="p-4 bg-red-950/50 border border-red-800 text-red-300 rounded-lg text-sm text-center">
						{error}
					</div>
				)}

				{/* Results Header */}
				{searchedUser && (
					<div className="flex items-center justify-between border-b border-slate-800 pb-4">
						<h2 className="text-xl font-bold text-slate-200">
							Repositories for{' '}
							<span className="text-indigo-400">@{searchedUser}</span>
						</h2>
						<span className="text-xs text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
							Total: {allRepos.length}
						</span>
					</div>
				)}

				{/* Repositories List */}
				<div className="space-y-4">
					{visibleRepos.map((repo) => (
						<div
							key={repo.id}
							className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors space-y-3"
						>
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
								<h3 className="text-lg font-semibold text-indigo-300">
									{repo.name}
								</h3>
								<div className="flex gap-4 text-xs text-slate-400">
									<span>
										Created: {new Date(repo.createdAt).toLocaleDateString()}
									</span>
									<span>
										Last Commit: {new Date(repo.pushedAt).toLocaleDateString()}
									</span>
								</div>
							</div>

							<p className="text-sm text-slate-300">
								{repo.description || 'No description provided.'}
							</p>

							{/* Languages / Technologies */}
							{repo.languages.length > 0 && (
								<div className="flex flex-wrap gap-2 pt-2">
									{repo.languages.map((lang) => (
										<span
											key={lang}
											className="text-xs px-2.5 py-1 bg-slate-800 text-indigo-300 rounded-md border border-slate-700/50"
										>
											{lang}
										</span>
									))}
								</div>
							)}
						</div>
					))}
				</div>

				{/* Infinite Scroll Sentinel */}
				{visibleCount < allRepos.length && (
					<div
						ref={observerRef}
						className="py-6 text-center text-slate-500 text-sm"
					>
						Loading more repositories...
					</div>
				)}
			</div>

			{/* Floating Scroll To Top Button */}
			{showScrollTop && (
				<button
					onClick={scrollToTop}
					aria-label="Scroll to top"
					className="fixed bottom-6 right-6 p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg transition-all duration-300 z-50 cursor-pointer"
				>
					↑
				</button>
			)}
		</main>
	);
}
