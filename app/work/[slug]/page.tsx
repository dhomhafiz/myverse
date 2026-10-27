import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { findProject, galleryProjects, projects } from '@/lib/projects';
import ProjectMedia from '@/components/work/ProjectMedia';
import ReturnToRoom from '@/components/ui/ReturnToRoom';
import type { CSSProperties } from 'react';
export function generateStaticParams() { return projects.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const project = findProject((await params).slug);
  if (!project) return { title: 'Project not found' };
  return { title: `${project.title} — Mohd Hafiz`, description: project.description, alternates: { canonical: `/work/${project.slug}` }, robots: project.placeholder ? { index: false, follow: true } : undefined };
}
export default async function CaseStudy({ params }: { params: Promise<{ slug: string }> }) {
  const project = findProject((await params).slug);
  if (!project) notFound();
  const projectIndex = galleryProjects.findIndex(({ slug }) => slug === project.slug);
  const previousProject = galleryProjects[(projectIndex + galleryProjects.length - 1) % galleryProjects.length];
  const nextProject = galleryProjects[(projectIndex + 1) % galleryProjects.length];
  return <main className="work-shell case-study" style={{ '--project-accent': project.accent } as CSSProperties}>
    <header className="work-header"><Link href="/work" className="work-link">Selected work</Link><span className="work-brand">MYVERSE<span> / CASE STUDY</span></span><nav aria-label="Return to workspace"><ReturnToRoom /></nav></header>
    <section className="case-heading"><p className="work-eyebrow">{project.category}</p><h1 tabIndex={-1}>{project.title}<span>.</span></h1><p>{project.description}</p>{project.placeholder && <p className="placeholder-notice">Content preview — project details and media pending.</p>}</section>
    <div className="case-media"><ProjectMedia project={project} priority /></div>
    <section className="case-overview"><h2>Overview</h2><div><p>{project.description}</p>{project.role && <p>Role: {project.role}</p>}{project.technologies.length > 0 && <p>Technologies used: {project.technologies.join(', ')}</p>}{project.highlights && <><h3>Implementation highlights</h3><ul>{project.highlights.map(item => <li key={item}>{item}</li>)}</ul></>}
      <div className="work-actions">{project.demo && <a href={project.demo} target="_blank" rel="noreferrer">Live Demo</a>}{project.repository && <a href={project.repository} target="_blank" rel="noreferrer">Repository</a>}</div></div></section>
    {project.sections?.map(section => <section className="case-overview" key={section.title}><h2>{section.title}</h2><div><p>{section.body}</p>{section.highlights && <ul>{section.highlights.map(item => <li key={item}>{item}</li>)}</ul>}</div></section>)}
    {project.gallery && project.gallery.length > 0 && <section className="case-project-gallery" aria-label={`${project.title} project gallery`}>{project.gallery.map(item => <figure key={item.src}><div><Image src={item.src} alt={item.alt} fill sizes="(max-width: 760px) 92vw, 44vw" /></div>{item.caption && <figcaption>{item.caption}</figcaption>}</figure>)}</section>}
    {galleryProjects.length > 1 && <nav className="case-project-navigation" aria-label="Project navigation"><Link href={`/work/${previousProject.slug}`}>Previous project: {previousProject.title}</Link><Link href={`/work/${nextProject.slug}`}>Next project: {nextProject.title}</Link></nav>}
    <footer className="case-footer"><Link href="/work" className="work-link">Back to selected work</Link><span>MOHD HAFIZ / MYVERSE</span></footer>
  </main>;
}
