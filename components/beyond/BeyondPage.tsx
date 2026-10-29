'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { gsap } from 'gsap';
import useReducedMotion from '@/hooks/useReducedMotion';
import { useExperienceNavigation } from '@/components/ui/ExperienceNavigation';
import LiquidSodaBackground from '@/components/ui/LiquidSodaBackground';
import PageHeader from '@/components/ui/PageHeader';
import ReturnToRoom from '@/components/ui/ReturnToRoom';

const chapters = [
  {
    number: '01',
    category: 'CYCLING',
    title: 'THE OPEN ROAD',
    supporting: 'Give me a winding road and a good climb.',
    body: ["A good climb is what I enjoy most, whether it's the Bangi–Dengkil road towards Putrajaya or Fraser's Hill on an MTB. Off-road, I ride plantation trails around Batang Kali and Kuala Kubu Bharu, or enjoy downhill sessions at PCP Putrajaya. Longer rides include a Bangi–Putrajaya gran fondo round trip and the old Karak road from Jalan Lama Gombak towards Bukit Tinggi."],
    image: '/images/beyond/beyond-cycling-noir.webp',
    imageWidth: 512,
    imageHeight: 1024,
    alt: 'A gravel bike beside a winding mountain road, framed by dark trees and misty peaks.',
    reverse: false,
  },
  {
    number: '02',
    category: 'FOOTBALL & FUTSAL',
    title: 'THE BEAUTIFUL GAME',
    supporting: 'Some passions never leave you. They just become part of who you are.',
    body: [
      "Football has always been more than just a game to me. Whether it's the intensity of futsal or watching FC Barcelona and Spain play, I've always been drawn to the skill, creativity and moments of brilliance that make football unforgettable.",
      'I grew up admiring players like Ronaldo Nazário, Ronaldinho, Rivaldo and Marc Overmars — players who could change a match with a single moment of magic. Today, I still enjoy watching talents like Lamine Yamal and Harry Kane. Different generations, different styles, but the same love for the beautiful game.',
    ],
    image: '/images/beyond/beyond_football_noir.png',
    imageWidth: 1122,
    imageHeight: 1402,
    alt: 'Black-and-white close-up of a football on a wet pitch beneath stadium floodlights.',
    reverse: true,
  },
  {
    number: '03',
    category: 'MUSIC',
    title: 'SIX STRINGS',
    supporting: 'From heavy riffs to expressive solos.',
    body: ['Metal was the soundtrack to my teenage years. These days, I lean more towards hard rock, but guitar solos still draw me in — from the melodic feel of Bon Jovi and the bluesy edge of Slash to the styles of Kirk Hammett and Marty Friedman. I enjoy playing blues- and rock-inspired solos, where every phrase has its own character.'],
    image: '/images/beyond/beyond-music-noir.webp',
    imageWidth: 512,
    imageHeight: 1024,
    alt: 'An electric guitar resting in a dim, cinematic music studio.',
    reverse: false,
  },
  {
    number: '04',
    category: 'GAMING',
    title: 'ANOTHER REALITY',
    supporting: 'Stories worth getting lost in.',
    body: ["I enjoy action games and action RPGs for their worlds, exploration and stories. Horizon, The Last of Us, Resident Evil and Red Dead Redemption 2 are some standouts; Call of Duty and Wolfenstein 3D bring a different kind of excitement and nostalgia."],
    image: '/images/beyond/beyond-gaming-noir.webp',
    imageWidth: 512,
    imageHeight: 1024,
    alt: 'A detailed game controller on a desk in front of a moody, immersive game scene.',
    reverse: true,
  },
] as const;

