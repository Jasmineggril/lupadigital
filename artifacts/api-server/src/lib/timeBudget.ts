export const GLOBAL_BUDGET_MS = 240_000;
export const RESERVE_MS = 30_000;
export const MIN_CHUNK_TIMEOUT_MS = 15_000;

export interface TimeBudget {
  startMs: number;
  globalBudgetMs: number;
  reserveMs: number;
  getElapsedMs(): number;
  getRemainingMs(): number;
  getChunksRemaining(totalChunks: number, processedCount: number): number;
  getChunkTimeoutMs(totalChunks: number, processedCount: number): number;
  canStartChunk(totalChunks: number, processedCount: number): boolean;
}

export function createTimeBudget(startMs: number, globalBudgetMs = GLOBAL_BUDGET_MS, reserveMs = RESERVE_MS): TimeBudget {
  return {
    startMs,
    globalBudgetMs,
    reserveMs,
    getElapsedMs() { return Date.now() - this.startMs; },
    getRemainingMs() { return Math.max(0, this.globalBudgetMs - this.getElapsedMs()); },
    getChunksRemaining(totalChunks: number, processedCount: number) { return totalChunks - processedCount; },
    getChunkTimeoutMs(totalChunks: number, processedCount: number) {
      const remaining = this.getRemainingMs();
      const chunksLeft = this.getChunksRemaining(totalChunks, processedCount);
      if (chunksLeft <= 0 || remaining <= this.reserveMs) return MIN_CHUNK_TIMEOUT_MS;
      const available = remaining - this.reserveMs;
      const perChunk = Math.floor(available / chunksLeft);
      return Math.max(MIN_CHUNK_TIMEOUT_MS, Math.min(perChunk, 60_000));
    },
    canStartChunk(totalChunks: number, processedCount: number) {
      const remaining = this.getRemainingMs();
      const chunksLeft = this.getChunksRemaining(totalChunks, processedCount);
      if (chunksLeft <= 0) return false;
      const perChunk = (remaining - this.reserveMs) / chunksLeft;
      return perChunk >= MIN_CHUNK_TIMEOUT_MS;
    },
  };
}
