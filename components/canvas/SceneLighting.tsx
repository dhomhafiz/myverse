'use client';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Light, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { EntranceMotion } from '@/lib/entrance';
type Channel = keyof EntranceMotion['lights'];
function setLight(light: Light, value: number) { light.intensity = value; }
function setEmissive(material: MeshStandardMaterial, value: number) { material.emissiveIntensity = value; }
export default function SceneLighting({ motion }: { motion: RefObject<EntranceMotion> }) {
  const scene = useThree(state => state.scene);
  const emissive = useRef<{ material: MeshStandardMaterial; intensity: number; channel: Channel }[]>([]);
  const fill = useRef<{ light: Light; intensity: number }[]>([]);
  const trackSpots = useRef<{ light: Light; intensity: number }[]>([]);
  const lamp = useRef<PointLight>(null), monitors = useRef<PointLight>(null);
  const previous = useRef({ monitors: -1, pc: -1, lamp: -1, room: -1 });
  useLayoutEffect(() => {
    Object.assign(previous.current, { monitors: -1, pc: -1, lamp: -1, room: -1 });
    trackSpots.current = [];
    const materials = new Set<MeshStandardMaterial>();
    scene.traverse(object => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial) || object.material.emissive.getHex() === 0 || materials.has(object.material)) return;
      materials.add(object.material);
      let ancestor = object.parent, channel: Channel = 'room';
      while (ancestor) {
        if (ancestor.name.startsWith('monitor_') || ancestor.name === 'rgb_keyboard' || ancestor.name === 'gaming_mouse') { channel = 'monitors'; break; }
        if (ancestor.name === 'gaming_pc') { channel = 'pc'; break; }
        if (ancestor.name === 'floor_lamp' || ancestor.name === 'guitar_wall_track_light') { channel = 'lamp'; break; }
        ancestor = ancestor.parent;
      }
      const entry = { material: object.material, intensity: object.material.emissiveIntensity, channel };
      emissive.current.push(entry);
      setEmissive(entry.material, entry.intensity * motion.current.lights[entry.channel]);
    });
    for (const name of ['room_ambient_light', 'room_hemisphere_light', 'room_directional_light']) {
      const light = scene.getObjectByName(name);
      if (light instanceof Light) fill.current.push({ light, intensity: light.intensity });
    }
    for (const name of ['guitar_track_spot_01', 'guitar_track_spot_02']) {
      const light = scene.getObjectByName(name);
      if (light instanceof Light) trackSpots.current.push({ light, intensity: light.intensity });
    }
    return () => {
      for (const entry of emissive.current) setEmissive(entry.material, entry.intensity);
      for (const entry of fill.current) setLight(entry.light, entry.intensity);
      for (const entry of trackSpots.current) setLight(entry.light, entry.intensity);
      emissive.current = []; fill.current = []; trackSpots.current = [];
    };
  }, [scene, motion]);
  useFrame(() => {
    const values = motion.current.lights;
    if (values.monitors === previous.current.monitors && values.pc === previous.current.pc && values.lamp === previous.current.lamp && values.room === previous.current.room) return;
    Object.assign(previous.current, values);
    if (lamp.current) lamp.current.intensity = values.lamp * 12;
    if (monitors.current) monitors.current.intensity = values.monitors * 0.7;
    for (const entry of fill.current) setLight(entry.light, entry.intensity * (0.14 + values.room * 0.86));
    for (const entry of trackSpots.current) setLight(entry.light, entry.intensity * values.lamp);
    for (const entry of emissive.current) setEmissive(entry.material, entry.intensity * values[entry.channel]);
  });
  return <>
    <pointLight ref={lamp} name="floor_lamp_glow" position={[1.6, 2.1, -1.9]} color="#ffb96b" intensity={0} distance={5} decay={2} />
    <pointLight ref={monitors} name="monitor_glow" position={[-0.2, 1.4, -1.5]} color="#78b9ff" intensity={0} distance={2} />
  </>;
}
