import { runningAudioContext } from '../sound/audio';

/** MediaRecorder also works where WebCodecs is unavailable, including HTTP previews. */
export function canvasRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined'
    || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  // Ask for H.264/AAC explicitly: Chromium's default MP4 codec can be VP9.
  return ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm']
    .find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

interface CanvasRecordingOptions {
  canvas: HTMLCanvasElement;
  mimeType: string;
  duration: number;
  fps: number;
  bitrate: number;
  /** Draw the picture at this many seconds into the video. */
  drawFrame: (time: number) => Promise<void>;
  audio?: AudioBuffer;
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Records the same offscreen stage in real time when frame-by-frame encoding isn't available. */
export async function recordCanvasVideo({
  canvas, mimeType, duration, fps, bitrate, drawFrame, audio, onProgress, signal,
}: CanvasRecordingOptions): Promise<Blob> {
  signal?.throwIfAborted();
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let audioSource: AudioBufferSourceNode | undefined;
  let audioStarted = false;
  let audioDestination: MediaStreamAudioDestinationNode | undefined;
  try {
    // Warm up the renderer before starting the recording clock.
    await drawFrame(0);
    signal?.throwIfAborted();
    stream = canvas.captureStream(fps);
    const context = audio ? runningAudioContext() : null;
    if (audio && context) {
      audioDestination = context.createMediaStreamDestination();
      audioSource = context.createBufferSource();
      audioSource.buffer = audio;
      audioSource.connect(audioDestination);
      for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);
    }
    const recording = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128_000 });
    recorder = recording;
    let recordingError: Error | undefined;
    const finished = new Promise<Blob>(resolve => {
      const chunks: Blob[] = [];
      recording.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = event => {
        recordingError = 'error' in event ? event.error as Error : new Error('Video recording failed.');
      };
      recording.onstop = () => resolve(new Blob(chunks, { type: chunks[0]?.type || recording.mimeType || mimeType }));
    });
    recording.start();
    audioSource?.start();
    audioStarted = Boolean(audioSource);
    const start = performance.now();
    let time = 0;
    while (time < duration) {
      signal?.throwIfAborted();
      if (recording.state !== 'recording') throw recordingError ?? new Error('Video recording stopped early.');
      const frameStart = performance.now();
      await drawFrame(time);
      onProgress?.(time / duration);
      await pause(Math.max(0, 1000 / fps - (performance.now() - frameStart)));
      // Keep the trick and its soundtrack at the chosen speed even if drawing drops frames.
      time = Math.min(duration, (performance.now() - start) / 1000);
    }
    await drawFrame(duration);
    // Give captureStream time to capture the landing before stopping.
    await pause(1000 / fps);
    signal?.throwIfAborted();
    if (recording.state === 'recording') recording.stop();
    const blob = await finished;
    if (recordingError) throw recordingError;
    if (!blob.size) throw new Error('The video came out empty.');
    onProgress?.(1);
    return blob;
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (audioStarted) audioSource?.stop();
    audioSource?.disconnect();
    audioDestination?.disconnect();
  }
}
