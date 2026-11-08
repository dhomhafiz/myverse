export type CompanionLanguage = 'en' | 'ms';

export type CompanionSuggestion = {
  id: 'about' | 'experience' | 'skills' | 'projects' | 'hiring' | 'contact';
  label: Record<CompanionLanguage, string>;
  question: Record<CompanionLanguage, string>;
};

export const companionSuggestions = [
  {
    id: 'about',
    label: { en: 'About Hafiz', ms: 'Tentang Hafiz' },
    question: {
      en: 'Tell me about Hafiz and his background.',
      ms: 'Ceritakan tentang Hafiz dan latar belakangnya.',
    },
  },
  {
    id: 'experience',
    label: { en: 'Experience', ms: 'Pengalaman' },
    question: {
      en: "What is Hafiz's professional development experience?",
      ms: 'Apakah pengalaman profesional Hafiz dalam pembangunan perisian?',
    },
  },
  {
    id: 'skills',
    label: { en: 'Tech Stack', ms: 'Kemahiran' },
    question: {
      en: 'What technologies does Hafiz specialize in?',
      ms: 'Apakah teknologi dan kemahiran utama Hafiz?',
    },
  },
  {
    id: 'projects',
    label: { en: 'Projects', ms: 'Projek' },
    question: {
      en: 'What projects has Hafiz worked on?',
      ms: 'Apakah projek yang pernah Hafiz bangunkan?',
    },
  },
  {
    id: 'hiring',
    label: { en: 'Hire Hafiz', ms: 'Upah Hafiz' },
    question: {
      en: 'Can I hire Hafiz for a website or software project?',
      ms: 'Bolehkah saya mengupah Hafiz untuk projek laman web atau perisian?',
    },
  },
  {
    id: 'contact',
    label: { en: 'Contact Hafiz', ms: 'Hubungi Hafiz' },
    question: {
      en: 'How can I contact Hafiz?',
      ms: 'Bagaimana saya boleh menghubungi Hafiz?',
    },
  },
] satisfies readonly CompanionSuggestion[];
