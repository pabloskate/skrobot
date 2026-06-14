# Billing Enablement

Stripe billing is intentionally hidden during the beta. Voice mode is account-gated,
but free users currently get 15 voice games per rolling 7 days and there is no visible
checkout or upgrade flow.

## Current beta behavior

- `src/features/auth/server/sessions.ts` sets `FREE_VOICE_LIMIT` to `15`.
- Quota exhaustion shows a beta limit screen, not a payment CTA.
- `/api/billing/checkout` and `/api/billing/webhook` return `404` unless billing is
  explicitly enabled with `ENABLE_BILLING=true`.
- The Stripe server integration remains in `src/features/billing/server/stripe.ts`
  so it can be enabled later without rebuilding the whole flow.

## Enabling Stripe later

1. Form the business and finish the Stripe account setup.
2. Create a recurring `$7/mo` Stripe Price.
3. Add Worker secrets:

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put STRIPE_PRICE_ID
   ```

4. Add the runtime flag in `wrangler.jsonc`:

   ```jsonc
   "vars": {
     "MAGIC_LINK_FROM": "skaterobot@customrouter.ai",
     "ENABLE_BILLING": "true"
   }
   ```

5. Create the Stripe webhook endpoint:

   ```text
   https://<production-domain>/api/billing/webhook
   ```

   Subscribe it to:

   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

6. Restore the visible upgrade CTA in `src/features/billing/UpgradeScreen.tsx` so
   quota exhaustion opens `/api/billing/checkout`.

7. Re-test:

   - signed-out voice start requires sign-in
   - 15 beta games are counted per rolling 7 days
   - checkout redirects to Stripe
   - webhook flips `users.tier` to `paid`
   - paid users have unlimited voice quota
