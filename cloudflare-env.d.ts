/**
 * Bindings available on `getCloudflareContext().env`.
 * Hand-maintained because the app needs optional future billing fields while
 * Wrangler generates only currently configured bindings. Run `npm run cf-typegen`
 * to generate a binding reference in /private/tmp after wrangler.jsonc changes.
 */

/** Workers rate limiting binding (wrangler.jsonc `unsafe.bindings`, type "ratelimit"). */
interface CloudflareRateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta: unknown;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface SendEmailMessage {
  to: string;
  from: string | { email: string; name?: string };
  subject: string;
  html?: string;
  text?: string;
}

interface SendEmail {
  send(message: SendEmailMessage): Promise<unknown>;
}

interface CloudflareEnv {
  DB?: D1Database;
  EMAIL?: SendEmail;
  ENABLE_BILLING?: string;
  GEMINI_API_KEY?: string;
  MAGIC_LINK_FROM?: string;
  NEXTJS_ENV?: string;
  LIVE_TOKEN_RATE_LIMIT?: CloudflareRateLimit;
  STRIPE_PRICE_ID?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}
