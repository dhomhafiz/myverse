'use client';

import { useSyncExternalStore } from 'react';
import { roomPreparation, initialRoomPreparationSnapshot, roomAssetPercent } from '@/lib/room-preparation';
import { useExperienceNavigation } from './ExperienceNavigation';

export default function ReturnToRoom({ size = 'default', onActivate }: {
  size?: 'default' | 'prominent';
  onActivate?: () => void;
}) {
  const preparation = useSyncExternalStore(
    roomPreparation.subscribe, roomPreparation.getSnapshot, () => initialRoomPreparationSnapshot,
  );
  const { requestRoomReturn } = useExperienceNavigation();
  const percent = roomAssetPercent(preparation);
  const ready = preparation.status === 'sceneReady';
  const pending = preparation.returnRequested;
  const failed = preparation.status === 'failed';
  const finalizing = !ready && !failed && pending && percent === 100;
  const label = failed ? 'RETRY ROOM PREPARATION'
    : finalizing ? 'FINALIZING SCENE...'
    : pending ? 'RETURNING TO ROOM...'
    : !ready && percent !== null && percent < 100 ? `LOADING ROOM — ${percent}%`
    : 'RETURN TO 3D ROOM';
  const activate = () => {
    const current = roomPreparation.getSnapshot();
    if (current.returnRequested && current.status !== 'failed') return;
    onActivate?.();
    requestRoomReturn();
  };
  return (
    <div className={`room-return-control${size === 'prominent' ? ' room-return-control--prominent' : ''}`} aria-busy={pending && !failed}>
      <button type="button" onClick={activate} disabled={pending && !failed}>
        {label}
      </button>
      {!ready && !failed && percent !== null && (
        <div className="room-return-progress" role="progressbar" aria-label="Room asset preparation"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
          aria-valuetext={`${percent}% of room assets loaded`}>
          <span style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
      )}
      <span className="room-return-status" role="status" aria-live="polite">
        {failed ? preparation.error : finalizing ? 'FINALIZING SCENE...'
          : !pending && !ready && percent === 100 ? 'ASSETS CACHED / SCENE PREPARES ON RETURN' : null}
      </span>
    </div>
  );
}
