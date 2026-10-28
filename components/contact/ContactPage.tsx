'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { contactMethods, contactSocialLinks } from '@/lib/contact';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import useReducedMotion from '@/hooks/useReducedMotion';
import ReturnToRoom from '@/components/ui/ReturnToRoom';
import LiquidSodaBackground from '@/components/ui/LiquidSodaBackground';
import ContactCard from './ContactCard';

export default function ContactPage() {
  const { requestRoomReturn } = useExperienceNavigation();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const page = root.current;
    if (!page) return;
    const targets = page.querySelectorAll<HTMLElement>('.contact-reveal:not(.contact-card-entrance)');
    const cards = page.querySelectorAll<HTMLElement>('.contact-card-entrance');
    timeline.current?.kill();
    if (reducedMotion) {
      gsap.set([ ...targets, ...cards ], { clearProps: 'all' });
      page.setAttribute('data-contact-visible', '');
      return;
    }

    page.removeAttribute('data-contact-visible');
    gsap.set(targets, { opacity: 0, y: 14 });
    timeline.current = gsap.timeline({
      onComplete: () => page.setAttribute('data-contact-visible', ''),
    }).to(targets, { opacity: 1, y: 0, duration: .38, stagger: .035, ease: 'power2.out' }, 0)
      .fromTo(cards, { opacity: .65, y: 12 }, { opacity: 1, y: 0, duration: .42, stagger: .075, ease: 'power2.out' }, .12);
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
      <LiquidSodaBackground className="contact-liquid" area={root} interactionReadyAttribute="data-contact-visible" viewport />
      <div className="contact-content">
        <header className="contact-header">
          <div className="contact-brand skills-brand contact-reveal">
            <p className="contact-eyebrow">MYVERSE / CONTACT</p>
            <span className="skills-online"><i aria-hidden="true" /> ONLINE</span>
          </div>
          <nav aria-label="Return to workspace" className="contact-return contact-reveal">
            <ReturnToRoom size="prominent" />
          </nav>
        </header>

        <section className="contact-main" aria-labelledby="contact-title">
          <div className="contact-hero">
            <p className="contact-kicker contact-reveal">START A CONVERSATION</p>
            <h1 ref={heading} id="contact-title" tabIndex={-1} className="contact-title contact-reveal">
              HAVE A PROJECT IN MIND?<br />
              <span>LET&apos;S BUILD SOMETHING.</span>
            </h1>
            <p className="contact-intro contact-reveal">
              Tell me a little about what you&apos;re building and what you have in mind.
              I&apos;d love to hear about it.
            </p>
            <p className="contact-availability contact-reveal">OPEN FOR ENQUIRIES</p>
          </div>

          <section className="contact-methods" aria-label="Contact methods">
            {contactMethods.map(method => (
              <div className="contact-card-entrance contact-reveal" key={method.id}>
                <ContactCard method={method} />
              </div>
            ))}
          </section>

          <nav className="contact-social-links contact-reveal" aria-label="Social profiles">
            {contactSocialLinks.map(link => (
              <a href={link.href} key={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
            ))}
          </nav>
        </section>

        <footer className="contact-footer contact-reveal">
          <span>MYVERSE / PERSONAL PORTFOLIO</span>
          <span>CONTACT / CONNECTIONS</span>
        </footer>
      </div>
    </main>
  );
}
