import { cameraAnchors } from './room-config';

export type HotspotDestination = {
  id: string;
  route: `/${string}`;
  focusPose: keyof typeof cameraAnchors;
  transitionAnchor: string;
  returnTo: 'saved-camera' | 'home';
  loading: 'progressive';
  accessibleLabel: string;
  duration?: number;
};

export const hotspotDestinations = {
  projects: {
    id: 'left-monitor',
    route: '/work',
    focusPose: 'camera_projects',
    transitionAnchor: 'monitor_left',
    returnTo: 'saved-camera',
    loading: 'progressive',
    accessibleLabel: 'Open selected projects',
    duration: 1.15,
  },
} satisfies Record<'projects', HotspotDestination>;
