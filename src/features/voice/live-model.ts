/**
 * The Gemini Live model used for voice games. Shared by the browser session
 * (liveSession.ts) and the server token mint (server/live-token.ts) — the
 * ephemeral token is constrained to this exact model, so they must match.
 */
export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
