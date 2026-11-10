'use client';

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { TbVideo } from 'react-icons/tb';
import { FOOT, SCENE_ORBIT_BOUNDS, type SceneCamera, type TripodSpot } from '@skrobot/animations';
import { planBounds, type PathPoint, type SpotPlan } from '@skrobot/animations/three';
import { followOffset, followYaw, insideWindow, pathAt, type CameraMode, type MapPoint, type MapWindow } from './dream';

/** The crane's reach from the rider at lens 1, in stage units (the animation package's DISTANCE). */
const CRANE_REACH = 520;
/** Following, the map shows this far above and below the rider: room for the crane at its longest lens. */
const FOLLOW_HALF = 27 * FOOT;
/** The least the camera's view is drawn out from it, and half its spread. */
const CONE_LEAST = 8 * FOOT;
const CONE_HALF = (17 * Math.PI) / 180;
/** Arrow keys walk the tripod this far, or swing the crane this many degrees. */
const KEY_STEP = 2 * FOOT;
const KEY_SWING = 8;
/** Anything standing this far over the run-up is drawn as a building, not as ground. */
const TALL = 9 * FOOT;
/** A step this tall between neighboring squares is inked as an edge: a stair, a curb, a wall. */
const EDGE = 0.3 * FOOT;
/** And one this tall is a wall. */
const WALL = 2.5 * FOOT;

type Rgb = [number, number, number];
const VOID: Rgb = [18, 12, 46];
const LOW: Rgb = [70, 54, 150];
const HIGH: Rgb = [118, 100, 204];
const BUILT: Rgb = [186, 176, 238];

