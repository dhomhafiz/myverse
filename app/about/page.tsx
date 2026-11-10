import AboutPage from '@/components/about/AboutPage';
import { createPageMetadata } from '@/lib/site';

export const metadata = createPageMetadata(
  'About Me | Mohd Hafiz Abd Rahim',
  'Meet Mohd Hafiz Abd Rahim, a Kuala Lumpur-based web designer and developer focused on interactive web experiences.',
  '/about/',
);

export default function AboutRoute() {
  return <AboutPage />;
}