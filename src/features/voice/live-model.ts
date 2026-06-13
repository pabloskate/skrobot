/**
 * The Gemini Live model used for voice games. Shared by the browser session
 * (liveSession.ts) and the server token mint (server/live-token.ts) — the
 * ephemeral token is pinned to this exact model (liveConnectConstraints), and
 * the Live API silently substitutes the pinned model if the client asks for
 * another, so changing it here updates both sides together.
 */
export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
