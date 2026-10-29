'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { gsap } from 'gsap';
import { aboutCards } from '@/lib/about';
import { PROFESSIONAL_TITLE } from '@/lib/site';
import ExperienceTimeline from '@/components/about/ExperienceTimeline';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import LiquidSodaBackground from '@/components/ui/LiquidSodaBackground';
import PageHeader from '@/components/ui/PageHeader';

export default function AboutPage() {
  const { requestRoomReturn, navigateToDestination } = useExperienceNavigation();
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
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (expanded) setExpanded(null);
      else returnToRoom();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [expanded, returnToRoom]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateToDestination(href);
  };

  return (
    <main ref={root} className="about-dashboard" data-about-visible="">
      <LiquidSodaBackground
        className="about-liquid"
        area={root}
        interactionReadyAttribute="data-about-visible"
        viewport
        enabled={liquidActive}
      />
      <div className="skills-content">
        <PageHeader label="ABOUT" className="about-reveal" onReturn={stopLiquid} />

        <section className="about-hero" aria-labelledby="about-title">
          <div className="about-hero-copy about-reveal">
            <h1 ref={heading} id="about-title" tabIndex={-1} className="skills-title">ABOUT ME<span>_</span></h1>
            <p className="about-identity">{PROFESSIONAL_TITLE} / KUALA LUMPUR</p>
            <p className="about-introduction">I build interactive web experiences by combining software engineering, design and a curiosity for how things work.</p>
            <p className="about-transition">Years of building enterprise applications taught me to value structure, reliability and performance. Today, I bring that engineering foundation into creative web development — exploring interaction, motion and immersive 3D experiences without losing sight of how things work underneath.</p>
          </div>
          <figure className="about-portrait">
            <Image src="/images/about-portrait-original.png" width={1122} height={1402}
              alt="Portrait of Mohd Hafiz"
              sizes="(max-width: 760px) 200px, 301px" loading="eager" />
          </figure>
        </section>

        <section className="skills-section" aria-labelledby="about-section-title">
          <div className="skills-section-heading about-reveal">
            <h2 id="about-section-title">A LITTLE CONTEXT</h2>
          </div>
          <div className="skills-grid">
            {aboutCards.map((card, index) => {
              const isExpanded = expanded === card.id;
              const detailsId = `about-context-${card.id}`;
              const titleId = `about-title-${card.id}`;
              const actionId = `about-action-${card.id}`;
              const summaryId = `about-summary-${card.id}`;
              return (
                <article className={`skill-card about-reveal${isExpanded ? ' is-expanded' : ''}`} key={card.id}>
                  <h3 id={titleId} className="sr-only">{card.title}</h3>
                  <button
                    className="skill-card-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    aria-labelledby={`${titleId} ${actionId}`}
                    aria-describedby={summaryId}
                    onClick={() => setExpanded(current => current === card.id ? null : card.id)}
                  >
                    <span className="skill-card-topline">
                      <span>{String(index + 1).padStart(2, '0')} / 04</span>
                    </span>
                    <span className="skill-category" aria-hidden="true">{card.title}</span>
                    <span id={summaryId} className="about-card-summary">{card.summary}</span>
                    <span className="skill-card-prompt">
                      <span id={actionId}>{isExpanded ? 'CLOSE CONTEXT' : 'VIEW CONTEXT'}</span>
                      <span className="skill-card-indicator" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </span>
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

        <ExperienceTimeline />

        <section className="about-next-steps about-reveal" aria-labelledby="about-next-steps-title">
          <h2 id="about-next-steps-title">Interested in working together?</h2>
          <p>Whether it&apos;s a business website or an interactive digital experience, I&apos;d love to hear what you&apos;re building.</p>
          <div className="about-next-steps-actions">
            <Link className="about-cta about-cta--primary" href="/contact" prefetch={false}
              onClick={event => navigate(event, '/contact')}>GET IN TOUCH</Link>
            <Link className="about-cta" href="/work" prefetch={false}
              onClick={event => navigate(event, '/work')}>SEE MY WORK</Link>
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
