'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import type { Readiness } from '@/lib/room-state';
export default function SceneReadiness({ onReadiness, onFailure }: {
  onReadiness: (stage: Readiness) => void; onFailure: () => void;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  const active = useProgress(state => state.active);
  const compiled = useRef(false);
  const sent = useRef(false);
  const frame = useRef(0);
  useEffect(() => {
    let mounted = true;
    const lost = (event: Event) => { event.preventDefault(); onFailure(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    if (!active) {
      onReadiness('compiling');
      gl.compileAsync(scene, camera).then(() => {
        if (mounted) { compiled.current = true; invalidate(); }
      }).catch(error => { if (mounted) { console.error('Room compilation failed:', error); onFailure(); } });
    }
    return () => { mounted = false; cancelAnimationFrame(frame.current); gl.domElement.removeEventListener('webglcontextlost', lost); };
  }, [gl, scene, camera, active, invalidate, onReadiness, onFailure]);
  useFrame(() => {
    if (!compiled.current || sent.current) return;
    sent.current = true;
    // Notify after this R3F frame has drawn, rather than at render start.
    frame.current = requestAnimationFrame(() => onReadiness('ready'));
  });
  return null;
}
