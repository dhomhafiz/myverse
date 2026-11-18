'use client';

import { useId, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

// Sample the existing botanical artwork through narrow stem/leaf masks. These
// are textured plant fragments, not a replacement illustration or a green line.
const stem = 'M340 733C350 707 370 698 400 689C470 674 530 721 598 704C659 702 697 671 685 630';
const leaves = [
  { d: 'M596 385C620 298 625 255 727 270C766 277 800 286 817 303C766 282 753 376 653 374Z', transform: 'translate(322 67) rotate(-28) scale(.13) translate(-596 -385)', origin: '596px 385px' },
  { d: 'M500 860C516 791 560 760 610 790C632 803 647 820 652 835C626 816 608 862 548 850Z', transform: 'translate(291 66) rotate(-60) scale(.11) translate(-500 -860)', origin: '500px 860px' },
];

export default function NatureEntranceButton({ revealed, ready, reducedMotion, statusId, onEnter }: {
  revealed: boolean; ready: boolean; reducedMotion: boolean; statusId: string; onEnter: () => void;
}) {
  const id = useId().replace(/:/g, '');
  const scope = useRef<HTMLDivElement>(null);
  const finished = useRef(false);

  useLayoutEffect(() => {
    if (!revealed) return;
    const context = gsap.context(() => {
      const paths = scope.current?.querySelectorAll<SVGPathElement>('.entrance-vine-growth');
      paths?.forEach(path => {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      });
      gsap.set('.entrance-leaf-unfurl', { opacity: 0, scaleX: 0.25, scaleY: 0.6, rotation: -8 });
      const sequence = gsap.timeline({ onComplete: () => { finished.current = true; } });
      sequence.fromTo(scope.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0);
      paths?.forEach(path => sequence.to(path, { strokeDashoffset: 0, duration: 1.25, ease: 'sine.inOut' }, 0.15));
      sequence.to('.entrance-leaf-unfurl', { opacity: 1, scaleX: 1, scaleY: 1, rotation: 0,
        duration: 0.65, stagger: 0.18, ease: 'sine.out' }, 0.65);
      if (finished.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) sequence.progress(1).pause();
    }, scope);
    return () => context.revert();
  }, [revealed, reducedMotion]);

  return <div ref={scope} className="nature-entrance" data-revealed={revealed}>
    <button className="nature-entrance-button" type="button" disabled={!ready}
      aria-describedby={statusId} aria-busy={!ready} onClick={onEnter}>
      <svg className="nature-entrance-botany" viewBox="0 0 350 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <image id={`${id}-art`} href="/images/loader/nature-terminal.webp" width="1254" height="1254" />
          <mask id={`${id}-stem`} maskUnits="userSpaceOnUse" x="300" y="600" width="420" height="210">
            <path className="entrance-vine-growth" d={stem} fill="none" stroke="white" strokeWidth="28" strokeLinecap="round" />
          </mask>
          <clipPath id={`${id}-front`}>
            {/* The middle section slips behind the opaque border/surface. */}
            <path d="M278 71V44H313V62L304 73Z M327 78V57H358V78Z" />
          </clipPath>
          {leaves.map((leaf, index) => <clipPath id={`${id}-leaf-${index}`} key={index}><path d={leaf.d} /></clipPath>)}
        </defs>
        <g transform="translate(226 -59) scale(.18)"><use href={`#${id}-art`} mask={`url(#${id}-stem)`} /></g>
        <rect className="nature-entrance-frame" x="1.5" y="1.5" width="347" height="67" rx="18" />
        <g clipPath={`url(#${id}-front)`}>
          <g transform="translate(226 -59) scale(.18)"><use href={`#${id}-art`} mask={`url(#${id}-stem)`} /></g>
        </g>
        {leaves.map((leaf, index) => <g key={index} transform={leaf.transform}>
          <g className="entrance-leaf-unfurl" style={{ transformOrigin: leaf.origin }}>
            <use href={`#${id}-art`} clipPath={`url(#${id}-leaf-${index})`} />
          </g>
        </g>)}
      </svg>
      <span className="nature-entrance-label">ENTER MY 3D ROOM</span>
    </button>
  </div>;
}
