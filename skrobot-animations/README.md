# Skrobot Animation Playground

A standalone, interactive dev environment for the Skrobot animation assets.

## What's inside

- **Playground** — one attempt on the shared three.js stage (`TrickScene3D`
  from `@skrobot/animations/three`): pick a robot and tune its skate style
  (pop height, rotation speed, flick strength), the rider and trick stance,
  a flatground trick or a grind combo, the spot, the skater, and the fall,
  then land, fall, replay, or scrub frame by frame. Copy the parameters as
  JSON for a robot's `skateStyle`.
- **Contact sheet** — every trick as a row of frozen key frames, drawn one
  cell at a time on the same stage.
- **Blender prototype** — a GLB rig posed from the shared `computeFrame`.

For a quick look at any trick from any camera, the web app's `/explore` is
the same stage with orbit, zoom, and shareable links.

## Get started

```bash
cd skrobot-animations
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

## How to use the playground

1. Pick a robot, and tune its **Skate style** (values are multipliers).
2. Pick the rider's natural **Rider stance** (`regular` or `goofy`).
3. Pick a trick and its independent **Trick stance** (`regular`, `fakie`, `switch`, or `nollie`).
4. Click **Land** to see the success animation, **Fall** to see the bail, or **Replay** to restart the current one.
5. Switch **Playback** between normal and slow motion to inspect trick timing.
6. Pick a **Spot**, a **Skater**, and a **Fall** variant, then copy the parameter JSON below the stage.

Switch **Discipline** to **Grinds** for grinds and slides: pick a **Grind
side** (Frontside or Backside) and a grind or slide. The frame buttons become
Setup / Pop / Lock / Hold / Pop off / Roll away, or Slip / Bail for a fall.
Frontside means the bar is on the rider's toeside on the way in. At El Toro
a grind goes down the center handrail, or with **Rail** set to side, the side
rail its approach comes in toward (shown under the picker); a flatground trick
goes down the stairs.

Pick a **Trick into grind** (for example Kickflip) to pop a flatground trick
on the way to the bar, giving "Kickflip into Frontside Lipslide". Flips,
shuvits, and spins (180s, 360s, bigspins, and flips with them) qualify;
dolphin flips and impossibles don't. A 180 or bigspin turns the rider round,
so the grind is named the way they then ride it, fakie. It shows up as
`entryTrick` in the params JSON.

Pick a **Trick out of grind** to pop a flatground trick off the end of the
bar instead of a plain pop off, giving "Frontside 5-0 Grind Kickflip Out" or
"Crooked Grind Nollie Kickflip Out". What rides the bar decides which end can
pop: centered on it (50-50, boardslide, lipslide) either end; on one end (a
single truck, a nose- or tailslide, a blunt) only that end. The off-limits
end is disabled in the picker. It shows up as `exitTrick` in the params JSON.

The contact sheet has the same Flatground / Grinds switch, with each grind's
key frames placed at its own timing, and the same trick in / trick out
controls (a trick out pops off the tail where the grind rides it, else off
the nose).

## Type check

```bash
npm run typecheck
```

From the repo root, this is included in:

```bash
npm run typecheck:animations
npm run check
```

## Notes

- Reusable animation code lives in `../packages/animations` and is consumed by
  both this playground and the production web app.
- This package does not import from the main app, so animation ideas can be
  iterated on without touching feature code.
- Playground-only changes stay here. Animation behavior changes should land in
  `packages/animations` so the game and playground remain in lockstep.
- Do not commit `dist/` output unless there is an explicit reason to publish a
  static demo artifact.
