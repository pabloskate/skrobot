/**
 * Voice feature — hands-free S.K.A.T.E. over the Gemini Live API.
 * The game engine stays the source of truth; the model only narrates tool
 * results (see docs/VOICE_MODE_PLAN.md). Everything here is client-only
 * EXCEPT `server/live-token.ts`, which is server-only and deliberately not
 * exported from this barrel — the API route imports it by path.
 */
export { default as VoiceGameScreen } from './VoiceGameScreen';
