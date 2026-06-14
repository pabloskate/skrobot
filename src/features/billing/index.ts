/**
 * Billing feature — beta quota screen today, dormant Stripe helpers later.
 * Server-only Stripe integration stays under `server/` and is imported
 * directly only by API routes when billing is explicitly enabled.
 */
export { default as UpgradeScreen } from './UpgradeScreen';
