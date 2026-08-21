/**
 * @file lib/aiCache.ts
 * @description In-memory LRU cache for AI analysis results.
 *
 * Avoids re-analyzing the same document with the same agent, saving:
 * - API tokens (Groq/OpenAI costs)
 * - User wait time (5-30s per analysis)
 * - TPM quota (rate limit headroom)
 *
 * Cache key = SHA-256(agentId + text). TTL = 1 hour.
 * Max 100 entries (~50MB estimated for large edital analyses).
 */

import { createHash } from "crypto";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

function makeKey(agentId: string, text: string): string {
  // Use first 2000 chars + agentId for key — avoids hashing huge documents
  // while still being unique enough for cache invalidation
  const input = `${agentId}:${text.slice(0, 2000)}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    }
  }
}

function evictOldest(): void {
  if (cache.size < MAX_ENTRIES) return;
  // Find entry with oldest expiry (least recently useful)
  let oldestKey: string | null = null;
  let oldestExpiry = Infinity;
  for (const [key, entry] of cache) {
    if (entry.expiresAt < oldestExpiry) {
      oldestExpiry = entry.expiresAt;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

/**
 * Get cached result for an agent + text combination.
 * Returns null on miss.
 */
export function cacheGet<T>(agentId: string, text: string): T | null {
  evictExpired();
  const key = makeKey(agentId, text);
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  entry.hits++;
  return entry.value;
}

/**
 * Store result in cache.
 * @param ttlMs - Time to live in milliseconds (default: 1 hour)
 */
export function cacheSet<T>(agentId: string, text: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  evictExpired();
  evictOldest();
  const key = makeKey(agentId, text);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    hits: 0,
  });
}

/**
 * Cache stats for health check / diagnostics.
 */
export function cacheStats(): { size: number; maxEntries: number } {
  evictExpired();
  return { size: cache.size, maxEntries: MAX_ENTRIES };
}

/**
 * Clear all cached entries.
 */
export function cacheClear(): void {
  cache.clear();
}
