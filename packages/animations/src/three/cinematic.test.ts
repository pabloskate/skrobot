import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh } from 'three';
import { prepareCinematicSurfaces } from './cinematic';
import { faceMaterial, toonMaterial } from './materials';
import { realisticBoardMaterial } from '../board/realisticBoardMaterials';

describe('export-only cinematic surfaces', () => {
  it('preserves geometry, transforms, uniforms and the original renderer material', () => {
    const original = toonMaterial('#81c4e5');
    const finish = toonMaterial('#81c4e5');
    const geometry = new BoxGeometry();
    const mesh = new Mesh(geometry, finish);
    mesh.position.set(10, 20, 30);
    const positions = Array.from(geometry.getAttribute('position').array);
    const uniforms = finish.uniforms;
    const originalShader = original.fragmentShader;
    prepareCinematicSurfaces(mesh);
    expect(mesh.geometry).toBe(geometry);
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(positions);
    expect(mesh.position.toArray()).toEqual([10, 20, 30]);
    expect(finish.uniforms).toBe(uniforms);
    expect(original.fragmentShader).toBe(originalShader);
    expect(finish.fragmentShader).toContain('outInfo.z = 0.0');
  });

  it('can revisit asynchronously loaded scenes without wrapping existing materials twice', () => {
    const root = new Group();
    const material = toonMaterial('#81c4e5');
    root.add(new Mesh(new BoxGeometry(), material));
    prepareCinematicSurfaces(root);
    const shader = material.fragmentShader;
    const late = faceMaterial('#81c4e5', '#e777ad');
    root.add(new Mesh(new BoxGeometry(), late));
    prepareCinematicSurfaces(root);
    expect(material.fragmentShader).toBe(shader);
    expect(late.fragmentShader).toContain('float shell = smoothstep');
    expect(late.uniforms.uExpression).toBeDefined();
    expect(late.uniforms.uFade).toBeDefined();
  });

  it('keeps the existing physical board shader and contact surface finish', () => {
    const material = realisticBoardMaterial();
    const fragment = material.fragmentShader;
    const vertex = material.vertexShader;
    prepareCinematicSurfaces(new Mesh(new BoxGeometry(), material));
    expect(material.vertexShader).toBe(vertex);
    expect(material.fragmentShader).toContain(fragment.replace(/void main\s*\(\s*\)/, 'void originalSurface()'));
    expect(material.fragmentShader).not.toContain('FINISH_SUN');
  });
});
