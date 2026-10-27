'use client';

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { roomPreparation, initialRoomPreparationSnapshot, roomAssetPercent, readinessGates } from '@/lib/room-preparation';
import { hotspotNavigation } from '@/lib/hotspot-navigation';
import { getHotspotDestinationForRoute, isHotspotDestinationRoute } from '@/lib/hotspot-destinations';
import type { ReviewView } from '@/lib/room-config';
import { ExperienceNavigationContext } from './ExperienceNavigation';
import RoomPreview from './RoomPreview';

function ReviewViewSynchronizer({ onViewChange }: { onViewChange: (view: ReviewView) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onViewChange(searchParams.get('view') === 'bike' ? 'bike' : 'home');
  }, [onViewChange, searchParams]);
  return null;
}

export default function ExperienceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const preparation = useSyncExternalStore(
    roomPreparation.subscribe,
    roomPreparation.getSnapshot,
    () => initialRoomPreparationSnapshot,
  );
  const onHomeRoute = pathname === '/';
  const [enteredAtHome] = useState(onHomeRoute);
  const [roomMounted, setRoomMounted] = useState(onHomeRoute);
  const [view, setView] = useState<ReviewView>('home');
  const originalFocus = useRef<HTMLElement | null>(null);
  const originalRoute = useRef<string | null>(null);
  const previousPathname = useRef(pathname);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasLoaderVisible = useRef(false);
  const directReturn = !hotspotNavigation.visited && (!onHomeRoute || !enteredAtHome);
  const roomVisible = onHomeRoute || preparation.returnRequested || (roomMounted && (hotspotNavigation.visited || preparation.gates.length > 0));
  const loaderVisible = preparation.returnRequested &&
    preparation.status !== 'sceneReady' && preparation.status !== 'transitioning';
  const preparationFailed = preparation.status === 'failed';
  const routeFading = preparation.returnRequested &&
    (preparation.status === 'sceneReady' || preparation.status === 'transitioning');

  useEffect(() => {
    const previous = previousPathname.current;
    if (previous !== pathname && !onHomeRoute &&
      preparation.returnRequested) {
      roomPreparation.cancelReturn(hotspotNavigation.visited);
      hotspotNavigation.setMode('paused');
      originalRoute.current = null;
    }
    if (onHomeRoute && isHotspotDestinationRoute(previous) &&
      !roomPreparation.getSnapshot().returnRequested &&
      (!hotspotNavigation.visited || hotspotNavigation.saved)) {
      originalRoute.current = previous;
      hotspotNavigation.setDestination(getHotspotDestinationForRoute(previous).id);
      hotspotNavigation.setMode('paused');
      roomPreparation.beginReturn();
    }
    if (onHomeRoute && roomPreparation.getSnapshot().transitionComplete) {
      roomPreparation.finishReturn();
      hotspotNavigation.setMode('explore');
      originalRoute.current = null;
    }
    previousPathname.current = pathname;
  }, [onHomeRoute, pathname, preparation.returnRequested, preparation.transitionComplete]);

  useEffect(() => {
    if (onHomeRoute || !isHotspotDestinationRoute(pathname) || roomVisible || preparation.status !== 'idle') return;
    const browser = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const device = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
    };
    if (!browser.requestIdleCallback || device.connection?.saveData || (device.deviceMemory && device.deviceMemory <= 2)) return;
    const id = browser.requestIdleCallback(() => roomPreparation.startPreloading());
    return () => browser.cancelIdleCallback?.(id);
  }, [onHomeRoute, pathname, roomVisible, preparation.status]);

  useEffect(() => {
    if (!loaderVisible) return;
    wasLoaderVisible.current = true;
    cancelButton.current?.focus({ preventScroll: true });
  }, [loaderVisible]);

  useEffect(() => {
    if (wasLoaderVisible.current && !loaderVisible) {
      wasLoaderVisible.current = false;
      if (!roomPreparation.getSnapshot().returnRequested) {
        originalFocus.current?.focus({ preventScroll: true });
        originalFocus.current = null;
      }
    }
  }, [loaderVisible]);

  const startReturn = useCallback(() => {
    const current = roomPreparation.getSnapshot();
    if ((current.returnRequested && current.status !== 'failed') || current.status === 'transitioning') return;
    originalFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    originalRoute.current = window.location.pathname;
    hotspotNavigation.setDestination(getHotspotDestinationForRoute(window.location.pathname).id);
    setRoomMounted(true);
    hotspotNavigation.setMode('paused');
    roomPreparation.beginReturn();
  }, []);

  const retryInProgress = useRef(false);
  const retryReturn = useCallback(async () => {
    if (retryInProgress.current) return;
    retryInProgress.current = true;
    const attempt = roomPreparation.getSnapshot().attempt;
    const route = window.location.pathname;
    try {
      const { clearFailedRoomAssets } = await import('@/components/canvas/RoomCanvas');
      clearFailedRoomAssets();
      if (roomPreparation.getSnapshot().attempt !== attempt || !roomPreparation.getSnapshot().returnRequested || window.location.pathname !== route) return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      originalRoute.current = window.location.pathname;
      hotspotNavigation.setDestination(getHotspotDestinationForRoute(window.location.pathname).id);
      setRoomMounted(true);
      hotspotNavigation.setMode('paused');
      roomPreparation.beginReturn();
    } finally { retryInProgress.current = false; }
  }, []);

  const cancelReturn = useCallback(() => {
    roomPreparation.cancelReturn(hotspotNavigation.visited);
    hotspotNavigation.setMode('paused');
    if (!hotspotNavigation.visited && isHotspotDestinationRoute(window.location.pathname)) setRoomMounted(false);
    const destination = originalRoute.current;
    originalRoute.current = null;
    if (window.location.pathname === '/' && destination && destination !== '/') router.push(destination);
  }, [router]);

  const beginRoomTransition = useCallback(() => {
    return roomPreparation.beginTransition();
  }, []);

  const completeRoomReturn = useCallback(() => {
    const shouldNavigate = window.location.pathname !== '/';
    if (!roomPreparation.markTransitionComplete()) return;
    hotspotNavigation.saved = null;
    hotspotNavigation.visited = true;
    originalFocus.current = null;
    if (shouldNavigate) router.push('/');
    else {
      roomPreparation.finishReturn();
      hotspotNavigation.setMode('explore');
      originalRoute.current = null;
    }
  }, [router]);

  useEffect(() => {
    if (!loaderVisible) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelReturn();
    };
    window.addEventListener('keydown', cancelOnEscape, true);
    return () => window.removeEventListener('keydown', cancelOnEscape, true);
  }, [cancelReturn, loaderVisible]);

  // A deadline enters recovery; it never authorizes readiness. Hidden-tab time is excluded.
  useEffect(() => {
    if (!loaderVisible || preparationFailed) return;
    let elapsed = 0;
    let previous = performance.now();
    const attempt = preparation.attempt;
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'visible') elapsed += now - previous;
      previous = now;
      if (elapsed < 45000) return;
      const state = roomPreparation.getSnapshot();
      const pending = readinessGates.filter(gate => !state.gates.includes(gate));
      roomPreparation.fail(new Error(`Room preparation could not finish (${pending.join(', ')} pending). Please retry, or cancel to keep browsing.`), attempt);
    }, 1000);
    const visibility = () => { previous = performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [loaderVisible, preparation.attempt, preparationFailed]);

  const percent = roomAssetPercent(preparation);
  const routeInactive = loaderVisible || routeFading;
  const preparationLabel = preparation.status === 'failed'
    ? 'ROOM INITIALIZATION FAILED'
    : percent !== null && percent < 100
      ? `LOADING ENVIRONMENT — ${percent}%`
      : 'FINALIZING SCENE...';

  return (
    <ExperienceNavigationContext.Provider value={{ requestRoomReturn: startReturn }}>
      <div className="experience-shell" data-route={pathname} data-room-status={preparation.status} data-room-pending={readinessGates.filter(gate => !preparation.gates.includes(gate)).join(',')}>
        <Suspense fallback={null}><ReviewViewSynchronizer onViewChange={setView} /></Suspense>
        {roomVisible && (
          <div className={`experience-room-layer${onHomeRoute ? ' is-active' : ''}`}>
            <RoomPreview
              key={`${view}-${preparation.attempt}`}
              view={view}
              roomActive={onHomeRoute && !loaderVisible && !routeFading && !preparation.returnRequested}
              directReturn={directReturn}
              returnRequested={preparation.returnRequested}
              onTransitionStart={beginRoomTransition}
              onReturnComplete={completeRoomReturn}
            />
          </div>
        )}
        <div
          className={`experience-route${onHomeRoute ? ' is-home' : ''}${routeFading ? ' is-returning' : ''}`}
          aria-hidden={routeInactive}
          inert={routeInactive}
        >
          {children}
        </div>
        {loaderVisible && (
          <div className="room-return-loader" role="dialog" aria-modal="true" aria-labelledby="room-return-title" onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }}>
            <p className="room-loader-brand">MYVERSE / SYSTEM</p>
            <h1 id="room-return-title">RETURNING TO ROOM_</h1>
            <p className="room-loader-status" role="status" aria-live="polite">
              {preparation.status === 'failed' ? preparation.error : preparationLabel}
            </p>
            <div
              className={`room-loader-progress${percent === null ? ' is-indeterminate' : ''}`}
              role={percent === null ? undefined : "progressbar"}
              aria-label="Room asset preparation"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              aria-valuetext={percent === null ? 'Preparing room assets' : `${percent}% of room assets loaded`}
            >
              <span style={percent === null ? undefined : { transform: `scaleX(${percent / 100})` }} />
            </div>
            <div className="room-loader-actions">
              {preparation.status === 'failed' && <button type="button" onClick={retryReturn}>Retry</button>}
              <button ref={cancelButton} type="button" onClick={cancelReturn}>Cancel and stay here</button>
            </div>
          </div>
        )}
      </div>
    </ExperienceNavigationContext.Provider>
  );
}