/** The spot from above as a shaded relief: higher ground lighter, steps and walls inked, buildings flat and pale. */
function paintRelief(canvas: HTMLCanvasElement, plan: SpotPlan) {
  const { cols, rows, height, cell } = plan;
  canvas.width = cols;
  canvas.height = rows;
  const context = canvas.getContext('2d');
  if (!context) return;
  let low = Infinity;
  for (const h of height) if (h < low) low = h;
  if (!Number.isFinite(low)) low = 0;
  const span = Math.max(1, TALL - low);
  const image = context.createImageData(cols, rows);
  const at = (i: number, j: number, fallback: number) => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return fallback;
    const h = height[j * cols + i];
    return Number.isNaN(h) ? fallback : h;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const h = height[j * cols + i];
      let color: Rgb = VOID;
      if (!Number.isNaN(h)) {
        const west = at(i - 1, j, h), east = at(i + 1, j, h), north = at(i, j - 1, h), south = at(i, j + 1, h);
        // Lit from up the drop and to the left, as a map's hills are.
        const du = Math.max(-1.2, Math.min(1.2, (east - west) / (2 * cell)));
        const dz = Math.max(-1.2, Math.min(1.2, (south - north) / (2 * cell)));
        const light = Math.max(0, Math.min(1, 0.66 + 0.42 * du + 0.22 * dz));
        const step = Math.max(Math.abs(h - west), Math.abs(h - east), Math.abs(h - north), Math.abs(h - south));
        const built = h > TALL;
        const lift = Math.max(0, Math.min(1, (h - low) / span));
        const base: Rgb = built ? BUILT : [LOW[0] + (HIGH[0] - LOW[0]) * lift, LOW[1] + (HIGH[1] - LOW[1]) * lift, LOW[2] + (HIGH[2] - LOW[2]) * lift];
        // A wall's foot or a roof's edge is a firm line; a stair's nosing a faint one.
        const ink = step > WALL ? 0.55 : step > EDGE ? 0.84 : 1;
        const shade = (built ? 0.96 : 0.74 + 0.4 * light) * ink;
        color = [Math.min(255, base[0] * shade), Math.min(255, base[1] * shade), Math.min(255, base[2] * shade)];
      }
      const p = (j * cols + i) * 4;
      image.data[p] = color[0];
      image.data[p + 1] = color[1];
      image.data[p + 2] = color[2];
      image.data[p + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

export interface MapMark {
  id: string;
  label: string;
  at: MapPoint;
  active: boolean;
}

interface Props {
  plan: SpotPlan;
  /** The part of the spot the map shows. */
  window: MapWindow;
  /** The rider's line through the spot, and where on it the playhead is (read every frame). */
  path: readonly PathPoint[];
  clock: RefObject<number>;
  /** The stretch of the attempt that is the trick itself: pop to landing. */
  flight: readonly [number, number];
  mode: CameraMode;
  /** Where the tripod stands; null while following, or before the spot's plan is read. */
  stand: TripodSpot | null;
  /** The crane, while following. */
  camera: SceneCamera;
  /** The spot's own filmers' stands, to jump the tripod to. */
  marks: readonly MapMark[];
  onPlace: (to: MapPoint) => void;
  onOrbit: (yaw: number, lens: number) => void;
  onMark: (id: string) => void;
}

/**
 * The camera on a map of the spot, seen from above with the drop running
 * left to right. A tripod is a pin that stays where it's dragged while the
 * rider goes by; a following camera hangs off the rider, who stays in the
 * middle while the spot slides under them. Either way, dragging the camera
 * on the map moves it in the picture.
 */
export default function CameraMap({ plan, window: bounds, path, clock, flight, mode, stand, camera, marks, onPlace, onOrbit, onMark }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const relief = useRef<HTMLCanvasElement>(null);
  const rider = useRef<HTMLSpanElement>(null);
  const pin = useRef<HTMLSpanElement>(null);
  const cone = useRef<SVGPolygonElement>(null);
  const ring = useRef<SVGGElement>(null);
  const dragging = useRef(false);
  const whole = planBounds(plan);
  const width = bounds.u1 - bounds.u0;
  const depth = bounds.z1 - bounds.z0;
  const follow = mode === 'follow';
  // Following, the map closes in on the rider; the tripod's shows the whole spot.
  const viewDepth = follow ? 2 * FOLLOW_HALF : depth;
  const viewWidth = (viewDepth * width) / depth;
  const scale = depth / viewDepth;

  useEffect(() => {
    if (relief.current) paintRelief(relief.current, plan);
  }, [plan]);

  // What moves every frame is moved by hand, so the map costs the page nothing while the trick plays.
  const live = useRef({ path, stand, camera, follow });
  useEffect(() => {
    live.current = { path, stand, camera, follow };
  });
  useEffect(() => {
    let raf = 0;
    const percent = (point: MapPoint) => ({ left: `${((point.u - bounds.u0) / width) * 100}%`, top: `${((point.z - bounds.z0) / depth) * 100}%` });
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = live.current;
      const at = pathAt(now.path, clock.current ?? 0);
      const eye: MapPoint | null = now.follow
        ? (() => {
          const off = followOffset(now.camera, CRANE_REACH);
          return { u: at.u + off.u, z: at.z + off.z };
        })()
        : now.stand;
      if (rider.current) Object.assign(rider.current.style, percent(at));
      if (pin.current) {
        pin.current.hidden = eye == null;
        if (eye) Object.assign(pin.current.style, percent(eye));
      }
      if (world.current) {
        // Following, the spot slides so the rider holds the middle of the map.
        const shift = now.follow
          ? `translate(${-((at.u - viewWidth / 2 - bounds.u0) / width) * 100}%, ${-((at.z - viewDepth / 2 - bounds.z0) / depth) * 100}%)`
          : 'none';
        world.current.style.transform = shift;
      }
      if (cone.current && eye) {
        const toward = Math.atan2(at.z - eye.z, at.u - eye.u);
        // Out to the skater and a little past, so the cone reads as what's in shot.
        const reach = Math.max(CONE_LEAST, Math.hypot(at.u - eye.u, at.z - eye.z) * 1.12);
        const edge = (turn: number) => `${eye.u + reach * Math.cos(toward + turn)},${eye.z + reach * Math.sin(toward + turn)}`;
        cone.current.setAttribute('points', `${eye.u},${eye.z} ${edge(-CONE_HALF)} ${edge(CONE_HALF)}`);
      }
      ring.current?.setAttribute('transform', `translate(${at.u} ${at.z})`);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bounds.u0, bounds.z0, width, depth, viewWidth, viewDepth, clock]);

  /** The point of the spot under a pointer, and how far that is from the rider in the middle (following). */
  const pointAt = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    return {
      spot: { u: bounds.u0 + fx * width, z: bounds.z0 + fy * depth },
      off: { u: (fx - 0.5) * viewWidth, z: (fy - 0.5) * viewDepth },
    };
  };
  const moveTo = (clientX: number, clientY: number) => {
    const point = pointAt(clientX, clientY);
    if (!point) return;
    if (follow) {
      const flat = Math.cos((camera.pitch * Math.PI) / 180) * CRANE_REACH;
      const lens = Math.max(SCENE_ORBIT_BOUNDS.lens.min, Math.min(SCENE_ORBIT_BOUNDS.lens.max, Math.hypot(point.off.u, point.off.z) / flat));
      onOrbit(followYaw(point.off), Math.round(lens * 100) / 100);
    } else {
      onPlace(insideWindow(point.spot, bounds, 2 * FOOT));
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragging.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Already gone; the drag still works while the pointer is over the map.
    }
    moveTo(event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(event.clientX, event.clientY);
  };
  const stop = () => {
    dragging.current = false;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[event.key];
    if (!step) return;
    event.preventDefault();
    if (follow) onOrbit(camera.yaw - (step[0] || step[1]) * KEY_SWING, camera.lens);
    else if (stand) onPlace(insideWindow({ u: stand.u + step[0] * KEY_STEP, z: stand.z + step[1] * KEY_STEP }, bounds));
  };

  const line = (points: readonly PathPoint[]) => points.map((point) => `${point.u},${point.z}`).join(' ');
  const inFlight = path.filter((point) => point.t >= flight[0] && point.t <= flight[1]);
  const flat = Math.cos((camera.pitch * Math.PI) / 180) * CRANE_REACH;
  const place = (point: MapPoint) => ({ left: `${((point.u - bounds.u0) / width) * 100}%`, top: `${((point.z - bounds.z0) / depth) * 100}%` });

  return (
    <div
      ref={box}
      className={`dream-map dream-map-${mode}`}
      style={{ aspectRatio: `${width} / ${depth}` }}
      role="application"
      aria-roledescription="camera map"
      aria-label={follow
        ? 'The spot from above, with the camera following the skater. Drag, or use the arrow keys, to swing it round them.'
        : 'The spot from above. Drag the camera, or use the arrow keys, to stand it somewhere else.'}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
    >
      <div ref={world} className="dream-map-world" style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}>
        <canvas
          ref={relief}
          className="dream-map-relief"
          style={{
            left: `${((whole.u0 - bounds.u0) / width) * 100}%`,
            top: `${((whole.z0 - bounds.z0) / depth) * 100}%`,
            width: `${((whole.u1 - whole.u0) / width) * 100}%`,
            height: `${((whole.z1 - whole.z0) / depth) * 100}%`,
          }}
          aria-hidden
        />
        <svg className="dream-map-lines" viewBox={`${bounds.u0} ${bounds.z0} ${width} ${depth}`} preserveAspectRatio="none" aria-hidden>
          <polygon ref={cone} className="dream-map-cone" />
          <polyline className="dream-map-path" points={line(path)} />
          <polyline className="dream-map-flight" points={line(inFlight)} />
          {follow && (
            <g ref={ring}>
              <circle className="dream-map-ring dream-map-ring-range" r={flat * SCENE_ORBIT_BOUNDS.lens.max} />
              <circle className="dream-map-ring dream-map-ring-range" r={flat * SCENE_ORBIT_BOUNDS.lens.min} />
              <circle className="dream-map-ring" r={flat * camera.lens} />
            </g>
          )}
        </svg>
        {!follow && marks.map((mark) => (
          <button
            key={mark.id}
            type="button"
            className={`dream-map-mark ${mark.active ? 'active' : ''}`}
            style={place(mark.at)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onMark(mark.id)}
            aria-label={`Stand at the ${mark.label.toLowerCase()}`}
          >
            <span>{mark.label}</span>
          </button>
        ))}
        <span ref={rider} className="dream-map-rider" aria-hidden />
        <span ref={pin} className="dream-map-pin" aria-hidden>
          <TbVideo />
        </span>
      </div>
      <span className="dream-map-scale" style={{ width: `${((10 * FOOT) / viewWidth) * 100}%` }} aria-hidden>10 ft</span>
    </div>
  );
}
