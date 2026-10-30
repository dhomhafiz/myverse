'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { credits } from '@/lib/credits';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import LiquidSodaBackground from '@/components/ui/LiquidSodaBackground';
import PageHeader from '@/components/ui/PageHeader';

export default function CreditsDashboard() {
  const { requestRoomReturn } = useExperienceNavigation();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [liquidActive, setLiquidActive] = useState(true);
  const reducedMotion = useReducedMotion();

  const stopLiquid = useCallback(() => setLiquidActive(false), []);
  const returnToRoom = useCallback(() => {
    stopLiquid();
    requestRoomReturn();
  }, [requestRoomReturn, stopLiquid]);

  useLayoutEffect(() => {
    const dashboard = root.current;
    if (!dashboard) return;
    const targets = dashboard.querySelectorAll<HTMLElement>('.credits-reveal');
    timeline.current?.kill();
    if (reducedMotion) {
      gsap.set(targets, { clearProps: 'all' });
      dashboard.setAttribute('data-credits-visible', '');
      return;
    }

    dashboard.removeAttribute('data-credits-visible');
    gsap.set(targets, { opacity: 0, y: 14 });
    timeline.current = gsap.timeline({
      onComplete: () => dashboard.setAttribute('data-credits-visible', ''),
    }).to(targets, { opacity: 1, y: 0, duration: 0.52, stagger: 0.075, ease: 'power2.out' });
    return () => { timeline.current?.kill(); };
  }, [reducedMotion]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.key !== 'Escape') return;
      event.preventDefault();
      if (expanded) setExpanded(null);
      else returnToRoom();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [expanded, returnToRoom]);

  return (
    <main ref={root} className="credits-dashboard" data-credits-visible="">
      <LiquidSodaBackground
        className="credits-liquid"
        area={root}
        interactionReadyAttribute="data-credits-visible"
        viewport
        enabled={liquidActive}
      />
      <div className="credits-content">
        <PageHeader label="CREDITS" className="credits-reveal" onReturn={stopLiquid} />
        <header className="credits-header">
          <h1 ref={heading} tabIndex={-1} className="skills-title credits-reveal">CREDITS<span>_</span></h1>
          <p className="skills-subtitle credits-reveal">ATTRIBUTIONS, LICENSES &amp; MODIFICATIONS</p>
          <p className="credits-intro credits-reveal">
            A record of the original creators, open licenses, and custom modifications behind the MyVerse experience.
          </p>
        </header>

        <section className="credits-section" aria-labelledby="credits-section-title">
          <div className="skills-section-heading credits-section-heading credits-reveal">
            <h2 id="credits-section-title">ASSET ATTRIBUTIONS</h2>
            <p>ORIGINAL WORK / LICENSE / MYVERSE ADAPTATION</p>
          </div>
          <div className="credits-grid">
            {credits.map(entry => {
              const isExpanded = expanded === entry.id;
              const detailsId = `credit-modifications-${entry.id}`;
              return (
                <article className={`credit-card credits-reveal${isExpanded ? ' is-expanded' : ''}`} key={entry.id}>
                  <div className="credit-card-summary">
                    <p className="credit-card-topline">{String(entry.displayOrder).padStart(2, '0')} / {String(credits.length).padStart(2, '0')}</p>
                    <h3 className="credit-card-title">{entry.assetName}</h3>
                    <dl className="credit-details">
                      <div>
                        <dt>CREATOR</dt>
                        <dd>{entry.creator}</dd>
                      </div>
                      <div>
                        <dt>LICENSE</dt>
                        <dd>
                          <a href={entry.licenseUrl} target="_blank" rel="noopener noreferrer"
                            aria-label={`${entry.licenseName} license (opens in a new tab)`}>
                            {entry.licenseShortName}
                          </a>
                          <span className="credit-license-full">{entry.licenseName}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>SOURCE</dt>
                        <dd>
                          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"
                            aria-label={`View original ${entry.originalTitle} by ${entry.creatorOrPublisher} (opens in a new tab)`}>
                            VIEW ORIGINAL {entry.assetName.toUpperCase()}
                          </a>
                        </dd>
                      </div>
                    </dl>
                    <p className="credit-attribution">{entry.attributionText}</p>
                    {entry.additionalNotice && (
                      <p className={`credit-notice${entry.id === 'gaming-pc' ? ' is-important' : ''}`}>
                        {entry.id === 'gaming-pc' && <strong>NON-ENDORSEMENT NOTICE</strong>}
                        {entry.additionalNotice}
                      </p>
                    )}
                    <p className="credit-customized">CUSTOMIZED FOR MYVERSE</p>
                    <button className="credit-toggle" type="button" aria-expanded={isExpanded} aria-controls={detailsId}
                      onClick={() => setExpanded(current => current === entry.id ? null : entry.id)}>
                      {isExpanded ? 'HIDE MODIFICATIONS' : 'VIEW MODIFICATIONS'}
                      <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </button>
                  </div>
                  <div className="credit-modifications" id={detailsId} hidden={!isExpanded}>
                    <h4>MODIFICATIONS</h4>
                    <ul>{entry.modifications.map(modification => <li key={modification}>{modification}</li>)}</ul>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="credits-footer credits-reveal">
          <span>MYVERSE / THIRD-PARTY ASSET ATTRIBUTIONS</span>
          <a href="/third-party-notices.txt">THIRD-PARTY LICENSE NOTICES</a>
          <span>FIVE VERIFIED MODELS</span>
        </footer>
      </div>
    </main>
  );
}
