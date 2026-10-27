'use client';

import { useSyncExternalStore } from 'react';
import { roomPreparation, initialRoomPreparationSnapshot } from '@/lib/room-preparation';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';

export default function RoomReturnControl({ onRequest }: { onRequest?: () => void }) {
  const preparation = useSyncExternalStore(
    roomPreparation.subscribe,
    roomPreparation.getSnapshot,
    () => initialRoomPreparationSnapshot,
  );
  const { requestRoomReturn } = useExperienceNavigation();
  const percent = preparation.total > 0
    ? Math.round((preparation.loaded / preparation.total) * 100)
    : null;
  const isReady = preparation.status === 'sceneReady';
  const busy = preparation.status === 'transitioning';
  const failed = preparation.status === 'failed';
  const assetsLoaded = preparation.status === 'assetsLoaded';
  const finalizing = preparation.status === 'initializing' && percent === 100;
  const label = busy
    ? 'RETURNING TO ROOM...'
    : failed
      ? 'RETRY ROOM PREPARATION'
      : isReady
        ? 'RETURN TO 3D ROOM'
        : assetsLoaded
          ? 'ROOM ASSETS READY — RETURN TO ROOM'
        : finalizing
          ? 'FINALIZING ROOM...'
          : percent !== null
            ? `LOADING ROOM — ${percent}%`
            : 'RETURN TO 3D ROOM';

  return (
    <div className="room-return-control">
      <button type="button" onClick={onRequest ?? requestRoomReturn} disabled={busy} aria-label={label}>
        {label}
      </button>
      {!isReady && !failed && !busy && (
        <>
          <div
            className={`room-return-progress${percent === null ? ' is-indeterminate' : ''}`}
            role="progressbar"
            aria-label="Room asset preparation"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={percent === null ? 'Room preparation progress is not measurable yet' : `${percent}% of room assets loaded`}
          >
            <span style={percent === null ? undefined : { transform: `scaleX(${percent / 100})` }} />
          </div>
          <span className="room-return-status" aria-live="polite">
            {finalizing ? 'FINALIZING SCENE...' : assetsLoaded ? 'SCENE INITIALIZATION STARTS ON RETURN' : null}
          </span>
        </>
      )}
      {failed && <span className="room-return-status" role="status">{preparation.error}</span>}
    </div>
  );
}
