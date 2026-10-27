/** Pointer impulses shared by the Work and Contact liquid shaders.
 * Values preserve the original gallery timing, pool, coordinate system and strength. */
export const RIPPLE_COUNT = 12;
export const RIPPLE_LIFETIME = 2.8;
export type Ripple = { x: number; y: number; born: number; strength: number };

export function createPointerRipples(area: HTMLElement, onImpulse: () => void, {
  intensity = 1,
  interactive = () => true,
  viewport = false,
}: { intensity?: number; interactive?: () => boolean; viewport?: boolean } = {}) {
  const ripples: Ripple[] = Array.from({ length: RIPPLE_COUNT }, () => ({ x: 0, y: 0, born: -100, strength: 0 }));
  let slot = 0, lastImpulse = -100, lastX = -1, lastY = -1, activeUntil = 0;
  const pointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || document.hidden || !interactive()) return;
    const time = performance.now() / 1000;
    const distance = Math.hypot(event.clientX - lastX, event.clientY - lastY);
    if (time - lastImpulse < .045 || distance < 4) return;
    const bounds = viewport
      ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      : area.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const speed = lastX < 0 ? 1 : Math.min(1, distance / 75);
    Object.assign(ripples[slot], {
      x: (event.clientX - bounds.left) / bounds.width,
      y: 1 - (event.clientY - bounds.top) / bounds.height,
      born: time, strength: (.35 + speed * .65) * intensity,
    });
    slot = (slot + 1) % RIPPLE_COUNT;
    lastImpulse = time; lastX = event.clientX; lastY = event.clientY;
    activeUntil = time + RIPPLE_LIFETIME;
    onImpulse();
  };
  const clear = () => { ripples.forEach(ripple => { ripple.strength = 0; }); activeUntil = 0; };
  area.addEventListener('pointermove', pointer, { passive: true });
  return {
    ripples,
    get activeUntil() { return activeUntil; },
    clear,
    dispose() { clear(); area.removeEventListener('pointermove', pointer); },
  };
}
