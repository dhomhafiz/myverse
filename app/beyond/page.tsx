import BeyondPage from '@/components/beyond/BeyondPage';
import { createPageMetadata } from '@/lib/site';

export const metadata = createPageMetadata(
  'Beyond the Code | Mohd Hafiz Abd Rahim',
  'A glimpse into the cycling, football, music and gaming interests that keep Mohd Hafiz Abd Rahim curious, creative and moving.',
  '/beyond/',
  {
    image: {
      url: '/images/beyond/beyond-cycling-noir.webp',
      alt: 'A gravel bike on a winding mountain road in a cinematic monochrome scene.',
    },
  },
);

export default function BeyondRoute() {
  return <BeyondPage />;
}
