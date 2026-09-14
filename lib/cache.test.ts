import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCache } from '@/lib/cache';

describe('createCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns null for a missing key', () => {
		const cache = createCache<string>();
		expect(cache.get('nope')).toBeNull();
	});

	it('stores and retrieves a value with its expiresAt', () => {
		const cache = createCache<string>({ ttlMs: 60_000 });
		cache.set('k', 'v');
		const entry = cache.get('k');
		expect(entry).not.toBeNull();
		expect(entry?.value).toBe('v');
		expect(entry?.expiresAt).toBe(Date.now() + 60_000);
	});

	it('treats an expired entry as missing and removes it', () => {
		const cache = createCache<string>({ ttlMs: 60_000 });
		cache.set('k', 'v');
		vi.advanceTimersByTime(60_001);
		expect(cache.get('k')).toBeNull();
	});

	it('returns the default 6h TTL when not configured', () => {
		const cache = createCache<string>();
		cache.set('k', 'v');
		expect(cache.get('k')?.expiresAt).toBe(Date.now() + 6 * 60 * 60 * 1000);
	});

	it('evicts the oldest entry once maxEntries is reached', () => {
		const cache = createCache<string>({ maxEntries: 2 });
		cache.set('a', '1');
		cache.set('b', '2');
		cache.set('c', '3');
		expect(cache.get('a')).toBeNull();
		expect(cache.get('b')).not.toBeNull();
		expect(cache.get('c')).not.toBeNull();
	});

	it('prefers dropping expired entries over live ones when full', () => {
		const cache = createCache<string>({ maxEntries: 2, ttlMs: 60_000 });
		cache.set('expired', 'x');
		vi.advanceTimersByTime(120_000); // expire 'expired'
		cache.set('live-1', '1');
		cache.set('live-2', '2'); // triggers eviction of 'expired' first
		expect(cache.get('expired')).toBeNull();
		expect(cache.get('live-1')).not.toBeNull();
		expect(cache.get('live-2')).not.toBeNull();
	});
});