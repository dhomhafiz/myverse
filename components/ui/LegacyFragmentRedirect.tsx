'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const legacyDestinations: Record<string, string> = {
  '#works': '/work/',
  '#contact': '/contact/',
};

export default function LegacyFragmentRedirect() {
  const router = useRouter();

  useEffect(() => {
    const destination = legacyDestinations[window.location.hash];
    if (destination) router.replace(destination);
  }, [router]);

  return null;
}
