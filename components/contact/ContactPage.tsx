'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { contactMethods, contactSocialLinks } from '@/lib/contact';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import ReturnToRoom from '@/components/ui/ReturnToRoom';

export default function ContactPage() {
  const { requestRoomReturn } = useExperienceNavigation();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const page = root.current;
    if (!page) return;
    const targets = page.querySelectorAll<HTMLElement>('.contact-reveal');
    timeline.current?.kill();
    if (reducedMotion) {
      gsap.set(targets, { clearProps: 'all' });
      page.setAttribute('data-contact-visible', '');
      return;
    }

    page.removeAttribute('data-contact-visible');
    gsap.set(targets, { opacity: 0, y: 14 });
    timeline.current = gsap.timeline({
      onComplete: () => page.setAttribute('data-contact-visible', ''),
    }).to(targets, { opacity: 1, y: 0, duration: 0.52, stagger: 0.075, ease: 'power2.out' });
    return () => { timeline.current?.kill(); };
  }, [reducedMotion]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.key !== 'Escape') return;
      event.preventDefault();
      requestRoomReturn();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [requestRoomReturn]);

  return (
    <main ref={root} className="contact-page" data-contact-visible="">
      <div className="contact-backdrop" aria-hidden="true" />
      <div className="contact-content">
        <header className="contact-header">
          <p className="contact-eyebrow contact-reveal">MYVERSE / CONTACT</p>
          <nav aria-label="Return to workspace" className="contact-return contact-reveal">
            <ReturnToRoom />
          </nav>
          <section className="contact-hero" aria-labelledby="contact-title">
            <p className="contact-kicker contact-reveal">START A CONVERSATION</p>
            <h1 ref={heading} id="contact-title" tabIndex={-1} className="contact-title contact-reveal">
              HAVE A PROJECT IN MIND?<br />
              <span>LET&apos;S BUILD SOMETHING.</span>
            </h1>
            <p className="contact-intro contact-reveal">
              Tell me a little about what you&apos;re building and what you have in mind.
              I&apos;d love to hear about it.
            </p>
          </section>
        </header>

        <section className="contact-methods" aria-label="Contact methods">
          {contactMethods.map(method => (
            <article className="contact-card contact-reveal" key={method.id}>
              <p className="contact-card-index">/ {method.id === 'email' ? '01' : '02'}</p>
              <h2>{method.title}</h2>
              <p className="contact-description">{method.description}</p>
              {method.href ? (
                <a className="contact-action" href={method.href}
                  aria-label={method.actionLabel}
                  {...(method.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {method.actionLabel}<span aria-hidden="true"> &gt;</span>
                </a>
              ) : (
                <p className="contact-unavailable">Contact details are not configured yet.</p>
              )}
            </article>
          ))}
        </section>

        <footer className="contact-footer contact-reveal">
          <span>MYVERSE / PERSONAL PORTFOLIO</span>
          {contactSocialLinks.length > 0 ? (
            <nav aria-label="Social links">
              {contactSocialLinks.map(link => (
                <a href={link.href} key={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
              ))}
            </nav>
          ) : <span>CONTACT / CONNECTIONS</span>}
        </footer>
      </div>
    </main>
  );
}
