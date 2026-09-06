'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from '@/components/ui/card';

interface Repository {
	id: number;
	name: string;
	description: string | null;
	createdAt: string;
	pushedAt: string;
	languages: string[];
	htmlUrl: string;
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
		<main className="min-h-screen bg-background text-foreground p-6 md:p-12 relative">
			<div className="max-w-4xl mx-auto space-y-8">
				{/* Header */}
				<header className="text-center space-y-2">
					<h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
						GitHub Inspector
					</h1>
					<p className="text-muted-foreground text-sm md:text-base">
						Inspect public repositories, technologies, and metadata instantly.
					</p>
				</header>

				{/* Search Form */}
				<form
					onSubmit={handleSearch}
					className="flex flex-col sm:flex-row gap-3"
				>
					<Input
						type="text"
						placeholder="https://github.com/username or username"
						value={inputUrl}
						onChange={(e) => setInputUrl(e.target.value)}
						className="flex-1"
					/>
					<Button type="submit" disabled={loading}>
						{loading ? 'Searching...' : 'Search'}
					</Button>
				</form>

				{/* Error Alert */}
				{error && (
					<div className="p-4 bg-destructive/15 border border-destructive text-destructive rounded-lg text-sm text-center">
						{error}
					</div>
				)}

				{/* Results Header */}
				{searchedUser && (
					<div className="flex items-center justify-between border-b pb-4">
						<h2 className="text-xl font-bold">
							Repositories for{' '}
							<span className="text-primary">@{searchedUser}</span>
						</h2>
						<Badge variant="secondary">Total: {allRepos.length}</Badge>
					</div>
				)}

				{/* Repositories List */}
				<div className="space-y-4">
					{visibleRepos.map((repo) => (
						<Card
							key={repo.id}
							className="transition-all hover:border-primary/40 hover:shadow-md bg-card/50 backdrop-blur-sm"
						>
							<CardHeader className="pb-3">
								<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
									<CardTitle className="text-xl font-bold tracking-tight">
										<a
											href={repo.htmlUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
										>
											{repo.name}
											<span className="text-xs text-muted-foreground font-normal">
												↗
											</span>
										</a>
									</CardTitle>

									<div className="flex items-center gap-3 text-xs text-muted-foreground font-mono bg-muted/40 px-2.5 py-1 rounded-md self-start">
										<span>
											<strong className="font-semibold text-foreground/70">
												Created:
											</strong>{' '}
											{new Date(repo.createdAt).toLocaleDateString()}
										</span>
										<span className="text-muted-foreground/40">•</span>
										<span>
											<strong className="font-semibold text-foreground/70">
												Updated:
											</strong>{' '}
											{new Date(repo.pushedAt).toLocaleDateString()}
										</span>
									</div>
								</div>

								<CardDescription className="text-sm leading-relaxed pt-1 text-muted-foreground">
									{repo.description || 'No description provided.'}
								</CardDescription>
							</CardHeader>

							{/* Languages / Technologies */}
							{repo.languages.length > 0 && (
								<CardContent className="pt-0 pb-4">
									<div className="flex flex-wrap gap-1.5">
										{repo.languages.map((lang) => (
											<Badge
												key={lang}
												variant="secondary"
												className="text-xs font-mono font-normal"
											>
												{lang}
											</Badge>
										))}
									</div>
								</CardContent>
							)}
						</Card>
					))}
				</div>

				{/* Infinite Scroll Sentinel */}
				{visibleCount < allRepos.length && (
					<div
						ref={observerRef}
						className="py-6 text-center text-muted-foreground text-sm"
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
					className="fixed bottom-6 right-6 rounded-full shadow-lg z-50"
				>
					↑
				</Button>
			)}
		</main>
	);
}
