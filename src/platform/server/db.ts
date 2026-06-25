/**
 * Cloudflare D1 access for server code (API routes, server feature modules).
 *
 * D1 is enabled in wrangler.jsonc. Schema changes belong in `migrations/` and
 * should be applied with the `db:migrate:*` npm scripts. `npm run cf-typegen`
 * writes Wrangler's generated binding reference to /private/tmp; keep
 * cloudflare-env.d.ts in sync by hand when bindings change.
 *
 * Local dev: `next dev` (via initOpenNextCloudflareForDev) and
 * `npm run preview` both serve the binding from a local D1 simulator.
 */
import { getCloudflareEnv } from './cloudflare';

export async function getDb() {
  const env = await getCloudflareEnv();
  if (!env.DB) throw new Error('D1 binding "DB" is not configured - set d1_databases.database_id in wrangler.jsonc');
  return env.DB;
}
