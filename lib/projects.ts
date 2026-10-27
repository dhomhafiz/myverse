export type Project = {
  id: string; order: number; slug: string; title: string; category: string; description: string;
  technologies: string[]; accent: string; image?: string; imageAlt?: string;
  role?: string; highlights?: string[]; demo?: string; repository?: string; placeholder?: boolean;
  wordmark?: string;
  sections?: { title: string; body: string; highlights?: string[] }[];
  gallery?: { src: string; alt: string; caption?: string }[];
};
// User-authorized placeholders. Replace here with confirmed project content and media.
export const projects: Project[] = [
  { id: 'netflix', order: 0, slug: 'netflix', title: 'Netflix', category: 'Streaming experience',
    description: 'A space for the Netflix project. The story, implementation details and final imagery will be added here.',
    technologies: [], accent: '#e64146', wordmark: 'N', placeholder: true },
  { id: 'project-preview', order: 1, slug: 'project-preview', title: 'Next chapter', category: 'Project preview',
    description: 'A placeholder for another selected project. Replace this entry with your next piece of work.',
    technologies: [], accent: '#9ab7ba', placeholder: true },
];
export const galleryProjects = [...projects].sort((a, b) => a.order - b.order);
export const findProject = (slug: string) => projects.find(project => project.slug === slug);
