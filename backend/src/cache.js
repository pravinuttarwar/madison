// In-memory, short-TTL cache. This is *caching*, not storage — it lives in process
// memory only, never touches disk, and is evicted on TTL. Keeps tab-switching from
// hammering the upstream APIs without persisting any of the customer's data.
const store = new Map();

export async function cached(key, ttlMs, producer) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value;
  const value = await producer();
  store.set(key, { value, at: now });
  return value;
}

export function clearCache() {
  store.clear();
}
