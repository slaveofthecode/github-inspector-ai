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

const siteUrl =
	process.env.NEXT_PUBLIC_SITE_URL ||
	'https://main.d22y0lq8a3u6xm.amplifyapp.com';

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: 'GitHub Inspector',
	description:
		"Inspect any GitHub user's public repositories, top languages, and metadata in a clean, fast interface.",
	openGraph: {
		title: 'GitHub Inspector',
		description:
			"Inspect any GitHub user's public repositories, top languages, and metadata in a clean, fast interface.",
		type: 'website',
		locale: 'en_US',
		url: siteUrl,
	},
	twitter: {
		card: 'summary_large_image',
		title: 'GitHub Inspector',
		description:
			"Inspect any GitHub user's public repositories, top languages, and metadata in a clean, fast interface.",
	},
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={cn(
				'h-full',
				'antialiased',
				geistMono.variable,
				'font-sans',
				inter.variable,
				'dark'
			)}
		>
			<body suppressHydrationWarning className="min-h-full flex flex-col">
				{children}
			</body>
		</html>
	);
}
