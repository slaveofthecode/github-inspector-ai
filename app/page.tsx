'use client';

import { useState, useEffect, useRef, FormEvent, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from '@/components/ui/card';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { LanguageBadge } from '@/components/language-badge';
import { parseGithubInput } from '@/lib/validation';
import {
	Search,
	ArrowUp,
	ExternalLink,
	Loader2,
	Info,
	CheckCircle2,
	Clock,
	ShieldAlert,
} from 'lucide-react';
import { RepoAnalysis } from '@/components/repo-analysis';

interface Repository {
	id: number;
	name: string;
	description: string | null;
	createdAt: string;
	pushedAt: string;
	languages: string[];
	htmlUrl: string;
}

type SortCriterion = 'created' | 'updated';

export default function Home() {
	const [inputUrl, setInputUrl] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const [allRepos, setAllRepos] = useState<Repository[]>([]);
	// Default filter: Sort by creation date in DESC order
	const [sortCriterion, setSortCriterion] = useState<SortCriterion>('created');
	const [visibleCount, setVisibleCount] = useState(10);
	const [searchedUser, setSearchedUser] = useState<string | null>(null);

	const [showScrollTop, setShowScrollTop] = useState(false);
	const observerRef = useRef<HTMLDivElement | null>(null);

	const handleSearch = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);

		const username = parseGithubInput(inputUrl);

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
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError('An unexpected error occurred');
			}
		} finally {
			setLoading(false);
		}
	};

	// Client-side sorting logic: Always DESC (newest/most recent first)
	const sortedRepos = useMemo(() => {
		return [...allRepos].sort((a, b) => {
			if (sortCriterion === 'created') {
				return (
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
			} else {
				return new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime();
			}
		});
	}, [allRepos, sortCriterion]);

	useEffect(() => {
		const handleScroll = () => {
			setShowScrollTop(window.scrollY > 300);
		};
		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	useEffect(() => {
		if (!observerRef.current || visibleCount >= sortedRepos.length) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					setVisibleCount((prev) => Math.min(prev + 10, sortedRepos.length));
				}
			},
			{ threshold: 1.0 }
		);

		observer.observe(observerRef.current);

		return () => observer.disconnect();
	}, [sortedRepos, visibleCount]);

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const visibleRepos = sortedRepos.slice(0, visibleCount);

	return (
		<TooltipProvider>
			<main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-10 relative">
				<div className="max-w-4xl mx-auto space-y-8">
					{/* Header */}
					<header className="text-center space-y-2 pt-4">
						<h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-linear-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
							GitHub Inspector
						</h1>
						<p className="text-zinc-400 text-sm md:text-base">
							Inspect any GitHub user&apos;s public repositories, top
							technologies and metadata — with dependency security insights
							coming soon.
						</p>
					</header>

					{/* Vision strip: what's live vs what's next */}
					<div className="flex flex-wrap items-center justify-center gap-2 text-xs">
						<span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-800/60 bg-indigo-950/40 px-3 py-1 font-medium text-indigo-300">
							<CheckCircle2 className="h-3.5 w-3.5" />
							Repo insights — Live now
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-medium text-zinc-400">
							<Clock className="h-3.5 w-3.5" />
							Dependency vulnerability scan — Coming soon
						</span>
					</div>

					{/* Search Form - Integrated Lens Button */}
					<form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
						<div className="relative flex items-center">
							<Input
								type="text"
								placeholder="https://github.com/username or username..."
								value={inputUrl}
								onChange={(e) => setInputUrl(e.target.value)}
								className="pr-12 pl-4 py-6 text-base bg-zinc-900/90 border-zinc-800 rounded-xl focus-visible:ring-zinc-400 placeholder:text-zinc-500 shadow-inner"
							/>
							<Button
								type="submit"
								size="icon"
								disabled={loading}
								className="absolute right-1.5 h-9 w-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
							>
								{loading ? (
									<Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
								) : (
									<Search className="w-4 h-4 text-zinc-300" />
								)}
							</Button>
						</div>
					</form>

					{/* Error Alert */}
					{error && (
						<div className="p-4 bg-red-950/40 border border-red-900/50 text-red-300 rounded-xl text-sm text-center">
							{error}
						</div>
					)}

					{/* Sticky Results & Custom Badge/Radio Filters */}
					{searchedUser && (
						<div className="sticky top-2 z-40 bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-xl px-4 py-3 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 transition-all">
							<div className="flex items-center gap-3">
								<h2 className="text-lg font-bold tracking-tight text-zinc-100">
									Repositories for{' '}
									<a
										href={`https://github.com/${searchedUser}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
									>
										@{searchedUser}
									</a>
								</h2>
								<Badge
									variant="secondary"
									className="bg-zinc-800/80 text-zinc-300 border-zinc-700/50 font-mono text-xs"
								>
									Total: {allRepos.length}
								</Badge>
							</div>

							{/* Custom Radio/Badge Toggles */}
							{allRepos.length > 0 && (
								<div className="flex items-center gap-2">
									<div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
										<button
											type="button"
											onClick={() => setSortCriterion('created')}
											className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
												sortCriterion === 'created'
													? 'bg-indigo-600 text-white shadow-sm'
													: 'text-zinc-400 hover:text-zinc-200'
											}`}
										>
											Created Date
										</button>
										<button
											type="button"
											onClick={() => setSortCriterion('updated')}
											className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
												sortCriterion === 'updated'
													? 'bg-indigo-600 text-white shadow-sm'
													: 'text-zinc-400 hover:text-zinc-200'
											}`}
										>
											Last Commit
										</button>
									</div>

									{/* Info Icon Tooltip */}
									<Tooltip>
										<TooltipTrigger className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 cursor-pointer">
											<Info className="w-4 h-4" />
										</TooltipTrigger>
										<TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 text-xs">
											Repositories are sorted in descending order (newest/most
											recent first).
										</TooltipContent>
									</Tooltip>
								</div>
							)}
						</div>
					)}

					{/* Repositories List */}
					<div className="space-y-4">
						{loading ? (
							<div className="space-y-4">
								{Array.from({ length: 5 }).map((_, i) => (
									<Card key={i} className="bg-zinc-900/70 border-zinc-800/80">
										<CardHeader className="pb-3">
											<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
												<Skeleton className="h-6 w-1/3 rounded-md" />
												<Skeleton className="h-4 w-48 rounded-md" />
											</div>
											<Skeleton className="h-4 w-full mt-2 rounded-md" />
											<div className="flex gap-2 pt-2">
												<Skeleton className="h-5 w-16 rounded-full" />
												<Skeleton className="h-5 w-20 rounded-full" />
												<Skeleton className="h-5 w-14 rounded-full" />
											</div>
										</CardHeader>
									</Card>
								))}
							</div>
						) : (
							visibleRepos.map((repo) => (
								<Card
									key={repo.id}
									className="bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700/80 transition-all hover:shadow-lg backdrop-blur-sm"
								>
									<CardHeader className="pb-3">
										<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
											<CardTitle className="text-lg font-bold tracking-tight">
												<a
													href={repo.htmlUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-1.5 text-zinc-100 hover:text-indigo-400 transition-colors"
												>
													{repo.name}
													<ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
												</a>
											</CardTitle>

											<div className="flex items-center gap-2.5 text-xs text-zinc-400 font-mono bg-zinc-950/60 border border-zinc-800/60 px-2.5 py-1 rounded-md self-start">
												<span>
													<strong className="text-zinc-500 font-normal">
														Created:
													</strong>{' '}
													{new Date(repo.createdAt).toLocaleDateString()}
												</span>
												<span className="text-zinc-700">•</span>
												<span>
													<strong className="text-zinc-500 font-normal">
														Updated:
													</strong>{' '}
													{new Date(repo.pushedAt).toLocaleDateString()}
												</span>
											</div>
										</div>

										<CardDescription className="text-sm leading-relaxed pt-1 text-zinc-400">
											{repo.description || 'No description provided.'}
										</CardDescription>
									</CardHeader>

									{/* Languages / Technologies with Icons */}
									{repo.languages.length > 0 && (
										<CardContent className="pt-0 pb-0">
											<div className="flex flex-wrap gap-1.5">
												{repo.languages.map((lang) => (
													<LanguageBadge key={lang} name={lang} />
												))}
											</div>
										</CardContent>
									)}

									{/* Vulnerability scan (coming soon) */}
									<CardContent className="pt-3">
										<button
											type="button"
											disabled
											title="Coming soon."
											className="inline-flex select-none items-center gap-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-500 cursor-not-allowed"
										>
											<ShieldAlert className="h-3.5 w-3.5" />
											Scan vulnerabilities
										</button>
									</CardContent>

									{/* AI Analysis Component */}
									<CardContent className="pt-0 pb-3">
										<RepoAnalysis owner={searchedUser!} repo={repo.name} />
									</CardContent>
								</Card>
							))
						)}
					</div>

					{/* Infinite Scroll Sentinel */}
					{visibleCount < sortedRepos.length && (
						<div
							ref={observerRef}
							className="py-6 text-center text-zinc-500 text-sm"
						>
							Loading more repositories...
						</div>
					)}
				</div>

				{/* Floating Scroll To Top Button */}
				{showScrollTop && (
					<Button
						onClick={scrollToTop}
						size="icon"
						aria-label="Scroll to top"
						className="fixed bottom-6 right-6 h-10 w-10 rounded-full shadow-2xl bg-indigo-600 hover:bg-indigo-500 text-white z-50 cursor-pointer transition-all duration-300"
					>
						<ArrowUp className="w-4 h-4" />
					</Button>
				)}
			</main>
		</TooltipProvider>
	);
}
