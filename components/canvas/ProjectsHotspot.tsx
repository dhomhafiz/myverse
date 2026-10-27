'use client';
import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2 } from 'three';
import HotspotIndicator from './HotspotIndicator';
import { freeLook } from '@/lib/room-state';
import { hotspotDestinations } from '@/lib/hotspot-destinations';

const destination = hotspotDestinations.projects;

export default function ProjectsHotspot({ active, reducedMotion, onOpen }: { active: boolean; reducedMotion: boolean; onOpen: () => void }) {
  const { gl, camera, scene } = useThree();
  const [hovered, setHovered] = useState(false);
  const hover = useRef(false);
  const start = useRef<{ x: number; y: number; dragged: boolean; id: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement, ray = new Raycaster(), point = new Vector2();
    const hit = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect(); point.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(point, camera);
      const first = ray.intersectObjects(scene.children, true).find(item => item.object.type === 'Mesh');
      let object = first?.object;
      while (object) { if (object.name === destination.transitionAnchor) return true; object = object.parent ?? undefined; }
      return false;
    };
    const down = (event: PointerEvent) => { if (event.isPrimary && event.button === 0) start.current = { x: event.clientX, y: event.clientY, dragged: false, id: event.pointerId }; };
    const highlight = (value: boolean) => { if (hover.current === value) return; hover.current = value; setHovered(value); canvas.classList.toggle('over-projects', value); };
    const move = (event: PointerEvent) => {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) >= freeLook.dragThreshold) start.current.dragged = true;
      highlight(hit(event));
    };
    const up = (event: PointerEvent) => { const gesture = start.current; start.current = null; if (gesture && event.pointerId === gesture.id && !gesture.dragged && hit(event)) onOpen(); };
    const cancel = () => { start.current = null; highlight(false); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('pointerleave', cancel); window.addEventListener('blur', cancel);
    return () => { cancel(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('pointerleave', cancel); window.removeEventListener('blur', cancel); };
  }, [active, onOpen, gl, camera, scene]);
  return <HotspotIndicator target={destination.transitionAnchor} anchor="screen_left_anchor" position={[0, .48, .04]}
    caption="View My Works" ariaLabel={destination.accessibleLabel} active={active} reducedMotion={reducedMotion} highlighted={hovered} onActivate={onOpen} />;
}
