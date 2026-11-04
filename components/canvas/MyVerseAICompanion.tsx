'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Material } from 'three';

const MODEL_PATH = '/models/myverse_ai_companion_v1.glb';
const TARGET_HEIGHT = 0.3;
// Desk-local: the side surface spans X 0.975–1.525 and Z 0.42–1.54.
const TABLETOP_Y = 0.76 + 0.07 / 2;
const POSITION: [number, number, number] = [1.25, TABLETOP_Y, 0.64];
const YAW = -0.72;

export default function MyVerseAICompanion() {
  const { scene } = useGLTF(MODEL_PATH);
  const { model, scale, offset, emissiveMaterials } = useMemo(() => {
    // Preserve pivots and share cached geometry; isolate only materials whose
    // intensity SceneLighting controls during the existing room power sequence.
    const model = scene.clone(true);
    const emissiveMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const isolateEmissive = (material: Material) => {
        if (!(material instanceof MeshStandardMaterial) || material.emissive.getHex() === 0) return material;
        let clone = emissiveMaterials.get(material);
        if (!clone) {
          clone = material.clone();
          emissiveMaterials.set(material, clone);
        }
        return clone;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(isolateEmissive)
        : isolateEmissive(object.material);
    });
    const bounds = new Box3().setFromObject(model, true);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    return {
      model,
      scale: TARGET_HEIGHT / size.y,
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
      emissiveMaterials: [...emissiveMaterials.values()],
    };
  }, [scene]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) emissiveMaterials.forEach(material => material.dispose());
      });
    };
  }, [emissiveMaterials]);

  // SceneLighting automatically assigns this group's emission to its room channel.
  return <group name="myverse_ai_companion" position={POSITION} rotation={[0, YAW, 0]} dispose={null}>
    <group scale={scale}>
      <group position={offset}><primitive object={model} /></group>
    </group>
  </group>;
}

useGLTF.preload(MODEL_PATH);
