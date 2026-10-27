export type SkillGroup = {
  id: string;
  category: string;
  skills: string[];
  context: string;
};

export const skillGroups: SkillGroup[] = [
  {
    id: 'frontend',
    category: 'Frontend development',
    skills: ['Next.js', 'React', 'TypeScript'],
    context: 'Used to build App Router pages and the shared experience shell.',
  },
  {
    id: 'three-dimensional',
    category: '3D & interactive experiences',
    skills: ['Three.js', 'React Three Fiber', 'Drei'],
    context: 'Used for the persistent 3D room, its scene, and interactive camera.',
  },
  {
    id: 'motion',
    category: 'Motion & interface',
    skills: ['GSAP', 'CSS'],
    context: 'Used for camera transitions, content reveals, and responsive interface styling.',
  },
  {
    id: 'workflow',
    category: 'Development tools & workflow',
    skills: ['Tailwind CSS', 'ESLint'],
    context: 'Included in the portfolio workspace styling and linting toolchain.',
  },
];
