import { runningAudioContext } from '../audio';
import { cuesBetween, type SoundCue, type Soundtrack } from './soundtrack';

/**
 * The trick sounds, synthesized with Web Audio rather than recorded, so
 * there is nothing to load and every hit comes out a little different: the
 * tail's crack and the deck's wooden knock at the pop, the trucks clanking
 * onto the rail and scraping along it (a smoother hiss for a slide, the deck
 * on the rail), the thump and clack of the wheels coming down, a board
 * clattering away from a slam, and the low rumble of the wheels in between.
 * Where the app serves recordings of the wheels and the rail
 * (TRICK_SOUND_FILES), those play instead of their synthesized stand-ins.
 *
 * Kept under the game's own beeps: there to feel, not to notice. Slowed
 * down, everything drops in pitch a little, like slow-motion footage.
 */

/**
 * Everything together, and the wheels' and the rail's levels within that.
 * Wood sliding on metal is only a faint hiss, well under trucks grinding it.
 */
const VOLUME = 0.5;
const ROLL_LEVEL = 0.22;
const GRIND_LEVEL = 0.2;
const SLIDE_LEVEL = 0.045;

/** Seconds the wheels and rail take to follow a level change: soft enough not to click, quick enough for a pop. */
const LEVEL_EASE = 0.012;
/** How quickly they fall quiet once the clock stops. */
const QUIET_EASE = 0.05;

/**
 * Pitch played at for a playback rate: slowed down, a little lower and longer
 * (a quarter speed plays about two thirds as high), never higher than life.
 */
export const slowPitch = (rate: number) => Math.max(0.25, Math.min(1, rate)) ** 0.3;

// ----- Sources -----

interface Noises {
  white: AudioBuffer;
  /** White noise integrated: its energy in the lows, for rumble. */
  brown: AudioBuffer;
  /** A smooth random wander between -1 and 1, 40 turns a second: unevenness to modulate levels with. */
  wander: AudioBuffer;
}

const NOISE_SECONDS = 2;
const WANDER_RATE = 40;
const noiseCache = new WeakMap<BaseAudioContext, Noises>();

function noises(ctx: BaseAudioContext): Noises {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.round(NOISE_SECONDS * ctx.sampleRate);
  const buffer = (fill: (data: Float32Array) => void) => {
    const b = ctx.createBuffer(1, length, ctx.sampleRate);
    fill(b.getChannelData(0));
    return b;
  };
  const made: Noises = {
    white: buffer((d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }),
    brown: buffer((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }),
    wander: buffer((d) => {
      // Points to ease between; the last eases back into the first, so it loops seamlessly.
      const points = Array.from({ length: NOISE_SECONDS * WANDER_RATE }, () => Math.random() * 2 - 1);
      const span = d.length / points.length;
      for (let i = 0; i < d.length; i++) {
        const k = Math.floor(i / span);
        const f = i / span - k;
        const ease = (1 - Math.cos(f * Math.PI)) / 2;
        d[i] = points[k] + (points[(k + 1) % points.length] - points[k]) * ease;
      }
    }),
  };
  noiseCache.set(ctx, made);
  return made;
}

// ----- Recordings -----

/**
 * Recordings that take over from the synthesized wheels and rail where the
 * app serves them (from its public folder); any that are missing stay
 * synthesized. The wheels' is a steady stretch of a board rolling on
 * concrete, looped as it is. A rail recording — trucks grinding a rail, or
 * the deck sliding one — needs only be a short stretch of the board riding
 * it, past the catch: it's woven into a steady glide (`weave`), its low end
 * rolled off so it rides light, the way a board does on a waxed rail. Each
 * is levelled to the same loudness and crossfaded where it loops.
 */
export const TRICK_SOUND_FILES = {
  roll: '/sounds/skate/roll.mp3',
  grind: '/sounds/skate/grind.mp3',
  slide: '/sounds/skate/slide.mp3',
} as const;

type RecordingName = keyof typeof TRICK_SOUND_FILES;

interface Recording {
  buffer: AudioBuffer;
  /** Seconds in where the loop starts over: past where its end crossfades from. */
  loopStart: number;
}

/**
 * The loudness (RMS) every recording's loop is levelled to, and each bed's
 * full level from there. A recording with a loud moment over a quiet loop is
 * levelled down instead, as far as keeps that moment at RECORDING_PEAK, so it
 * never plays louder than a landing.
 */
