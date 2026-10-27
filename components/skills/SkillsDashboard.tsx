'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { skillGroups } from '@/lib/skills';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import ReturnToRoom from '@/components/ui/ReturnToRoom';

export default function SkillsDashboard() {
  const { requestRoomReturn } = useExperienceNavigation();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  const returnToRoom = requestRoomReturn;

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

  return (
    <main ref={root} className="skills-dashboard" data-skills-visible="">
      <div className="skills-backdrop" aria-hidden="true" />
      <div className="skills-content">
        <header className="skills-header">
          <div className="skills-brand skills-reveal">
            <p className="skills-eyebrow">MYVERSE / CAPABILITIES</p>
            <span className="skills-online"><i aria-hidden="true" /> ONLINE</span>
          </div>
          <nav aria-label="Return to workspace" className="skills-return skills-reveal">
            <ReturnToRoom />
          </nav>
          <h1 ref={heading} tabIndex={-1} className="skills-title skills-reveal">SKILLS<span>_</span></h1>
          <p className="skills-subtitle skills-reveal">THE TOOLS BEHIND THE EXPERIENCE</p>
        </header>

        <section className="skills-section" aria-labelledby="skills-section-title">
          <div className="skills-section-heading skills-reveal">
            <h2 id="skills-section-title">TECH STACK</h2>
            <p>TOOLS / TECHNOLOGIES / EXPERTISE</p>
          </div>
          <div className="skills-grid">
            {skillGroups.map((group, index) => {
              const isExpanded = expanded === group.id;
              const detailsId = `skill-context-${group.id}`;
              return (
                <article className={`skill-card skills-reveal${isExpanded ? ' is-expanded' : ''}`} key={group.id}>
                  <button
                    className="skill-card-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    onClick={() => setExpanded(current => current === group.id ? null : group.id)}
                  >
                    <span className="skill-card-topline">
                      <span>{String(index + 1).padStart(2, '0')} / 04</span>
                      <span className="skill-card-indicator" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </span>
                    <span className="skill-category">{group.category}</span>
                    <span className="skill-list">
                      {group.skills.map(skill => <span className="skill-chip" key={skill}>{skill}</span>)}
                    </span>
                    <span className="skill-card-prompt">{isExpanded ? 'CLOSE DETAILS' : 'VIEW CONTEXT'}</span>
                  </button>
                  <div className="skill-context" id={detailsId} hidden={!isExpanded}>
                    <p className="skill-context-label">IMPLEMENTATION CONTEXT</p>
                    <p>{group.context}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="skills-footer skills-reveal">
          <span>MYVERSE / DEVELOPMENT ENVIRONMENT</span>
          <span>BUILT WITH THE TOOLS LISTED ABOVE</span>
        </footer>
      </div>
    </main>
  );
}
