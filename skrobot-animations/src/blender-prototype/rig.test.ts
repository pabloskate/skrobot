/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeFrame, specFor } from '@skrobot/animations';
import { applyRobotPalette, bindRig, poseFromFrame } from './poseFromFrame';

async function loadRig() {
  const bytes = readFileSync(new URL('../../public/blender-prototype/skrobot-kickflip-land.glb', import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return (await new GLTFLoader().parseAsync(buffer, '')).scene;
}

describe('Blender character export', () => {
  it('binds every exported joint after GLTFLoader sanitizes its name', async () => {
    const scene = await loadRig();
    const rig = bindRig(scene);
    expect(rig).not.toBeNull();
    for (const [name, node] of Object.entries(rig!)) {
      expect(node, name).not.toBeNull();
    }
    const spec = specFor({ id: 'kickflip-regular', name: 'Kickflip', base: 'Kickflip', stance: 'regular' });
    poseFromFrame(rig!, computeFrame(0, spec, true, 'bail', 0.65), spec, 'regular');
    const initialKnee = rig!.kneeNose!.quaternion.clone();
    poseFromFrame(rig!, computeFrame(0.8, spec, true, 'bail', 0.65), spec, 'regular');
    expect(rig!.kneeNose!.quaternion.equals(initialKnee)).toBe(false);
    scene.updateMatrixWorld(true);
    scene.traverse((node) => expect(node.matrixWorld.elements.every(Number.isFinite), node.name).toBe(true));
  });

  it('shows exactly the selected helmet and face for each robot', async () => {
    const scene = await loadRig();
    for (let variant = 0; variant < 4; variant++) {
      applyRobotPalette(scene, { body: '#7ec8e3', accent: '#e05c7a', variant });
      const visible: string[] = [];
      scene.traverse((node) => {
        if (/^Variant[0-3]$/.test(node.name) && node.visible) visible.push(node.name);
      });
      expect(visible).toEqual([`Variant${variant}`]);
    }
  });
});