const RECORDING_RMS = 0.1;
const RECORDING_PEAK = 1.2;
const RECORDED_LEVEL: Record<RecordingName, number> = { roll: 0.4, grind: 0.6, slide: 0.12 };
/** Longest crossfade where a recording loops; a short one uses a quarter of what it loops. */
const LOOP_FADE = 0.25;
/** A rail recording's weave: seconds of it, each grain's length, and the low end rolled off it (Hz). */
const WEAVE_SECONDS = 4;
const GRAIN_SECONDS = 0.12;
const RAIL_LOW_CUT = 350;

const recordings = new Map<RecordingName, Recording>();
let loading: Promise<void> | null = null;

/** Fetch and prepare the recordings, once a page. Resolves when each has loaded or turned out to be missing. */
export function loadRecordings(): Promise<void> {
  if (loading) return loading;
  if (typeof fetch === 'undefined' || typeof OfflineAudioContext === 'undefined') return Promise.resolve();
  const decoder = new OfflineAudioContext(1, 1, 48_000);
  loading = Promise.all((Object.keys(TRICK_SOUND_FILES) as RecordingName[]).map(async (name) => {
    try {
      const response = await fetch(TRICK_SOUND_FILES[name]);
      if (!response.ok) return;
      const decoded = await decoder.decodeAudioData(await response.arrayBuffer());
      const rail = name !== 'roll';
      const source = rail ? await lowCut(decoded, RAIL_LOW_CUT) : decoded;
      const channels = Array.from({ length: source.numberOfChannels }, (_, c) => source.getChannelData(c));
      const sampleRate = source.sampleRate;
      const steady = rail
        ? weave(channels, Math.round(WEAVE_SECONDS * sampleRate), Math.round(GRAIN_SECONDS * sampleRate))
        : channels;
      recordings.set(name, prepareRecording(decoder, steady, sampleRate));
    } catch {
      // Not there, or not audio this browser decodes: the synthesized one plays.
    }
  })).then(() => {});
  return loading;
}

