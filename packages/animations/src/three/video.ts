import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { RiderStance, Robot, Trick } from '../types';
import type { FallVariant } from '../motion/trick';
import type { RailBail } from '../motion/fall/railBail';
import { resolveSkateStyle } from '../motion/style';
import { DEFAULT_SCENE_CAMERA, type SceneCamera, type TripodId } from '../camera/camera';
import type { Obstacle, RailChoice, StageSet } from '../sets/sets';
import type { BankRide } from '../sets/terrain';
import type { Skater } from '../riders/skaters';
import { SceneRenderer } from './renderer';
import type { RenderQuality } from './cinematic';
export type { RenderQuality } from './cinematic';
import { lookFor } from './rendererPool';
import { renderSoundtrack } from '../sound/skateSounds';
import { soundtrackFor } from '../sound/soundtrack';
import { planStage, stageFrame } from '../stage/stage';
import { STOCK_VIEW } from '../camera/view';

/**
 * @skrobot/animations/three/video — films an attempt, landed or missed, to a video file.
 *
 * TrickScene3D's picture, drawn off screen one frame at a time at a steady
 * frame rate, however fast or slow the device draws, and encoded with
 * WebCodecs. No real-time recording fallback: slow rendering must never skip
 * frames in a downloaded video. Browsers without an encoder cannot export.
 * The same stage, renderer, camera and zoom draw the live scene. The trick's
 * sounds go on its audio track where the browser can encode one.
 * Its own entry point, so the encoder only loads when someone films.
 */

export interface TrickVideoOptions {
  robot: Robot;
  trick: Pick<Trick, 'id' | 'name' | 'base' | 'stance'>;
  riderStance?: RiderStance;
  /** Whether the attempt lands, as on the live stage; landed unless given. */
  landed?: boolean;
  /** How a missed attempt goes wrong (the explorer's kick-out), as on the live stage. A slam unless given. */
  fallVariant?: FallVariant;
  /** A grind kicked out: which way the rider jumps off the rail, as on the live stage. */
  railBail?: RailBail;
  camera?: SceneCamera;
  /** Film from this tripod instead of the crane, where the set has it (the landmarks). */
  tripod?: TripodId | null;
  /** Magnification of the picture, 1 stock. */
  zoom?: number;
  set?: StageSet;
  /** Which of the set's handrails a grind rides, as on the live stage. */
  rail?: RailChoice;
  /** What a gap trick goes over where the set has a choice, as on the live stage. */
  obstacle?: Obstacle;
  /** On a bank that supports it, whether the landing is ridden on four wheels, manual, or nose manual. */
  bankRide?: BankRide;
  /** The same robot or realistic human selected in the live scene. */
  skater?: Skater;
  /** Playback speed: at 0.25 the trick fills four times as long a video. */
  rate?: number;
  /** Video width in pixels; the height keeps the stage's shape. */
  width?: number;
  /** Opt into an audio track; off by default and omitted where the browser can't encode audio. */
  sound?: boolean;
  fps?: number;
  /** Export-only physical surface finish and contact shading. */
  quality?: RenderQuality;
  /** The share of the video filmed so far, 0 to 1. */
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

/** Thrown when frame-by-frame video encoding is unavailable. */
export class VideoUnsupportedError extends Error {
  constructor() {
    super("To download a smooth video, open the HTTPS site in an up-to-date browser.");
    this.name = 'VideoUnsupportedError';
  }
}

/**
 * Bits per second at 1280 wide, 60 fps, scaled by pixels and frames for other
 * sizes. The flat cel shading holds up well here, and a set rate (rather
 * than the encoder's own quality scale) keeps file sizes alike everywhere.
 */
const BITRATE = 8_000_000;
/** H.264 first: it plays everywhere an MP4 is opened. */
const CODECS = ['avc', 'hevc', 'vp9', 'av1'] as const;
/** AAC first, for the same reason. */
const AUDIO_CODECS = ['aac', 'opus'] as const;
const AUDIO_BITRATE = 128_000;
const SAMPLE_RATE = 48_000;

const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

/** Whether this browser exposes frame-by-frame encoding (codec support is checked at export). */
export const canRecordVideo = () => hasWebCodecs();

/** Films the attempt. The blob's MIME type identifies its format. Rejects when aborted. */
export async function recordTrickVideo({
  robot,
  trick,
  riderStance = 'regular',
  landed = true,
  fallVariant = 'slam',
  railBail,
  camera = DEFAULT_SCENE_CAMERA,
  tripod = null,
  zoom = 1,
  set = 'plaza',
  skater = 'robot',
  rail = 'center',
  obstacle = 'stairs',
  bankRide = 'ride',
  rate = 1,
  quality = 'standard',
  width: requestedWidth = quality === 'cinematic' ? 1920 : 1280,
  sound = false,
  fps = 60,
  onProgress,
  signal,
}: TrickVideoOptions): Promise<Blob> {
  signal?.throwIfAborted();
  if (!canRecordVideo()) throw new VideoUnsupportedError();
  // Encoders want even dimensions.
  const width = Math.round(requestedWidth / 2) * 2;
  const height = Math.round(width / (STOCK_VIEW.width / STOCK_VIEW.height) / 2) * 2;
  const codec = await getFirstEncodableVideoCodec([...CODECS], { width, height, frameRate: fps });
  if (!codec) throw new VideoUnsupportedError();
  const audioCodec = sound && typeof OfflineAudioContext !== 'undefined'
    ? await getFirstEncodableAudioCodec([...AUDIO_CODECS], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, quality: new Quality({ bitrate: AUDIO_BITRATE }) })
    : null;
  signal?.throwIfAborted();

