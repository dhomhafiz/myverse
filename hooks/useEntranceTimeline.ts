'use client';
import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { entrance, finalPose, poseValues, type EntranceMotion } from '@/lib/entrance';
import type { EntrancePhase } from '@/lib/room-state';
import type { ReviewView } from '@/lib/room-config';
import { room } from '@/lib/room-config';

export default function useEntranceTimeline({ root, motion, phase, reducedMotion, view, onEntered }: {
  root: RefObject<HTMLDivElement | null>; motion: RefObject<EntranceMotion>; phase: EntrancePhase;
  reducedMotion: boolean; view: ReviewView; onEntered: () => void;
}) {
  useLayoutEffect(() => {
    const element = root.current;
    if (phase !== 'entering' || !element) return;
    const name = element.querySelector<HTMLElement>('.hero-name')!;
    const titleWrap = element.querySelector<HTMLElement>('.hero-title-wrap');
    const displacement = element.querySelector<SVGElement>('#hero-displacement-map');
    const chromaPink = element.querySelector<HTMLElement>('.hero-chroma-pink');
    const chromaBlue = element.querySelector<HTMLElement>('.hero-chroma-blue');
    const titleScanlines = element.querySelector<HTMLElement>('.hero-title-scanlines');
    const noise = element.querySelector<SVGElement>('.hero-noise');
    const smear = element.querySelector<HTMLElement>('.hero-smear');
    const captionCursor = element.querySelector<HTMLElement>('.hero-caption-cursor');
    const anchor = element.querySelector<HTMLElement>('.brand-anchor')!;
    const mobile = element.clientWidth < element.clientHeight;
    const home = finalPose(view, mobile);
    const invalidate = () => motion.current.invalidate?.();
    const chairPose = {
      x: room.chairStartup.position[0], y: room.chairStartup.position[1], z: room.chairStartup.position[2],
      yaw: room.chairStartup.rotation[1],
    };
    const interrupted = !!element.dataset.cinematicStep && element.dataset.cinematicStep !== 'exploring';
    let finished = false;
    const context = gsap.context(() => {}, element);
    const stage = (value: string) => { element.setAttribute('data-cinematic-step', value); };
    const distortion = { value: 0 };
    const applyDistortion = () => {
      const value = distortion.value;
      displacement?.setAttribute('scale', `${value * 24}`);
      if (titleWrap) titleWrap.style.transform = `scaleX(${1 + value * 0.12}) scaleY(${1 + value * 0.06})`;
      if (chromaPink) chromaPink.style.opacity = `${value * 0.42}`;
      if (chromaBlue) chromaBlue.style.opacity = `${value * 0.42}`;
      if (titleScanlines) titleScanlines.style.opacity = `${value * 0.2}`;
      if (noise) noise.style.opacity = `${value * 0.06}`;
      if (smear) {
        smear.style.opacity = `${value * 0.24}`;
        smear.style.transform = `translate3d(${value * 38}px, 0, 0) skewX(${-value * 5}deg) scaleX(${1 + value * 0.16})`;
      }
    };
    const settle = () => {
      Object.assign(motion.current.camera, home);
      Object.assign(motion.current.lights, { monitors: 1, pc: 1, lamp: 1, room: 1 });
      Object.assign(motion.current.chair, chairPose);
      name.classList.add('is-settled');
      gsap.set(name, { clearProps: 'all' });
      gsap.set(element.querySelectorAll('.hero-title-wrap, .hero-chroma, .hero-title-scanlines, .hero-noise, .hero-smear, .brand-subtitle'), { clearProps: 'all' });
      displacement?.setAttribute('scale', '0');
      gsap.set(element.querySelectorAll('.hero-caption, .intro-scanlines'), { opacity: 0 });
      gsap.set(element.querySelectorAll('.room-surface'), { filter: 'none' });
      stage('exploring'); finished = true; invalidate(); onEntered();
    };
    let timeline: gsap.core.Timeline;
    context.add(() => {
      name.classList.remove('is-settled');
      captionCursor?.classList.remove('is-blinking');
      gsap.set(name, { left: '50%', top: '42%', xPercent: -50, yPercent: -50, x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0, transformOrigin: '0 0' });
      gsap.set('.hero-caption', { opacity: 0, y: 10 });
      gsap.set('.brand-subtitle', { opacity: 0 });
      gsap.set('.hero-smear, .hero-chroma, .hero-title-scanlines, .hero-noise, .intro-scanlines', { opacity: 0 });
      gsap.set('.room-surface', { filter: 'blur(0px) brightness(1)' });
      gsap.set('.boot-screen', { autoAlpha: 1 });
      distortion.value = 0;
      applyDistortion();
      const target = anchor.getBoundingClientRect();
      const scaleX = target.width / name.offsetWidth;
      const scaleY = target.height / name.offsetHeight;
      timeline = gsap.timeline({ onComplete: settle });
      if (interrupted) {
        Object.assign(motion.current.camera, home);
        Object.assign(motion.current.lights, { monitors: 1, pc: 1, lamp: 1, room: 1 });
        Object.assign(motion.current.chair, chairPose);
        stage('simplified'); invalidate();
        timeline.to('.boot-screen', { autoAlpha: 0, duration: 0 });
        return;
      }
      if (reducedMotion) {
        Object.assign(motion.current.camera, home);
        Object.assign(motion.current.lights, { monitors: 1, pc: 1, lamp: 1, room: 1 });
        Object.assign(motion.current.chair, chairPose);
        stage('simplified'); invalidate();
        timeline.to('.boot-screen', { autoAlpha: 0, duration: 0.12 });
        timeline.to(name, { opacity: 1, duration: 0.14 }, 0);
        timeline.to('.hero-caption', { opacity: 1, y: 0, duration: 0.14 }, 0.12);
        timeline.to('.hero-caption', { opacity: 0, duration: 0.12 }, 0.48);
        return;
      }
      Object.assign(motion.current.camera, poseValues(mobile ? entrance.mobile : entrance.desktop));
      Object.assign(motion.current.lights, { monitors: 0, pc: 0, lamp: 0, room: 0 });
      stage('closeup'); invalidate();
      timeline.to('.boot-screen', { autoAlpha: 0, duration: 0.28 }, 0);
      timeline.call(() => stage('lighting'), [], 0.4);
      timeline.to(motion.current.lights, { monitors: 1, duration: 0.3, onUpdate: invalidate }, 0.4);
      timeline.to(motion.current.chair, { ...chairPose, duration: 0.72, ease: 'power2.inOut', onUpdate: invalidate }, 0.42);
      timeline.to(motion.current.lights, { pc: 1, duration: 0.25, onUpdate: invalidate }, 0.58);
      timeline.to(motion.current.lights, { lamp: 1, room: 1, duration: 0.55, ease: 'power2.inOut', onUpdate: invalidate }, 0.78);
      timeline.call(() => stage('pullback'), [], 1.05);
      timeline.to(motion.current.camera, { ...home, duration: 1.15, ease: 'power2.inOut', onUpdate: invalidate }, 1.05);
      timeline.call(() => stage('home'), [], 2.2);
      timeline.to('.room-surface', { filter: 'blur(2.2px) brightness(0.65)', duration: 0.2 }, 2.45);
      timeline.to('.intro-scanlines', { opacity: 0.15, duration: 0.2 }, 2.45);
      timeline.call(() => stage('hero'), [], 2.6);
      timeline.to(name, { opacity: 1, y: 0, duration: 0.26 }, 2.6);
      timeline.to(distortion, { value: 0.55, duration: 0.18, ease: 'power2.out', onUpdate: applyDistortion }, 2.6);
      timeline.to(distortion, { value: 1, duration: 0.1, ease: 'power1.inOut', onUpdate: applyDistortion }, 2.78);
      timeline.to(distortion, { value: 0, duration: 0.3, ease: 'power2.out', onUpdate: applyDistortion }, 3.12);
      timeline.to('.hero-caption', { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', onStart: () => captionCursor?.classList.add('is-blinking') }, 3.42);
      const collapseStart = 3.98 + 1.2;
      const brandMoveStart = collapseStart + 0.12;
      const brandSubtitleStart = brandMoveStart + 0.68;
      timeline.call(() => { stage('collapse'); captionCursor?.classList.remove('is-blinking'); }, [], collapseStart);
      timeline.to(name, { scaleY: 0.88, duration: 0.12, ease: 'power1.in' }, collapseStart);
      timeline.to('.hero-caption', { opacity: 0, duration: 0.2 }, collapseStart);
      timeline.to(name, { left: target.left, top: target.top, xPercent: 0, yPercent: 0, scaleX, scaleY, duration: 0.68, ease: 'power2.inOut' }, brandMoveStart);
      timeline.to('.brand-subtitle', { opacity: 1, duration: 0.18 }, brandSubtitleStart);
      timeline.to('.room-surface', { filter: 'blur(0px) brightness(1)', duration: 0.7 }, collapseStart);
      timeline.to('.intro-scanlines', { opacity: 0, duration: 0.6 }, collapseStart);
    });
    const skip = () => timeline.progress(1);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); skip(); } };
    const button = element.querySelector<HTMLButtonElement>('.intro-skip');
    button?.addEventListener('click', skip); button?.focus({ preventScroll: true });
    window.addEventListener('keydown', escape);
    // A resize completes safely rather than landing the name at stale FLIP coordinates.
    window.addEventListener('resize', skip);
    return () => {
      button?.removeEventListener('click', skip); window.removeEventListener('keydown', escape); window.removeEventListener('resize', skip);
      timeline.kill(); if (!finished) context.revert();
    };
  }, [phase, reducedMotion, view, root, motion, onEntered]);
}
