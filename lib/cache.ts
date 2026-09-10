interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

export function createCache<T>({
	ttlMs = 6 * 60 * 60 * 1000,
	maxEntries = 200,
}: { ttlMs?: number; maxEntries?: number } = {}) {
	const store = new Map<string, CacheEntry<T>>();

	function get(key: string): T | null {
		const entry = store.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			store.delete(key);
			return null;
		}
		return entry.value;
	}

	function set(key: string, value: T) {
		if (store.size >= maxEntries) {
			const now = Date.now();
			for (const [k, entry] of store) {
				if (now > entry.expiresAt) store.delete(k);
			}
			const oldest = store.keys().next().value;
			if (store.size >= maxEntries && oldest !== undefined) {
				store.delete(oldest);
			}
		}
		store.set(key, { value, expiresAt: Date.now() + ttlMs });
	}

	return { get, set };
}