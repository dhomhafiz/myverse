'use client';

import { createContext, useContext } from 'react';

export type ExperienceNavigation = {
  requestRoomReturn: () => void;
};

export const ExperienceNavigationContext = createContext<ExperienceNavigation | null>(null);

export function useExperienceNavigation() {
  const value = useContext(ExperienceNavigationContext);
  if (!value) throw new Error('Room navigation must be used inside the persistent experience shell.');
  return value;
}
