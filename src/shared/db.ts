/**
 * Cloudflare D1 access for server code (API routes, server components).
 *
 * The backend is not enabled yet. To turn it on:
 *   1. `npx wrangler d1 create skrobot` and paste the id into the
 *      `d1_databases` block in wrangler.jsonc (it's there, commented out).
 *   2. Add SQL migrations under `migrations/` and apply with
 *      `npx wrangler d1 migrations apply skrobot`.
 *   3. `npm run cf-typegen` to regenerate cloudflare-env.d.ts with the
 *      typed `DB` binding, then replace the cast below with `env.DB`.
 *
 * Local dev: `next dev` (via initOpenNextCloudflareForDev) and
 * `npm run preview` both serve the binding from a local D1 simulator.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as { DB?: unknown }).DB;
  if (!db) {
    throw new Error('D1 binding "DB" is not configured — uncomment d1_databases in wrangler.jsonc (see src/shared/db.ts)');
  }
  return db;
}
