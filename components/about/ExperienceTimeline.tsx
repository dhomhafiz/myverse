import Link from 'next/link';
import { professionalExperiences } from '@/lib/about';

export default function ExperienceTimeline() {
  return (
    <section className="about-experience" aria-labelledby="about-experience-title">
      <header className="about-experience-heading">
        <p className="about-experience-eyebrow">PROFESSIONAL EXPERIENCE</p>
        <div className="about-experience-title-row">
          <h2 id="about-experience-title">MY CAREER JOURNEY<span>_</span></h2>
          <p className="about-experience-range">2013 — PRESENT</p>
        </div>
      </header>
      <ol className="about-experience-list">
        {professionalExperiences.map(experience => (
          <li className={`about-experience-item${experience.isCurrent ? ' is-current' : ''}`} key={experience.id}>
            <time className="about-experience-period">{experience.period}</time>
            <div className="about-experience-details">
              <span className="about-experience-marker" aria-hidden="true" />
              <h3>{experience.role}</h3>
              <p className="about-experience-employer">{experience.employer ?? experience.specialization}</p>
              <p className="about-experience-description">{experience.description}</p>
              {experience.projectEvidence && (
                <>
                  <p className="about-experience-project-evidence">{experience.projectEvidence}</p>
                  <Link className="about-experience-project-link" href="/work" prefetch={false}>
                    VIEW SELECTED WORK
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
