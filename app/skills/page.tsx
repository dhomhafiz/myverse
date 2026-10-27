import type { Metadata } from 'next';
import SkillsDashboard from '@/components/skills/SkillsDashboard';

export const metadata: Metadata = {
  title: 'Skills — Mohd Hafiz',
  description: 'The technologies used to build the MyVerse interactive portfolio.',
  alternates: { canonical: '/skills' },
};

export default function SkillsPage() {
  return <SkillsDashboard />;
}
