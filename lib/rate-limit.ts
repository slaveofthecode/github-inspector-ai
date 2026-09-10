import type { NextRequest } from 'next/server';

export interface RateLimitResult {
	ok: boolean;
	remaining: number;
	retryAfterMs: number;
}

export function createRateLimiter({
	max = 10,
	windowMs = 60_000,
}: { max?: number; windowMs?: number } = {}) {
	const hits = new Map<string, number[]>();

	function check(key: string, now = Date.now()): RateLimitResult {
		const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
		if (recent.length >= max) {
			const oldest = recent[0];
			return {
				ok: false,
				remaining: 0,
				retryAfterMs: windowMs - (now - oldest),
			};
		}
		recent.push(now);
		hits.set(key, recent);
		return { ok: true, remaining: max - recent.length, retryAfterMs: 0 };
	}

	return { check };
}

export function getClientIp(request: NextRequest): string {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}
	return request.headers.get('x-real-ip') ?? 'unknown';
}