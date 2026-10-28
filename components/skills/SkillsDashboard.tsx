'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { skillGroups } from '@/lib/skills';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import LiquidSodaBackground from '@/components/ui/LiquidSodaBackground';
import ReturnToRoom from '@/components/ui/ReturnToRoom';

export default function SkillsDashboard() {
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
    const dashboard = root.current;
    if (!dashboard) return;
    const targets = dashboard.querySelectorAll<HTMLElement>('.skills-reveal');
    timeline.current?.kill();
    if (reducedMotion) {
      gsap.set(targets, { clearProps: 'all' });
      dashboard.setAttribute('data-skills-visible', '');
      return;
    }

    dashboard.removeAttribute('data-skills-visible');
    gsap.set(targets, { opacity: 0, y: 14 });
    timeline.current = gsap.timeline({
      onComplete: () => dashboard.setAttribute('data-skills-visible', ''),
    }).to(targets, { opacity: 1, y: 0, duration: 0.52, stagger: 0.075, ease: 'power2.out' });
    return () => { timeline.current?.kill(); };
  }, [reducedMotion]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (expanded) setExpanded(null);
        else returnToRoom();
      }
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
    <main ref={root} className="skills-dashboard" data-skills-visible="">
      <LiquidSodaBackground
        className="skills-liquid"
        area={root}
        interactionReadyAttribute="data-skills-visible"
        viewport
        enabled={liquidActive}
      />
      <div className="skills-content">
        <header className="skills-header">
          <div className="skills-brand skills-reveal">
            <p className="skills-eyebrow">MYVERSE / CAPABILITIES</p>
            <span className="skills-online"><i aria-hidden="true" /> ONLINE</span>
          </div>
          <nav aria-label="Return to workspace" className="skills-return skills-reveal">
            <ReturnToRoom size="prominent" onActivate={stopLiquid} />
          </nav>
          <h1 ref={heading} id="skills-title" tabIndex={-1} className="skills-title skills-reveal">SKILLS<span>_</span></h1>
          <p className="skills-subtitle skills-reveal">Tools I use to build interactive, performant web experiences — from application logic to immersive 3D interfaces.</p>
        </header>

        <section className="skills-section" aria-labelledby="skills-section-title">
          <div className="skills-section-heading skills-reveal">
            <h2 id="skills-section-title">TECH STACK</h2>
          </div>
          <div className="skills-grid">
            {skillGroups.map((group, index) => {
              const isExpanded = expanded === group.id;
              const detailsId = `skill-context-${group.id}`;
              const titleId = `skill-title-${group.id}`;
              const actionId = `skill-action-${group.id}`;
              const tagsId = `skill-tags-${group.id}`;
              return (
                <article className={`skill-card skills-reveal${isExpanded ? ' is-expanded' : ''}`} key={group.id}>
                  <h3 id={titleId} className="sr-only">{group.category}</h3>
                  <button
                    className="skill-card-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    aria-labelledby={`${titleId} ${actionId}`}
                    aria-describedby={tagsId}
                    onClick={() => setExpanded(current => current === group.id ? null : group.id)}
                  >
                    <span className="skill-card-topline">
                      <span>{String(index + 1).padStart(2, '0')} / 04</span>
                    </span>
                    <span className="skill-category" aria-hidden="true">{group.category}</span>
                    <span className="skill-list" id={tagsId}>
                      {group.skills.map(skill => <span className="skill-chip" key={skill}>{skill}</span>)}
                    </span>
                    <span className="skill-card-prompt">
                      <span id={actionId}>{isExpanded ? 'CLOSE CONTEXT' : 'VIEW CONTEXT'}</span>
                      <span className="skill-card-indicator" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </span>
                  </button>
                  <div className="skill-context" id={detailsId} hidden={!isExpanded}>
                    <p className="skill-context-label">IMPLEMENTATION CONTEXT</p>
                    <p>{group.context}</p>
                    <p className="skill-context-label skills-project-label">IN MYVERSE</p>
                    <p>{group.projectContext}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="skills-next-steps skills-reveal" aria-labelledby="skills-next-steps-title">
          <h2 id="skills-next-steps-title" className="sr-only">Explore projects or get in touch</h2>
          <Link className="skills-cta skills-cta--primary" href="/work" prefetch={false}
            onClick={event => navigate(event, '/work')}>SEE MY PROJECTS</Link>
          <Link className="skills-cta" href="/contact" prefetch={false}
            onClick={event => navigate(event, '/contact')}>GET IN TOUCH</Link>
        </section>

        <footer className="skills-footer skills-reveal">
          <span>MYVERSE / DEVELOPMENT ENVIRONMENT</span>
          <span>BUILT WITH THE TOOLS LISTED ABOVE</span>
        </footer>
      </div>
    </main>
  );
}
