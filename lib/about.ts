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
