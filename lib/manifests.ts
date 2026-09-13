export interface Dependency {
	name: string;
	version: string;
	ecosystem: 'npm' | 'PyPI' | 'crates.io' | 'Go' | 'RubyGems';
}

export const KNOWN_MANIFESTS: string[] = [
	'package.json',
	'requirements.txt',
	'Cargo.toml',
	'go.mod',
	'Gemfile',
];

export const MAX_MANIFESTS = 20;
export const MAX_MANIFEST_BYTES = 100_000;

function normalizeVersion(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const cleaned = raw.trim().replace(/^[~^>=<v]+/, '');
	const match = cleaned.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?)/);
	return match ? match[1] : null;
}

function parsePackageJson(content: string): Dependency[] {
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(content) as Record<string, unknown>;
	} catch {
		return [];
	}

	const sections = [
		'dependencies',
		'devDependencies',
		'peerDependencies',
		'optionalDependencies',
	];
	const deps: Dependency[] = [];
	for (const section of sections) {
		const obj = data[section];
		if (!obj || typeof obj !== 'object') continue;
		for (const [name, rawVersion] of Object.entries(
			obj as Record<string, string>
		)) {
			const version = normalizeVersion(rawVersion);
			if (version) deps.push({ name, version, ecosystem: 'npm' });
		}
	}
	return deps;
}

function parseRequirements(content: string): Dependency[] {
	const deps: Dependency[] = [];
	for (const rawLine of content.split('\n')) {
		const line = rawLine.split('#')[0].trim();
		if (!line) continue;
		const withoutExtras = line.split('[')[0].trim();
		const eq = withoutExtras.indexOf('==');
		if (eq === -1) continue;
		const name = withoutExtras.slice(0, eq).trim();
		const version = withoutExtras.slice(eq + 2).split(/[<>=;,]/)[0].trim();
		if (name && version) deps.push({ name, version, ecosystem: 'PyPI' });
	}
	return deps;
}

function parseCargoToml(content: string): Dependency[] {
	const deps: Dependency[] = [];
	const sectionRegex =
		/^(?:dependencies|dev-dependencies|build-dependencies)$/;
	let currentSection: string | null = null;
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		const sectionMatch = line.match(/^\[([^\]]+)\]$/);
		if (sectionMatch) {
			currentSection = sectionMatch[1].trim().toLowerCase();
			continue;
		}
		if (!currentSection || !sectionRegex.test(currentSection)) continue;

		const simple = line.match(/^([\w.\-]+)\s*=\s*"([^"]+)"$/);
		if (simple) {
			const version = normalizeVersion(simple[2]);
			if (version) deps.push({ name: simple[1], version, ecosystem: 'crates.io' });
			continue;
		}
		const inline = line.match(/^([\w.\-]+)\s*=\s*\{\s*version\s*=\s*"([^"]+)"/);
		if (inline) {
			const version = normalizeVersion(inline[2]);
			if (version) deps.push({ name: inline[1], version, ecosystem: 'crates.io' });
		}
	}
	return deps;
}

function parseGoMod(content: string): Dependency[] {
	const deps: Dependency[] = [];
	const linePattern = /^(\S+)\s+(v[\w][\w.\-+]*)\s*(?:\/\/.*)?$/;
	let inRequireBlock = false;
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (!inRequireBlock) {
			if (line === 'require (') {
				inRequireBlock = true;
				continue;
			}
			const single = line.match(/^require\s+(\S+)\s+(v[\w][\w.\-+]*)/);
			if (single) {
				deps.push({ name: single[1], version: single[2], ecosystem: 'Go' });
			}
			continue;
		}
		if (line === ')') {
			inRequireBlock = false;
			continue;
		}
		const match = line.match(linePattern);
		if (match && /^v\d+\.\d+/.test(match[2])) {
			deps.push({ name: match[1], version: match[2], ecosystem: 'Go' });
		}
	}
	return deps;
}

function parseGemfile(content: string): Dependency[] {
	const deps: Dependency[] = [];
	const gemRegex =
		/^\s*gem\s+["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/gm;
	let match: RegExpExecArray | null;
	while ((match = gemRegex.exec(content)) !== null) {
		const version = normalizeVersion(match[2]);
		if (version) deps.push({ name: match[1], version, ecosystem: 'RubyGems' });
	}
	return deps;
}

const PARSERS: Record<string, (content: string) => Dependency[]> = {
	'package.json': parsePackageJson,
	'requirements.txt': parseRequirements,
	'Cargo.toml': parseCargoToml,
	'go.mod': parseGoMod,
	Gemfile: parseGemfile,
};

export function parseManifest(path: string, content: string): Dependency[] {
	if (content.length > MAX_MANIFEST_BYTES) return [];
	const basename = path.split('/').pop() ?? path;
	const parser = PARSERS[basename];
	return parser ? parser(content) : [];
}