'use client';

import Link from 'next/link';
import { hotspotDestinations } from '@/lib/hotspot-destinations';
import { useExperienceNavigation } from './ExperienceNavigation';

const destinations = [
  { label: 'WORK', destination: hotspotDestinations.projects, icon: 'M3 4h18v12H3z M8 21h8 M12 16v5' },
  { label: 'SKILLS', destination: hotspotDestinations.skills, icon: 'm7 7-5 5 5 5 M17 7l5 5-5 5 M14 4l-4 16' },
  { label: 'ABOUT', destination: hotspotDestinations.about, icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2' },
  { label: 'BEYOND', destination: hotspotDestinations.beyond, icon: 'M7 6h10c3 0 4 3 5 10 .5 4-3 5-5 1l-1-1H8l-1 1c-2 4-5.5 3-5-1 1-7 2-10 5-10 M7 9v6 M4 12h6 M16 10h.01 M19 13h.01' },
  { label: 'CONTACT', destination: hotspotDestinations.contact, icon: 'M21 11a9 8 0 0 1-9 8 10 10 0 0 1-4-.8L3 21l1.5-5A8 8 0 0 1 3 11a9 8 0 0 1 18 0' },
] as const;

export default function MobileRoomNavigation() {
  const { navigateToDestination } = useExperienceNavigation();

  return (
    <div className="mobile-room-navigation">
      <nav className="mobile-room-navigation-panel" aria-label="Mobile room navigation"
        onPointerDown={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}>
        {destinations.map(({ label, destination, icon }) => (
          <Link key={destination.route} href={destination.route} prefetch={false}
            onClick={event => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigateToDestination(destination.route);
            }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d={icon} />
            </svg>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
