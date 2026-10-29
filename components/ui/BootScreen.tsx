'use client';
import Link from 'next/link';
import { useProgress } from '@react-three/drei';
import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import type { EntrancePhase, Readiness } from '@/lib/room-state';
import BootGraph from './BootGraph';

const stages: Readiness[] = ['initializing', 'renderer', 'compiling', 'ready'];
const checks = ['Create browser rendering context', 'Mount room geometry and lights', 'Compile shaders · present first frame'];
const command = 'npm run enter-my-world';
const progressSegments = Array.from({ length: 10 }, (_, index) => index);

function setProgressSegments(fills: Array<HTMLSpanElement | null>, progress: number) {
  const progressPerSegment = 100 / progressSegments.length;
  fills.forEach((fill, index) => {
    if (!fill) return;
    const segmentProgress = Math.min(1, Math.max(0, progress / progressPerSegment - index));
    fill.style.transform = `scaleX(${segmentProgress})`;
  });
}

export default function BootScreen({ phase, readiness, reducedMotion, onEnter }: {
  phase: EntrancePhase; readiness: Readiness; reducedMotion: boolean; onEnter: () => void;
}) {
  const { active, loaded, total } = useProgress();
  const scope = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const initialization = useRef<HTMLParagraphElement>(null);
  const [terminalSequenceDone, setTerminalSequenceDone] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const animatedProgress = useRef({ value: 0 });
  const progressFills = useRef<Array<HTMLSpanElement | null>>([]);
  const progressLabel = useRef<HTMLSpanElement>(null);
  const step = stages.indexOf(readiness);
  const entering = phase === 'entering';
  const status = readiness === 'ready' ? 'READY' : readiness === 'initializing' ? 'INITIALIZING' : 'LOADING';

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const letters = { count: 0 };
      if (reducedMotion) {
        if (typed.current) typed.current.textContent = command;
        if (initialization.current) gsap.set(initialization.current, { autoAlpha: 1, y: 0 });
        setTerminalSequenceDone(true);
        gsap.set('.signal-line', { strokeDasharray: 'none', strokeDashoffset: 0 });
        gsap.set('.signal-area', { opacity: 1 });
        return;
      }
      setTerminalSequenceDone(false);
      setPromptVisible(false);
      if (typed.current) typed.current.textContent = '';
      gsap.timeline({ onComplete: () => setTerminalSequenceDone(true) }).to(letters, {
        count: command.length,
        duration: 0.85,
        ease: 'none',
        onUpdate: () => {
          if (typed.current) typed.current.textContent = command.slice(0, Math.floor(letters.count));
        },
      }).fromTo(initialization.current, { autoAlpha: 0, y: 4 }, {
        autoAlpha: 1, y: 0, duration: 0.24, ease: 'power1.out',
      });
      const trace = scope.current?.querySelector<SVGPathElement>('.signal-line');
      if (trace) {
        const length = trace.getTotalLength();
        gsap.fromTo(trace, { strokeDasharray: length, strokeDashoffset: length }, {
          strokeDashoffset: 0, duration: 1.25, ease: 'none', autoRound: false,
        });
      }
      gsap.fromTo('.signal-area', { opacity: 0 }, { opacity: 1, duration: 1.25, ease: 'power1.in' });
    }, scope);
    return () => context.revert();
  }, [reducedMotion]);

  useLayoutEffect(() => {
    const target = Math.round((step / 3) * 100);
    if (reducedMotion) {
      animatedProgress.current.value = target;
      setProgressSegments(progressFills.current, target);
      if (progressLabel.current) progressLabel.current.textContent = `${target}`;
      return;
    }
    const tween = gsap.to(animatedProgress.current, {
      value: target,
      duration: 0.38,
      ease: 'power2.out',
      onUpdate: () => {
        const value = Math.round(animatedProgress.current.value);
        setProgressSegments(progressFills.current, animatedProgress.current.value);
        if (progressLabel.current) progressLabel.current.textContent = `${value}`;
      },
    });
    return () => { tween.kill(); };
  }, [step, reducedMotion]);

  useLayoutEffect(() => {
    if (!terminalSequenceDone) return;
    const rows = scope.current?.querySelectorAll('.boot-log-row[data-reached="true"]');
    if (!rows?.length) return;
    gsap.to(rows, {
      autoAlpha: 1, y: 0, duration: reducedMotion ? 0 : 0.22,
      stagger: reducedMotion ? 0 : 0.09, overwrite: 'auto',
      onComplete: () => { if (step === 3) setPromptVisible(true); },
    });
    return () => gsap.killTweensOf(rows);
  }, [step, reducedMotion, terminalSequenceDone]);

  return <div ref={scope} className={`boot-screen ${entering ? 'boot-leaving' : ''}`} aria-hidden={entering} data-boot-status={status}>
    <div className="boot-terminal">
      <div className="boot-window-bar"><p className="boot-brand">dhomhafiz.dev <span>/ terminal</span></p></div>
      <div className="boot-content">
        <div className="boot-columns">
          <div className="terminal-session">
            <p className="terminal-command" aria-hidden="true"><span className="command-prompt">$</span> <span ref={typed} />{!terminalSequenceDone && <span className="terminal-cursor">▌</span>}</p>
            <p ref={initialization} className="terminal-initialization" aria-hidden="true">&gt; Initializing immersive workspace...</p>
            <div className="boot-log" aria-hidden="true">
              {checks.map((message, index) => <p key={message} className="boot-log-row" data-reached={terminalSequenceDone && step > index}>
                <span className="log-prefix">[OK]</span><span className="log-message">{message}</span>
              </p>)}
            </div>
            {promptVisible && <p className="terminal-command terminal-prompt" aria-hidden="true"><span className="command-prompt">$</span> <span className="terminal-prompt-cursor">█</span></p>}
          </div>
          <BootGraph />
        </div>
        <div className="boot-footer">
          <div className="boot-progress" role="progressbar" aria-label="Workspace initialization" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((step / 3) * 100)} aria-valuetext={`${Math.round((step / 3) * 100)}% complete`}>
            {progressSegments.map(index => <span key={index} className="boot-progress-segment">
              <span ref={element => { progressFills.current[index] = element; }} className="boot-progress-fill" />
            </span>)}
          </div>
          <p className="asset-status"><span ref={progressLabel}>0</span>%{total > 0 ? ` · ${loaded} / ${total} assets ${active ? 'loaded' : 'ready'}` : ''}</p>
          <button className="enter-button boot-footer-enter" disabled={phase !== 'ready'} tabIndex={entering ? -1 : 0} onClick={onEnter}>ENTER MY ROOM</button>
          <p className="boot-controls" aria-label="Room controls">
            <span className="boot-controls-desktop">DRAG TO LOOK · CLICK OBJECTS · ESC TO CLOSE</span>
            <span className="boot-controls-mobile">DRAG TO LOOK · TAP OBJECTS TO EXPLORE</span>
          </p>
          <Link className="boot-2d-link" href="/work" tabIndex={entering ? -1 : 0}>CONTINUE IN 2D</Link>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}. {step} of 3 scene readiness checks complete. {status === 'READY' ? 'Enter my room is available.' : 'Preparing interactive workspace.'}</p>
    </div>
  </div>;
}
