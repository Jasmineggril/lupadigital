export function getRateLimitConfig() {
  return {
    defaultMax: Number(process.env.RATE_LIMIT_DEFAULT_MAX ?? 300),
    aiMax: Number(process.env.RATE_LIMIT_AI_MAX ?? 120),
    ocrMax: Number(process.env.RATE_LIMIT_OCR_MAX ?? 30),
  };
}

export function getDatabasePoolConfig() {
  return {
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT ?? 10000),
  };
}