  const film = document.createElement('canvas');
  film.width = width;
  film.height = height;
  const ctx = film.getContext('2d');
  if (!ctx) throw new VideoUnsupportedError();
  const style = resolveSkateStyle(robot.skateStyle);
  const stage = planStage(trick, { landed, riderStance, style, fall: fallVariant, shankProgress: 0.5, skater, set, rail, obstacle, bankRide, railBail });
  const glCanvas = document.createElement('canvas');
  const scene = new SceneRenderer(glCanvas, lookFor(robot, skater), set, quality);
  scene.setSize(width, height, quality === 'cinematic' ? Math.min(1.5, 2560 / width) : 1);

  const bitrate = Math.round(BITRATE * ((width * height) / (1280 * 1034)) * (fps / 60));
  const drawFrame = (time: number) => {
    // The wheels' motion smear spans one video frame (stageFrame assumes 60 fps).
    const frame = stageFrame(stage, Math.min(stage.end, time * rate), (rate * 60) / fps);
    ctx.clearRect(0, 0, width, height);
    // Copied in the same task it's drawn, while the WebGL canvas still holds the frame.
    if (scene.renderer.getContext().isContextLost()) throw new Error('The graphics context was lost. Try exporting again.');
    scene.render(frame, camera, zoom, tripod);
    if (scene.renderer.getContext().isContextLost()) throw new Error('The graphics context was lost. Try exporting again.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(glCanvas, 0, 0, width, height);
  };
  // Frame i shows the trick at i / fps of video time, so the last lands exactly
  // on the end. No hold after it: the explorer stops there too, the video ends.
  const total = Math.ceil((stage.end / rate) * fps) + 1;
  try {
    await scene.ready;
    signal?.throwIfAborted();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const source = new CanvasSource(film, { codec, quality: new Quality({ bitrate }) });
    output.addVideoTrack(source, { frameRate: fps });
    const audio = audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: AUDIO_BITRATE }) }) : null;
    if (audio) output.addAudioTrack(audio);
    try {
      await output.start();
      if (audio) {
        await audio.add(await renderSoundtrack(soundtrackFor(stage), stage.end, rate, SAMPLE_RATE));
        audio.close();
      }
      for (let i = 0; i < total; i++) {
        signal?.throwIfAborted();
        drawFrame(i / fps);
        await source.add(i / fps, 1 / fps);
        onProgress?.((i + 1) / total);
      }
      await output.finalize();
    } catch (error) {
      await output.cancel();
      throw error;
    }
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video came out empty.');
    return new Blob([buffer], { type: output.format.mimeType });
  } finally {
    scene.dispose();
  }
}

/** Same moment, camera and rig in both export finishes. No encoder or live-stage changes. */
export async function renderTrickPreview(options: TrickVideoOptions): Promise<{ standard: string; cinematic: string }> {
  const { robot, trick, skater = 'robot', set = 'plaza', riderStance = 'regular', landed = true, fallVariant = 'slam', railBail,
    rail = 'center', obstacle = 'stairs', bankRide = 'ride', camera = DEFAULT_SCENE_CAMERA, zoom = 1, tripod = null, signal } = options;
  const stage = planStage(trick, { landed, riderStance, style: resolveSkateStyle(robot.skateStyle),
    fall: fallVariant, shankProgress: 0.5, skater, set, rail, obstacle, bankRide, railBail });
  const previewTime = stage.grind ? (stage.grind.lockAt + stage.grind.off) / 2 : stage.end * 0.45;
  const frame = stageFrame(stage, previewTime, options.rate ?? 1);
  const width = 960;
  const height = Math.round(width / (STOCK_VIEW.width / STOCK_VIEW.height));
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const ctx = output.getContext('2d');
  if (!ctx) throw new VideoUnsupportedError();
  const result = { standard: '', cinematic: '' };
  for (const quality of ['standard', 'cinematic'] as const) {
    signal?.throwIfAborted();
    const canvas = document.createElement('canvas');
    const scene = new SceneRenderer(canvas, lookFor(robot, skater), set, quality);
    try {
      scene.setSize(width, height, quality === 'cinematic' ? 1.5 : 1);
      await scene.ready;
      signal?.throwIfAborted();
      scene.render(frame, camera, zoom, tripod);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, width, height);
      result[quality] = output.toDataURL('image/png');
    } finally { scene.dispose(); }
  }
  return result;
}
