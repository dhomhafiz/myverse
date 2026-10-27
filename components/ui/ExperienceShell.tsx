'use client';

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { roomPreparation, initialRoomPreparationSnapshot } from '@/lib/room-preparation';
import { projectsNavigation } from '@/lib/projects-navigation';
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
  const [roomMounted, setRoomMounted] = useState(onHomeRoute);
  const [view, setView] = useState<ReviewView>('home');
  const originalFocus = useRef<HTMLElement | null>(null);
  const originalRoute = useRef<string | null>(null);
  const previousPathname = useRef(pathname);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasLoaderVisible = useRef(false);
  const directReturn = !onHomeRoute && !projectsNavigation.visited;
  const roomVisible = onHomeRoute || roomMounted || preparation.returnRequested;
  const loaderVisible = preparation.returnRequested &&
    preparation.status !== 'sceneReady' && preparation.status !== 'transitioning';
  const routeFading = preparation.returnRequested &&
    (preparation.status === 'sceneReady' || preparation.status === 'transitioning');

  useEffect(() => {
    const previous = previousPathname.current;
    if (onHomeRoute && previous.startsWith('/work') && !projectsNavigation.visited &&
      !roomPreparation.getSnapshot().returnRequested) {
      originalRoute.current = previous;
      projectsNavigation.setMode('paused');
      roomPreparation.beginReturn();
    }
    if (onHomeRoute && roomPreparation.getSnapshot().transitionComplete) {
      roomPreparation.finishReturn();
      projectsNavigation.setMode('explore');
      originalRoute.current = null;
    }
    previousPathname.current = pathname;
  }, [onHomeRoute, pathname, preparation.transitionComplete]);

  useEffect(() => {
    if (onHomeRoute || !pathname.startsWith('/work') || roomVisible || preparation.status !== 'idle') return;
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
    if (current.returnRequested || current.status === 'transitioning') return;
    originalFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    originalRoute.current = window.location.pathname;
    setRoomMounted(true);
    projectsNavigation.setMode('paused');
    roomPreparation.beginReturn();
  }, []);

  const retryReturn = useCallback(() => {
    originalFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    originalRoute.current = window.location.pathname;
    setRoomMounted(true);
    projectsNavigation.setMode('paused');
    roomPreparation.beginReturn();
  }, []);

  const cancelReturn = useCallback(() => {
    roomPreparation.cancelReturn(projectsNavigation.visited);
    if (!projectsNavigation.visited && window.location.pathname.startsWith('/work')) setRoomMounted(false);
    const destination = originalRoute.current;
    originalRoute.current = null;
    if (window.location.pathname === '/' && destination && destination !== '/') router.push(destination);
  }, [router]);

  const beginRoomTransition = useCallback(() => {
    roomPreparation.beginTransition();
  }, []);

  const completeRoomReturn = useCallback(() => {
    const shouldNavigate = window.location.pathname !== '/';
    roomPreparation.markTransitionComplete();
    projectsNavigation.saved = null;
    projectsNavigation.visited = true;
    originalFocus.current = null;
    if (shouldNavigate) router.push('/');
    else {
      roomPreparation.finishReturn();
      projectsNavigation.setMode('explore');
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

  const percent = preparation.total > 0
    ? Math.round((preparation.loaded / preparation.total) * 100)
    : null;
  const routeInactive = loaderVisible || routeFading;
  const preparationLabel = preparation.status === 'failed'
    ? 'ROOM INITIALIZATION FAILED'
    : percent !== null && percent < 100
      ? `LOADING ENVIRONMENT — ${percent}%`
      : 'FINALIZING SCENE...';

  return (
    <ExperienceNavigationContext.Provider value={{ requestRoomReturn: startReturn }}>
      <div className="experience-shell" data-route={pathname}>
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
          <div className="room-return-loader" role="dialog" aria-modal="true" aria-labelledby="room-return-title">
            <p className="room-loader-brand">MYVERSE / SYSTEM</p>
            <h1 id="room-return-title">RETURNING TO ROOM_</h1>
            <p className="room-loader-status" role="status" aria-live="polite">
              {preparation.status === 'failed' ? preparation.error : preparationLabel}
            </p>
            <div
              className={`room-loader-progress${percent === null ? ' is-indeterminate' : ''}`}
              role="progressbar"
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
