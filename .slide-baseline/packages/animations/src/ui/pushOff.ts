/** Deterministic, fixed-step sidewalk ride used by the game-start scene. */
const DT = 1 / 480;
const JOINT = 96;
const FIRST_JOINT = 52;
const WHEEL = 17.9;
const AIR_TIME = 0.42;
const CROUCH = 0.09;
const PUSHES = [
  { at: 0.16, duration: 0.15, impulse: 330 },
  { at: 0.44, duration: 0.15, impulse: 290 },
] as const;

export interface PushOffTimeline {
  x: number[];
  height: number[];
  speed: number[];
  camera: number[];
  frontClacks: number[];
  backClacks: number[];
  letterTimes: number[];
  pop: number;
  land: number;
  slide: number;
  stop: number;
  slideX: number;
  stopX: number;
  head: number;
  exit: number;
  end: number;
}

function pushAcceleration(t: number): number {
  return PUSHES.reduce((sum, push) => {
    const u = (t - push.at) / push.duration;
    return sum + (u >= 0 && u <= 1
      ? push.impulse * Math.PI / (2 * push.duration) * Math.sin(Math.PI * u)
      : 0);
  }, 0);
}

export function createPushOffTimeline(letterCount: number): PushOffTimeline {
  const x: number[] = [];
  const height: number[] = [];
  const speed: number[] = [];
  const frontClacks: number[] = [];
  const backClacks: number[] = [];
  const jointAt = (distance: number) => Math.floor((distance - FIRST_JOINT) / JOINT);
  let distance = 0;
  let velocity = 0;
  let lift = 0;
  let verticalVelocity = 0;
  let phase: 'roll' | 'air' | 'land' | 'slide' | 'stop' = 'roll';
  let pop = -1;
  let land = -1;
  let slide = -1;
  let stop = -1;
  let slideX = 0;

  for (let i = 0; i < 6 / DT; i++) {
    const t = i * DT;
    if (pop < 0 && frontClacks.length >= letterCount) {
      pop = Math.max(frontClacks[letterCount - 1] + CROUCH, 0.69);
    }
    if (phase === 'roll' && pop >= 0 && t >= pop) {
      phase = 'air';
      verticalVelocity = 2800 * AIR_TIME / 2;
    }
    let acceleration = pushAcceleration(t);
    if ((phase === 'roll' || phase === 'land') && velocity > 0) acceleration -= 24 + 0.12 * velocity;
    if (phase === 'slide') acceleration = -1750;
    const oldFront = jointAt(distance + WHEEL);
    const oldBack = jointAt(distance - WHEEL);
    velocity += acceleration * DT;
    if (phase === 'slide' && velocity <= 0) {
      velocity = 0;
      stop = t;
      phase = 'stop';
    }
    distance += velocity * DT;
    if (phase === 'air') {
      verticalVelocity -= 2800 * DT;
      lift += verticalVelocity * DT;
      if (lift <= 0) {
        lift = 0;
        land = t;
        phase = 'land';
      }
    }
    if (phase === 'land' && t >= land + 0.08) {
      phase = 'slide';
      slide = t;
      slideX = distance;
    }
    if (phase !== 'air') {
      if (jointAt(distance + WHEEL) > oldFront) frontClacks.push(t);
      if (jointAt(distance - WHEEL) > oldBack) backClacks.push(t);
    }
    x.push(distance);
    height.push(lift);
    speed.push(velocity);
    if (stop >= 0 && t > stop + 2.4) break;
  }

  const stopX = x[x.length - 1];
  const camera: number[] = [];
  let cameraSpeed = 0;
  let slideScreenX = 195;
  for (let i = 0; i < x.length; i++) {
    let screenX: number;
    if (i * DT < slide) {
      cameraSpeed += (speed[i] - cameraSpeed) * DT / 0.22;
      screenX = 195 - 0.1 * cameraSpeed;
      slideScreenX = screenX;
    } else {
      const progress = Math.min(1, (x[i] - slideX) / (stopX - slideX));
      screenX = slideScreenX + (195 - slideScreenX) * (1 - (1 - progress) ** 1.25);
    }
    camera.push(x[i] - screenX);
  }
  const head = slide + 0.1;
  const exit = head + 1.2;
  return { x, height, speed, camera, frontClacks, backClacks,
    letterTimes: frontClacks.slice(0, letterCount), pop, land, slide, stop,
    slideX, stopX, head, exit, end: exit + 0.3 };
}

export function pushOffFrame(timeline: PushOffTimeline, seconds: number) {
  const i = Math.max(0, Math.min(timeline.x.length - 1, Math.floor(seconds / DT)));
  return { x: timeline.x[i], height: timeline.height[i], speed: timeline.speed[i], camera: timeline.camera[i] };
}
