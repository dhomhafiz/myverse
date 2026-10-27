import Image from 'next/image';
import type { Project } from '@/lib/projects';
export default function ProjectMedia({ project, priority = false }: { project: Project; priority?: boolean }) {
  if (project.image) return <Image src={project.image} alt={project.imageAlt ?? `${project.title} project preview`} fill sizes="(max-width: 760px) 92vw, 60vw" priority={priority} className="project-image" />;
  return <div className="project-placeholder" role="img" aria-label={`${project.title}: placeholder artwork, final screenshot pending`}>
    <div className="placeholder-grid" aria-hidden="true" /><span className="media-kicker">MYVERSE / PROJECT STUDY</span>
    <span className="media-wordmark" aria-hidden="true">{project.wordmark ?? project.title.slice(0, 1)}</span>
    <span className="media-caption">{project.title}<small>PLACEHOLDER ARTWORK · FINAL MEDIA PENDING</small></span>
  </div>;
}
