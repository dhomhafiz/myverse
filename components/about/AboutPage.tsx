'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { aboutCards } from '@/lib/about';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import ReturnToRoom from '@/components/ui/ReturnToRoom';

export default function AboutPage() {
  const { requestRoomReturn } = useExperienceNavigation();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const page = root.current;
    if (!page) return;
    const targets = page.querySelectorAll<HTMLElement>('.about-reveal');
    timeline.current?.kill();
    if (reducedMotion) {
      gsap.set(targets, { clearProps: 'all' });
      page.setAttribute('data-about-visible', '');
      return;
    }

    page.removeAttribute('data-about-visible');
    gsap.set(targets, { opacity: 0, y: 14 });
    timeline.current = gsap.timeline({
      onComplete: () => page.setAttribute('data-about-visible', ''),
    }).to(targets, { opacity: 1, y: 0, duration: 0.52, stagger: 0.075, ease: 'power2.out' });
    return () => { timeline.current?.kill(); };
  }, [reducedMotion]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (expanded) setExpanded(null);
      else requestRoomReturn();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [expanded, requestRoomReturn]);

  return (
    <main ref={root} className="about-dashboard" data-about-visible="">
      <div className="skills-backdrop" aria-hidden="true" />
      <div className="skills-content">
        <header className="skills-header">
          <div className="skills-brand about-reveal">
            <p className="skills-eyebrow">MYVERSE / ABOUT</p>
            <span className="skills-online"><i aria-hidden="true" /> ONLINE</span>
          </div>
          <nav aria-label="Return to workspace" className="skills-return about-reveal">
            <ReturnToRoom />
          </nav>
          <h1 ref={heading} tabIndex={-1} className="skills-title about-reveal">ABOUT ME<span>_</span></h1>
          <p className="skills-subtitle about-reveal">THE PERSON BEHIND THE CODE</p>
        </header>

        <section className="skills-section" aria-labelledby="about-section-title">
          <div className="skills-section-heading about-reveal">
            <h2 id="about-section-title">A LITTLE CONTEXT</h2>
            <p>OPEN A CARD TO READ MORE</p>
          </div>
          <div className="skills-grid">
            {aboutCards.map((card, index) => {
              const isExpanded = expanded === card.id;
              const detailsId = `about-context-${card.id}`;
              return (
                <article className={`skill-card about-reveal${isExpanded ? ' is-expanded' : ''}`} key={card.id}>
                  <button
                    className="skill-card-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    onClick={() => setExpanded(current => current === card.id ? null : card.id)}
                  >
                    <span className="skill-card-topline">
                      <span>{String(index + 1).padStart(2, '0')} / 04</span>
                      <span className="skill-card-indicator" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </span>
                    <span className="skill-category">{card.title}</span>
                    <span className="about-card-summary">{card.summary}</span>
                    <span className="skill-card-prompt">{isExpanded ? 'CLOSE DETAILS' : 'VIEW CONTEXT'}</span>
                  </button>
                  <div className="skill-context" id={detailsId} hidden={!isExpanded}>
                    <p className="skill-context-label">A LITTLE MORE</p>
                    <p>{card.details}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="skills-footer about-reveal">
          <span>MYVERSE / PERSONAL PROFILE</span>
          <span>CODE / DESIGN / CURIOSITY</span>
        </footer>
      </div>
    </main>
  );
}