import type { Metadata } from 'next';
import AboutPage from '@/components/about/AboutPage';

export const metadata: Metadata = {
  title: 'About — Mohd Hafiz',
  description: 'Meet Mohd Hafiz, the developer and web designer behind MyVerse.',
  alternates: { canonical: '/about' },
};

export default function AboutRoute() {
  return <AboutPage />;
}