/**
 * @file lib/aiCache.ts
 * @description In-memory cache for AI analysis results.
 *
 * Avoids re-analyzing the same document with the same configuration, saving:
 * - API tokens (Groq/OpenAI costs)
 * - User wait time (5-30s per analysis)
 * - TPM quota (rate limit headroom)
 *
 * Cache key = SHA-256 over (scope, model, promptVersion, options) + the FULL
 * document text. Every parameter that can change the AI output must be part of
 * the key — otherwise two different requests could share one cached answer.
 *
 * Only complete results are stored: a partial result (e.g. a chunk failed with
 * 429/500 and `processing.complete === false`) is never cached, so a retry
 * after the provider recovers produces a fresh, complete analysis.
 *
 * TTL = 1 hour. Max 100 entries.
 */

import { createHash } from "crypto";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

/**
 * Parameters that influence the AI output. All of them are part of the key.
 * - scope: operation / agent (e.g. "simplify", "analyze:simples")
 * - model: model id actually used for the request
 * - promptVersion: bump whenever prompts or output schema change
 * - options: any other input that changes the result (profile, chunking config…)
 */
export interface CacheKeyParts {
  scope: string;
  model: string;
  promptVersion: string;
  options?: unknown;
}

const cache = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/** JSON.stringify with sorted object keys, so equivalent options give the same key. */
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Builds the cache key from every output-affecting parameter plus the full text.
 * Exported for tests.
 */
export function buildCacheKey(parts: CacheKeyParts, text: string): string {
  const header = stableStringify({
    scope: parts.scope,
    model: parts.model,
    promptVersion: parts.promptVersion,
    options: parts.options ?? null,
  });
  return createHash("sha256")
    .update(header)
    .update("\u0000")
    .update(text)
    .digest("hex");
}

/**
 * Returns false for results flagged as incomplete/partial.
 * Recognizes `processing.complete === false` (chunked analyses) and a
 * top-level `complete === false`.
 */
export function isCompleteResult(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return true;
  const v = value as { complete?: unknown; processing?: { complete?: unknown } | null };
  if (v.complete === false) return false;
  if (v.processing && typeof v.processing === "object" && v.processing.complete === false) return false;
  return true;
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
  // Map preserves insertion order: the first entry is the oldest one.
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) cache.delete(oldestKey);
}

/**
 * Get cached result. Returns null on miss.
 */
export function cacheGet<T>(parts: CacheKeyParts, text: string): T | null {
  evictExpired();
  const key = buildCacheKey(parts, text);
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
 * Store result in cache. Incomplete results are rejected.
 * @param ttlMs - Time to live in milliseconds (default: 1 hour)
 * @returns true if the value was stored, false if it was refused as incomplete.
 */
export function cacheSet<T>(parts: CacheKeyParts, text: string, value: T, ttlMs = DEFAULT_TTL_MS): boolean {
  if (!isCompleteResult(value)) return false;
  evictExpired();
  evictOldest();
  const key = buildCacheKey(parts, text);
  cache.delete(key); // re-insert so it becomes the newest entry
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    hits: 0,
  });
  return true;
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
