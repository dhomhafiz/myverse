export type SkillGroup = {
  id: string;
  category: string;
  skills: string[];
  context: string;
  projectContext: string;
};

export const skillGroups: SkillGroup[] = [
  {
    id: 'frontend',
    category: 'Frontend Development',
    skills: ['React', 'Next.js', 'JavaScript', 'TypeScript'],
    context: 'React and TypeScript support the interface, Next.js provides App Router pages, and JavaScript powers the static-export helper script.',
    projectContext: 'MyVerse’s shared ExperienceShell coordinates room readiness and direct navigation between accessible HTML destination pages.',
  },
  {
    id: 'three-dimensional',
    category: '3D & Interactive',
    skills: ['Three.js', 'React Three Fiber', 'Drei'],
    context: 'Three.js provides the scene, React Three Fiber connects it to React, and Drei supplies GLB loading helpers.',
    projectContext: 'RoomCanvas renders the room models; CameraRig manages camera poses, while interactive hotspots connect the room to HTML destinations.',
  },
  {
    id: 'motion',
    category: 'Motion & Styling',
    skills: ['GSAP', 'CSS', 'Tailwind CSS'],
    context: 'GSAP sequences motion, CSS defines responsive layouts and interaction states, and Tailwind CSS is integrated through the PostCSS styling pipeline.',
    projectContext: 'MyVerse uses GSAP for camera transitions and destination reveals, with CSS for card disclosures, focus indicators and responsive page layouts.',
  },
  {
    id: 'workflow',
    category: 'Development Tools',
    skills: ['Git', 'GitHub', 'ESLint'],
    context: 'Git tracks source changes, the project repository is hosted on GitHub, and ESLint checks the JavaScript and TypeScript code.',
    projectContext: 'MyVerse’s npm scripts run TypeScript validation and ESLint checks; Git and the GitHub repository keep source changes available for review.',
  },
];
