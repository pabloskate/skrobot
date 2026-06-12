/**
 * Bindings available on `getCloudflareContext().env`.
 * Hand-maintained for now; once real bindings (D1 etc.) exist in
 * wrangler.jsonc, regenerate with `npm run cf-typegen`.
 */
interface CloudflareEnv {
  GEMINI_API_KEY?: string;
  NEXTJS_ENV?: string;
}
