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
    summary: "I'm Mohd Hafiz, the developer and web designer behind MyVerse.",
    details: 'I bring interface design and frontend engineering together to make this portfolio a place to explore, not just scroll.',
  },
  {
    id: 'my-journey',
    title: 'My Journey',
    summary: 'A development practice growing into interactive web experiences.',
    details: 'MyVerse is where I connect coding with visual storytelling, motion, and 3D interaction—learning and refining the work as I build.',
  },
  {
    id: 'my-approach',
    title: 'My Approach',
    summary: 'Engineering, design, interaction, and experimentation belong together.',
    details: 'I prototype ideas in the browser, keep interfaces responsive and accessible, and give motion or 3D a clear purpose in the experience.',
  },
  {
    id: 'beyond-work',
    title: 'Beyond Work',
    summary: 'Music, cycling, and playful technology bring a creative edge to my workspace.',
    details: 'The guitars, bike, and gaming gear in the room are creative touchpoints. I’ll share more about those interests at the future Pegboard destination.',
  },
];
