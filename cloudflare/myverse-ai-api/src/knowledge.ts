export const KNOWLEDGE_CATEGORIES = [
  'identity',
  'approach',
  'career',
  'skills',
  'publishedProjects',
  'myVerse',
  'interests',
  'contact',
  'credits',
] as const;

export type KnowledgeCategory = typeof KNOWLEDGE_CATEGORIES[number];

export const KNOWLEDGE_TITLES: Record<KnowledgeCategory, string> = {
  identity: 'Identity',
  approach: 'Approach',
  career: 'Career',
  skills: 'Skills',
  publishedProjects: 'Published Projects',
  myVerse: 'MyVerse',
  interests: 'Interests',
  contact: 'Contact',
  credits: 'Credits',
};

export function joinEnglish(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

export const PORTFOLIO_FACTS = {
  identity: {
    fullName: 'Mohd Hafiz Abd Rahim',
    shortName: 'Hafiz',
    city: 'Kuala Lumpur',
    title: 'web designer and developer',
    titleMs: 'pereka laman web dan pembangun',
    positioning: 'He brings interface design and frontend engineering together to build responsive, accessible interfaces with purposeful motion and 3D.',
  },
  approach: 'Hafiz combines interface design and frontend engineering to create responsive, accessible web interfaces with purposeful motion and 3D.',
  career: {
    current: 'Independent Developer, Web Design & Interactive Experiences (2026-present)',
    employers: [
      {
        employer: 'Ethereal Digital',
        role: 'Software Developer / Senior Backend Developer',
        period: '2024-Feb 2026',
        technologies: ['Spring Boot', 'REST APIs', 'Microsoft SQL Server'],
        responsibilities: {
          en: 'Implemented business logic and integrated systems for banking and financial services.',
          ms: 'Melaksanakan logik perniagaan dan mengintegrasikan sistem untuk sektor perbankan dan perkhidmatan kewangan.',
        },
      },
      {
        employer: 'Commerce Dot Com International',
        role: 'Senior Java Developer',
        period: '2023',
        technologies: ['Spring Boot', 'Angular'],
        responsibilities: {
          en: 'Developed enterprise application features, including production support and legacy system enhancements.',
          ms: 'Membangunkan ciri aplikasi perusahaan, termasuk sokongan aplikasi dan penambahbaikan sistem legasi.',
        },
      },
      {
        employer: 'Strato Solutions',
        role: 'Java Developer / DevOps Engineer',
        period: '2022-2023',
        technologies: ['Spring Boot', 'Microsoft Power Platform', 'CI/CD'],
        responsibilities: {
          en: 'Developed applications and supported enterprise systems.',
          ms: 'Membangunkan aplikasi dan menyokong sistem perusahaan.',
        },
      },
      {
        employer: 'MYNIC Berhad',
        role: 'Senior Developer - Backend',
        period: '2018-2019',
        technologies: ['Java', 'Spring Boot', 'REST APIs'],
        responsibilities: {
          en: 'Worked on domain management and customer-facing applications.',
          ms: 'Membangunkan aplikasi untuk pengurusan domain dan kegunaan pelanggan.',
        },
      },
      {
        employer: 'dJava Factory',
        role: 'Java Developer',
        period: '2019-2022',
        technologies: [],
        responsibilities: {
          en: 'Developed and maintained enterprise applications across banking, government e-procurement and web platforms.',
          ms: 'Membangunkan dan menyelenggara aplikasi perusahaan dalam sektor perbankan, e-perolehan kerajaan dan platform web.',
        },
      },
      {
        employer: 'Globe3 Systems',
        role: 'Software Engineer',
        period: '2017-2018',
        technologies: ['ColdFusion', 'JavaScript', 'PostgreSQL'],
        responsibilities: {
          en: 'Developed ERP business applications.',
          ms: 'Membangunkan aplikasi perniagaan ERP.',
        },
      },
      {
        employer: 'PharmEng Technology Malaysia',
        role: 'Validation Engineer',
        period: '2016-2017',
        technologies: [],
        responsibilities: {
          en: 'Worked on computer system validation and qualification documentation in pharmaceutical environments.',
          ms: 'Mengendalikan pengesahan sistem komputer dan dokumentasi kelayakan dalam persekitaran farmaseutikal.',
        },
      },
      {
        employer: 'Avanade Malaysia',
        role: 'Analyst, Application Development',
        period: '2013-2014',
        technologies: [],
        responsibilities: {
          en: 'Provided Level 2 application support for a timesheet system in the oil and gas sector.',
          ms: 'Memberikan sokongan aplikasi Tahap 2 untuk sistem helaian masa dalam sektor minyak dan gas.',
        },
      },
    ],
  },
  skills: {
    general: ['React', 'Next.js', 'JavaScript', 'TypeScript', 'Three.js', 'React Three Fiber', 'Drei', 'GSAP', 'CSS', 'Tailwind CSS', 'Git', 'GitHub', 'ESLint'],
  },
  projects: {
    netflix: {
      title: 'Interactive Poll System',
      brand: 'Netflix',
      campaign: 'Squid Game 2',
      location: 'Ampang Park MRT Station, Kuala Lumpur',
      votingLogic: 'Python voting logic',
      inputs: 'physical Continue/Withdraw inputs',
      counter: 'voting counter',
      technologies: ['Python', 'hardware integration', 'interactive installation'],
      heroDisclosure: 'AI-generated concept illustration, not an actual event photograph',
    },
    comingSoon: {
      label: 'Coming Soon',
      details: 'has no published case study',
    },
  },
  myVerse: {
    name: 'MyVerse',
    description: 'an immersive interactive 3D room portfolio',
    technologies: ['Next.js', 'TypeScript', 'Three.js', 'React Three Fiber', 'GSAP'],
    navigation: 'WORK /work, SKILLS /skills, ABOUT /about, BEYOND /beyond, CONTACT /contact; ReturnToRoom returns to the room.',
  },
  interests: 'Cycling including climbs, MTB, trails and downhill; football and futsal, FC Barcelona and Spain; guitar, hard rock and blues/rock solos; action games and action RPGs such as Horizon, The Last of Us, Resident Evil and Red Dead Redemption 2.',
  contact: {
    publicEmail: 'build@dhomhafiz.dev',
    channels: ['WhatsApp', 'LinkedIn', 'Facebook', 'Instagram'],
    terms: 'Pricing, availability, quotations and booking details are not supplied.',
  },
  credits: {
    attribution: 'third-party asset creators, licenses and modifications',
    caution: 'Do not imply Hafiz authored all source models.',
  },
} as const;

// Verified against professionalExperiences in lib/about.ts, published by /about.
// Preserve year-only precision; do not invent start months or exact handoff dates.
// Keep this metadata outside PORTFOLIO_FACTS: historical acceptance journals hash it.
type CareerEmployer = typeof PORTFOLIO_FACTS.career.employers[number]['employer'];
export const CAREER_DATES = {
  'Ethereal Digital': { startYear: 2024, endYear: 2026, endMonth: 2 },
  'Commerce Dot Com International': { startYear: 2023, endYear: 2023 },
  'Strato Solutions': { startYear: 2022, endYear: 2023 },
  'MYNIC Berhad': { startYear: 2018, endYear: 2019 },
  'dJava Factory': { startYear: 2019, endYear: 2022 },
  'Globe3 Systems': { startYear: 2017, endYear: 2018 },
  'PharmEng Technology Malaysia': { startYear: 2016, endYear: 2017 },
  'Avanade Malaysia': { startYear: 2013, endYear: 2014 },
} as const satisfies Record<CareerEmployer, { startYear: number; endYear: number; endMonth?: number }>;
export const CURRENT_CAREER_DATES = { startYear: 2026, endYear: null } as const;
export const CAREER_TIMELINE = PORTFOLIO_FACTS.career.employers
  .map(record => ({ ...record, ...CAREER_DATES[record.employer] }))
  .sort((a, b) => a.startYear - b.startYear || a.endYear - b.endYear);

const careerChronology = [
  ...CAREER_TIMELINE.map(({ role, employer, period }) => `${role} at ${employer} (${period})`),
  PORTFOLIO_FACTS.career.current,
].join('; ');
function formatEmployerFact(record: typeof CAREER_TIMELINE[number]): string {
  const technologies = record.technologies.length > 0
    ? `Explicitly supported technologies: ${joinEnglish(record.technologies)}.`
    : 'The approved role description does not specify technologies.';
  return `${record.employer} — ${record.role} (${record.period}): ${record.responsibilities.en} ${technologies}`;
}
const careerEmployerFacts = CAREER_TIMELINE.map(record => ({
  employer: record.employer,
  id: `career:${record.employer.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  category: 'career' as const,
  content: formatEmployerFact(record),
  focusedContent: `${record.employer} — ${record.role} (${record.period}). Verified technologies: ${joinEnglish(record.technologies)}.`,
}));
const employerFacts = careerEmployerFacts.map(record => record.content).join(' ');
const generalSkills = joinEnglish(PORTFOLIO_FACTS.skills.general);
const projectTechnologies = joinEnglish(PORTFOLIO_FACTS.projects.netflix.technologies);
const myVerseTechnologies = joinEnglish(PORTFOLIO_FACTS.myVerse.technologies);

export const KNOWLEDGE: Record<KnowledgeCategory, readonly string[]> = {
  identity: [
    `Public identity [lib/site.ts; app/about/page.tsx; /about]: ${PORTFOLIO_FACTS.identity.fullName} (${PORTFOLIO_FACTS.identity.shortName}) is a ${PORTFOLIO_FACTS.identity.city}-based ${PORTFOLIO_FACTS.identity.title}. ${PORTFOLIO_FACTS.identity.positioning}`,
  ],
  approach: [
    `Approach [lib/about.ts; /about]: ${PORTFOLIO_FACTS.approach} Describe this as his approach, not as proof of a particular employer or project outcome.`,
  ],
  career: [
    `Career chronology [lib/about.ts; /about], oldest-first by verified start year: ${careerChronology}. Preserve this chronology. Year-only dates and overlapping years do not establish exact transitions; use neutral dated descriptions, not "began at" or "later joined". Job titles and general skills alone do not verify an employer-specific technology.`,
    `Verified employer records [lib/about.ts; /about]: ${employerFacts} Do not assign a technology to an employer unless it is explicitly listed in that employer's record.`,
  ],
  skills: [
    `General skills [lib/skills.ts; /skills]: ${generalSkills}. This general skills list does not establish use at a particular employer or in a published project.`,
  ],
  publishedProjects: [
    `Netflix Squid Game 2 Interactive Poll System [lib/projects.ts; /work and /work/netflix]: The published installation was developed for the ${PORTFOLIO_FACTS.projects.netflix.brand} ${PORTFOLIO_FACTS.projects.netflix.campaign} promotional activation at ${PORTFOLIO_FACTS.projects.netflix.location}. It used ${PORTFOLIO_FACTS.projects.netflix.votingLogic} and ${PORTFOLIO_FACTS.projects.netflix.inputs} integrated with a ${PORTFOLIO_FACTS.projects.netflix.counter}. Technologies: ${projectTechnologies}. Keep this project distinct from MyVerse. Its case-study hero is an ${PORTFOLIO_FACTS.projects.netflix.heroDisclosure}.`,
    `Other published-work entry [lib/projects.ts; /work]: The other work entry is marked ${PORTFOLIO_FACTS.projects.comingSoon.label} and ${PORTFOLIO_FACTS.projects.comingSoon.details}.`,
  ],
  myVerse: [
    `MyVerse architecture [lib/about.ts; lib/skills.ts; /]: ${PORTFOLIO_FACTS.myVerse.name} is ${PORTFOLIO_FACTS.myVerse.description} built with ${myVerseTechnologies}. These technologies describe MyVerse, not the Netflix installation or any employer role unless separately specified above.`,
    `Portfolio navigation: ${PORTFOLIO_FACTS.myVerse.navigation}`,
  ],
  interests: [
    `Personal interests [components/beyond/BeyondPage.tsx; /beyond]: ${PORTFOLIO_FACTS.interests}`,
  ],
  contact: [
    `Contact and collaboration [lib/contact.ts; /contact]: Public email ${PORTFOLIO_FACTS.contact.publicEmail}. The Contact page provides ${joinEnglish(PORTFOLIO_FACTS.contact.channels)} links. Direct visitors there for project enquiries and collaboration. ${PORTFOLIO_FACTS.contact.terms}`,
  ],
  credits: [
    `Credits and asset attribution [lib/credits.ts; app/credits/page.tsx; /credits]: The Credits page acknowledges ${PORTFOLIO_FACTS.credits.attribution} for room assets. ${PORTFOLIO_FACTS.credits.caution}`,
  ],
};

export type KnowledgeProfile = 'focused-career';
export type SelectedKnowledgeRecord = {
  id: string;
  category: KnowledgeCategory;
  content: string;
};

const FOCUSED_CAREER_EMPLOYERS = new Set([
  'MYNIC Berhad',
  'Strato Solutions',
  'Commerce Dot Com International',
  'Ethereal Digital',
]);

export function selectKnowledgeRecords(
  categories: readonly KnowledgeCategory[],
  profile?: KnowledgeProfile,
): SelectedKnowledgeRecord[] {
  return KNOWLEDGE_CATEGORIES
    .filter(category => categories.includes(category))
    .flatMap(category => {
      if (profile === 'focused-career' && category === 'career') {
        return [
          ...careerEmployerFacts
            .filter(record => FOCUSED_CAREER_EMPLOYERS.has(record.employer))
            .map(({ id, category: recordCategory, focusedContent }) => ({
              id,
              category: recordCategory,
              content: focusedContent,
            })),
          {
            id: 'career:independent-developer',
            category,
            content: PORTFOLIO_FACTS.career.current,
          },
        ];
      }
      if (profile === 'focused-career' && category === 'myVerse') {
        return [{ id: 'myVerse:architecture', category, content: KNOWLEDGE.myVerse[0] }];
      }
      return KNOWLEDGE[category].map((content, index) => ({
        id: `${category}:${index + 1}`,
        category,
        content,
      }));
    });
}

export function formatKnowledgeRecords(records: readonly SelectedKnowledgeRecord[]): string {
  return KNOWLEDGE_CATEGORIES
    .map(category => {
      const selected = records.filter(record => record.category === category);
      if (selected.length === 0) return '';
      return `${KNOWLEDGE_TITLES[category]}:\n${selected.map(record => `- ${record.content}`).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function formatKnowledge(
  categories: readonly KnowledgeCategory[],
  profile?: KnowledgeProfile,
): string {
  const records = selectKnowledgeRecords(categories, profile);
  const formatted = formatKnowledgeRecords(records);
  return profile === 'focused-career' && categories.includes('career')
    ? formatted.replace('Career:\n', 'Career (selected relevant experience; not a complete timeline):\n')
    : formatted;
}

export const ALL_KNOWLEDGE = formatKnowledge(KNOWLEDGE_CATEGORIES);