/** `buffer` with everything under `hz` rolled off. */
async function lowCut(buffer: AudioBuffer, hz: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hz;
  filter.Q.value = Math.SQRT1_2;
  source.connect(filter).connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

/** Channels made into a loop and levelled. */
function prepareRecording(ctx: BaseAudioContext, channels: Float32Array[], sampleRate: number): Recording {
  const length = channels[0].length;
  const fade = Math.min(Math.round(LOOP_FADE * sampleRate), Math.floor(length / 4));
  const looped = channels.map((data) => crossfadeLoop(data, fade));
  const peak = Math.max(...looped.map((data) => data.reduce((top, x) => Math.max(top, Math.abs(x)), 0)));
  const scale = Math.min(
    RECORDING_RMS / Math.max(1e-6, rms(looped.map((data) => data.subarray(fade)))),
    RECORDING_PEAK / Math.max(1e-6, peak),
  );
  const buffer = ctx.createBuffer(looped.length, length, sampleRate);
  looped.forEach((data, c) => buffer.copyToChannel(data.map((x) => x * scale), c));
  return { buffer, loopStart: fade / sampleRate };
}

/** Root-mean-square level over every channel together. */
export function rms(channels: Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const data of channels) {
    for (const x of data) sum += x * x;
    count += data.length;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

/**
 * `data` made to loop from `fade` to its end without a seam: its last `fade`
 * samples crossfade (at equal power) into its first, so the end runs straight
 * on into the loop's start just as the recording ran on there.
 */
export function crossfadeLoop(data: Float32Array, fade: number): Float32Array {
  const out = data.slice();
  const from = data.length - fade;
  for (let i = 0; i < fade; i++) {
    const a = ((i + 1) / fade) * (Math.PI / 2);
    out[from + i] = data[from + i] * Math.cos(a) + data[i] * Math.sin(a);
  }
  return out;
}

/** Most a quiet grain is turned up to meet the rest; quieter than that, it's mostly hiss. */
const MAX_GRAIN_GAIN = 4;

/**
 * A steady texture `length` samples long woven from a short recording:
 * `grain`-sample slices of it from random places, overlapping by half under
 * windows whose powers sum to one, each levelled to the recording's overall
 * loudness. What it sounds like carries over; its swells, ebbs, and one-off
 * knocks don't, and nothing repeats.
 */
export function weave(channels: Float32Array[], length: number, grain: number, random: () => number = Math.random): Float32Array[] {
  const size = Math.max(2, Math.min(grain, channels[0].length));
  const hop = Math.floor(size / 2);
  const window = Float32Array.from({ length: size }, (_, i) => Math.sin((Math.PI * (i + 0.5)) / size));
  // A steady stretch at the recording's own level, seen through the window.
  const target = rms(channels) * Math.SQRT1_2;
  const out = channels.map(() => new Float32Array(length));
  for (let at = -hop; at < length; at += hop) {
    const from = Math.floor(random() * (channels[0].length - size + 1));
    let sum = 0;
    for (const data of channels) for (let i = 0; i < size; i++) sum += (data[from + i] * window[i]) ** 2;
    const level = Math.sqrt(sum / (size * channels.length));
    const gain = level > 0 ? Math.min(MAX_GRAIN_GAIN, target / level) : 0;
    channels.forEach((data, c) => {
      const to = out[c];
      for (let i = Math.max(0, -at); i < size && at + i < length; i++) to[at + i] += data[from + i] * window[i] * gain;
    });
  }
  return out;
}

const outputs = new WeakMap<BaseAudioContext, AudioNode>();

/** Where every trick sound goes: the overall level, with a limiter catching the biggest landings. */
function trickOutput(ctx: BaseAudioContext): AudioNode {
  const cached = outputs.get(ctx);
  if (cached) return cached;
  const volume = ctx.createGain();
  volume.gain.value = VOLUME;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  volume.connect(limiter).connect(ctx.destination);
  outputs.set(ctx, volume);
  return volume;
}

/** `x`, nudged up or down by as much as `spread` of itself. */
const vary = (x: number, spread = 0.06) => x * (1 + (Math.random() * 2 - 1) * spread);

const SILENT = 0.0001;

/** A burst of noise through a band, struck at `when` and dying away over `decay`. */
function hiss(
  ctx: BaseAudioContext,
  out: AudioNode,
  when: number,
  o: { band: number; q: number; gain: number; decay: number; type?: BiquadFilterType },
) {
  const source = ctx.createBufferSource();
  source.buffer = noises(ctx).white;
  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? 'bandpass';
  filter.frequency.value = o.band;
  filter.Q.value = o.q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(o.gain, when + 0.0015);
  env.gain.exponentialRampToValueAtTime(SILENT, when + 0.0015 + o.decay);
  source.connect(filter).connect(env).connect(out);
  source.start(when, Math.random() * (NOISE_SECONDS - o.decay - 0.1));
  source.stop(when + o.decay + 0.02);
}

/** A struck tone — wood's knock, a body's thud — falling from `from` to `to` Hz over `drop`, dying over `decay`. */
function knock(
  ctx: BaseAudioContext,
  out: AudioNode,
  when: number,
  o: { from: number; to?: number; drop?: number; gain: number; decay: number; type?: OscillatorType },
) {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.from, when);
  if (o.to != null) osc.frequency.exponentialRampToValueAtTime(o.to, when + (o.drop ?? o.decay));
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(o.gain, when + 0.002);
  env.gain.exponentialRampToValueAtTime(SILENT, when + 0.002 + o.decay);
  osc.connect(env).connect(out);
  osc.start(when);
  osc.stop(when + o.decay + 0.03);
}

/** Struck metal ringing on: a bar's inharmonic partials over `base`, the higher ones dying first. */
function ring(ctx: BaseAudioContext, out: AudioNode, when: number, base: number, gain: number, decay: number) {
  for (const [ratio, share, life] of [[1, 1, 1], [2.756, 0.55, 0.6], [5.404, 0.3, 0.35]] as const) {
    knock(ctx, out, when, { from: base * ratio, gain: gain * share, decay: decay * life });
  }
}

// ----- Hits -----

/** One cue's sound, starting at `when`, at `pitch` (1 at full speed). A `slide` locks on with the deck. */
function playCue(ctx: BaseAudioContext, out: AudioNode, cue: SoundCue, when: number, pitch: number, slide: boolean) {
  const hz = (f: number) => f * pitch;
  const s = (seconds: number) => seconds / pitch;
  const v = vary(1);
  switch (cue.kind) {
    case 'pop':
      // The tail cracking off the ground, the deck's wooden knock, and weight through the tail.
      hiss(ctx, out, when, { band: hz(2300 * v), q: 0.9, gain: 1.2, decay: s(0.05) });
      hiss(ctx, out, when, { band: hz(4800 * v), q: 1.5, gain: 0.3, decay: s(0.02) });
      knock(ctx, out, when, { from: hz(560 * v), to: hz(240 * v), drop: s(0.03), gain: 0.3, decay: s(0.08), type: 'triangle' });
      knock(ctx, out, when, { from: hz(150), to: hz(80), drop: s(0.05), gain: 0.12, decay: s(0.08) });
      break;
    case 'lock':
      if (slide) {
        // The deck settling onto the rail: a faint wooden tick, the rail barely humming under it.
        hiss(ctx, out, when, { band: hz(1100 * v), q: 0.9, gain: 0.22, decay: s(0.06) });
        knock(ctx, out, when, { from: hz(260 * v), to: hz(130 * v), drop: s(0.05), gain: 0.1, decay: s(0.1), type: 'triangle' });
        ring(ctx, out, when, hz(760 * v), 0.012, s(0.25));
      } else {
        // Trucks catching a waxed rail: a light tick into the glide, not a clank.
        hiss(ctx, out, when, { band: hz(2800 * v), q: 1.5, gain: 0.55, decay: s(0.04) });
        knock(ctx, out, when, { from: hz(220), to: hz(120), drop: s(0.04), gain: 0.12, decay: s(0.06) });
      }
      break;
    case 'popOff':
      // A lighter snap off the end of the rail.
      hiss(ctx, out, when, { band: hz(3000 * v), q: 1.4, gain: 0.45, decay: s(0.03) });
      knock(ctx, out, when, { from: hz(600 * v), to: hz(300 * v), drop: s(0.03), gain: 0.14, decay: s(0.06), type: 'triangle' });
      break;
    case 'land': {
      // The wheels clacking down — the back pair a beat after the front — the
      // deck's slap, the thump of the rider's weight (deeper off a drop), and
      // the trucks' hardware rattling.
      const w = cue.weight;
      const strike = Math.sqrt(w);
      hiss(ctx, out, when, { band: hz(1500 * v), q: 1.1, gain: 1.4 * strike, decay: s(0.09) });
      hiss(ctx, out, when + s(0.02), { band: hz(1250 * v), q: 1.1, gain: 0.9 * strike, decay: s(0.08) });
      knock(ctx, out, when, { from: hz(300 * v), to: hz(140 * v), drop: s(0.04), gain: 0.28 * strike, decay: s(0.11), type: 'triangle' });
      knock(ctx, out, when, { from: hz(130), to: hz(55), drop: s(0.08), gain: 0.16 * w, decay: s(0.12 + 0.08 * w) });
      hiss(ctx, out, when + s(0.008), { band: hz(3600), q: 7, gain: 0.35 * strike, decay: s(0.14) });
      break;
    }
    case 'crash': {
      // The rider's weight hitting the ground, and the board clattering away
      // on its edges and wheels, softer each knock.
      const strike = Math.sqrt(cue.weight);
      knock(ctx, out, when, { from: hz(320), to: hz(150), drop: s(0.06), gain: 0.18 * strike, decay: s(0.12), type: 'triangle' });
      knock(ctx, out, when, { from: hz(110), to: hz(45), drop: s(0.1), gain: 0.11 * cue.weight, decay: s(0.2) });
      for (const [after, share] of [[0, 1], [0.075, 0.6], [0.17, 0.42], [0.3, 0.25]] as const) {
        const at = when + s(vary(after, 0.2));
        hiss(ctx, out, at, { band: hz(vary(1600, 0.25)), q: 1.2, gain: 1 * share * strike, decay: s(0.08) });
        knock(ctx, out, at, { from: hz(vary(420, 0.2)), to: hz(190), drop: s(0.03), gain: 0.18 * share, decay: s(0.07), type: 'triangle' });
      }
      hiss(ctx, out, when, { band: hz(3200), q: 6, gain: 0.22 * strike, decay: s(0.35) });
      break;
    }
  }
}

// ----- Beds -----

/** The wheels rolling and the rail scraping: running sounds whose levels follow the soundtrack. */
interface Beds {
  /** Ease toward these levels (0 → 1 of each bed's full level) from `when`. */
  ease(roll: number, grind: number, when: number): void;
  /** Lay these levels down exactly, evenly spread from `when` over `duration` — for rendering ahead. */
  curve(roll: Float32Array, grind: Float32Array, when: number, duration: number): void;
  /** Fall quiet from `when` (now, by default) and let the sources go. */
  stop(when?: number): void;
}

function createBeds(ctx: BaseAudioContext, out: AudioNode, slide: boolean, pitch: number, when: number): Beds {
  const { white, wander, brown } = noises(ctx);
  const sources: AudioBufferSourceNode[] = [];
  const source = (buffer: AudioBuffer, rate: number) => {
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.playbackRate.value = rate;
    sources.push(node);
    return node;
  };
  /** Synthesis noise, looping from anywhere in it. */
  const loop = (buffer: AudioBuffer, rate = 1) => {
    const node = source(buffer, rate);
    node.start(when, Math.random() * buffer.duration);
    return node;
  };
  /** A recording from `offset` seconds in, slowed with the clock, going round its loop. */
  const play = (recording: Recording, offset: number, at: number) => {
    const node = source(recording.buffer, pitch);
    node.loopStart = recording.loopStart;
    node.loopEnd = recording.buffer.duration;
    node.start(at, offset);
    return node;
  };
  const anywhereInLoop = (recording: Recording) =>
    recording.loopStart + Math.random() * (recording.buffer.duration - recording.loopStart);
  const filter = (type: BiquadFilterType, frequency: number, q: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency * pitch;
    f.Q.value = q;
    return f;
  };
  const gain = (value: number) => {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  };

  // Wheels on concrete: the recording; or a low roar with a little grit
  // over it, uneven as the ground is.
  const roll = gain(0);
  roll.connect(out);
  const rolling = recordings.get('roll');
  if (rolling) {
    play(rolling, anywhereInLoop(rolling), when).connect(roll);
  } else {
    const rollGround = gain(1);
    const ground = loop(white);
    loop(brown).connect(filter('lowpass', 300, 0.5)).connect(gain(0.5)).connect(rollGround);
    ground.connect(filter('bandpass', 420, 0.8)).connect(gain(0.6)).connect(rollGround);
    ground.connect(filter('bandpass', 1300, 0.8)).connect(gain(0.08)).connect(rollGround);
    loop(wander, 0.3 * pitch).connect(gain(0.25)).connect(rollGround.gain);
    rollGround.connect(roll);
  }

  // The rail: the recording's glide; or, waxed, a board gliding along it —
  // a smooth, high hiss for the deck sliding, a high ringing scrape for the
  // trucks grinding, with little grit to either.
  const grind = gain(0);
  grind.connect(out);
  const scraping = recordings.get(slide ? 'slide' : 'grind');
  if (scraping) {
    play(scraping, anywhereInLoop(scraping), when).connect(grind);
  } else {
    const glide = gain(1);
    const top = filter('lowpass', 7000, 0.5);
    top.connect(glide).connect(grind);
    const hissing = loop(white);
    const band = (hz: number, q: number, level: number) => hissing.connect(filter('bandpass', hz, q)).connect(gain(level)).connect(top);
    if (slide) {
      band(2000, 0.8, 0.9);
      band(1150, 9, 0.7);
      loop(wander, 0.4 * pitch).connect(gain(0.08)).connect(glide.gain);
    } else {
      band(3000, 1.2, 0.6);
      band(5200, 3, 0.15);
      band(1450, 24, 1.6);
      band(2250, 28, 1.1);
      band(3600, 30, 0.7);
      loop(wander, 0.6 * pitch).connect(gain(0.15)).connect(glide.gain);
    }
  }
  const rollLevel = rolling ? RECORDED_LEVEL.roll : ROLL_LEVEL;
  const grindLevel = scraping ? RECORDED_LEVEL[slide ? 'slide' : 'grind'] : slide ? SLIDE_LEVEL : GRIND_LEVEL;

  const ease = (r: number, g: number, at: number, by = LEVEL_EASE) => {
    roll.gain.setTargetAtTime(r * rollLevel, at, by);
    grind.gain.setTargetAtTime(g * grindLevel, at, by);
  };
  return {
    ease,
    curve(r, g, at, duration) {
      roll.gain.setValueCurveAtTime(r.map((x) => x * rollLevel), at, duration);
      grind.gain.setValueCurveAtTime(g.map((x) => x * grindLevel), at, duration);
    },
    stop(at = ctx.currentTime) {
      ease(0, 0, at, QUIET_EASE);
      for (const node of sources) node.stop(at + QUIET_EASE * 6);
    },
  };
}

// ----- Playing -----

/** The longest clock step heard through; a longer one is a jump (a seek, a tab coming back) and skips what it passes. */
const MAX_STEP = 0.25;
/** Milliseconds without the clock moving before the wheels and rail fall quiet. */
const STILL_MS = 120;

/**
 * An attempt's soundtrack played along with the clock its picture is drawn
 * at. Tell it each new clock time: it plays the hits the clock passes (and
 * the ones due before the next frame, timed to land on it), and keeps the
 * wheels and rail at the soundtrack's levels while the clock runs. A paused,
 * finished, or scrubbed clock falls quiet. Nothing plays until the page's
 * audio is running; a sound that couldn't play then is skipped, not queued.
 */
export class LiveSoundtrack {
  private last: number | null = null;
  /** Clock time the hits have been played up to. */
  private heard = -Infinity;
  private beds: Beds | null = null;
  private pitch = 1;
  private still = 0;

  constructor(private readonly track: Soundtrack) {}

  /** The clock has reached `t`, running at `rate` times real time. */
  update(t: number, rate: number) {
    const last = this.last;
    this.last = t;
    if (last == null || t === last) return;
    const step = t - last;
    const ctx = runningAudioContext();
    if (!ctx || step < 0 || step > MAX_STEP) {
      this.heard = t;
      this.quiet();
      return;
    }
    const now = ctx.currentTime;
    const out = trickOutput(ctx);
    const pitch = slowPitch(rate);
    if (!this.beds || pitch !== this.pitch) {
      this.beds?.stop();
      this.beds = createBeds(ctx, out, this.track.slide, pitch, now);
      this.pitch = pitch;
    }
    const ahead = t + step;
    for (const cue of cuesBetween(this.track, Math.max(this.heard, last), ahead)) {
      playCue(ctx, out, cue, now + Math.max(0, cue.at - t) / rate, pitch, this.track.slide);
    }
    this.heard = ahead;
    this.beds.ease(this.track.roll(t), this.track.grind(t), now);
    clearTimeout(this.still);
    this.still = window.setTimeout(() => this.quiet(), STILL_MS);
  }

  /** Even on a context that has since stopped running, so its loops never carry on when it resumes. */
  private quiet() {
    clearTimeout(this.still);
    this.beds?.stop();
    this.beds = null;
  }

  dispose() {
    this.quiet();
  }
}

/** Seconds the wheels fade over at the end of a recording, rather than cutting off. */
const TAIL_FADE = 0.25;
/** Level points a second laid down for a recording. */
const CURVE_RATE = 250;

/**
 * The soundtrack recorded from clock 0 to `end` at `rate` times real time
 * (0.25 plays four times as long), for a video.
 */
export async function renderSoundtrack(track: Soundtrack, end: number, rate: number, sampleRate = 48_000): Promise<AudioBuffer> {
  await loadRecordings();
  const duration = end / rate;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const out = trickOutput(ctx);
  const pitch = slowPitch(rate);
  for (const cue of track.cues) {
    if (cue.at >= 0 && cue.at <= end) playCue(ctx, out, cue, cue.at / rate, pitch, track.slide);
  }
  const beds = createBeds(ctx, out, track.slide, pitch, 0);
  const points = Math.max(2, Math.ceil(duration * CURVE_RATE) + 1);
  const roll = new Float32Array(points);
  const grind = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const at = (i / (points - 1)) * duration;
    const fade = Math.min(1, (duration - at) / TAIL_FADE);
    roll[i] = track.roll(at * rate) * fade;
    grind[i] = track.grind(at * rate) * fade;
  }
  beds.curve(roll, grind, 0, duration);
  return ctx.startRendering();
}
