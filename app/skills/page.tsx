import SkillsDashboard from '@/components/skills/SkillsDashboard';
import { createPageMetadata } from '@/lib/site';

export const metadata = createPageMetadata(
  'Skills | Mohd Hafiz Abd Rahim',
  'Explore the web design, front-end, and interactive technologies used in Mohd Hafiz Abd Rahim’s portfolio.',
  '/skills/',
);

export default function SkillsPage() {
  return <SkillsDashboard />;
}