export default function BeyondPage() {
  const { navigateToDestination } = useExperienceNavigation();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [liquidActive, setLiquidActive] = useState(true);
  const reducedMotion = useReducedMotion();

  const stopLiquid = useCallback(() => setLiquidActive(false), []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const page = root.current;
    if (!page || reducedMotion || !('IntersectionObserver' in window)) return;

    const tweens: gsap.core.Tween[] = [];
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const target = entry.target as HTMLElement;
        observer.unobserve(target);
        const delay = Number(target.dataset.revealDelay ?? 0);
        tweens.push(gsap.fromTo(target, { opacity: 0, y: 24 }, {
          opacity: 1,
          y: 0,
          duration: 0.72,
          delay: Number.isFinite(delay) ? delay : 0,
          ease: 'power2.out',
          immediateRender: false,
        }));
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });

    page.querySelectorAll<HTMLElement>('.beyond-reveal').forEach(target => observer.observe(target));
    return () => {
      observer.disconnect();
      tweens.forEach(tween => tween.kill());
    };
  }, [reducedMotion]);

  useEffect(() => {
    const page = root.current;
    if (!page || reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const images = page.querySelectorAll<HTMLImageElement>('.beyond-artwork img');
    const moveArtwork = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * -4;
      const y = (event.clientY / window.innerHeight - 0.5) * -4;
      images.forEach(image => {
        image.style.setProperty('--beyond-parallax-x', `${x}px`);
        image.style.setProperty('--beyond-parallax-y', `${y}px`);
      });
    };
    const resetArtwork = () => {
      images.forEach(image => {
        image.style.removeProperty('--beyond-parallax-x');
        image.style.removeProperty('--beyond-parallax-y');
      });
    };

    page.addEventListener('pointermove', moveArtwork, { passive: true });
    page.addEventListener('pointerleave', resetArtwork);
    return () => {
      page.removeEventListener('pointermove', moveArtwork);
      page.removeEventListener('pointerleave', resetArtwork);
      resetArtwork();
    };
  }, [reducedMotion]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    stopLiquid();
    navigateToDestination(href);
  };

  return (
    <main ref={root} className="beyond-page" data-beyond-ready="">
      <LiquidSodaBackground
        className="beyond-liquid"
        area={root}
        interactionReadyAttribute="data-beyond-ready"
        viewport
        enabled={liquidActive}
      />
      <div className="beyond-content">
        <div className="beyond-header">
          <PageHeader label="BEYOND THE CODE" className="beyond-reveal" onReturn={stopLiquid} />
          <div className="beyond-hero-copy beyond-reveal">
            <h1 ref={heading} id="beyond-title" tabIndex={-1}>BEYOND THE CODE<span>_</span></h1>
            <p>There&apos;s more to life than lines of code. Here&apos;s a glimpse into the things that keep me curious, creative, and moving.</p>
          </div>
        </div>

        <div className="beyond-chapters">
          {chapters.map(chapter => (
            <section
              className={`beyond-chapter${chapter.reverse ? ' beyond-chapter--reverse' : ''}`}
              key={chapter.number}
              aria-labelledby={`beyond-chapter-${chapter.number}`}
            >
              <figure
                className="beyond-artwork beyond-reveal"
                data-reveal-delay="0.1"
                style={{ aspectRatio: `${chapter.imageWidth} / ${chapter.imageHeight}` }}
              >
                <Image
                  src={chapter.image}
                  width={chapter.imageWidth}
                  height={chapter.imageHeight}
                  alt={chapter.alt}
                  sizes="(max-width: 760px) min(320px, calc(100vw - 32px)), 320px"
                  loading={chapter.number === '01' ? 'eager' : 'lazy'}
                />
              </figure>
              <div className="beyond-chapter-copy beyond-reveal">
                <p className="beyond-category">{chapter.number} / {chapter.category}</p>
                <h2 id={`beyond-chapter-${chapter.number}`}>{chapter.title}<span>_</span></h2>
                <p className="beyond-supporting">{chapter.supporting}</p>
                {chapter.body.map((paragraph, index) => (
                  <p className="beyond-body" key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="beyond-closing beyond-reveal" aria-labelledby="beyond-closing-title">
          <p className="beyond-category">THE STORY CONTINUES</p>
          <h2 id="beyond-closing-title">The story doesn&apos;t stop here.</h2>
          <p className="beyond-closing-copy">These interests shape how I think, build, and create. If you&apos;d like to see that mindset in action, explore the work.</p>
          <div className="beyond-actions">
            <Link className="beyond-cta beyond-cta--primary" href="/work" prefetch={false}
              onClick={event => navigate(event, '/work')}>SEE MY WORK</Link>
            <div className="beyond-return-cta">
              <ReturnToRoom includeNavigation={false} onActivate={stopLiquid} />
            </div>
          </div>
        </section>

        <footer className="beyond-footer">
          <span>MYVERSE / PERSONAL INTERESTS</span>
          <span>CODE / CURIOSITY / CREATION</span>
        </footer>
      </div>
    </main>
  );
}
