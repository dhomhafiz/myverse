export type AboutCard = {
  id: string;
  title: string;
  summary: string;
  details: string;
};

export const aboutCards: AboutCard[] = [
  {
    id: 'who-i-am',
    title: 'Who I Am',
    summary: 'A developer and designer creating useful, engaging digital experiences.',
    details: 'I bring interface design and frontend engineering together to make this portfolio a place to explore, not just scroll.',
  },
  {
    id: 'my-journey',
    title: 'My Journey',
    summary: 'From software development to interactive design and immersive 3D.',
    details: 'MyVerse is where I connect coding with visual storytelling, motion, and 3D interaction—learning and refining the work as I build.',
  },
  {
    id: 'my-approach',
    title: 'My Approach',
    summary: 'Combining engineering precision with creative experimentation.',
    details: 'I prototype ideas in the browser, keep interfaces responsive and accessible, and give motion or 3D a clear purpose in the experience.',
  },
  {
    id: 'beyond-work',
    title: 'Beyond Work',
    summary: 'The interests and experiences that keep my creativity moving.',
    details: 'The guitars, bike, and gaming gear in the room are creative touchpoints. I’ll share more about those interests at the future Pegboard destination.',
  },
];

export type ProfessionalExperience = {
  id: string;
  period: string;
  role: string;
  description: string;
  projectEvidence?: string;
  isCurrent?: boolean;
} & (
  | { employer: string; specialization?: never }
  | { employer?: never; specialization: string }
);

export const professionalExperiences: ProfessionalExperience[] = [
  {
    id: 'independent-developer',
    period: '2026 — PRESENT',
    role: 'Independent Developer',
    specialization: 'Web Design & Interactive Experiences',
    description: 'Building interactive websites, creative frontend experiences and immersive 3D projects using Next.js, TypeScript, Three.js and GSAP.',
    projectEvidence: 'MyVerse immersive 3D portfolio, alongside published work in Selected Work.',
    isCurrent: true,
  },
  {
    id: 'ethereal-digital',
    period: '2024 — FEB 2026',
    role: 'Software Developer / Senior Backend Developer',
    employer: 'Ethereal Digital',
    description: 'Developed secure Spring Boot REST APIs, implemented business logic and integrated Microsoft SQL Server systems for banking and financial services.',
  },
  {
    id: 'commerce-dot-com',
    period: '2023',
    role: 'Senior Java Developer',
    employer: 'Commerce Dot Com International',
    description: 'Developed enterprise application features using Spring Boot and Angular, including production support and legacy system enhancements.',
  },
  {
    id: 'strato-solutions',
    period: '2022 — 2023',
    role: 'Java Developer / DevOps Engineer',
    employer: 'Strato Solutions',
    description: 'Developed Spring Boot APIs, Microsoft Power Platform applications and supported CI/CD workflows for enterprise systems.',
  },
  {
    id: 'djava-factory',
    period: '2019 — 2022',
    role: 'Java Developer',
    employer: 'dJava Factory',
    description: 'Developed and maintained enterprise applications across banking, government e-procurement and web platforms.',
  },
  {
    id: 'mynic',
    period: '2018 — 2019',
    role: 'Senior Developer — Backend',
    employer: 'MYNIC Berhad',
    description: 'Developed Java and Spring Boot REST APIs for domain management and customer-facing applications.',
  },
  {
    id: 'globe3-systems',
    period: '2017 — 2018',
    role: 'Software Engineer',
    employer: 'Globe3 Systems',
    description: 'Developed ERP business applications using ColdFusion, JavaScript and PostgreSQL.',
  },
  {
    id: 'pharmeng-technology',
    period: '2016 — 2017',
    role: 'Validation Engineer',
    employer: 'PharmEng Technology Malaysia',
    description: 'Worked on computer system validation and qualification documentation in pharmaceutical environments.',
  },
  {
    id: 'avanade-malaysia',
    period: '2013 — 2014',
    role: 'Analyst, Application Development',
    employer: 'Avanade Malaysia',
    description: 'Provided Level 2 application support for a timesheet system in the oil and gas sector.',
  },
];
