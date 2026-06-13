import type { LiveServerMessage, Session } from '@google/genai';
import { EndSensitivity, GoogleGenAI, Modality, StartSensitivity } from '@google/genai';
import { MicCapture, SpeakerQueue } from './audio';
import type { VoiceGameController } from './controller';
import { LIVE_MODEL } from './live-model';
import { buildSystemInstruction } from './prompts';
import { executeTool, functionDeclarations } from './tools';

export interface SessionEvents {
  onStatus: (status: 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error') => void;
  onCaption: (who: 'you' | 'robot', text: string, final: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Auth: prefer an ephemeral token from /api/live-token (production); fall back to
 * NEXT_PUBLIC_GEMINI_API_KEY (dev only — never ship a real key in client code).
 */
async function getAuthKey(): Promise<string> {
  try {
    const res = await fetch('/api/live-token', { method: 'POST' });
    if (res.ok) {
      const { token } = await res.json();
      if (token) return token;
    }
  } catch {
    /* no token endpoint configured */
  }
  const devKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (devKey) return devKey;
  throw new Error('No auth available: set GEMINI_API_KEY for /api/live-token, or NEXT_PUBLIC_GEMINI_API_KEY for dev.');
}

export class VoiceSession {
  private controller: VoiceGameController;
  private events: SessionEvents;
  private session: Session | null = null;
  private mic = new MicCapture();
  private speaker = new SpeakerQueue();
  private resumeHandle: string | null = null;
  private closedByUser = false;
  private isSessionOpen = false;
  private captionBuf = { you: '', robot: '' };
  private prevLetters = { player: 0, robot: 0 };

  constructor(controller: VoiceGameController, events: SessionEvents) {
    this.controller = controller;
    this.events = events;
  }

  get muted(): boolean {
    return this.mic.muted;
  }

  setMuted(m: boolean): void {
    this.mic.muted = m;
  }

  async start(): Promise<void> {
    this.events.onStatus('connecting');
    await this.speaker.resume();
    await this.connect();
    await this.mic.start((chunk) => this.sendMicChunk(chunk));
  }

  private sendMicChunk(chunk: string): void {
    const session = this.session;
    if (!session || !this.isSessionOpen) return;
    try {
      session.sendRealtimeInput({ audio: { data: chunk, mimeType: 'audio/pcm;rate=16000' } });
    } catch (error) {
      this.isSessionOpen = false;
      this.events.onStatus('error');
      this.events.onError(error instanceof Error ? error.message : 'Could not send microphone audio.');
    }
  }

  private async connect(): Promise<void> {
    const key = await getAuthKey();
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha' } });

    this.session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemInstruction(
          this.controller.robot,
          this.controller.remainingTricks(),
          this.controller.snapshot(),
        ),
        tools: [{ functionDeclarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 60,
            silenceDurationMs: 700,
          },
        },
        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
        contextWindowCompression: { slidingWindow: {} },
      },
      callbacks: {
        onopen: () => {
          this.isSessionOpen = true;
          this.events.onStatus('live');
        },
        onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
        onerror: (e: ErrorEvent) => {
          this.isSessionOpen = false;
          this.events.onStatus('error');
          this.events.onError(e.message || 'Connection error');
        },
        onclose: (e: CloseEvent) => {
          this.isSessionOpen = false;
          this.session = null;
          if (e.code || e.reason) {
            this.events.onError(`Live connection closed${e.code ? ` (${e.code})` : ''}${e.reason ? `: ${e.reason}` : ''}`);
          }
          if (!this.closedByUser) void this.reconnect();
        },
      },
    });
  }

  private async reconnect(): Promise<void> {
    if (this.closedByUser) return;
    this.events.onStatus('reconnecting');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        // Without a resumption handle a fresh session still works: the system
        // instruction is rebuilt from the controller's current state snapshot.
        await this.connect();
        return;
      } catch {
        /* retry */
      }
    }
    this.events.onStatus('error');
    this.events.onError('Lost connection and could not reconnect.');
  }

  private handleMessage(msg: LiveServerMessage): void {
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    }

    if (msg.toolCall?.functionCalls?.length) {
      const functionResponses = msg.toolCall.functionCalls.map((fc) => {
        const response = executeTool(this.controller, fc.name ?? '', (fc.args ?? {}) as Record<string, unknown>);
        return { id: fc.id, name: fc.name, response };
      });
      this.playStateEarcons();
      this.session?.sendToolResponse({ functionResponses });
    }

    const sc = msg.serverContent;
    if (sc?.interrupted) this.speaker.interrupt();

    const audio = msg.data;
    if (audio) this.speaker.enqueue(audio);

    if (sc?.inputTranscription?.text) {
      this.captionBuf.you += sc.inputTranscription.text;
      this.events.onCaption('you', this.captionBuf.you, false);
    }
    if (sc?.outputTranscription?.text) {
      this.captionBuf.robot += sc.outputTranscription.text;
      this.events.onCaption('robot', this.captionBuf.robot, false);
    }
    if (sc?.turnComplete) {
      if (this.captionBuf.you) this.events.onCaption('you', this.captionBuf.you, true);
      if (this.captionBuf.robot) this.events.onCaption('robot', this.captionBuf.robot, true);
      this.captionBuf = { you: '', robot: '' };
    }

    if (msg.goAway) {
      // Server is about to drop us; proactively cycle the connection.
      this.session?.close();
    }
  }

  /** Audio cues on letter changes / game over, driven by authoritative state. */
  private playStateEarcons(): void {
    const s = this.controller.state;
    if (s.winner === 'player') this.speaker.earcon('win');
    else if (s.winner === 'robot') this.speaker.earcon('lose');
    else if (s.letters.player > this.prevLetters.player) this.speaker.earcon('letter');
    this.prevLetters = { ...s.letters };
  }

  async stop(): Promise<void> {
    this.closedByUser = true;
    this.isSessionOpen = false;
    this.session?.close();
    this.session = null;
    await this.mic.stop();
    await this.speaker.close();
    this.events.onStatus('ended');
  }
}
