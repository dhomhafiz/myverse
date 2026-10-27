import type { Metadata } from 'next';
import ProjectsGallery from '@/components/work/ProjectsGallery';
export const metadata: Metadata = {
  title: 'Selected work — Mohd Hafiz',
  description: 'Explore selected projects in MyVerse.',
  alternates: { canonical: '/work' },
};
export default function WorkPage() { return <ProjectsGallery />; }
