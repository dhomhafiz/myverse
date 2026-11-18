'use client';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

// Reveal corridors follow the approved raster artwork; no substitute plants.
const growth = [
  { d: 'M346 480C287 459 276 388 317 349C359 309 412 347 397 379C388 403 361 394 375 378', width: 38, at: 0.55, duration: 0.8 },
  { d: 'M354 586C385 490 449 475 514 445C551 428 578 411 595 383', width: 94, at: 0.75, duration: 1.3 },
  { d: 'M486 461C566 451 618 494 626 562', width: 62, at: 1.1, duration: 0.85 },
  { d: 'M636 563C702 611 714 685 626 705C546 732 461 657 389 695C343 716 320 751 324 801', width: 75, at: 1.65, duration: 1.45 },
  { d: 'M373 629C364 653 365 681 379 697', width: 40, at: 1.75, duration: 0.5 },
  { d: 'M405 812C442 835 510 851 510 901C509 958 444 966 430 937C413 906 457 894 451 917', width: 50, at: 2.65, duration: 1 },
];
const botanicals = [
  { d: 'M568 404C529 372 509 337 510 262C551 264 624 294 608 356L593 398Z', origin: '575px 398px', at: 1.2 },
  { d: 'M590 396C610 296 625 245 727 266C766 271 803 284 822 309C769 278 753 378 653 377Z', origin: '596px 385px', at: 1.55 },
  { d: 'M374 650C366 635 342 632 306 623C257 610 261 555 218 544C230 518 324 503 359 550C378 575 381 609 374 650Z', origin: '369px 635px', at: 1.9 },
  { d: 'M498 874C510 775 564 750 612 785C644 805 650 819 657 841C629 814 610 869 548 853Z', origin: '502px 864px', at: 2.9 },
  { d: 'M446 450L448 340L523 340L560 442Z', origin: '492px 444px', at: 1.6 },
  { d: 'M608 560L608 459L664 452L676 546Z', origin: '625px 554px', at: 2 },
  { d: 'M369 698L376 598L436 600L438 668Z', origin: '380px 687px', at: 2.25 },
  { d: 'M270 706L271 653L351 646L377 699Z', origin: '366px 691px', at: 2.45 },
  { d: 'M467 843L467 775L528 770L534 847Z', origin: '503px 841px', at: 3.1 },
];

export default function NatureTerminal({ reducedMotion, complete, onComplete }: {
  reducedMotion: boolean; complete: boolean; onComplete: () => void;
}) {
  const id = useId().replace(/:/g, '');
  const scope = useRef<SVGSVGElement>(null);
  const [artworkFailed, setArtworkFailed] = useState(false);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const completeRef = useRef(complete);
  const finished = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useLayoutEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useLayoutEffect(() => { completeRef.current = complete; }, [complete]);

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const paths = scope.current?.querySelectorAll<SVGPathElement>('.nature-growth');
      paths?.forEach(path => {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      });
      gsap.set('.nature-terminal-symbol', { opacity: 0, scale: 0.97, svgOrigin: '627 627' });
      gsap.set('.nature-terminal-border', { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set('.nature-botanical', { opacity: 0, scaleX: 0.15, scaleY: 0.5, rotation: -9 });
      gsap.set('.nature-final', { opacity: 0 });
      const sequence = gsap.timeline({ onComplete: () => {
        if (finished.current) return;
        finished.current = true;
        onCompleteRef.current();
      } });
      timeline.current = sequence;
      const tagline = scope.current?.parentElement?.querySelector('.nature-boot-tagline');
      if (tagline) sequence.fromTo(tagline, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.6 }, 3.1);
      sequence.to('.nature-terminal-symbol', { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' }, 0)
        .to('.nature-terminal-border', { strokeDashoffset: 0, duration: 0.9, ease: 'power1.inOut' }, 0.25);
      paths?.forEach((path, index) => sequence.to(path, {
        strokeDashoffset: 0, duration: growth[index].duration, ease: 'sine.inOut',
      }, growth[index].at));
      scope.current?.querySelectorAll<SVGGElement>('.nature-botanical').forEach((leaf, index) => {
        sequence.to(leaf, { opacity: 1, scaleX: 1, scaleY: 1, rotation: 0, duration: 0.8, ease: 'sine.out' }, botanicals[index].at);
      });
      // Resolve reveal-mask edges to the approved final composition after growth.
      sequence.to('.nature-final', { opacity: 1, duration: 0.3 }, 3.65);
      if (finished.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches || completeRef.current) sequence.progress(1).pause();
    }, scope);
    return () => { context.revert(); timeline.current = null; };
  }, [reducedMotion]);

  useLayoutEffect(() => {
    // Finish beneath the entrance's existing fade; never wait on the artwork.
    if (complete) timeline.current?.progress(1).pause();
  }, [complete]);

  return <svg ref={scope} className="nature-terminal-art" viewBox="125 125 1000 1000" aria-hidden="true" focusable="false">
    <defs>
      {/* Remove the baked-in backdrop once, before every growth/leaf/final use.
          The original raster colors and all animation geometry stay intact. */}
      <mask id={`${id}-foreground`} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254">
        <image href="/images/loader/nature-terminal-foreground.svg" width="1254" height="1254" onError={() => setArtworkFailed(true)} />
      </mask>
      <g id={`${id}-art`}>
        <image href="/images/loader/nature-terminal.webp" width="1254" height="1254" mask={`url(#${id}-foreground)`} onError={() => setArtworkFailed(true)} />
      </g>
      <mask id={`${id}-growth`} maskUnits="userSpaceOnUse" x="125" y="125" width="1000" height="1000">
        {growth.map((segment, index) => <path key={index} className="nature-growth" d={segment.d} fill="none" stroke="white" strokeWidth={segment.width} strokeLinecap="round" />)}
      </mask>
      {botanicals.map((leaf, index) => <clipPath key={index} id={`${id}-leaf-${index}`}><path d={leaf.d} /></clipPath>)}
    </defs>
    <g className="nature-terminal-symbol" fill="white">
      <path d="M370 404Q337 390 337 423V475Q337 487 351 496L546 614L341 756Q328 763 328 781V824Q328 852 351 841L640 653Q655 645 655 627V603Q655 585 640 577Z" />
      <path d="M687 758H959V825H687Z" />
    </g>
    <rect className="nature-terminal-border" x="183" y="185" width="887" height="885" rx="145" fill="none" stroke="white" strokeWidth="50" pathLength="1" />
    <use href={`#${id}-art`} mask={`url(#${id}-growth)`} />
    {botanicals.map((leaf, index) => <g key={index} className="nature-botanical" style={{ transformOrigin: leaf.origin }}>
      <use href={`#${id}-art`} clipPath={`url(#${id}-leaf-${index})`} />
    </g>)}
    <g className="nature-final" style={{ opacity: 0 }}>
      {/* The old opaque final image covered the vector approximation. Keep that
          stacking behavior with a uniform backplate instead of its noisy pixels. */}
      {!artworkFailed && <rect x="125" y="125" width="1000" height="1000" fill="#0b0e12" />}
      <use href={`#${id}-art`} />
    </g>
  </svg>;
}
