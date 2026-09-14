import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '@/lib/rate-limit';

describe('createRateLimiter', () => {
	it('allows requests up to max within the window', () => {
		const limiter = createRateLimiter({ max: 3, windowMs: 1000 });
		for (let i = 0; i < 4; i++) {
			const res = limiter.check('ip-1', i * 100);
			if (i < 3) {
				expect(res.ok).toBe(true);
				expect(res.remaining).toBe(3 - i - 1);
			} else {
				expect(res.ok).toBe(false);
			}
		}
	});

	it('blocks further requests after reaching max and reports retryAfterMs', () => {
		const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
		expect(limiter.check('ip-1', 0).ok).toBe(true);
		expect(limiter.check('ip-1', 10).ok).toBe(true);
		const blocked = limiter.check('ip-1', 20);
		expect(blocked.ok).toBe(false);
		expect(blocked.remaining).toBe(0);
		// oldest hit at t=0 → retry after (1000 - 20)ms
		expect(blocked.retryAfterMs).toBe(980);
	});

	it('releases the window once the oldest hit ages out', () => {
		const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
		expect(limiter.check('ip-1', 0).ok).toBe(true);
		expect(limiter.check('ip-1', 500).ok).toBe(false);
		// t=1000 → window [lastMs - 1000, now) contains only the t=500 hit which is excluded
		expect(limiter.check('ip-1', 1100).ok).toBe(true);
	});

	it('tracks keys independently', () => {
		const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
		expect(limiter.check('ip-1', 0).ok).toBe(true);
		expect(limiter.check('ip-1', 100).ok).toBe(false);
		expect(limiter.check('ip-2', 200).ok).toBe(true);
	});

	it('uses Date.now() by default when now is not provided', () => {
		const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
		expect(limiter.check('ip-1').ok).toBe(true);
	});
});