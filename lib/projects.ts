export type Project = {
  status: 'published' | 'comingSoon';
  id: string; order: number; slug: string; title: string; category: string; description: string;
  technologies: string[]; accent: string; image?: string; imageAlt?: string; imageDisclosure?: string;
  heroTitle?: string; heroSubtitle?: string; heroCategory?: string; location?: string; imageAspectRatio?: number; imageUnoptimized?: boolean;
  role?: string; highlights?: string[]; demo?: string; repository?: string;
  wordmark?: string; ctaLabel?: string; heroDescription?: string; overview?: string; aliases?: string[];
  sections?: { title: string; body?: string; highlights?: string[]; steps?: { title: string; body: string }[]; flow?: string[] }[];
  gallery?: { src: string; alt: string; caption?: string }[];
  references?: { label: string; url: string; context: string }[];
};
export const projects: Project[] = [
  { status: 'published', id: 'netflix', order: 0, slug: 'netflix', title: 'Interactive Poll System',
    heroTitle: 'Interactive Poll System', heroSubtitle: 'Squid Game 2 Promotional Activation',
    heroDescription: 'A physical voting experience connecting audience input to a live digital counter.',
    overview: 'Developed for the Netflix Squid Game 2 promotional activation at MRT Ampang Park, Kuala Lumpur, this Python-based installation invited visitors to vote through physical inputs. Visitors could choose to continue or withdraw, with each selection reflected in an interactive voting counter.',
    category: 'Interactive Installation', heroCategory: 'Interactive Installation / Python',
    location: 'Ampang Park MRT Station — Kuala Lumpur',
    description: "A Python-based interactive voting installation developed for Netflix's Squid Game 2 promotional activation at Ampang Park MRT Station, Kuala Lumpur. Physical voting inputs let visitors choose whether to continue or withdraw, with each selection reflected in an interactive voting counter.",
    technologies: ['Python', 'Hardware Integration', 'Interactive Installation'],
    accent: '#e64146', image: '/images/selectedwork1.webp',
    imageAlt: 'AI-generated concept illustration of an interactive blue-and-red voting booth at a transit station, with two event staff members.',
    imageDisclosure: 'AI-generated concept visual. Illustrative representation, not an actual event photograph.',
    imageAspectRatio: 1672 / 941, imageUnoptimized: true,
    sections: [
      { title: 'My Contribution',
        highlights: [
          'Developed the Python voting application logic.',
          'Integrated physical voting inputs for the Continue and Withdraw choices.',
          'Implemented counter updates for each voting selection.',
        ] },
      { title: 'How It Works',
        steps: [
          { title: 'Choose', body: 'A visitor selects a voting option through the physical input.' },
          { title: 'Process', body: 'The Python application handles the selection.' },
          { title: 'Display', body: 'The counter reflects the updated voting result.' },
        ],
        flow: ['Physical Input', 'Python Application', 'Voting Counter'],
      },
    ],
    references: [{
      label: 'The Rakyat Post — Squid Game Takes Over MRT Ampang Park',
      url: 'https://www.therakyatpost.com/fun/2024/12/20/come-and-play-ddakji-squid-game-takes-over-mrt-ampang-park/',
      context: 'External event coverage',
    }],
  },
  { status: 'comingSoon', id: 'coming-soon', order: 1, slug: 'coming-soon',
    title: 'COMING SOON', category: 'NEXT SELECTED WORK', heroSubtitle: 'NEXT SELECTED WORK',
    description: 'A new case study is currently in progress and will be revealed soon.',
    heroDescription: 'This case study is currently being prepared and will be published soon.',
    ctaLabel: 'Explore next chapter', aliases: ['project-preview'],
    technologies: [], accent: '#9ab7ba' },
];
export const galleryProjects = [...projects].sort((a, b) => a.order - b.order);
export const findProject = (slug: string) => projects.find(project => project.slug === slug || project.aliases?.includes(slug));
