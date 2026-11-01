import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferGeometry, Material, Mesh, MeshStandardMaterial } from 'three';
import { room } from '@/lib/room-config';

const MODEL_PATH = '/models/floor-uplighter-optimized.glb';
const SHADE_PROFILE_BANDS = 13;
const INNER_SHADE_START_BAND = 7;

export default function FloorLamp() {
  const { scene } = useGLTF(MODEL_PATH);
  const { model, disposableResources } = useMemo(() => {
    const clone = scene.clone(true);
    const disposableResources: Array<BufferGeometry | Material> = [];
    const metalMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    let foundShade = false;

    clone.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;

      if (object.name === 'Shallow_opal_uplighter_bowl') {
        if (!(object.material instanceof MeshStandardMaterial) || !object.geometry.index) {
          throw new Error('The floor lamp shade must have an indexed standard material.');
        }

        const geometry = object.geometry.clone();
        const outerMaterial = object.material.clone();
        const innerMaterial = object.material.clone();
        const indexCount = geometry.index.count;
        const indicesPerProfileBand = indexCount / SHADE_PROFILE_BANDS;
        const innerIndexStart = indicesPerProfileBand * INNER_SHADE_START_BAND;
        if (!Number.isInteger(indicesPerProfileBand) || innerIndexStart >= indexCount) {
          throw new Error('The floor lamp shade profile cannot be split into inner and outer surfaces.');
        }

        geometry.clearGroups();
        geometry.addGroup(0, innerIndexStart, 0);
        geometry.addGroup(innerIndexStart, indexCount - innerIndexStart, 1);
        outerMaterial.name = 'Warm matte fabric exterior';
        outerMaterial.color.set('#e5dccb');
        outerMaterial.metalness = 0;
        outerMaterial.roughness = 0.82;
        outerMaterial.emissive.set('#000000');
        outerMaterial.emissiveIntensity = 0;
        innerMaterial.name = 'Warm illuminated fabric interior';
        innerMaterial.color.set('#fff0d8');
        innerMaterial.metalness = 0;
        innerMaterial.roughness = 0.82;
        innerMaterial.emissive.set('#ffbf78');
        innerMaterial.emissiveIntensity = 0.26;
        object.geometry = geometry;
        object.material = [outerMaterial, innerMaterial];
        disposableResources.push(geometry, outerMaterial, innerMaterial);
        foundShade = true;
      } else if (object.material instanceof MeshStandardMaterial && object.material.name === 'Satin black metal') {
        let material = metalMaterials.get(object.material);
        if (!material) {
          material = object.material.clone();
          material.metalness = 0.48;
          material.roughness = 0.43;
          metalMaterials.set(object.material, material);
          disposableResources.push(material);
        }
        object.material = material;
      }
    });

    if (!foundShade) throw new Error('The floor lamp shade mesh is missing.');
    return { model: clone, disposableResources };
  }, [scene]);
  useEffect(() => () => disposableResources.forEach(resource => resource.dispose()), [disposableResources]);

  return <group {...room.lamp} name="floor_lamp">
    <primitive object={model} />
  </group>;
}

useGLTF.preload(MODEL_PATH);
