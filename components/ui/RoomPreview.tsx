'use client';
import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReviewView } from '@/lib/room-config';
import type { EntrancePhase, Readiness } from '@/lib/room-state';
import useReducedMotion from '@/hooks/useReducedMotion';
import BootScreen from './BootScreen';
import RoomUnavailable from './RoomUnavailable';
import HeroBrand from './HeroBrand';
import useEntranceTimeline from '@/hooks/useEntranceTimeline';
import { createEntranceMotion } from '@/lib/entrance';
const RoomCanvas = dynamic(() => import('@/components/canvas/RoomCanvas'), { ssr: false });
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Room rendering failed:', error); this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export default function RoomPreview({ view }: { view: ReviewView }) {
  const [phase, setPhase] = useState<EntrancePhase>('loading');
  const [readiness, setReadiness] = useState<Readiness>('initializing');
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(true);
  const surface = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef(createEntranceMotion());
  const reducedMotion = useReducedMotion();
  const onFailure = useCallback(() => setFailed(true), []);
  const onReadiness = useCallback((stage: Readiness) => {
    setReadiness(stage);
    if (stage === 'ready') setPhase(previous => previous === 'loading' ? 'ready' : previous);
  }, []);
  const onEntered = useCallback(() => setPhase('exploring'), []);
  const onGesture = useCallback(() => setHint(false), []);
  useEntranceTimeline({ root, motion, phase, reducedMotion, view, onEntered });
  useEffect(() => {
    if (phase === 'exploring') surface.current?.querySelector('canvas')?.focus({ preventScroll: true });
  }, [phase]);
  if (failed) return <RoomUnavailable />;
  return <div ref={root} className="room-experience" data-phase={phase} data-readiness={readiness} data-reduced-motion={reducedMotion}>
    <div className="room-surface" ref={surface}>
      <SceneBoundary onFailure={onFailure}>
        <RoomCanvas view={view} phase={phase} reducedMotion={reducedMotion} onReadiness={onReadiness}
          motion={motion} onGesture={onGesture} onFailure={onFailure} fallback={<p>Your browser does not support the room canvas.</p>} />
      </SceneBoundary>
    </div>
    {phase !== 'exploring' && <BootScreen phase={phase} readiness={readiness} reducedMotion={reducedMotion} onEnter={() => setPhase('entering')} />}
    {(phase === 'entering' || phase === 'exploring') && <>
      <header className="preview-header pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-6">
        <div><p className="brand">dhomhafiz<span>.dev</span></p></div>
      </header>
      {phase === 'entering' && <button className="intro-skip" aria-label="Skip introduction" type="button">Skip intro <span aria-hidden="true">↘</span></button>}
      {hint && phase === 'exploring' && <p className="explore-hint" aria-live="polite">Drag to explore <span aria-hidden="true">↔</span></p>}
    </>}
    <HeroBrand active={phase === 'entering' || phase === 'exploring'} settled={phase === 'exploring'} />
    <noscript><style>{'.boot-screen { display: none; }'}</style><section className="scene-message no-script"><h1>Mohd Hafiz’s workspace</h1><p>A personal developer room with guitars and a gravel bike. Enable JavaScript for the interactive room. Portfolio content arrives in a later phase.</p></section></noscript>
  </div>;
}
