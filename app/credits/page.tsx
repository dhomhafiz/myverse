import type { Metadata } from 'next';
import CreditsDashboard from '@/components/credits/CreditsDashboard';

export const metadata: Metadata = {
  title: 'Credits — Mohd Hafiz',
  description: 'Creators, sources, licenses, and modifications behind the MyVerse experience.',
  alternates: { canonical: '/credits' },
};

export default function CreditsPage() {
  return <CreditsDashboard />;
}
