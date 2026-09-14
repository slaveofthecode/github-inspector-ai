import { describe, it, expect } from 'vitest';
import { parseManifest, MAX_MANIFEST_BYTES } from '@/lib/manifests';

describe('parseManifest — package.json', () => {
	it('parses pinned versions from all dependency sections', () => {
		const content = JSON.stringify({
			dependencies: { react: '18.3.1', 'next': '^16.3.4' },
			devDependencies: { typescript: '~5.6.2' },
			peerDependencies: { react: '>=18.0.0 <19.0.0' },
			optionalDependencies: { 'fsevents': '2.3.3' },
		});
		const deps = parseManifest('package.json', content);
		expect(deps).toEqual([
			{ name: 'react', version: '18.3.1', ecosystem: 'npm' },
			{ name: 'next', version: '16.3.4', ecosystem: 'npm' },
			{ name: 'typescript', version: '5.6.2', ecosystem: 'npm' },
			{ name: 'react', version: '18.0.0', ecosystem: 'npm' },
			{ name: 'fsevents', version: '2.3.3', ecosystem: 'npm' },
		]);
	});

	it('skips non-string versions and undefined sections', () => {
		const content = JSON.stringify({ dependencies: { a: '1.2.3', b: null, c: 42 }, scripts: {} });
		const deps = parseManifest('package.json', content);
		expect(deps.map((d) => d.name)).toEqual(['a']);
	});

	it('returns [] for malformed JSON', () => {
		expect(parseManifest('package.json', '{ not json')).toEqual([]);
	});
});

describe('parseManifest — requirements.txt', () => {
	it('parses == pinned dependencies and ignores comments', () => {
		const content = [
			'# comment line',
			'requests==2.31.0',
			'',
			'flask==2.2.5  # trailing comment',
			'fastapi>=0.100.0,<0.101.0',
		].join('\n');
		const deps = parseManifest('requirements.txt', content);
		expect(deps).toEqual([
			{ name: 'requests', version: '2.31.0', ecosystem: 'PyPI' },
			{ name: 'flask', version: '2.2.5', ecosystem: 'PyPI' },
		]);
	});

	it('skips extras syntax like pkg[extra]==1.0 (no == after bracket strip)', () => {
		const deps = parseManifest('requirements.txt', 'Django[argon2]==4.2.10\nboto3==1.34.0');
		expect(deps.map((d) => d.name)).toEqual(['boto3']);
	});

	it('skips lines without a pinned == version', () => {
		const deps = parseManifest('requirements.txt', 'gunicorn\nflask>=2.0\npytest==8.0.0');
		expect(deps.map((d) => d.name)).toEqual(['pytest']);
	});
});

describe('parseManifest — Cargo.toml', () => {
	it('parses simple and inline table dependencies from deps sections', () => {
		const content = `
[package]
name = "demo"

[dependencies]
serde = "1.0.188"
tokio = { version = "1.37.0", features = ["full"] }

[dev-dependencies]
criterion = "0.5.1"

[build-dependencies]
cc = "1.0.95"

[features]
default = []
`;
		const deps = parseManifest('Cargo.toml', content);
		expect(deps).toEqual([
			{ name: 'serde', version: '1.0.188', ecosystem: 'crates.io' },
			{ name: 'tokio', version: '1.37.0', ecosystem: 'crates.io' },
			{ name: 'criterion', version: '0.5.1', ecosystem: 'crates.io' },
			{ name: 'cc', version: '1.0.95', ecosystem: 'crates.io' },
		]);
	});

	it('ignores non-dependency tables', () => {
		const content = '[profile.release]\nopt-level = 3\n[dependencies]\nanyhow = "1.0.86"';
		const deps = parseManifest('Cargo.toml', content);
		expect(deps.map((d) => d.name)).toEqual(['anyhow']);
	});
});

describe('parseManifest — go.mod', () => {
	it('parses single-line and block require directives', () => {
		const content = `module demo

go 1.22

require github.com/pkg/errors v0.9.1

require (
	github.com/gin-gonic/gin v1.9.1
	golang.org/x/text v0.13.0 // indirect
)

require (
	gopkg.in/yaml.v3 v3.0.1
)
`;
		const deps = parseManifest('go.mod', content);
		expect(deps).toEqual([
			{ name: 'github.com/pkg/errors', version: 'v0.9.1', ecosystem: 'Go' },
			{ name: 'github.com/gin-gonic/gin', version: 'v1.9.1', ecosystem: 'Go' },
			{ name: 'golang.org/x/text', version: 'v0.13.0', ecosystem: 'Go' },
			{ name: 'gopkg.in/yaml.v3', version: 'v3.0.1', ecosystem: 'Go' },
		]);
	});
});

describe('parseManifest — Gemfile', () => {
	it('parses pinned gem versions with single or double quotes', () => {
		const content = "source 'https://rubygems.org'\ngem 'rails', '~> 7.1.2'\ngem \"sinatra\", \"4.0.2\"\ngem 'puma'\n";
		const deps = parseManifest('Gemfile', content);
		expect(deps).toEqual([
			{ name: 'rails', version: '7.1.2', ecosystem: 'RubyGems' },
			{ name: 'sinatra', version: '4.0.2', ecosystem: 'RubyGems' },
		]);
	});
});

describe('parseManifest — generic behavior', () => {
	it('resolves the basename of nested paths', () => {
		const content = '{"dependencies":{"react":"18.3.1"}}';
		const deps = parseManifest('src/sub/package.json', content);
		expect(deps).toEqual([{ name: 'react', version: '18.3.1', ecosystem: 'npm' }]);
	});

	it('returns [] for unknown manifest basenames', () => {
		expect(parseManifest('yarn.lock', 'anything')).toEqual([]);
		expect(parseManifest('package-lock.json', '{}')).toEqual([]);
	});

	it('returns [] for content over MAX_MANIFEST_BYTES', () => {
		expect(parseManifest('package.json', 'x'.repeat(MAX_MANIFEST_BYTES + 1))).toEqual([]);
	});
});