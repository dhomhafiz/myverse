'use client';
import Link from 'next/link';
import { useCallback, useId, useRef, useState } from 'react';
import type { EntrancePhase, Readiness } from '@/lib/room-state';
import NatureTerminal from './NatureTerminal';
import NatureEntranceButton from './NatureEntranceButton';
import './nature-boot.css';

export default function BootScreen({ phase, readiness, reducedMotion, onEnter, active }: {
  phase: EntrancePhase; readiness: Readiness; reducedMotion: boolean; onEnter: () => void; active: boolean;
}) {
  const entered = useRef(false);
  const statusId = useId();
  const [logoComplete, setLogoComplete] = useState(false);
  const onLogoComplete = useCallback(() => setLogoComplete(true), []);
  const entering = phase === 'entering';
  const canEnter = active && logoComplete && phase === 'ready' && readiness === 'ready' && !entering;
  const enterRoom = () => {
    // A ref closes the same-frame double-click window before React updates phase.
    if (!canEnter || entered.current) return;
    entered.current = true;
    onEnter();
  };
  return <div className={`boot-screen nature-boot${entering ? ' boot-leaving' : ''}`}
    aria-hidden={entering} inert={entering} data-boot-status={readiness === 'ready' ? 'READY' : 'LOADING'}>
    <div className="nature-boot-composition">
      <NatureTerminal reducedMotion={reducedMotion} complete={entering} onComplete={onLogoComplete} />
      <p className="nature-boot-tagline">ROOTED IN CODE. BUILT TO GROW.</p>
      <NatureEntranceButton revealed={logoComplete} ready={canEnter} reducedMotion={reducedMotion}
        statusId={statusId} onEnter={enterRoom} />
      <p id={statusId} className="nature-boot-status" role="status" aria-live="polite" aria-atomic="true">
        {canEnter ? 'YOUR ROOM IS READY. ENTER WHEN YOU ARE.' : readiness === 'ready' ? 'YOUR ROOM IS READY' : 'PREPARING YOUR EXPERIENCE'}
      </p>
      <Link className="boot-2d-link nature-boot-escape" href="/work" tabIndex={entering ? -1 : 0}>CONTINUE IN 2D</Link>
    </div>
  </div>;
}
