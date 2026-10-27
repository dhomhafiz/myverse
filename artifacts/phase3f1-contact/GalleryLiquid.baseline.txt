'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { Color, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Texture, TextureLoader, Vector2, Vector4, WebGLRenderer } from 'three';
import type { Project } from '@/lib/projects';
import useReducedMotion from '@/hooks/useReducedMotion';

const RIPPLE_COUNT = 12;
const LIFETIME = 2.8;
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uViewport;
  uniform vec4 uMediaRect;
  uniform vec4 uRipples[12];
  uniform float uTime;
  uniform vec3 uAccent;
  uniform sampler2D uImage;
  uniform float uHasImage;
  uniform float uImageAspect;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  // All artwork is evaluated in one viewport coordinate system before displacement.
  vec3 environment(vec2 uv) {
    float aspect = uViewport.x / uViewport.y;
    vec2 p = uv * vec2(aspect, 1.0);
    float atmosphere = exp(-length((uv - vec2(.72, .54)) * vec2(1.1, 1.0)) * 3.5);
    vec3 color = vec3(.063, .071, .075) + atmosphere * vec3(.027, .021, .03);
    // Low-contrast broad bands reveal refraction across otherwise near-black space.
    float depth = sin((p.x * .65 + p.y) * 19.0) * .5 + .5;
    color += depth * .007 * atmosphere;
    vec2 local = (uv - uMediaRect.xy) / uMediaRect.zw;
    vec2 outside = max(max(-local, local - 1.0), 0.0) * uMediaRect.zw;
    float shadow = exp(-length(outside * vec2(aspect, 1.0)) * 28.0);
    color *= 1.0 - shadow * .22;
    if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0) {
      float glow = exp(-length((local - vec2(.55, .45)) * vec2(1.1, 1.0)) * 3.0);
      color = vec3(.084, .088, .098) + uAccent * glow * .15;
      vec2 grid = abs(fract(local * uMediaRect.zw * uViewport / 60.0) - .5);
      color += (1.0 - smoothstep(.48, .5, max(grid.x, grid.y))) * .004;
      if (uHasImage > .5) {
        vec2 cover = vec2(1.0);
        float rectAspect = uMediaRect.z * uViewport.x / (uMediaRect.w * uViewport.y);
        if (rectAspect > uImageAspect) cover.y = uImageAspect / rectAspect;
        else cover.x = rectAspect / uImageAspect;
        vec2 imageUv = clamp((local - .5) * cover + .5, .001, .999);
        color = texture2D(uImage, imageUv).rgb;
      }
      float edge = min(min(local.x, 1.0 - local.x) * uMediaRect.z * uViewport.x,
                       min(local.y, 1.0 - local.y) * uMediaRect.w * uViewport.y);
      color = mix(color + vec3(.055), color, smoothstep(0.0, 1.2, edge));
    }
    return color;
  }
  void main() {
    float aspect = uViewport.x / uViewport.y;
    vec2 slope = vec2(0.0);
    float waveActivity = 0.0;
    float highlights = 0.0;
    for (int i = 0; i < 12; i++) {
      vec4 ripple = uRipples[i];
      float age = uTime - ripple.z;
      if (ripple.w > .0 && age >= .0 && age < 2.8) {
        vec2 delta = (vUv - ripple.xy) * vec2(aspect, 1.0);
        float distanceToOrigin = length(delta);
        float wave = distanceToOrigin - age * .32;
        float front = smoothstep(.0, .06, age);
        float damping = exp(-age * 1.3) * front * ripple.w;
        float envelope = exp(-wave * wave / .0028) * damping;
        slope += delta / max(distanceToOrigin, .001) * sin(wave * 105.0) * envelope * 1.3;
        waveActivity = max(waveActivity, exp(-wave * wave / .018) * damping);
        highlights += exp(-wave * wave / .0009) * damping;
      }
    }
    slope = slope / (1.0 + length(slope) * .7);
    vec2 offset = slope * .008 / vec2(aspect, 1.0);
    vec2 refractedUv = clamp(vUv + offset, .0001, .9999);
    vec3 color = environment(refractedUv);
    color *= 1.0 + dot(slope, vec2(-.05, .06));
    color += vec3(.035, .043, .047) * min(highlights, .8);
    vec2 pixel = vUv * uViewport;
    float cellSize = 110.0;
    float drift = mod(uTime * 8.0, cellSize);
    vec2 cell = floor((pixel + vec2(0.0, drift)) / cellSize);
    vec2 randomOffset = vec2(hash21(cell + 13.7), hash21(cell + 47.2));
    float bubblePresent = step(.87, hash21(cell + 89.1));
    float radius = mix(.65, 1.55, hash21(cell + 31.8));
    vec2 bubbleCenter = cell * cellSize + mix(vec2(.2), vec2(.8), randomOffset) * cellSize - vec2(0.0, drift);
    float bubbleDistance = length(pixel - bubbleCenter);
    float rim = exp(-pow((bubbleDistance - radius) / .38, 2.0));
    float glint = exp(-pow(length((pixel - bubbleCenter + vec2(radius * .3, radius * .35)) / max(radius * .55, .5)), 2.0));
    float bubbleVisibility = .08 + smoothstep(.015, .16, waveActivity) * .92;
    float bubbles = bubblePresent * bubbleVisibility * (rim * .16 + glint * .07);
    color += vec3(.72, .8, .83) * bubbles;
    gl_FragColor = vec4(color, 1.0);
  }
