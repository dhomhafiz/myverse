'use client';
import { useEffect, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import type { Readiness } from '@/lib/room-state';
import type { ReadinessGate } from '@/lib/room-preparation';

export default function SceneReadiness({ onReadiness, onProgress, onFailure, onGate }: {
  onReadiness: (stage: Readiness) => void;
  onProgress: (loaded: number, total: number, active: boolean) => void;
  onFailure: (error?: Error) => void;
  onGate: (gate: ReadinessGate) => void;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  const active = useProgress(state => state.active);
  const loaded = useProgress(state => state.loaded);
  const total = useProgress(state => state.total);
  const errors = useProgress(state => state.errors);
  const compiled = useRef(false);
  const sent = useRef(false);
  const candidateFrame = useRef<number | null>(null);
  const observedErrors = useRef(errors.length);
  useEffect(() => onProgress(loaded, total, active), [loaded, total, active, onProgress]);
  useEffect(() => {
    if (errors.length <= observedErrors.current) return;
    observedErrors.current = errors.length;
    onFailure(new Error(`Room asset failed to load: ${errors[errors.length - 1]}`));
  }, [errors, onFailure]);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onFailure(new Error('The room graphics context was lost.')); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, onFailure]);
  useEffect(() => {
    let current = true;
    compiled.current = false;
    candidateFrame.current = null;
    if (!active && !sent.current) {
      // This component commits inside the Canvas Suspense boundary, alongside room objects.
      if (!scene.getObjectByName('room_root')) return;
      onGate('objects');
      onReadiness('compiling');
      gl.compileAsync(scene, camera).then(() => {
        if (!current) return;
        compiled.current = true;
        onGate('shaders');
        // The inactive room is demand-driven too: explicitly request its validation frame.
        invalidate();
      }).catch(error => {
        if (current) onFailure(error instanceof Error ? error : new Error('Room shader compilation failed.'));
      });
    }
    return () => { current = false; compiled.current = false; candidateFrame.current = null; };
  }, [gl, scene, camera, active, invalidate, onReadiness, onFailure, onGate]);
  useFrame(() => {
    if (!compiled.current || active || sent.current || gl.getContext().isContextLost()) return;
    // CameraRig is registered first and has applied the configured focus pose by this frame.
    if (![...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements].every(Number.isFinite)) return;
    onGate('camera');
    candidateFrame.current = gl.info.render.frame;
  });
  useEffect(() => addAfterEffect(() => {
    if (sent.current || active || !compiled.current || candidateFrame.current === null) return;
    // Observe a real completed draw, not the start of a frame or a separate browser RAF.
    if (gl.info.render.frame <= candidateFrame.current || gl.getContext().isContextLost()) return;
    sent.current = true;
    onGate('frame');
    onReadiness('ready');
  }), [active, gl, onGate, onReadiness]);
  return null;
}
