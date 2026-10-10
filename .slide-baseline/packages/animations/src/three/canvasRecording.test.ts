import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasRecordingType, recordCanvasVideo } from './canvasRecording';

vi.mock('../sound/audio', () => ({ runningAudioContext: vi.fn(() => null) }));

class Recorder {
  static supported = ['video/mp4', 'video/webm'];
  static instances: Recorder[] = [];
  static fail = false;
  static empty = false;
  static isTypeSupported(type: string) { return this.supported.includes(type); }
  state = 'inactive';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: (event: { error: Error }) => void;
  constructor(_stream: MediaStream, readonly options: MediaRecorderOptions) {
    Recorder.instances.push(this);
  }
  get mimeType() { return this.options.mimeType!; }
  start() {
    this.state = 'recording';
    if (Recorder.fail) setTimeout(() => {
      this.onerror?.({ error: new Error('Encoder failed') });
      this.stop();
    }, 10);
  }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(Recorder.empty ? [] : ['encoded video'], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}

function fixture() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const captureStream = vi.fn(() => stream);
  return {
    stop, captureStream,
    options: {
      canvas: { captureStream } as unknown as HTMLCanvasElement,
      mimeType: 'video/mp4', duration: 0.1, fps: 60, bitrate: 8_000_000,
      drawFrame: vi.fn<(time: number) => Promise<void>>(async () => {}),
      onProgress: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
  Recorder.supported = ['video/mp4', 'video/webm'];
  Recorder.instances = [];
  Recorder.fail = false;
  Recorder.empty = false;
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('HTMLCanvasElement', class { captureStream() {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('canvas recording support', () => {
  it('prefers H.264 and AAC for portable MP4 playback', () => {
    Recorder.supported.push('video/mp4;codecs=avc1,mp4a.40.2');
    expect(canvasRecordingType()).toBe('video/mp4;codecs=avc1,mp4a.40.2');
  });

  it('prefers MP4 without requiring a WebCodecs encoder', () => {
    vi.stubGlobal('VideoEncoder', undefined);
    expect(canvasRecordingType()).toBe('video/mp4');
  });

  it('uses WebM when MP4 cannot be recorded', () => {
    Recorder.supported = ['video/webm'];
    expect(canvasRecordingType()).toBe('video/webm');
  });

  it('requires both canvas capture and a supported recording format', () => {
    vi.stubGlobal('HTMLCanvasElement', class {});
    expect(canvasRecordingType()).toBeNull();
    vi.stubGlobal('HTMLCanvasElement', class { captureStream() {} });
    Recorder.supported = [];
    expect(canvasRecordingType()).toBeNull();
    vi.stubGlobal('MediaRecorder', undefined);
    expect(canvasRecordingType()).toBeNull();
  });
});

describe('canvas video recording', () => {
  it('captures the landing, waits for the final encoded data, and releases the stream', async () => {
    const { options, stop, captureStream } = fixture();
    const result = recordCanvasVideo(options);
    await vi.runAllTimersAsync();
    const blob = await result;
    expect(blob.type).toBe('video/mp4');
    expect(await blob.text()).toBe('encoded video');
    expect(options.drawFrame).toHaveBeenLastCalledWith(options.duration);
    expect(options.onProgress).toHaveBeenLastCalledWith(1);
    expect(captureStream).toHaveBeenCalledWith(60);
    expect(stop).toHaveBeenCalledOnce();
    expect(Recorder.instances[0].state).toBe('inactive');
  });

  it('cancels a recording and releases its tracks without completing progress', async () => {
    const { options, stop } = fixture();
    const controller = new AbortController();
    options.drawFrame.mockImplementation(async time => {
      if (time > 0) controller.abort();
    });
    const result = recordCanvasVideo({ ...options, signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.runAllTimersAsync();
    await rejected;
    expect(stop).toHaveBeenCalledOnce();
    expect(Recorder.instances[0].state).toBe('inactive');
    expect(options.onProgress).not.toHaveBeenCalledWith(1);
  });

  it('does not capture a stream when already cancelled', async () => {
    const { options, captureStream } = fixture();
    await expect(recordCanvasVideo({ ...options, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(captureStream).not.toHaveBeenCalled();
  });

  it('reports an encoder failure and releases its stream', async () => {
    const { options, stop } = fixture();
    Recorder.fail = true;
    const result = recordCanvasVideo(options);
    const rejected = expect(result).rejects.toThrow('Encoder failed');
    await vi.runAllTimersAsync();
    await rejected;
    expect(stop).toHaveBeenCalledOnce();
  });

  it('rejects an empty recording', async () => {
    const { options } = fixture();
    Recorder.empty = true;
    const result = recordCanvasVideo(options);
    const rejected = expect(result).rejects.toThrow('The video came out empty.');
    await vi.runAllTimersAsync();
    await rejected;
  });
});
