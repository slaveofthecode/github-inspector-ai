// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { siTypescript, siHtml5, siCplusplus, siGithub } from 'simple-icons/icons';
import { LanguageBadge } from './language-badge';

afterEach(() => cleanup());

function hexToRgb(hex: string): string {
	const clean = hex.replace('#', '');
	const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
	const num = parseInt(full, 16);
	const r = (num >> 16) & 255;
	const g = (num >> 8) & 255;
	const b = num & 255;
	return `rgb(${r}, ${g}, ${b})`;
}

function svgStyle(): string {
	const svgs = screen.getAllByRole('img');
	return svgs[0]?.getAttribute('style') ?? '';
}

describe('LanguageBadge', () => {
	it('renders the language name', () => {
		render(<LanguageBadge name="TypeScript" />);
		expect(screen.getByText('TypeScript')).toBeInTheDocument();
	});

	it('uses the brand icon color for a known language', () => {
		render(<LanguageBadge name="TypeScript" />);
		expect(svgStyle()).toContain(`color: ${hexToRgb(siTypescript.hex)}`);
	});

	it('maps alias names to brand icons (html -> html5, c++ -> cplusplus)', () => {
		const { unmount } = render(<LanguageBadge name="HTML" />);
		expect(svgStyle()).toContain(`color: ${hexToRgb(siHtml5.hex)}`);
		unmount();
		render(<LanguageBadge name="C++" />);
		expect(svgStyle()).toContain(`color: ${hexToRgb(siCplusplus.hex)}`);
	});

	it('handles case and whitespace-insensitive matching', () => {
		render(<LanguageBadge name=" typescript " />);
		expect(screen.getByText(/typescript/)).toBeInTheDocument();
		expect(svgStyle()).toContain(`color: ${hexToRgb(siTypescript.hex)}`);
	});

	it('falls back to the GitHub icon color for unknown languages', () => {
		render(<LanguageBadge name="COBOL" />);
		expect(svgStyle()).toContain(`color: ${hexToRgb(siGithub.hex)}`);
	});
});