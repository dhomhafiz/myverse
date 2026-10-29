import Image from 'next/image';
import type { Project } from '@/lib/projects';
export default function ProjectMedia({ project, priority = false, sizes = '(max-width: 760px) 92vw, 60vw', placeholderVariant = 'default' }: { project: Project; priority?: boolean; sizes?: string; placeholderVariant?: 'default' | 'status' }) {
  if (project.status === 'comingSoon' && placeholderVariant === 'status' && project.image) return <Image src={project.image} alt={project.imageAlt ?? `${project.title} project preview`} fill sizes={sizes} preload={priority} className="project-image coming-soon-image" />;
  if (project.status === 'comingSoon' && placeholderVariant === 'status') return <div className="coming-soon-art coming-soon-art--status">
    <div className="coming-soon-grid" aria-hidden="true" />
    <span className="coming-soon-status-kicker">MYVERSE / UPCOMING</span>
    <div className="coming-soon-status-copy">
      <p className="coming-soon-status-title">IN DEVELOPMENT</p>
      <p>The next case study will appear here when it is ready.</p>
    </div>
  </div>;
  if (project.status === 'comingSoon') return <div className="project-placeholder coming-soon-art" role="img" aria-label={`Case study ${String(project.order + 1).padStart(2, '0')}: coming soon, in progress`}>
    <div className="coming-soon-grid" aria-hidden="true" />
    <span className="media-kicker">CASE STUDY {String(project.order + 1).padStart(2, '0')}</span>
    <div className="coming-soon-frame" aria-hidden="true"><span>NEW WORK LOADING</span><strong>COMING<br />SOON</strong><i /></div>
    <span className="coming-soon-caption">NEXT SELECTED WORK <small>IN PROGRESS</small></span>
  </div>;
  if (project.image) return <Image src={project.image} alt={project.imageAlt ?? `${project.title} project preview`} fill sizes={sizes} preload={priority} aria-describedby={project.imageDisclosure ? `${project.id}-image-disclosure` : undefined} unoptimized={project.imageUnoptimized} className="project-image" />;
  return <div className="project-placeholder" role="img" aria-label={`${project.title}: placeholder artwork, final screenshot pending`}>
    <div className="placeholder-grid" aria-hidden="true" /><span className="media-kicker">MYVERSE / PROJECT STUDY</span>
    <span className="media-wordmark" aria-hidden="true">{project.wordmark ?? project.title.slice(0, 1)}</span>
    <span className="media-caption">{project.title}<small>PLACEHOLDER ARTWORK · FINAL MEDIA PENDING</small></span>
  </div>;
}
