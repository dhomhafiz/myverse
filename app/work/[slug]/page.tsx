import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { findProject, galleryProjects, projects } from '@/lib/projects';
import ProjectMedia from '@/components/work/ProjectMedia';
import ReturnToRoom from '@/components/ui/ReturnToRoom';
import ComingSoonCaseStudy from '@/components/work/ComingSoonCaseStudy';
import type { CSSProperties } from 'react';
import { createPageMetadata } from '@/lib/site';

export function generateStaticParams() {
  return projects.flatMap(project => [project.slug, ...(project.aliases ?? [])].map(slug => ({ slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const project = findProject((await params).slug);
  if (!project) return { title: 'Project not found' };
  const metadata = createPageMetadata(
    `${project.title} | Mohd Hafiz Abd Rahim`,
    project.description,
    `/work/${project.slug}/`,
    {
      type: 'article',
      image: project.image
        ? { url: project.image, alt: project.imageAlt ?? project.title }
        : undefined,
    },
  );
  return project.status === 'comingSoon'
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

export default async function CaseStudy({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const project = findProject(slug);
  if (!project) notFound();
  const projectIndex = galleryProjects.findIndex(({ slug }) => slug === project.slug);
  const previousProject = galleryProjects[(projectIndex + galleryProjects.length - 1) % galleryProjects.length];
  const nextProject = galleryProjects[(projectIndex + 1) % galleryProjects.length];
  if (project.status === 'comingSoon') return <ComingSoonCaseStudy project={project} previousProject={previousProject} />;
  return <main className="work-shell case-study" style={{ '--project-accent': project.accent } as CSSProperties}>
    <header className="work-header"><Link href="/work" className="work-link">Selected work</Link><span className="work-brand">MYVERSE<span> / CASE STUDY</span></span><nav aria-label="Return to workspace"><ReturnToRoom /></nav></header>
    <section className="case-heading"><p className="work-eyebrow">{project.heroCategory ?? project.category}</p><h1 tabIndex={-1}>{project.heroTitle ?? project.title}<span>.</span></h1>{project.heroSubtitle && <p className="case-subtitle">{project.heroSubtitle}</p>}<p>{project.description}</p>{project.location && <p className="case-location">{project.location}</p>}</section>
    <div className="case-media" style={project.imageAspectRatio ? { aspectRatio: project.imageAspectRatio } : undefined}><ProjectMedia project={project} priority sizes="88vw" /></div>
    {project.imageDisclosure && <p id={`${project.id}-image-disclosure`} className="project-image-disclosure">{project.imageDisclosure}</p>}
    <section className="case-overview"><h2>Overview</h2><div><p>{project.description}</p>{project.role && <p>Role: {project.role}</p>}{project.technologies.length > 0 && <p>Technologies used: {project.technologies.join(', ')}</p>}{project.highlights && <><h3>Implementation highlights</h3><ul>{project.highlights.map(item => <li key={item}>{item}</li>)}</ul></>}
      <div className="work-actions">{project.demo && <a href={project.demo} target="_blank" rel="noreferrer">Live Demo</a>}{project.repository && <a href={project.repository} target="_blank" rel="noreferrer">Repository</a>}</div></div></section>
    {project.sections?.map(section => <section className="case-overview" key={section.title}><h2>{section.title}</h2><div><p>{section.body}</p>{section.highlights && <ul>{section.highlights.map(item => <li key={item}>{item}</li>)}</ul>}{section.steps && <ol>{section.steps.map(item => <li key={item}>{item}</li>)}</ol>}</div></section>)}
    {project.gallery && project.gallery.length > 0 && <section className="case-project-gallery" aria-label={`${project.title} project gallery`}>{project.gallery.map(item => <figure key={item.src}><div><Image src={item.src} alt={item.alt} fill sizes="(max-width: 760px) 92vw, 44vw" /></div>{item.caption && <figcaption>{item.caption}</figcaption>}</figure>)}</section>}
    {project.references && project.references.length > 0 && <section className="case-references" aria-label="External references">{project.references.map(reference => <div key={reference.url}><span>{reference.context}</span><a href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a></div>)}</section>}
    {galleryProjects.length > 1 && <nav className="case-project-navigation" aria-label="Project navigation"><Link href={`/work/${previousProject.slug}`}>Previous project: {previousProject.title}</Link><Link href={`/work/${nextProject.slug}`}>Next Chapter: {nextProject.title}</Link></nav>}
    <footer className="case-footer"><Link href="/work" className="work-link">Back to selected work</Link><span>MOHD HAFIZ / MYVERSE</span></footer>
  </main>;
}
