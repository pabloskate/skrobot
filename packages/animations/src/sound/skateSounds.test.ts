import { describe, expect, it } from 'vitest';
import { crossfadeLoop, rms, slowPitch, weave } from './skateSounds';

/**
 * A recording dropped in for the wheels or the rail has to loop without a
 * click and play at a level set by the code, not by how loud it was recorded.
 */

describe('crossfadeLoop', () => {
  const data = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.37) * 0.5 + Math.sin(i * 0.051) * 0.4);
  let biggest = 0;
  for (let i = 1; i < data.length; i++) biggest = Math.max(biggest, Math.abs(data[i] - data[i - 1]));
  const fade = 150;
  const looped = crossfadeLoop(data, fade);

  it('runs its end straight on into where the loop starts, as the recording ran on there', () => {
    expect(looped.length).toBe(data.length);
    // Going round, the last sample hands over to the loop's start (`fade` in) the way the recording did.
    expect(looped[looped.length - 1]).toBeCloseTo(data[fade - 1], 6);
    expect(looped[fade]).toBe(data[fade]);
    for (let i = fade; i < looped.length; i++) {
      const next = i + 1 < looped.length ? looped[i + 1] : looped[fade];
      expect(Math.abs(next - looped[i])).toBeLessThanOrEqual(biggest * 1.5);
    }
  });

  it('leaves everything before the crossfade untouched', () => {
    expect(Array.from(looped.slice(0, data.length - fade))).toEqual(Array.from(data.slice(0, data.length - fade)));
  });
});

describe('weave', () => {
  /** A seeded generator, so the weave is the same every run. */
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const noise = seeded(7);
  // Half a second of noise that swells and ebbs by 20 dB, with a knock in it.
  const sampleRate = 8000;
  const source = Float32Array.from({ length: sampleRate / 2 }, (_, i) => {
    const swell = 0.1 + 0.9 * (0.5 + 0.5 * Math.sin((i / sampleRate) * 2 * Math.PI * 3));
    return (noise() * 2 - 1) * swell + (i > 1000 && i < 1040 ? 0.9 : 0);
  });
  const [woven] = weave([source], 4 * sampleRate, Math.round(0.12 * sampleRate), seeded(3));
  const windows = (data: Float32Array, size: number) => {
    const out: number[] = [];
    for (let i = 0; i + size <= data.length; i += size) out.push(rms([data.subarray(i, i + size)]));
    return out;
  };

  it('makes the length asked for at the recording\'s own loudness', () => {
    expect(woven.length).toBe(4 * sampleRate);
    expect(20 * Math.log10(rms([woven]) / rms([source]))).toBeCloseTo(0, 0);
  });

  it('holds steady where the recording swells and ebbs', () => {
    const sourceLevels = windows(source, sampleRate / 10).map((x) => 20 * Math.log10(x));
    const wovenLevels = windows(woven, sampleRate / 10).map((x) => 20 * Math.log10(x));
    const spread = (levels: number[]) => Math.max(...levels) - Math.min(...levels);
    expect(spread(sourceLevels)).toBeGreaterThan(10);
    expect(spread(wovenLevels)).toBeLessThan(4);
  });
});

describe('rms', () => {
  it('measures every channel together', () => {
    expect(rms([Float32Array.from([1, -1, 1, -1])])).toBe(1);
    expect(rms([Float32Array.from([0.5, -0.5]), Float32Array.from([0, 0])])).toBeCloseTo(Math.sqrt(0.125), 9);
    expect(rms([])).toBe(0);
  });
});

describe('slowPitch', () => {
  it('drops a little as playback slows, never rising past life', () => {
    expect(slowPitch(1)).toBe(1);
    expect(slowPitch(2)).toBe(1);
    expect(slowPitch(0.5)).toBeLessThan(1);
    expect(slowPitch(0.25)).toBeCloseTo(0.66, 2);
  });
});
