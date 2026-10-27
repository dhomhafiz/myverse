'use client';

import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ReviewView } from '@/lib/room-config';
import type { EntrancePhase, Readiness } from '@/lib/room-state';
import type { HotspotNavigationMode } from '@/lib/hotspot-navigation';
import { hotspotNavigation } from '@/lib/hotspot-navigation';
import { roomPreparation, type ReadinessGate } from '@/lib/room-preparation';
import { getHotspotDestination, getHotspotDestinationForRoute } from '@/lib/hotspot-destinations';
import useReducedMotion from '@/hooks/useReducedMotion';
import BootScreen from './BootScreen';
import RoomUnavailable from './RoomUnavailable';
import HeroBrand from './HeroBrand';
import useEntranceTimeline from '@/hooks/useEntranceTimeline';
import { createEntranceMotion } from '@/lib/entrance';

const RoomCanvas = dynamic(() => import('@/components/canvas/RoomCanvas'), { ssr: false });

class SceneBoundary extends Component<{ children: ReactNode; onFailure: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFailure(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function RoomPreview({
  view,
  roomActive,
  directReturn,
  returnRequested,
  onTransitionStart,
  onReturnComplete,
}: {
  view: ReviewView;
  roomActive: boolean;
  directReturn: boolean;
  returnRequested: boolean;
  onTransitionStart: () => boolean;
  onReturnComplete: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [directEntry] = useState(directReturn);
  const navigationMode = useSyncExternalStore(
    hotspotNavigation.subscribeMode,
    hotspotNavigation.getMode,
    () => 'explore' as HotspotNavigationMode,
  );
  const [attempt] = useState(() => roomPreparation.getSnapshot().attempt);
  const opening = useRef(false);
  useEffect(() => { roomPreparation.initialize(attempt); }, [attempt]);
  const onGate = useCallback((gate: ReadinessGate) => roomPreparation.signal(gate, attempt), [attempt]);
  const [phase, setPhase] = useState<EntrancePhase>('loading');
  const [readiness, setReadiness] = useState<Readiness>('initializing');
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(true);
  const surface = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [initialMotion] = useState(() => {
    const value = createEntranceMotion();
    if (directEntry) Object.assign(value.lights, { monitors: 1, pc: 1, lamp: 1, room: 1 });
    return value;
  });
  const motion = useRef(initialMotion);
  const reducedMotion = useReducedMotion();

  const handleFailure = useCallback((error: Error, logError: boolean) => {
    if (roomPreparation.getSnapshot().attempt !== attempt) return;
    if (logError) console.error('Room initialization failed:', error);
    hotspotNavigation.saved = null;
    hotspotNavigation.visited = false;
    hotspotNavigation.setMode('paused');
    roomPreparation.fail(error, attempt);
    setFailed(true);
  }, [attempt]);
  const onFailure = useCallback((error = new Error('Room initialization failed.')) => {
    handleFailure(error, true);
  }, [handleFailure]);

  const onReadiness = useCallback((stage: Readiness) => {
    if (roomPreparation.getSnapshot().attempt !== attempt || roomPreparation.getSnapshot().status === 'failed') return;
    setReadiness(stage);
    if (stage === 'ready') {
      roomPreparation.markSceneReady(attempt);
      setPhase(previous => previous === 'loading' ? (directEntry ? 'exploring' : 'ready') : previous);
    }
  }, [directEntry, attempt]);

  const onProgress = useCallback((loaded: number, total: number, active: boolean) => {
    roomPreparation.reportAssets(loaded, total, active, attempt);
  }, [attempt]);

  const onEntered = useCallback(() => setPhase('exploring'), []);
  const onGesture = useCallback(() => setHint(false), []);

  const onOpenDestination = useCallback((destinationId: string) => {
    if (opening.current || phase !== 'exploring' || navigationMode !== 'explore') return;
    opening.current = true;
    onGesture();
    hotspotNavigation.open(destinationId);
    router.prefetch(getHotspotDestination(destinationId).route);
  }, [phase, navigationMode, onGesture, router]);

  const onNavigationSettled = useCallback(() => {
    if (roomPreparation.getSnapshot().attempt !== attempt) return;
    if (hotspotNavigation.getMode() === 'opening') {
      router.push(getHotspotDestination(hotspotNavigation.destinationId).route);
    } else if (hotspotNavigation.getMode() === 'returning') {
      opening.current = false;
      onReturnComplete();
    }
  }, [onReturnComplete, router, attempt]);

  useEffect(() => {
    if (pathname !== '/' && navigationMode === 'opening' &&
      getHotspotDestinationForRoute(pathname).id === hotspotNavigation.destinationId) {
      hotspotNavigation.setMode('paused');
      return;
    }
    if (pathname !== '/' && navigationMode === 'explore' && hotspotNavigation.visited) {
      hotspotNavigation.setMode('paused');
      return;
    }
    if (pathname === '/' && navigationMode === 'paused' && !returnRequested && !hotspotNavigation.saved) {
      opening.current = false;
      hotspotNavigation.setMode('explore');
    }
  }, [pathname, phase, navigationMode, returnRequested]);

  useEffect(() => {
    if (!returnRequested || readiness !== 'ready' || phase !== 'exploring' || navigationMode === 'returning') return;
    opening.current = true;
    if (onTransitionStart()) hotspotNavigation.setMode('returning');
  }, [returnRequested, readiness, phase, navigationMode, onTransitionStart]);

  useEntranceTimeline({ root, motion, phase, reducedMotion, view, onEntered });

  useEffect(() => {
    if (phase === 'exploring' && navigationMode === 'explore' && roomActive) {
      surface.current?.querySelector('canvas')?.focus({ preventScroll: true });
    }
  }, [phase, navigationMode, roomActive]);

  if (failed) {
    return <div className="room-experience"><RoomUnavailable /></div>;
  }

  return (
    <div
      ref={root}
      className="room-experience"
      data-phase={phase}
      data-navigation-mode={navigationMode}
      data-readiness={readiness}
      data-reduced-motion={reducedMotion}
      aria-hidden={!roomActive}
      inert={!roomActive}
    >
      <div className="room-surface" ref={surface}>
        <SceneBoundary onFailure={onFailure}>
          <RoomCanvas
            directStart={directEntry}
            roomActive={roomActive}
            view={view}
            phase={phase}
            reducedMotion={reducedMotion}
            onReadiness={onReadiness}
            onProgress={onProgress}
            onGate={onGate}
            motion={motion}
            navigationMode={navigationMode}
            onNavigationSettled={onNavigationSettled}
            onOpenDestination={onOpenDestination}
            directDestinationId={pathname === '/' && hotspotNavigation.destinationId
              ? hotspotNavigation.destinationId
              : getHotspotDestinationForRoute(pathname).id}
            onGesture={onGesture}
            onFailure={onFailure}
            fallback={<p>Your browser does not support the room canvas.</p>}
          />
        </SceneBoundary>
      </div>
      {!directEntry && phase !== 'exploring' && <BootScreen phase={phase} readiness={readiness} reducedMotion={reducedMotion} onEnter={() => setPhase('entering')} />}
      {(phase === 'entering' || phase === 'exploring') && (
        <>
          <header className="preview-header pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-6">
            <div><p className="brand">dhomhafiz<span>.dev</span></p></div>
          </header>
          {phase === 'entering' && <button className="intro-skip" aria-label="Skip introduction" type="button">Skip intro</button>}
          {hint && phase === 'exploring' && <p className="explore-hint" aria-live="polite">Drag to explore</p>}
        </>
      )}
      {navigationMode === 'opening' && <div className="hotspot-transition-cover" aria-hidden="true" />}
      <HeroBrand active={phase === 'entering' || phase === 'exploring'} settled={phase === 'exploring'} />
      <noscript><style>{'.boot-screen { display: none; }'}</style><section className="scene-message no-script"><h1>Mohd Hafiz’s workspace</h1><p>A personal developer room with guitars and a gravel bike. Enable JavaScript for the interactive room. Portfolio content arrives in a later phase.</p></section></noscript>
    </div>
  );
}
