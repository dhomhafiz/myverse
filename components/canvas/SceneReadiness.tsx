'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import type { Readiness } from '@/lib/room-state';
export default function SceneReadiness({ onReadiness, onProgress, onFailure }: {
  onReadiness: (stage: Readiness) => void;
  onProgress: (loaded: number, total: number, active: boolean) => void;
  onFailure: (error?: Error) => void;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  const active = useProgress(state => state.active);
  const loaded = useProgress(state => state.loaded);
  const total = useProgress(state => state.total);
  const errors = useProgress(state => state.errors);
  const compiled = useRef(false);
  const sent = useRef(false);
  const frame = useRef(0);
  const observedErrors = useRef(errors.length);
  useEffect(() => onProgress(loaded, total, active), [loaded, total, active, onProgress]);
  useEffect(() => {
    if (errors.length <= observedErrors.current) return;
    observedErrors.current = errors.length;
    onFailure(new Error(`Room asset failed to load: ${errors[errors.length - 1]}`));
  }, [errors, onFailure]);
  useEffect(() => {
    let mounted = true;
    const lost = (event: Event) => { event.preventDefault(); onFailure(new Error('The room graphics context was lost.')); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    if (!active) {
      onReadiness('compiling');
      gl.compileAsync(scene, camera).then(() => {
        if (mounted) { compiled.current = true; invalidate(); }
      }).catch(error => {
        if (mounted) {
          const failure = error instanceof Error ? error : new Error('Room shader compilation failed.');
          onFailure(failure);
        }
      });
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
