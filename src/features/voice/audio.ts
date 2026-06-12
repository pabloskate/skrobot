/** Mic capture at 16kHz PCM16 and gapless 24kHz playback for the Live API. */

const WORKLET_SRC = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

function floatTo16BitBase64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(i16.buffer);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  muted = false;

  async start(onChunk: (base64Pcm16: string) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'capture-processor');
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (!this.muted) onChunk(floatTo16BitBase64(e.data));
    };
    source.connect(this.node);
    // Worklet needs a destination to keep pulling; route through zero gain.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
  }

  async stop(): Promise<void> {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }
}

export class SpeakerQueue {
  private ctx = new AudioContext({ sampleRate: 24000 });
  private cursor = 0;
  private sources = new Set<AudioBufferSourceNode>();

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /** Queue a base64 PCM16 @24kHz chunk for gapless playback. */
  enqueue(base64: string): void {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;

    const buf = this.ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    if (this.cursor < now + 0.03) this.cursor = now + 0.03;
    src.start(this.cursor);
    this.cursor += buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Barge-in: drop everything queued. */
  interrupt(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.cursor = 0;
  }

  /** Short earcon that cuts through wind better than speech. */
  earcon(kind: 'letter' | 'win' | 'lose'): void {
    const seq: [number, number][] =
      kind === 'letter' ? [[440, 0.12], [330, 0.18]] : kind === 'win' ? [[523, 0.1], [659, 0.1], [784, 0.22]] : [[330, 0.15], [262, 0.3]];
    let t = this.ctx.currentTime + 0.02;
    for (const [freq, dur] of seq) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }
  }

  async close(): Promise<void> {
    this.interrupt();
    if (this.ctx.state !== 'closed') await this.ctx.close();
  }
}
