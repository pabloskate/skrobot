import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canRecordVideo, recordTrickVideo, type TrickVideoOptions } from './video';

const state = vi.hoisted(() => ({
  codec: vi.fn(async () => 'avc' as string | null),
  add: vi.fn<(time: number, duration: number) => Promise<void>>(async () => {}),
  render: vi.fn(), dispose: vi.fn(), finalize: vi.fn(async () => {}), cancel: vi.fn(async () => {}),
  frame: vi.fn((_stage: unknown, time: number) => ({ time })),
  lost: false,
}));
vi.mock('mediabunny', () => ({
  getFirstEncodableVideoCodec: state.codec,
  getFirstEncodableAudioCodec: vi.fn(),
  Quality: class {}, Mp4OutputFormat: class { mimeType = 'video/mp4'; },
  BufferTarget: class { buffer = new Uint8Array([1, 2, 3]).buffer; },
  Output: class {
    target; format;
    constructor(options: { target: unknown; format: unknown }) { this.target = options.target; this.format = options.format; }
    addVideoTrack() {} start = async () => {}; finalize = state.finalize; cancel = state.cancel;
  },
  CanvasSource: class { add = state.add; }, AudioBufferSource: class {},
}));
vi.mock('./renderer', () => ({ SceneRenderer: class {
  ready = Promise.resolve();
  renderer = { getContext: () => ({ isContextLost: () => state.lost }) };
  setSize() {} render = state.render; dispose = state.dispose;
} }));
vi.mock('./rendererPool', () => ({ lookFor: () => ({}) }));
vi.mock('../stage/stage', () => ({ planStage: () => ({ end: 0.1 }), stageFrame: state.frame }));

const options = {
  robot: {}, trick: { id: 'ollie', name: 'Ollie', base: 'ollie', stance: 'regular' }, fps: 30,
} as TrickVideoOptions;

beforeEach(() => {
  vi.clearAllMocks();
  state.codec.mockResolvedValue('avc');
  state.add.mockImplementation(async () => {});
  state.lost = false;
  vi.stubGlobal('VideoEncoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  vi.stubGlobal('document', { createElement: vi.fn(() => ({
    getContext: () => ({ clearRect() {}, drawImage() {} }),
  })) });
});
afterEach(() => vi.unstubAllGlobals());

describe('frame-by-frame video export', () => {
  it('encodes every timestamp in order, waiting for the encoder before drawing again', async () => {
    let previousDraws = 0;
    state.add.mockImplementation(async () => {
      expect(state.render).toHaveBeenCalledTimes(++previousDraws);
      await Promise.resolve();
      expect(state.render).toHaveBeenCalledTimes(previousDraws);
    });
    const onProgress = vi.fn();
    const blob = await recordTrickVideo({ ...options, onProgress });
    expect(blob.type).toBe('video/mp4');
    expect(state.add.mock.calls).toEqual([0, 1 / 30, 2 / 30, 3 / 30].map(t => [t, 1 / 30]));
    expect(state.frame.mock.calls.map(call => call[1])).toEqual([0, 1 / 30, 2 / 30, 3 / 30]);
    expect(state.finalize).toHaveBeenCalledOnce();
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('does not substitute real-time recording when WebCodecs is missing', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    const recorder = vi.fn();
    vi.stubGlobal('MediaRecorder', recorder);
    expect(canRecordVideo()).toBe(false);
    await expect(recordTrickVideo(options)).rejects.toMatchObject({ name: 'VideoUnsupportedError' });
    expect(recorder).not.toHaveBeenCalled();
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it('reports unsupported codecs before allocating a renderer', async () => {
    state.codec.mockResolvedValue(null);
    await expect(recordTrickVideo(options)).rejects.toMatchObject({ name: 'VideoUnsupportedError' });
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it('rejects context loss instead of saving blank or damaged frames', async () => {
    state.render.mockImplementationOnce(() => { state.lost = true; });
    await expect(recordTrickVideo(options)).rejects.toThrow('graphics context was lost');
    expect(state.add).not.toHaveBeenCalled();
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.finalize).not.toHaveBeenCalled();
    expect(state.dispose).toHaveBeenCalledOnce();
  });

  it('cancels and releases the renderer when aborted during encoding', async () => {
    const controller = new AbortController();
    state.add.mockImplementationOnce(async () => { controller.abort(); });
    await expect(recordTrickVideo({ ...options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.add).toHaveBeenCalledOnce();
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.finalize).not.toHaveBeenCalled();
    expect(state.dispose).toHaveBeenCalledOnce();
  });
});
