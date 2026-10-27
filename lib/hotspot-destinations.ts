import type { Vec3 } from './room-config';
import { cameraAnchors } from './room-config';

export type HotspotDestination = {
  id: string;
  route: `/${string}`;
  focusPose: keyof typeof cameraAnchors;
  transitionAnchor: string;
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
} satisfies Record<'projects' | 'skills', HotspotDestination>;

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
