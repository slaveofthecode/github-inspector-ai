'use client';

import { useState, useEffect, useRef, useCallback, useMemo, FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
	ShieldAlert,
	Star,
	GitFork,
	Archive,
	RotateCcw,
	X,
} from 'lucide-react';
import { RepoAnalysis } from '@/components/repo-analysis';

interface Repository {
	id: number;
	name: string;
	description: string | null;
	createdAt: string;
	pushedAt: string;
	stargazerCount: number;
	forkCount: number;
	isArchived: boolean;
	languages: string[];
	htmlUrl: string;
}

type SortCriterion = 'created' | 'updated';

function formatCompact(n: number): string {
	return new Intl.NumberFormat('en', {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(n);
}

export default function Home() {
	const [inputUrl, setInputUrl] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const [allRepos, setAllRepos] = useState<Repository[]>([]);
	// Default filter: Sort by creation date in DESC order
	const [sortCriterion, setSortCriterion] = useState<SortCriterion>('created');
	const sortCriterionRef = useRef<SortCriterion>('created');
	const [visibleCount, setVisibleCount] = useState(10);
	const [searchedUser, setSearchedUser] = useState<string | null>(null);
	const [filterQuery, setFilterQuery] = useState('');
	const [canRetry, setCanRetry] = useState(false);

	const [showScrollTop, setShowScrollTop] = useState(false);
	const observerRef = useRef<HTMLDivElement | null>(null);
	const lastUsernameRef = useRef<string | null>(null);
	const hasInitialized = useRef(false);

	const setSort = (criterion: SortCriterion) => {
		sortCriterionRef.current = criterion;
		setSortCriterion(criterion);
	};

	const applyUrl = useCallback((username: string, sort: SortCriterion, replace: boolean) => {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('username', username);
		url.searchParams.set('sort', sort);
		window.history[replace ? 'replaceState' : 'pushState']({}, '', url.toString());
	}, []);

	const performSearch = useCallback(
		async (username: string, options?: { syncUrl?: boolean }) => {
			lastUsernameRef.current = username;
			setError(null);
			setCanRetry(false);
			setLoading(true);
			setAllRepos([]);
			setVisibleCount(10);
			setSearchedUser(null);

			try {
				const res = await fetch(
					`/api/repos?username=${encodeURIComponent(username)}`
				);
				let data: {
					error?: string;
					repos?: Repository[];
					username?: string;
				} = {};
				try {
					data = await res.json();
				} catch {
					// keep default payload
				}

				if (!res.ok) {
					const err = new Error(
						data.error || `Failed to fetch repositories (${res.status})`
					) as Error & { status?: number };
					err.status = res.status;
					throw err;
				}

				const resolvedName = data.username ?? username;
				setAllRepos(data.repos ?? []);
				setSearchedUser(resolvedName);
				if ((data.repos?.length ?? 0) > 0) {
					setInputUrl('');
				}
				if (options?.syncUrl !== false) {
					applyUrl(resolvedName, sortCriterionRef.current, false);
				}
			} catch (err: unknown) {
				const status = (err as Error & { status?: number })?.status;
				setCanRetry(status === 429 || status === undefined || status === null);
				if (err instanceof Error) {
					setError(err.message);
				} else {
					setError('An unexpected error occurred');
				}
			} finally {
				setLoading(false);
			}
		},
		[applyUrl]
	);

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

		setInputUrl(username);
		setFilterQuery('');
		await performSearch(username);
	};

	const handleSortChange = (criterion: SortCriterion) => {
		setSort(criterion);
		if (searchedUser) {
			applyUrl(searchedUser, criterion, true);
		}
	};

	// Restore a shared/bookmarked search on first load.
	useEffect(() => {
		if (hasInitialized.current) return;
		hasInitialized.current = true;
		const params = new URLSearchParams(window.location.search);
		const username = params.get('username');
		if (!username) return;
		const sort: SortCriterion =
			params.get('sort') === 'updated' ? 'updated' : 'created';
		queueMicrotask(() => {
			setInputUrl(username);
			setSort(sort);
			performSearch(username, { syncUrl: false });
		});
	}, [performSearch]);

	// Support browser back/forward navigation.
	useEffect(() => {
		const onPopState = () => {
			const params = new URLSearchParams(window.location.search);
			const username = params.get('username');
			const sort = params.get('sort');

			if (!username) {
				setError(null);
				setCanRetry(false);
				setAllRepos([]);
				setSearchedUser(null);
				setFilterQuery('');
				setVisibleCount(10);
				setInputUrl('');
				setSort('created');
				return;
			}

			setInputUrl(username);
			setSort(sort === 'updated' ? 'updated' : 'created');
			setFilterQuery('');
			performSearch(username, { syncUrl: false });
		};
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	}, [performSearch]);

	// Client-side filtering (progressive): matches the repo name OR any of its technologies.
	const filteredRepos = useMemo(() => {
		const q = filterQuery.trim().toLowerCase();
		if (!q) return allRepos;
		return allRepos.filter(
			(repo) =>
				repo.name.toLowerCase().includes(q) ||
				repo.languages.some((lang) => lang.toLowerCase().includes(q))
		);
	}, [allRepos, filterQuery]);

	// Client-side sorting logic: Always DESC (newest/most recent first)
	const sortedRepos = useMemo(() => {
		return [...filteredRepos].sort((a, b) => {
			if (sortCriterion === 'created') {
				return (
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
			} else {
				return new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime();
			}
		});
	}, [filteredRepos, sortCriterion]);

	// Restart infinite scroll whenever the filter changes.
	const handleFilterChange = (value: string) => {
		setFilterQuery(value);
		setVisibleCount(10);
	};

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

	const handleHomeReset = () => {
		window.history.replaceState({}, '', window.location.pathname);
		setError(null);
		setCanRetry(false);
		setAllRepos([]);
		setSearchedUser(null);
		setFilterQuery('');
		setVisibleCount(10);
		setInputUrl('');
		setSort('created');
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const visibleRepos = sortedRepos.slice(0, visibleCount);
	const showFilterEmpty =
		!loading && allRepos.length > 0 && sortedRepos.length === 0;

	return (
		<TooltipProvider>
			<main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-10 relative">
				<div className="max-w-4xl mx-auto space-y-8">
					{/* Header */}
					<header className="text-center space-y-2 pt-4">
<h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-linear-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
									<button
										type="button"
										onClick={handleHomeReset}
										aria-label="GitHub Inspector — back to home"
										className="inline-block cursor-pointer select-none text-left hover:to-zinc-200 transition-all"
									>
										GitHub Inspector
									</button>
								</h1>
						<p className="text-zinc-400 text-sm md:text-base">
							Inspect any GitHub user&apos;s public repositories, top
							technologies and metadata — with dependency security insights.
						</p>
					</header>

					{/* Vision strip: what's live vs what's next */}
					<div className="flex flex-wrap items-center justify-center gap-2 text-xs">
						<span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-800/60 bg-indigo-950/40 px-3 py-1 font-medium text-indigo-300">
							<CheckCircle2 className="h-3.5 w-3.5" />
							Repo insights — Live now
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-800/60 bg-indigo-950/40 px-3 py-1 font-medium text-indigo-300">
							<ShieldAlert className="h-3.5 w-3.5" />
							Dependency vulnerability scan — Live now
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
						<div className="flex flex-col items-center gap-3 p-4 bg-red-950/40 border border-red-900/50 text-red-300 rounded-xl text-sm text-center">
							<p>{error}</p>
							{canRetry && (
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => performSearch(lastUsernameRef.current ?? inputUrl)}
									className="cursor-pointer"
								>
									<RotateCcw className="h-3.5 w-3.5" />
									Retry
								</Button>
							)}
						</div>
					)}

					{/* Sticky Results & Custom Badge/Radio Filters */}
					{searchedUser && (
						<div className="sticky top-2 z-40 bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-xl px-4 py-3 shadow-lg flex flex-wrap items-center justify-between gap-3 transition-all">
							<div className="flex items-center gap-3">
								<h2 className="text-sm sm:text-lg font-bold tracking-tight text-zinc-100">
									<a
										href={`https://github.com/${searchedUser}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
									>
										@{searchedUser}
									</a>
								</h2>
								<span className="font-mono text-xs text-zinc-500">
									Total: {allRepos.length}
								</span>
							</div>

							{/* Progressive search filter (name or technology) */}
							{allRepos.length > 0 && (
								<div className="relative flex-1 min-w-[200px] max-w-xs">
									<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
									<Input
										type="text"
										value={filterQuery}
										onChange={(e) => handleFilterChange(e.target.value)}
										placeholder="Search by name or technology..."
										aria-label="Filter repositories by name or technology"
										className="h-8 pl-8 pr-8 text-xs bg-zinc-900/70 border-zinc-800 rounded-lg placeholder:text-zinc-500 focus-visible:ring-zinc-400"
									/>
									{filterQuery && (
										<button
											type="button"
											onClick={() => handleFilterChange('')}
											aria-label="Clear filter"
											className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
										>
											<X className="h-3 w-3" />
										</button>
									)}
								</div>
							)}

							<div className="flex items-center gap-2">
								{/* Custom Radio/Badge Toggles (single segmented control) */}
								{allRepos.length > 0 && (
									<div
										role="radiogroup"
										aria-label="Sort repositories"
										className="flex items-center gap-1.5"
									>
										{(
											[
												{ id: 'created', label: 'Created Date' },
												{ id: 'updated', label: 'Last Commit' },
											] as const
										).map((opt) => (
											<button
												key={opt.id}
												type="button"
												role="radio"
												aria-checked={sortCriterion === opt.id}
												onClick={() => handleSortChange(opt.id)}
												className={`px-2 py-1 rounded-md text-xs transition-all cursor-pointer ${
													sortCriterion === opt.id
														? 'text-indigo-400 font-medium'
														: 'text-zinc-500 hover:text-zinc-300'
												}`}
											>
												{opt.label}
											</button>
										))}
									</div>
								)}

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
						</div>
					)}

					{/* Repositories List */}
					<div className="space-y-4">
						{/* Empty state: real account with no public repos */}
						{searchedUser && !loading && !error && allRepos.length === 0 && (
							<div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-zinc-400 text-center">
								This account has no public repositories.
							</div>
						)}

						{/* Empty state: filter with no matches */}
						{showFilterEmpty && (
							<div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-zinc-400 text-center">
								No repositories match your filter.
							</div>
						)}

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
							visibleRepos.map((repo, i) => (
								<Card
									key={repo.id}
									className={`bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700/80 transition-all hover:shadow-lg backdrop-blur-sm animate-rise ${
										repo.isArchived ? 'opacity-70' : ''
									}`}
									style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
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

											<div className="flex flex-wrap items-center gap-2.5 text-xs text-zinc-400 font-mono bg-zinc-950/60 border border-zinc-800/60 px-2.5 py-1 rounded-md self-start">
												<span
													className="inline-flex items-center gap-1"
													title={`${repo.stargazerCount} stars`}
												>
													<Star className="h-3 w-3 text-amber-400/90" />
													{formatCompact(repo.stargazerCount)}
												</span>
												<span
													className="inline-flex items-center gap-1"
													title={`${repo.forkCount} forks`}
												>
													<GitFork className="h-3 w-3 text-indigo-400/90" />
													{formatCompact(repo.forkCount)}
												</span>
												<span className="text-zinc-700">•</span>
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
												{repo.isArchived && (
													<span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
														<Archive className="h-3 w-3" />
														Archived
													</span>
												)}
											</div>
										</div>

										<CardDescription className="text-sm leading-relaxed pt-1 text-zinc-400">
											{repo.description || 'No description provided.'}
										</CardDescription>
									</CardHeader>

									{/* Languages / Technologies with Icons */}
									{repo.languages.length > 0 ? (
										<CardContent className="pt-0 pb-0">
											<div className="flex flex-wrap gap-1.5">
												{repo.languages.map((lang) => (
													<LanguageBadge key={lang} name={lang} />
												))}
											</div>
										</CardContent>
									) : (
										<CardContent className="pt-0 pb-0">
											<p className="text-xs text-zinc-500 italic">
												No language data available for this repository.
											</p>
										</CardContent>
									)}

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