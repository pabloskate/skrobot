/**
 * Bindings available on `getCloudflareContext().env`.
 * Hand-maintained for now; once real bindings (D1 etc.) exist in
 * wrangler.jsonc, regenerate with `npm run cf-typegen`.
 */

/** Workers rate limiting binding (wrangler.jsonc `unsafe.bindings`, type "ratelimit"). */
interface CloudflareRateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface CloudflareEnv {
  GEMINI_API_KEY?: string;
  NEXTJS_ENV?: string;
  LIVE_TOKEN_RATE_LIMIT?: CloudflareRateLimit;
}
