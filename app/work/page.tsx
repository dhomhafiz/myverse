import ProjectsGallery from '@/components/work/ProjectsGallery';
import { createPageMetadata } from '@/lib/site';

export const metadata = createPageMetadata(
  'Selected Work | Mohd Hafiz Abd Rahim',
  'Explore selected interactive web and installation projects by Mohd Hafiz Abd Rahim.',
  '/work/',
);

export default function WorkPage() { return <ProjectsGallery />; }
