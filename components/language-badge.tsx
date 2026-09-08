import {
	siJavascript,
	siTypescript,
	siHtml5,
	siCss,
	siSass,
	siPython,
	siAstro,
	siDocker,
	siGnubash,
	siSharp,
	siCplusplus,
	siPhp,
	siRuby,
	siRust,
	siGo,
	siOpenjdk,
	siKotlin,
	siSwift,
	siGithub,
	type SimpleIcon,
} from 'simple-icons/icons';
import { Badge } from '@/components/ui/badge';

const iconMap: Record<string, SimpleIcon> = {
	javascript: siJavascript,
	typescript: siTypescript,
	html5: siHtml5,
	css3: siCss,
	sass: siSass,
	python: siPython,
	astro: siAstro,
	docker: siDocker,
	gnubash: siGnubash,
	csharp: siSharp,
	cplusplus: siCplusplus,
	php: siPhp,
	ruby: siRuby,
	rust: siRust,
	go: siGo,
	openjdk: siOpenjdk,
	kotlin: siKotlin,
	swift: siSwift,
	github: siGithub,
};

const getIconSlug = (lang: string): string => {
	const normalized = lang.toLowerCase().trim();
	const map: Record<string, string> = {
		javascript: 'javascript',
		typescript: 'typescript',
		html: 'html5',
		css: 'css3',
		scss: 'sass',
		python: 'python',
		astro: 'astro',
		dockerfile: 'docker',
		shell: 'gnubash',
		bash: 'gnubash',
		csharp: 'csharp',
		'c++': 'cplusplus',
		php: 'php',
		ruby: 'ruby',
		rust: 'rust',
		go: 'go',
		java: 'openjdk',
		kotlin: 'kotlin',
		swift: 'swift',
	};

	return map[normalized] || normalized;
};

export function LanguageBadge({ name }: { name: string }) {
	const slug = getIconSlug(name);
	const iconData = iconMap[slug] ?? siGithub;

	return (
		<Badge
			variant="outline"
			className="inline-flex items-center gap-1 px-2.5 py-1 bg-background/60 border-border/60 hover:bg-muted/50 transition-colors"
		>
			<svg
				role="img"
				viewBox="0 0 24 24"
				className="size-[27px] fill-current"
				style={{ color: `#${iconData.hex}` }}
			>
				<path d={iconData.path} />
			</svg>
			<span className="text-[10.5px] font-mono">{name}</span>
		</Badge>
	);
}
