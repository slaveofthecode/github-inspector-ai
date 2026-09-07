import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';

const inter = Inter({
	subsets: ['latin'],
	variable: '--font-sans',
});
const geistMono = Geist_Mono({
	subsets: ['latin'],
	variable: '--font-geist-mono',
});

export const metadata: Metadata = {
	title: 'GitHub Inspector',
	description:
		"Inspect any GitHub user's public repositories, top languages, and metadata in a clean, fast interface.",
	openGraph: {
		title: 'GitHub Inspector',
		description:
			"Inspect any GitHub user's public repositories, top languages, and metadata in a clean, fast interface.",
		type: 'website',
		locale: 'en_US',
		url: 'https://github.com/slaveofthecode/github-inspector-ai',
	},
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
	return (
		<html
			lang="en"
			className={cn(
				'h-full',
				'antialiased',
				geistMono.variable,
				'font-sans',
				inter.variable,
				'dark'
			)}
		>
			<body className="min-h-full flex flex-col">{children}</body>
		</html>
	);
}
