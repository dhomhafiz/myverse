'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2 } from 'three';
import HotspotIndicator from './HotspotIndicator';
import { freeLook } from '@/lib/room-state';
import { hotspotDestinations } from '@/lib/hotspot-destinations';

const destinations = Object.values(hotspotDestinations);

export default function DestinationHotspots({ active, reducedMotion, onOpen }: {
  active: boolean; reducedMotion: boolean; onOpen: (destinationId: string) => void;
}) {
  const { gl, camera, scene } = useThree();
  const [hovered, setHovered] = useState<string | null>(null);
  const hover = useRef<string | null>(null);
  const start = useRef<{ x: number; y: number; dragged: boolean; id: number } | null>(null);
  const activate = useMemo(() => new Map(destinations.map(destination => [
    destination.id,
    () => onOpen(destination.id),
  ])), [onOpen]);

  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement, ray = new Raycaster(), point = new Vector2();
    const hit = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      point.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(point, camera);
      const first = ray.intersectObjects(scene.children, true).find(item => item.object.type === 'Mesh');
      let object = first?.object;
      while (object) {
        const destination = destinations.find(item => object?.name === item.transitionAnchor);
        if (destination) return destination.id;
        object = object.parent ?? undefined;
      }
      return null;
    };
    const highlight = (destinationId: string | null) => {
      if (hover.current === destinationId) return;
      hover.current = destinationId;
      setHovered(destinationId);
      canvas.classList.toggle('over-projects', destinationId !== null);
    };
    const down = (event: PointerEvent) => {
      if (event.isPrimary && event.button === 0) start.current = { x: event.clientX, y: event.clientY, dragged: false, id: event.pointerId };
    };
    const move = (event: PointerEvent) => {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) >= freeLook.dragThreshold) start.current.dragged = true;
      highlight(hit(event));
    };
    const up = (event: PointerEvent) => {
      const gesture = start.current;
      start.current = null;
      const destinationId = hit(event);
      if (gesture && event.pointerId === gesture.id && !gesture.dragged && destinationId) onOpen(destinationId);
    };
    const cancel = () => { start.current = null; highlight(null); };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('pointerleave', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      canvas.classList.remove('over-projects');
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [active, onOpen, gl, camera, scene]);

  return destinations.map(destination => (
    <HotspotIndicator
      key={destination.id}
      target={destination.transitionAnchor}
      anchor={destination.beaconAnchor}
      position={destination.beaconPosition}
      caption={destination.caption}
      ariaLabel={destination.accessibleLabel}
      active={active}
      reducedMotion={reducedMotion}
      highlighted={hovered === destination.id}
      onActivate={activate.get(destination.id) ?? (() => onOpen(destination.id))}
    />
  ));
}
