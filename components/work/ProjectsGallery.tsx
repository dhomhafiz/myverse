'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { gsap } from 'gsap';
import { galleryProjects } from '@/lib/projects';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import ProjectMedia from './ProjectMedia';
import LiquidSodaBackground from '@/components/ui/LiquidSodaBackground';
import ReturnToRoom from '@/components/ui/ReturnToRoom';

export default function ProjectsGallery() {
  const router = useRouter();
  const { requestRoomReturn } = useExperienceNavigation();
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const root = useRef<HTMLElement>(null), content = useRef<HTMLDivElement>(null), visual = useRef<HTMLAnchorElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null), locked = useRef(false), hasRevealed = useRef(false);
  const project = galleryProjects[index];
  const returnToRoom = requestRoomReturn;
  const switchProject = useCallback((direction: number) => {
    if (locked.current || galleryProjects.length < 2) return;
    locked.current = true; root.current?.removeAttribute('data-gallery-interactive'); timeline.current?.kill();
    timeline.current = gsap.timeline().to(content.current, { opacity: 0, duration: reducedMotion ? 0 : .22,
      onComplete: () => setIndex(value => (value + direction + galleryProjects.length) % galleryProjects.length) });
  }, [reducedMotion]);
  useLayoutEffect(() => {
    const gallery = root.current;
    const galleryContent = content.current;
    if (!gallery || !galleryContent) return;
    timeline.current?.kill();
    const targets = hasRevealed.current
      ? [galleryContent]
      : [
          gallery.querySelector<HTMLElement>('.work-header'),
          gallery.querySelector<HTMLElement>('.gallery-topline'),
          galleryContent,
          gallery.querySelector<HTMLElement>('.gallery-footer'),
        ].filter((target): target is HTMLElement => target !== null);
    gallery.removeAttribute('data-gallery-visible');
    gallery.removeAttribute('data-gallery-interactive');
    gsap.set(targets, { opacity: 0 });
    const markReady = () => {
      hasRevealed.current = true;
      gallery.setAttribute('data-gallery-interactive', '');
      locked.current = false;
    };
    const reveal = () => {
      gallery.setAttribute('data-gallery-visible', '');
      if (reducedMotion) {
        gsap.set(targets, { opacity: 1 });
        markReady();
        return;
      }
      timeline.current = gsap.timeline({ onComplete: markReady })
        .to(targets, { opacity: 1, duration: .55, stagger: .07, ease: 'power2.out' });
    };
    let firstFrame = 0;
    let secondFrame = 0;
    if (reducedMotion) {
      reveal();
    } else {
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(reveal);
      });
    }
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      timeline.current?.kill();
    };
  }, [index, reducedMotion]);
  useEffect(() => {
    title.current?.focus({ preventScroll: true }); router.prefetch('/');
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      if (event.key === 'Escape') { event.preventDefault(); returnToRoom(); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); switchProject(event.key === 'ArrowRight' ? 1 : -1); }
    };
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); };
  }, [router, returnToRoom, switchProject]);
  return <main ref={root} className="work-shell gallery" style={{ '--project-accent': project?.accent ?? '#aaa' } as CSSProperties}>
    {project && <LiquidSodaBackground className="gallery-liquid" project={project} area={root} media={visual} interactionReadyAttribute="data-gallery-interactive" />}
    <header className="work-header"><Link href="/" className="work-brand" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); returnToRoom(); } }}>MYVERSE<span> / SELECTED WORK</span></Link><nav aria-label="Return to workspace"><ReturnToRoom /></nav></header>
    <div className="gallery-topline"><span>INDEPENDENT DEVELOPER / KUALA LUMPUR</span><span>AN EXPLORATION OF DIGITAL EXPERIENCES</span></div>
    <div className="gallery-content" ref={content}>
      {project ? <><section className="project-info"><p className="work-eyebrow">SELECTED WORK <span>/ {String(index + 1).padStart(2, '0')}</span></p>
        <h1 tabIndex={-1} ref={title}>{project.title}<span>.</span></h1><p className="project-category">{project.category}</p><p className="project-description">{project.description}</p>
        {project.technologies.length > 0 && <ul className="project-technologies">{project.technologies.map(tech => <li key={tech}>{tech}</li>)}</ul>}
        <div className="work-actions"><Link href={`/work/${project.slug}`}>View Project</Link>{project.demo && <a href={project.demo} target="_blank" rel="noreferrer">Live Demo</a>}</div>
        {project.placeholder && <p className="placeholder-notice">CONTENT &amp; MEDIA / PLACEHOLDER PREVIEW</p>}</section>
        <div className="project-stage"><Link ref={visual} href={`/work/${project.slug}`} className="featured-project" aria-label={`View ${project.title} case study`}><ProjectMedia project={project} priority /><span className="project-frame" aria-hidden="true" /></Link><span className="stage-caption">{project.category} <span>EXPLORE THE PROJECT</span></span></div></> : <section className="project-info"><h1 ref={title} tabIndex={-1}>Work in progress.</h1><p>Project content is being prepared.</p></section>}
    </div>
    <footer className="gallery-footer"><span className="gallery-edition">A COLLECTION OF IDEAS,<br />BUILT FOR THE WEB.</span><nav aria-label="Project navigation"><button disabled={galleryProjects.length < 2} onClick={() => switchProject(-1)} aria-label="Previous Project">Previous</button><span className="project-counter" aria-live="polite" aria-atomic="true">{String(project ? index + 1 : 0).padStart(2, '0')} <span>/ {String(galleryProjects.length).padStart(2, '0')}</span></span><button disabled={galleryProjects.length < 2} onClick={() => switchProject(1)} aria-label="Next Project">Next</button></nav><span className="gallery-key-hint">USE ARROW KEYS TO EXPLORE / ESC TO RETURN</span></footer>

  </main>;
}
