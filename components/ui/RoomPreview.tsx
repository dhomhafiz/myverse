'use client';

import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ReviewView } from '@/lib/room-config';
import type { CompanionFocusState, EntrancePhase, Readiness } from '@/lib/room-state';
import type { HotspotNavigationMode } from '@/lib/hotspot-navigation';
import { hotspotNavigation } from '@/lib/hotspot-navigation';
import { roomPreparation, type ReadinessGate } from '@/lib/room-preparation';
import { getHotspotDestination, getHotspotDestinationForRoute } from '@/lib/hotspot-destinations';
import Link from 'next/link';
import useReducedMotion from '@/hooks/useReducedMotion';
import BootScreen from './BootScreen';
import RoomUnavailable from './RoomUnavailable';
import HeroBrand from './HeroBrand';
import useEntranceTimeline from '@/hooks/useEntranceTimeline';
import { createEntranceMotion } from '@/lib/entrance';
import type { CompanionRobotActivity } from '@/lib/companion-robot-config';
import GlobalNavigation from './GlobalNavigation';
import FloatingRoomNavigation from './FloatingRoomNavigation';
import CompanionChat from './CompanionChat';

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
  onRegisterReturnFromBoot,
}: {
  view: ReviewView;
  roomActive: boolean;
  directReturn: boolean;
  returnRequested: boolean;
  onTransitionStart: () => boolean;
  onReturnComplete: () => void;
  onRegisterReturnFromBoot: (handler: (() => void) | null) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [directEntry] = useState(directReturn);
  const navigationMode = useSyncExternalStore(
    hotspotNavigation.subscribeMode,
    hotspotNavigation.getMode,
    () => 'explore' as HotspotNavigationMode,
  );
  const [companionInteractionSignal, setCompanionInteractionSignal] = useState(0);
  const [companionActivity, setCompanionActivity] = useState<CompanionRobotActivity>('idle');
  const [companionHoverSources, setCompanionHoverSources] = useState({ robot: false, hotspot: false });
  const [companionNotice, setCompanionNotice] = useState('');
  const [companionFocus, setCompanionFocus] = useState<CompanionFocusState>('closed');
  const companionFocusRef = useRef<CompanionFocusState>('closed');
  const companionTrigger = useRef<HTMLElement | null>(null);
  const companionTriggerKind = useRef<'mobile' | 'hotspot' | 'canvas'>('canvas');
  const [attempt] = useState(() => roomPreparation.getSnapshot().attempt);
  const opening = useRef(false);
  useEffect(() => { roomPreparation.initialize(attempt); }, [attempt]);
  const onGate = useCallback((gate: ReadinessGate) => roomPreparation.signal(gate, attempt), [attempt]);
  const [phase, setPhase] = useState<EntrancePhase>('loading');
  const [readiness, setReadiness] = useState<Readiness>('initializing');
  const [failed, setFailed] = useState(false);
  const [explorationHintDismissed, setExplorationHintDismissed] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const roomCopyright = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = roomCopyright.current;
    if (element) element.textContent = `${new Date().getFullYear()} dhomhafiz.dev`;
  }, [phase, roomActive]);
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
  const companionActive = roomActive && view === 'home' && phase === 'exploring' &&
    (navigationMode === 'explore' || companionFocus !== 'closed');
  const companionInteractive = roomActive && view === 'home' && phase === 'exploring' &&
    navigationMode === 'explore' && companionFocus === 'closed';
  const companionHovered = companionActive && (companionHoverSources.robot || companionHoverSources.hotspot);
  const onCompanionHoverChange = useCallback((source: 'robot' | 'hotspot', hovered: boolean) => {
    setCompanionHoverSources(current => current[source] === hovered ? current : { ...current, [source]: hovered });
  }, []);
  const onCompanionActivate = useCallback((trigger?: HTMLElement) => {
    if (!companionInteractive || companionFocusRef.current !== 'closed') return;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    companionTrigger.current = trigger ?? activeElement;
    companionTriggerKind.current = trigger?.matches('.mobile-ai-entry > button') ? 'mobile'
      : trigger?.classList.contains('hotspot-indicator') || activeElement?.classList.contains('hotspot-indicator')
        ? 'hotspot' : 'canvas';
    if (!trigger?.matches('.mobile-ai-entry > button')) setExplorationHintDismissed(true);
    setCompanionHoverSources({ robot: false, hotspot: false });
    setCompanionInteractionSignal(signal => signal + 1);
    companionFocusRef.current = 'opening';
    setCompanionFocus('opening');
    setCompanionNotice('');
  }, [companionInteractive]);
  const onMobileCompanionActivate = useCallback((trigger: HTMLElement) => {
    onCompanionActivate(trigger);
  }, [onCompanionActivate]);
  const onCompanionFocusSettled = useCallback((direction: 'opening' | 'closing') => {
    if (direction === 'opening' && companionFocusRef.current === 'opening') {
      companionFocusRef.current = 'open';
      setCompanionFocus('open');
      return;
    }
    if (direction !== 'closing' || companionFocusRef.current !== 'closing') return;
    companionFocusRef.current = 'closed';
    setCompanionFocus('closed');
    if (pathname !== '/' && hotspotNavigation.getMode() === 'explore') hotspotNavigation.setMode('paused');
    if (pathname === '/' && roomActive) {
      const restoreFocus = (attempt = 0) => {
        if (companionFocusRef.current !== 'closed') return;
        const trigger = companionTrigger.current?.isConnected
          ? companionTrigger.current
          : companionTriggerKind.current === 'mobile'
            ? root.current?.querySelector<HTMLElement>('.mobile-ai-entry > button')
            : companionTriggerKind.current === 'hotspot'
              ? root.current?.querySelector<HTMLElement>('.hotspot-indicator[data-target="myverse_ai_companion"]')
              : null;
        if (trigger?.isConnected && !trigger.closest('[inert]') && trigger.getClientRects().length &&
          getComputedStyle(trigger).visibility === 'visible') {
          trigger.focus({ preventScroll: true });
        } else if (companionTriggerKind.current === 'hotspot' && attempt < 30) {
          window.requestAnimationFrame(() => restoreFocus(attempt + 1));
        } else {
          surface.current?.querySelector('canvas')?.focus({ preventScroll: true });
        }
      };
      window.requestAnimationFrame(() => restoreFocus());
    }
  }, [pathname, roomActive]);
  const onCompanionFocusFailed = useCallback((error: Error) => {
    companionFocusRef.current = 'closed';
    setCompanionFocus('closed');
    setCompanionNotice(`AI Companion could not open: ${error.message}`);
  }, []);
  const onCompanionClose = useCallback(() => {
    if (companionFocusRef.current !== 'open') return;
    companionFocusRef.current = 'closing';
    setCompanionFocus('closing');
  }, []);
  const onCompanionAcknowledge = useCallback(() => {
    setCompanionInteractionSignal(signal => signal + 1);
  }, []);
  const onCompanionActivityChange = useCallback((activity: CompanionRobotActivity) => {
    setCompanionActivity(activity);
  }, []);
  useEffect(() => {
    if (companionFocus !== 'opening') return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || companionFocusRef.current !== 'opening') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      companionFocusRef.current = 'closing';
      setCompanionFocus('closing');
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [companionFocus]);

  useEffect(() => {
    if (!companionNotice) return;
    const timer = window.setTimeout(() => setCompanionNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [companionNotice]);

  const openDestination = useCallback((destinationId: string) => {
    if (opening.current || companionFocusRef.current !== 'closed' || phase !== 'exploring' || navigationMode !== 'explore') return false;
    opening.current = true;
    setCompanionNotice('');
    hotspotNavigation.open(destinationId);
    router.prefetch(getHotspotDestination(destinationId).route);
    return true;
  }, [phase, navigationMode, router]);
  const onOpenDestination = useCallback((destinationId: string) => {
    openDestination(destinationId);
  }, [openDestination]);
  const onHotspotActivate = useCallback((destinationId: string) => {
    if (openDestination(destinationId)) setExplorationHintDismissed(true);
  }, [openDestination]);

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
    if (phase !== 'ready') return;
    const resumeFromBoot = () => {
      Object.assign(motion.current.lights, { monitors: 1, pc: 1, lamp: 1, room: 1 });
      setPhase('exploring');
    };
    onRegisterReturnFromBoot(resumeFromBoot);
    return () => onRegisterReturnFromBoot(null);
  }, [motion, onRegisterReturnFromBoot, phase]);

  useEffect(() => {
    if (pathname !== '/' && companionFocus !== 'closed') {
      if (companionFocusRef.current !== 'closing') {
        companionFocusRef.current = 'closing';
        setCompanionFocus('closing');
      }
      if (navigationMode === 'explore') hotspotNavigation.setMode('paused');
      return;
    }
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
  }, [pathname, phase, navigationMode, returnRequested, companionFocus]);

  useEffect(() => {
    if (!returnRequested || readiness !== 'ready' || navigationMode === 'returning') return;
    if (phase !== 'exploring') return;
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
      id="top"
      className="room-experience"
      data-phase={phase}
      data-navigation-mode={navigationMode}
      data-companion-focus={companionFocus}
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
            onOpenDestination={onHotspotActivate}
            companionFocus={companionFocus}
            onCompanionFocusSettled={onCompanionFocusSettled}
            onCompanionFocusFailed={onCompanionFocusFailed}
            companionInteractionSignal={companionInteractionSignal}
            companionHovered={companionHovered}
            companionActivity={companionActivity}
            onCompanionActivate={onCompanionActivate}
            onCompanionHoverChange={onCompanionHoverChange}
            directDestinationId={pathname === '/' && hotspotNavigation.destinationId
              ? hotspotNavigation.destinationId
              : getHotspotDestinationForRoute(pathname).id}
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
          {roomActive && companionFocus === 'closed' && <GlobalNavigation placement="room" />}
          {phase === 'entering' && <button className="intro-skip" aria-label="Skip introduction" type="button">Skip intro</button>}
          {pathname === '/' && view === 'home' && roomActive && navigationMode === 'explore' &&
            !explorationHintDismissed && !hotspotNavigation.visited && phase === 'exploring' && (
              <p className="exploration-hint" aria-hidden="true">
                <span className="exploration-hint-pointer">Explore the room — click an object to discover more.</span>
                <span className="exploration-hint-touch">Explore the room — tap an object to discover more.</span>
              </p>
            )}
        </>
      )}
      {navigationMode === 'opening' && <div className={`hotspot-transition-cover${hotspotNavigation.destinationId === 'iphone' ? ' is-contact' : hotspotNavigation.destinationId === 'credits' ? ' is-credits' : ''}`} aria-hidden="true" />}
      {phase === 'exploring' && roomActive && navigationMode === 'explore' && companionFocus === 'closed' && (
        <>
          {view === 'home' && (
            <div className="mobile-ai-entry">
              <button type="button" aria-label="Open AI Companion chat" onClick={event => onMobileCompanionActivate(event.currentTarget)}
                onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <rect x="5" y="7" width="14" height="13" rx="3" />
                  <path d="M12 3v4M3 11v5M21 11v5M9 12h.01M15 12h.01M9 16h6" />
                </svg>
                <span>AI</span>
              </button>
              <p role="status" aria-live="polite" aria-atomic="true">{companionNotice}</p>
            </div>
          )}
          <FloatingRoomNavigation onActivate={onOpenDestination} />
          <footer className="room-footer">
            <Link className="room-credits-link" href="/credits" aria-label="Open credits and asset attributions"
              onClick={event => {
                event.preventDefault();
                onOpenDestination('credits');
              }}>
              CREDITS
            </Link>
            <span className="room-footer-separator" aria-hidden="true">|</span>
            <span className="room-copyright">
              <span className="room-copyright-mark" aria-hidden="true">©</span>
              <span ref={roomCopyright}>2026 dhomhafiz.dev</span>
            </span>
          </footer>
        </>
      )}
      <HeroBrand active={phase === 'entering' || phase === 'exploring'} settled={phase === 'exploring'} />
      {companionFocus === 'open' && <CompanionChat onClose={onCompanionClose}
        onAcknowledge={onCompanionAcknowledge} onActivityChange={onCompanionActivityChange} reducedMotion={reducedMotion} />}
      <noscript><style>{'.boot-screen { display: none; }'}</style><section className="scene-message no-script"><h1>Mohd Hafiz’s workspace</h1><p>A personal developer room with guitars and a gravel bike. Enable JavaScript for the interactive room. Portfolio content arrives in a later phase.</p></section></noscript>
    </div>
  );
}
