import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { findProject, galleryProjects, projects } from '@/lib/projects';
import ProjectMedia from '@/components/work/ProjectMedia';
import PageHeader from '@/components/ui/PageHeader';
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
  if (project.status === 'comingSoon') return <ComingSoonCaseStudy project={project} previousProject={previousProject} />;
  return <main className={`work-shell case-study${project.id === 'netflix' ? ' netflix-case-study' : ''}`} style={{ '--project-accent': project.accent } as CSSProperties}>
    <PageHeader label="CASE STUDY" backLink={{ href: '/work', label: 'Selected work' }} returnSize="default" />
    <div className="case-study-content">
    <section className="case-heading" aria-labelledby="case-study-title">
      <div className="case-hero-copy"><p className="work-eyebrow">SELECTED WORK / CASE STUDY</p><h1 id="case-study-title" tabIndex={-1}>{project.heroTitle ?? project.title}<span>.</span></h1>{project.heroSubtitle && <p className="case-subtitle">{project.heroSubtitle}</p>}<p className="case-hero-introduction">{project.heroDescription ?? project.description}</p></div>
      <dl className="case-hero-meta"><div><dt>Project Type</dt><dd>{project.category}</dd></div>{project.location && <div><dt>Location</dt><dd>{project.location}</dd></div>}{project.role && <div><dt>Role</dt><dd>{project.role}</dd></div>}</dl>
    </section>
    <figure className="case-visual"><div className="case-media" style={project.imageAspectRatio ? { aspectRatio: project.imageAspectRatio } : undefined}><ProjectMedia project={project} priority sizes="88vw" /></div>
      {project.imageDisclosure && <figcaption id={`${project.id}-image-disclosure`} className="project-image-disclosure">{project.imageDisclosure}</figcaption>}
    </figure>
    <section className="case-overview"><h2>Overview</h2><div><p>{project.overview ?? project.description}</p>
      {project.technologies.length > 0 && <div className="case-technologies"><h3>Technologies Used</h3><ul>{project.technologies.map(technology => <li key={technology}>{technology}</li>)}</ul></div>}
      {project.highlights && <><h3>Implementation highlights</h3><ul>{project.highlights.map(item => <li key={item}>{item}</li>)}</ul></>}
      {(project.demo || project.repository) && <div className="work-actions">{project.demo && <a href={project.demo} target="_blank" rel="noopener noreferrer">Live Demo</a>}{project.repository && <a href={project.repository} target="_blank" rel="noopener noreferrer">Repository</a>}</div>}
    </div></section>
    {project.sections?.map(section => <section className="case-overview" key={section.title}><h2>{section.title}</h2><div>
      {section.body && <p>{section.body}</p>}
      {section.highlights && <ul className="case-contributions">{section.highlights.map(item => <li key={item}>{item}</li>)}</ul>}
      {section.steps && <ol className="case-steps" role="list">{section.steps.map((step, index) => <li key={step.title}><h3><span aria-hidden="true">{String(index + 1).padStart(2, '0')} / </span>{step.title}</h3><p>{step.body}</p></li>)}</ol>}
      {section.flow && <div className="case-system-flow" role="group" aria-label="System flow"><h3>System Flow</h3><ol role="list">{section.flow.map((label, index, flow) => <li key={label}><span>{label}</span>{index < flow.length - 1 && <span className="case-flow-arrow" aria-hidden="true">→</span>}</li>)}</ol></div>}
    </div></section>)}
    {project.gallery && project.gallery.length > 0 && <section className="case-project-gallery" aria-label={`${project.title} project gallery`}>{project.gallery.map(item => <figure key={item.src}><div><Image src={item.src} alt={item.alt} fill sizes="(max-width: 760px) 92vw, 44vw" /></div>{item.caption && <figcaption>{item.caption}</figcaption>}</figure>)}</section>}
    {project.references && project.references.length > 0 && <section className="case-references" aria-labelledby="case-evidence-title"><h2 id="case-evidence-title">Event Coverage</h2><div className="case-evidence-links"><p>Background reporting on the Squid Game 2 activation at MRT Ampang Park.</p>{project.references.map(reference => <div key={reference.url}><span>{reference.context}</span><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.label}<span className="sr-only"> (opens in a new tab)</span></a></div>)}</div></section>}
    <footer className="case-footer"><Link href="/work" className="work-link">BACK TO PROJECTS</Link><span>MOHD HAFIZ / MYVERSE</span></footer>
    </div>
  </main>;
}
