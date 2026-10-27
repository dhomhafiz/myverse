import type { Vec3 } from './room-config';
import { cameraAnchors, phone } from './room-config';

export type HotspotDestination = {
  id: string;
  route: `/${string}`;
  focusPose: keyof typeof cameraAnchors;
  transitionAnchor: string;
  activationAnchors?: readonly string[];
  outlineTargets?: readonly string[];
  beaconAnchor: string;
  beaconPosition: Vec3;
  caption: string;
  returnTo: 'saved-camera' | 'home';
  loading: 'progressive';
  accessibleLabel: string;
  focusFov: { desktop: number; mobile: number };
  duration?: number;
};

export const hotspotDestinations = {
  projects: {
    id: 'left-monitor',
    route: '/work',
    focusPose: 'camera_projects',
    transitionAnchor: 'monitor_left',
    beaconAnchor: 'screen_left_anchor',
    beaconPosition: [0, 0.48, 0.04],
    caption: 'View My Works',
    returnTo: 'saved-camera',
    loading: 'progressive',
    accessibleLabel: 'Open selected projects',
    focusFov: { desktop: 46, mobile: 65 },
    duration: 1.15,
  },
  skills: {
    id: 'right-monitor',
    route: '/skills',
    focusPose: 'camera_skills',
    transitionAnchor: 'monitor_right',
    beaconAnchor: 'screen_right_anchor',
    beaconPosition: [0, 0.48, 0.04],
    caption: 'Explore My Skills',
    returnTo: 'saved-camera',
    loading: 'progressive',
    accessibleLabel: 'Explore skills and technologies',
    focusFov: { desktop: 46, mobile: 65 },
    duration: 1.15,
  },
  about: {
    id: 'guitar-wall',
    route: '/about',
    focusPose: 'camera_about',
    transitionAnchor: 'guitar_01',
    activationAnchors: ['guitar_01', 'guitar_02'],
    outlineTargets: ['guitar_01', 'guitar_02'],
    beaconAnchor: 'guitar_wall',
    beaconPosition: [-1.87, 2.42, 0.1],
    caption: 'GET TO KNOW ME',
    returnTo: 'saved-camera',
    loading: 'progressive',
    accessibleLabel: 'Learn about Mohd Hafiz',
    focusFov: { desktop: 46, mobile: 72 },
    duration: 1.15,
  },
  contact: {
    id: 'iphone',
    route: '/contact',
    focusPose: 'camera_contact',
    transitionAnchor: phone.name,
    outlineTargets: [phone.name],
    beaconAnchor: phone.hotspotAnchor.name,
    beaconPosition: [0, 0, 0],
    caption: "LET'S CONNECT",
    returnTo: 'saved-camera',
    loading: 'progressive',
    accessibleLabel: 'Open contact information',
    focusFov: { desktop: 46, mobile: 72 },
    duration: 1.15,
  },
} satisfies Record<'projects' | 'skills' | 'about' | 'contact', HotspotDestination>;

export function getHotspotDestination(id: string | null | undefined) {
  return Object.values(hotspotDestinations).find(destination => destination.id === id) ?? hotspotDestinations.projects;
}

export function getHotspotDestinationForRoute(pathname: string) {
  return Object.values(hotspotDestinations).find(destination =>
    pathname === destination.route || (destination.route === '/work' && pathname.startsWith('/work/')),
  ) ?? hotspotDestinations.projects;
}

export function isHotspotDestinationRoute(pathname: string) {
  return Object.values(hotspotDestinations).some(destination =>
    pathname === destination.route || (destination.route === '/work' && pathname.startsWith('/work/')),
  );
}
