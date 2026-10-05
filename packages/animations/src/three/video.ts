import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
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
import { resolveSkateStyle } from '../motion/style';
import { DEFAULT_SCENE_CAMERA, type SceneCamera, type TripodId } from '../camera/camera';
import { setInfo, type RailChoice, type StageSet } from '../sets/sets';
import type { Skater } from '../riders/skaters';
import { SceneRenderer } from './renderer';
import { lookFor } from './rendererPool';
import { renderSoundtrack } from '../sound/skateSounds';
import { soundtrackFor } from '../sound/soundtrack';
import { planStage, stageFrame, type StageFrame } from '../stage/stage';
import { STOCK_VIEW, stageView } from '../camera/view';
import { WaterfrontFarImage } from '../sets/waterfront/waterfrontFar';

/**
 * @skrobot/animations/three/video — films a landed attempt to an MP4.
 *
 * TrickScene3D's picture, drawn off screen one frame at a time at a steady
 * frame rate, however fast or slow the device draws, and encoded with
 * WebCodecs. The same stage, renderer, camera, and zoom as the live scene;
 * on the waterfront the far panorama, which the page layers under the
 * canvas, is painted under each frame instead (WaterfrontFarImage). The
 * trick's sounds go on its audio track, where the browser can encode one.
 * Its own entry point, so the encoder only loads when someone films.
 */

export interface TrickVideoOptions {
  robot: Robot;
  trick: Pick<Trick, 'id' | 'name' | 'base' | 'stance'>;
  riderStance?: RiderStance;
  camera?: SceneCamera;
  /** Film from this tripod instead of the crane, where the set has it (El Toro). */
  tripod?: TripodId | null;
  /** Magnification of the picture, 1 stock. */
  zoom?: number;
  set?: StageSet;
  /** Which of the set's handrails a grind rides, as on the live stage. */
  rail?: RailChoice;
  /** The same robot, human, or humanoid selected in the live scene. */
  skater?: Skater;
  /** Playback speed: at 0.25 the trick fills four times as long a video. */
  rate?: number;
  /** Video width in pixels; the height keeps the stage's shape. */
  width?: number;
  /** Put the trick's sounds on an audio track (left off where the browser can't encode audio). */
  sound?: boolean;
  fps?: number;
  /** The share of the video filmed so far, 0 to 1. */
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

/** Thrown when this browser can't encode video (no WebCodecs, or no codec an MP4 can carry). */
export class VideoUnsupportedError extends Error {
  constructor() {
    super("This browser can't encode video.");
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

/** Whether this browser has the WebCodecs encoder filming needs. */
export const canRecordVideo = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

/** Films the attempt and resolves to the MP4. Rejects with the signal's reason when aborted. */
export async function recordTrickVideo({
  robot,
  trick,
  riderStance = 'regular',
  camera = DEFAULT_SCENE_CAMERA,
  tripod = null,
  zoom = 1,
  set = 'plaza',
  skater = 'robot',
  rail = 'center',
  rate = 1,
  width: requestedWidth = 1280,
  sound = true,
  fps = 60,
  onProgress,
  signal,
}: TrickVideoOptions): Promise<Blob> {
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
  const stage = planStage(trick, { landed: true, riderStance, style, fall: 'slam', shankProgress: 0.5, skater, set, rail });
  const glCanvas = document.createElement('canvas');
  const scene = new SceneRenderer(glCanvas, lookFor(robot, skater), set);
  scene.setSize(width, height, 1);
  const far = setInfo(set).farPanorama ? new FarPainter(width, height) : null;

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const bitrate = Math.round(BITRATE * ((width * height) / (1280 * 1034)) * (fps / 60));
  const source = new CanvasSource(film, { codec, quality: new Quality({ bitrate }) });
  output.addVideoTrack(source, { frameRate: fps });
  const audio = audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: AUDIO_BITRATE }) }) : null;
  if (audio) output.addAudioTrack(audio);
  // Frame i shows the trick at i / fps of video time, so the last lands exactly
  // on the end. No hold after it: the explorer's loop pauses there, the video stops.
  const total = Math.ceil((stage.end / rate) * fps) + 1;
  try {
    await output.start();
    if (audio) {
      await audio.add(await renderSoundtrack(soundtrackFor(stage), stage.end, rate, SAMPLE_RATE));
      audio.close();
    }
    for (let i = 0; i < total; i++) {
      signal?.throwIfAborted();
      // The wheels' motion smear spans one video frame (stageFrame assumes 60 fps).
      const frame = stageFrame(stage, Math.min(stage.end, (i / fps) * rate), (rate * 60) / fps);
      const backdrop = await far?.paint(frame, camera, zoom);
      ctx.clearRect(0, 0, width, height);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, width, height);
      // Copied in the same task it's drawn, while the WebGL canvas still holds the frame.
      scene.render(frame, camera, zoom, tripod);
      ctx.drawImage(glCanvas, 0, 0, width, height);
      await source.add(i / fps, 1 / fps);
      onProgress?.((i + 1) / total);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    far?.dispose();
    scene.dispose();
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('The video came out empty.');
  return new Blob([buffer], { type: output.format.mimeType });
}

/** Rasterizes the waterfront's far panorama for one frame, framed as the renderer frames it. */
class FarPainter {
  private readonly host = document.createElement('div');
  private readonly root: Root = createRoot(this.host);

  constructor(private readonly width: number, private readonly height: number) {}

  async paint(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number): Promise<HTMLImageElement> {
    const { width, height } = this;
    const view = stageView(frame.lift, camera, zoom, width / height);
    flushSync(() => this.root.render(createElement(WaterfrontFarImage, { cam: view.cam, scroll: frame.scroll, view: view.box, width, height })));
    const svg = this.host.firstElementChild;
    if (!svg) throw new Error('The waterfront backdrop did not render.');
    const image = new Image(width, height);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await image.decode();
    return image;
  }

  dispose() {
    this.root.unmount();
  }
}
