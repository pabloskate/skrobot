/**
 * Auth feature — passwordless account UI and client auth state.
 * Server-only session and magic-link code stays under `server/` and is imported
 * directly only by API routes.
 */
export type { AuthTier, AuthUser, VoiceQuota } from './useAuth';
export { useAuth } from './useAuth';
export { default as AuthGate } from './AuthGate';
export { default as SignInScreen } from './SignInScreen';