`;

type LiquidEngine = { setProject: (project: Project) => void };

export default function GalleryLiquid({ project, gallery, media }: {
  project: Project; gallery: RefObject<HTMLElement | null>; media: RefObject<HTMLAnchorElement | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initialProject = useRef(project);
  const engine = useRef<LiquidEngine | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = host.current, area = gallery.current, imageLink = media.current;
    if (!element || !area || !imageLink) return;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    let dispose: (() => void) | undefined;
    const configure = () => {
      dispose?.(); dispose = undefined;
      if (reducedMotion || !finePointer.matches) return;
      let renderer: WebGLRenderer;
      try {
        renderer = new WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'low-power' });
      } catch (error) {
        console.warn('Gallery liquid is unavailable; static media retained.', error);
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      element.appendChild(renderer.domElement);
      const ripples = Array.from({ length: RIPPLE_COUNT }, () => new Vector4(0, 0, -100, 0));
      const emptyTexture = new Texture();
      const uniforms = {
        uViewport: { value: new Vector2(1, 1) }, uMediaRect: { value: new Vector4() },
        uRipples: { value: ripples }, uTime: { value: 0 }, uAccent: { value: new Color() },
        uImage: { value: emptyTexture }, uHasImage: { value: 0 }, uImageAspect: { value: 1 },
      };
      const geometry = new PlaneGeometry(2, 2);
      const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false });
      const scene = new Scene(); scene.add(new Mesh(geometry, material));
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      let frame = 0, lastImpulse = -100, activeUntil = 0, slot = 0, disposed = false, texture: Texture | null = null, revision = 0;
      let lastX = -1, lastY = -1, mediaReady = false, shaderFailed = false;
      renderer.debug.onShaderError = () => { shaderFailed = true; area.removeAttribute('data-liquid-ready'); console.error('Gallery liquid shader failed; static media retained.'); };
      const render = () => {
        frame = 0;
        if (disposed || document.hidden) return;
        const time = performance.now() / 1000;
        uniforms.uTime.value = time;
        renderer.render(scene, camera);
        if (mediaReady && !shaderFailed) area.setAttribute('data-liquid-ready', 'true');
        if (time < activeUntil) frame = requestAnimationFrame(render);
      };
      const requestRender = () => { if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(render); };
      const measure = () => {
        const bounds = area.getBoundingClientRect(), rect = imageLink.getBoundingClientRect();
        const width = Math.max(bounds.width, 1), height = Math.max(bounds.height, 1);
        if (uniforms.uViewport.value.x !== width || uniforms.uViewport.value.y !== height) renderer.setSize(width, height, false);
        uniforms.uViewport.value.set(width, height);
        uniforms.uMediaRect.value.set((rect.left - bounds.left) / width, 1 - (rect.bottom - bounds.top) / height, rect.width / width, rect.height / height);
        requestRender();
      };
      const setProject = (next: Project) => {
        const version = ++revision;
        ripples.forEach(ripple => { ripple.w = 0; }); activeUntil = 0;
        texture?.dispose(); texture = null; uniforms.uImage.value = emptyTexture;
        uniforms.uHasImage.value = 0; uniforms.uAccent.value.set(next.accent).convertLinearToSRGB();
        mediaReady = !next.image;
        // Reveal the static DOM media while a replacement texture is loading.
        area.removeAttribute('data-liquid-ready');
        if (next.image) {
          new TextureLoader().load(next.image, loaded => {
            if (disposed || version !== revision) { loaded.dispose(); return; }
            texture = loaded; mediaReady = true; loaded.minFilter = LinearFilter; loaded.generateMipmaps = false;
            uniforms.uImage.value = loaded; uniforms.uHasImage.value = 1;
            uniforms.uImageAspect.value = loaded.image.width / loaded.image.height;
            measure();
          }, undefined, () => {
            if (!disposed && version === revision) {
              area.removeAttribute('data-liquid-ready');
              console.warn(`Gallery media failed to load for "${next.title}"; static media retained.`);
            }
          });
        }
        measure();
      };
      const pointer = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse' || document.hidden || !area.hasAttribute('data-gallery-interactive')) return;
        const time = performance.now() / 1000;
        if (time - lastImpulse < .045 || Math.hypot(event.clientX - lastX, event.clientY - lastY) < 4) return;
        const bounds = area.getBoundingClientRect();
        const speed = lastX < 0 ? 1 : Math.min(1, Math.hypot(event.clientX - lastX, event.clientY - lastY) / 75);
        ripples[slot].set((event.clientX - bounds.left) / bounds.width, 1 - (event.clientY - bounds.top) / bounds.height, time, .35 + speed * .65);
        slot = (slot + 1) % RIPPLE_COUNT; lastImpulse = time; lastX = event.clientX; lastY = event.clientY;
        activeUntil = time + LIFETIME; requestRender();
      };
      const visibility = () => {
        cancelAnimationFrame(frame); frame = 0;
        ripples.forEach(ripple => { ripple.w = 0; }); activeUntil = 0;
        if (!document.hidden) requestRender();
      };
      const lost = (event: Event) => { event.preventDefault(); dispose?.(); dispose = undefined; };
      const observer = new ResizeObserver(measure); observer.observe(area); observer.observe(imageLink);
      area.addEventListener('pointermove', pointer, { passive: true });
      area.addEventListener('scroll', measure, true);
      document.addEventListener('visibilitychange', visibility);
      renderer.domElement.addEventListener('webglcontextlost', lost);
      engine.current = { setProject };
      dispose = () => {
        disposed = true; revision++; cancelAnimationFrame(frame); observer.disconnect(); engine.current = null;
        area.removeEventListener('pointermove', pointer); area.removeEventListener('scroll', measure, true);
        document.removeEventListener('visibilitychange', visibility);
        renderer.domElement.removeEventListener('webglcontextlost', lost);
        texture?.dispose(); emptyTexture.dispose(); material.dispose(); geometry.dispose();
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); area.removeAttribute('data-liquid-ready');
      };
      setProject(initialProject.current);
    };
    configure(); finePointer.addEventListener('change', configure);
    return () => { finePointer.removeEventListener('change', configure); dispose?.(); };
  }, [gallery, media, reducedMotion]);

  useEffect(() => { initialProject.current = project; engine.current?.setProject(project); }, [project]);
  return <div ref={host} className="gallery-liquid" aria-hidden="true" />;
}
