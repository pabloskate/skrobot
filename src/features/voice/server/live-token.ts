/**
 * Server-only: mints a single-use ephemeral Live API token so the real
 * GEMINI_API_KEY never ships to the browser. Called from
 * `src/app/api/live-token/route.ts`. Do not import this from client code.
 */
import { GoogleGenAI } from '@google/genai';
import { LIVE_MODEL } from '../live-model';

export async function mintLiveToken(apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      // Pin the token to our Live model. lockAdditionalFields: [] means only
      // the fields set here are locked — the browser still supplies its dynamic
      // game prompt/tools at connect time (omitting it would lock everything).
      liveConnectConstraints: { model: LIVE_MODEL },
      lockAdditionalFields: [],
    },
  });
  if (!token.name) throw new Error('Live API returned a token without a name');
  return token.name;
}
