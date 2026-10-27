'use client';

import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Object3D, Vector3 } from 'three';
import type { Vec3 } from '@/lib/room-config';

// Native DOM labels avoid Html's nested ReactDOM root and synchronous root cleanup.
// Their anchors remain in the scene; geometry and interaction controllers are unchanged.
export default function RoomLabel({ position, className, text, button = false, ariaLabel, zIndex,
  onClick, onFocus, onBlur }: {
  position: Vec3; className: string; text: string; button?: boolean; ariaLabel?: string; zIndex: number;
  onClick?: () => void; onFocus?: () => void; onBlur?: () => void;
}) {
  const { gl, invalidate } = useThree();
  const anchor = useRef<Object3D>(null), node = useRef<HTMLElement | null>(null);
  const point = useMemo(() => new Vector3(), []);
  const click = useEffectEvent(() => onClick?.());
  const focus = useEffectEvent(() => onFocus?.());
  const blur = useEffectEvent(() => onBlur?.());
  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const element = document.createElement(button ? 'button' : 'span');
    element.style.position = 'absolute'; element.style.top = '0'; element.style.left = '0';
    element.style.zIndex = String(zIndex); element.style.visibility = 'hidden';
    if (button) { (element as HTMLButtonElement).type = 'button'; }
    else element.setAttribute('aria-hidden', 'true');
    const activate = () => click(), entered = () => focus(), left = () => blur();
    element.addEventListener('click', activate); element.addEventListener('focus', entered); element.addEventListener('blur', left);
    host.appendChild(element); node.current = element; invalidate();
    return () => {
      element.removeEventListener('click', activate); element.removeEventListener('focus', entered); element.removeEventListener('blur', left);
      node.current = null; element.remove();
    };
  }, [gl, button, zIndex, invalidate]);
  useEffect(() => {
    const element = node.current;
    if (!element) return;
    element.className = className; element.textContent = text;
    if (ariaLabel) element.setAttribute('aria-label', ariaLabel);
    invalidate();
  }, [className, text, ariaLabel, invalidate]);
  useFrame(({ camera, size }) => {
    if (!node.current || !anchor.current) return;
    anchor.current.getWorldPosition(point); point.project(camera);
    const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) < 1.2 && Math.abs(point.y) < 1.2;
    node.current.style.visibility = visible ? 'visible' : 'hidden';
    node.current.style.transform = `translate(${(point.x + 1) * size.width / 2}px, ${(1 - point.y) * size.height / 2}px) translate(-50%, -50%)`;
  });
  return <object3D ref={anchor} position={position} />;
}
