'use client';

import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EdgesGeometry, LineBasicMaterial, LineSegments, Mesh, Vector3 } from 'three';
import type { Vec3 } from '@/lib/room-config';
import { freeLook } from '@/lib/room-state';
import { ROOM_SNAPSHOT_EXCLUDE } from '@/lib/room-snapshot';

type IndicatorProps = {
  target: string; anchor: string; position: Vec3; caption: string; ariaLabel?: string;
  active: boolean; reducedMotion: boolean; highlighted?: boolean; onActivate: () => void;
};

// Same native-DOM ownership as RoomLabel: no Html, portals or nested React roots.
export default function HotspotIndicator({ target, anchor, position, caption, ariaLabel = caption, active, reducedMotion, highlighted = false, onActivate }: IndicatorProps) {
  const { gl, scene, invalidate } = useThree();
  const node = useRef<HTMLButtonElement | null>(null);
  const outline = useRef<LineSegments<EdgesGeometry, LineBasicMaterial> | null>(null);
  const point = useMemo(() => new Vector3(), []);
  const visual = useRef({ pointer: false, focus: false, monitor: false });
  const activate = useEffectEvent(() => onActivate());
  const motionReduced = useEffectEvent(() => reducedMotion);
  const updateHighlight = useEffectEvent(() => {
    const hover = visual.current.pointer || visual.current.focus || visual.current.monitor;
    node.current?.classList.toggle('is-highlighted', hover);
    if (outline.current) outline.current.visible = hover;
    invalidate();
  });

  useEffect(() => {
    if (!active) return;
    const host = gl.domElement.parentElement, object = scene.getObjectByName(target);
    if (!host || !object) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'hotspot-indicator';
    button.setAttribute('aria-label', ariaLabel); button.dataset.target = target;
    button.style.visibility = 'hidden';
    const float = document.createElement('span'); float.className = 'hotspot-float';
    const disc = document.createElement('span'); disc.className = 'hotspot-disc';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const arrow = document.createElementNS(svg.namespaceURI, 'path');
    arrow.setAttribute('d', 'M12 5.5v12M7 12.5l5 5 5-5'); svg.appendChild(arrow); disc.appendChild(svg);
    const label = document.createElement('span'); label.className = 'hotspot-caption';
    label.textContent = caption; label.setAttribute('aria-hidden', 'true');
    float.append(disc, label); button.appendChild(float); host.appendChild(button); node.current = button;
    const frame = object.children.find(child => child instanceof Mesh);
    if (frame instanceof Mesh) {
      const geometry = new EdgesGeometry(frame.geometry);
      const material = new LineBasicMaterial({ color: '#bdeaff', transparent: true, opacity: .58, depthWrite: false });
      const edge = new LineSegments(geometry, material);
      edge.name = `${target}_hotspot_outline`; edge.position.copy(frame.position); edge.rotation.copy(frame.rotation);
      edge.scale.copy(frame.scale).multiplyScalar(1.012); edge.visible = false;
      edge.userData[ROOM_SNAPSHOT_EXCLUDE] = true;
      object.add(edge); outline.current = edge;
    }
    const state = visual.current;
    let animation: Animation | null = null, pending = false, disposed = false;
    let gesture: { id: number; x: number; y: number; dragged: boolean } | null = null;
    let suppressClick = false;
    const enter = (event: PointerEvent) => { if (event.pointerType !== 'touch') { state.pointer = true; updateHighlight(); } };
    const leave = () => { state.pointer = false; updateHighlight(); };
    const focus = () => { state.focus = true; updateHighlight(); };
    const blur = () => { state.focus = false; updateHighlight(); };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }; suppressClick = false;
    };
    const move = (event: PointerEvent) => { if (gesture && event.pointerId === gesture.id && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= freeLook.dragThreshold) gesture.dragged = true; };
    const up = () => { suppressClick = gesture?.dragged ?? false; gesture = null; };
    const cancel = () => { gesture = null; suppressClick = true; };
    const click = (event: MouseEvent) => {
      if (event.detail === 0) suppressClick = false;
      if (pending || suppressClick) { suppressClick = false; return; }
      pending = true;
      if (motionReduced()) { activate(); return; }
      animation = disc.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(.88)' }, { transform: 'scale(1)' }], { duration: 130, easing: 'ease-out' });
      void animation.finished.then(() => { if (!disposed) activate(); }, () => {});
    };
    button.addEventListener('pointerenter', enter); button.addEventListener('pointerleave', leave);
    button.addEventListener('focus', focus); button.addEventListener('blur', blur);
    button.addEventListener('pointerdown', down); button.addEventListener('pointermove', move);
    button.addEventListener('pointerup', up); button.addEventListener('pointercancel', cancel); button.addEventListener('click', click);
    updateHighlight(); invalidate();
    return () => {
      disposed = true; animation?.cancel(); button.remove(); node.current = null;
      state.pointer = false; state.focus = false;
      const edge = outline.current;
      if (edge) { edge.removeFromParent(); edge.geometry.dispose(); edge.material.dispose(); outline.current = null; }
      // Detached button owns its listeners; no global subscriptions or roots remain.
    };
  }, [active, anchor, ariaLabel, caption, gl, invalidate, scene, target]);

  useEffect(() => { visual.current.monitor = highlighted; updateHighlight(); }, [highlighted, active]);
  useEffect(() => { if (node.current) node.current.dataset.reducedMotion = String(reducedMotion); }, [reducedMotion, active]);
  useFrame(({ camera, size }) => {
    const button = node.current, object = scene.getObjectByName(anchor);
    if (!button || !object) return;
    // CameraRig updates transforms earlier in this frame; project with its current inverse.
    camera.updateMatrixWorld();
    point.set(...position); object.localToWorld(point); point.project(camera);
    const x = (point.x + 1) * size.width / 2, y = (1 - point.y) * size.height / 2;
    const visible = point.z > -1 && point.z < 1 && x >= 22 && x <= size.width - 22 && y >= 22 && y <= size.height - 22;
    button.style.visibility = visible ? 'visible' : 'hidden';
    button.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    button.dataset.side = x > size.width - 165 ? 'left' : 'right';
  });
  return null;
}
