'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { Color, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Texture, TextureLoader, Vector2, Vector4, WebGLRenderer } from 'three';
import type { Project } from '@/lib/projects';
import useReducedMotion from '@/hooks/useReducedMotion';

import { createPointerRipples, RIPPLE_COUNT } from '@/lib/pointer-ripples';
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
  uniform float uSwayStart;
  uniform float uSwayAmount;
  uniform vec3 uAccent;
  uniform float uFlatBackground;
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
    vec3 base = vec3(.063, .071, .075);
    vec3 color = mix(base + atmosphere * vec3(.027, .021, .03), base, uFlatBackground);
    // Low-contrast broad bands reveal refraction across otherwise near-black space.
    float depth = sin((p.x * .65 + p.y) * 19.0) * .5 + .5;
    color += depth * .007 * atmosphere * (1.0 - uFlatBackground);
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
        float swayAge = uTime - uSwayStart;
        if (swayAge >= 0.0 && swayAge < 1.8) {
          float sway = cos(swayAge * 7.0) * exp(-swayAge * 2.8) * uSwayAmount;
          vec2 centeredUv = imageUv - .5;
          imageUv = mat2(cos(sway), -sin(sway), sin(sway), cos(sway)) * centeredUv + .5;
        }
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

type LiquidEngine = { setProject: (project: Project | null) => void };

