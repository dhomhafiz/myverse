'use client';

import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import type { Project } from '@/lib/projects';
import { roomPreparation, initialRoomPreparationSnapshot } from '@/lib/room-preparation';
import LiquidSodaBackground from '@/components/ui/LiquidSodaBackground';
import PageHeader from '@/components/ui/PageHeader';
import ProjectMedia from './ProjectMedia';

export default function ComingSoonCaseStudy({ project, previousProject }: { project: Project; previousProject?: Project }) {
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const preparation = useSyncExternalStore(roomPreparation.subscribe, roomPreparation.getSnapshot, () => initialRoomPreparationSnapshot);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  return <main ref={root} className="work-shell case-study coming-soon-page" style={{ '--project-accent': project.accent } as CSSProperties}>
    <LiquidSodaBackground className="coming-soon-liquid" area={root} viewport enabled={!preparation.returnRequested} />
    <PageHeader label="CASE STUDY" backLink={{ href: '/work', label: 'Selected work' }} returnSize="default" />
    <div className="coming-soon-content">
      <div className="coming-soon-layout">
        <section className="case-heading" aria-labelledby="coming-soon-title">
          <p className="work-eyebrow">NEXT CHAPTER / {String(project.order + 1).padStart(2, '0')}</p>
          <h1 id="coming-soon-title" ref={heading} tabIndex={-1}>{project.title}<span>_</span></h1>
          <p className="case-subtitle">{project.heroSubtitle ?? project.category}</p>
          <p>{project.heroDescription ?? project.description}</p>
          <dl className="coming-soon-details">
            <div><dt>STATUS</dt><dd>IN PROGRESS</dd></div>
            <div><dt>AVAILABILITY</dt><dd>NOT YET PUBLIC</dd></div>
          </dl>
          <div className="work-actions"><Link href="/work">Back to Projects</Link></div>
        </section>
        <div className="coming-soon-preview"><ProjectMedia project={project} /></div>
      </div>
      {previousProject && previousProject.slug !== project.slug && <nav className="case-project-navigation" aria-label="Chapter navigation">
        <Link href={`/work/${previousProject.slug}`}>Previous chapter: {previousProject.title}</Link>
      </nav>}
      <footer className="case-footer"><Link href="/work" className="work-link">Back to selected work</Link><span>MOHD HAFIZ / MYVERSE</span></footer>
    </div>
  </main>;
}