export default function LiquidSodaBackground({ area, media, project = null, interactionReadyAttribute, className, viewport = false, enabled = true }: {
  area: RefObject<HTMLElement | null>;
  media?: RefObject<HTMLElement | null>;
  project?: Project | null;
  interactionReadyAttribute?: string;
  className?: string;
  viewport?: boolean;
  enabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initialProject = useRef(project);
  const engine = useRef<LiquidEngine | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!enabled) return;
    const element = host.current, target = area.current;
    if (!element || !target) return;
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
        uViewport: { value: new Vector2(1, 1) }, uMediaRect: { value: new Vector4(2, 2, .001, .001) },
        uRipples: { value: ripples }, uTime: { value: 0 }, uSwayStart: { value: -100 }, uSwayAmount: { value: 0 },
        uAccent: { value: new Color() }, uFlatBackground: { value: 0 },
        uImage: { value: emptyTexture }, uHasImage: { value: 0 }, uImageAspect: { value: 1 },
      };
      const geometry = new PlaneGeometry(2, 2);
      const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false });
      const scene = new Scene(); scene.add(new Mesh(geometry, material));
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
      let frame = 0, disposed = false, texture: Texture | null = null, revision = 0, swayUntil = 0;
      let mediaReady = false, shaderFailed = false;
      let observedMedia: HTMLElement | null = null;
      let mediaLayoutNodes: HTMLElement[] = [];
      renderer.debug.onShaderError = () => { shaderFailed = true; target.removeAttribute('data-liquid-ready'); console.error('Gallery liquid shader failed; static media retained.'); };
      const render = () => {
        frame = 0;
        if (disposed || document.hidden) return;
        const time = performance.now() / 1000;
        field.ripples.forEach((ripple, index) => ripples[index].set(ripple.x, ripple.y, ripple.born, ripple.strength));
        uniforms.uTime.value = time;
        renderer.render(scene, camera);
        if (mediaReady && !shaderFailed) target.setAttribute('data-liquid-ready', 'true');
        if (time < Math.max(field.activeUntil, swayUntil)) frame = requestAnimationFrame(render);
      };
      const requestRender = () => { if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(render); };
      const measure = () => {
        // Gallery slides can replace the media node without replacing this engine.
        // Measure and observe the current node, never a detached mount-time node.
        const mediaElement = media?.current ?? null;
        if (mediaElement !== observedMedia) {
          for (const node of mediaLayoutNodes) observer.unobserve(node);
          observedMedia = mediaElement;
          mediaLayoutNodes = [];
          // A scroll-hint/header resize can move the image without resizing it.
          for (let node: HTMLElement | null = mediaElement; node && node !== target && target.contains(node); node = node.parentElement) {
            mediaLayoutNodes.push(node);
            observer.observe(node);
          }
        }
        const bounds = viewport
          ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
          : target.getBoundingClientRect();
        const width = Math.max(bounds.width, 1), height = Math.max(bounds.height, 1);
        if (uniforms.uViewport.value.x !== width || uniforms.uViewport.value.y !== height) renderer.setSize(width, height, false);
        uniforms.uViewport.value.set(width, height);
        const rect = mediaElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          uniforms.uMediaRect.value.set((rect.left - bounds.left) / width, 1 - (rect.bottom - bounds.top) / height, rect.width / width, rect.height / height);
        } else {
          uniforms.uMediaRect.value.set(2, 2, .001, .001);
        }
        requestRender();
      };
      const setProject = (next: Project | null) => {
        const version = ++revision;
        field.clear();
        texture?.dispose(); texture = null; uniforms.uImage.value = emptyTexture;
        uniforms.uHasImage.value = 0; uniforms.uAccent.value.set(next?.accent ?? '#aaa').convertLinearToSRGB();
        uniforms.uFlatBackground.value = next ? 0 : 1;
        uniforms.uSwayStart.value = -100;
        uniforms.uSwayAmount.value = next?.status === 'comingSoon' && next.image ? .024 : 0;
        swayUntil = 0;
        mediaReady = !next?.image;
        // Reveal the static DOM media while a replacement texture is loading.
        target.removeAttribute('data-liquid-ready');
        if (next?.image) {
          new TextureLoader().load(next.image, loaded => {
            if (disposed || version !== revision) { loaded.dispose(); return; }
            texture = loaded; mediaReady = true; loaded.minFilter = LinearFilter; loaded.generateMipmaps = false;
            uniforms.uImage.value = loaded; uniforms.uHasImage.value = 1;
            uniforms.uImageAspect.value = loaded.image.width / loaded.image.height;
            if (next.status === 'comingSoon') {
              uniforms.uSwayStart.value = performance.now() / 1000;
              swayUntil = uniforms.uSwayStart.value + 1.8;
            }
            measure();
          }, undefined, () => {
            if (!disposed && version === revision) {
              target.removeAttribute('data-liquid-ready');
              console.warn(`Gallery media failed to load for "${next.title}"; static media retained.`);
            }
          });
        }
        measure();
      };
      const visibility = () => {
        cancelAnimationFrame(frame); frame = 0;
        field.clear();
        if (!document.hidden) requestRender();
      };
      const lost = (event: Event) => { event.preventDefault(); dispose?.(); dispose = undefined; };
      const observer = new ResizeObserver(measure); observer.observe(target);
      const field = createPointerRipples(target, requestRender, {
        interactive: () => (!interactionReadyAttribute || target.hasAttribute(interactionReadyAttribute)) && !target.closest('[inert]'),
        viewport,
      });
      target.addEventListener('scroll', measure, true);
      window.addEventListener('resize', measure);
      document.addEventListener('visibilitychange', visibility);
      renderer.domElement.addEventListener('webglcontextlost', lost);
      engine.current = { setProject };
      dispose = () => {
        disposed = true; revision++; cancelAnimationFrame(frame); observer.disconnect(); engine.current = null;
        field.dispose(); target.removeEventListener('scroll', measure, true);
        window.removeEventListener('resize', measure);
        document.removeEventListener('visibilitychange', visibility);
        renderer.domElement.removeEventListener('webglcontextlost', lost);
        texture?.dispose(); emptyTexture.dispose(); material.dispose(); geometry.dispose();
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); target.removeAttribute('data-liquid-ready');
      };
      setProject(initialProject.current);
    };
    configure(); finePointer.addEventListener('change', configure);
    return () => { finePointer.removeEventListener('change', configure); dispose?.(); };
  }, [area, media, reducedMotion, interactionReadyAttribute, viewport, enabled]);

  useEffect(() => {
    const changed = initialProject.current !== project;
    initialProject.current = project;
    if (changed) engine.current?.setProject(project);
  }, [project]);
  return <div ref={host} className={`liquid-soda-background ${className ?? ''}`.trim()} aria-hidden="true" />;
}
