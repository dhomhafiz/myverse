import { joinEnglish, PORTFOLIO_FACTS } from './knowledge.ts';

export type PortfolioFaq =
  | { kind: 'answer'; reply: string; route: string }
  | { kind: 'information-unavailable'; reply: string; route: '/contact' };

type ReplyLanguage = 'en' | 'ms';
type FaqTopic = 'identity' | 'backend' | 'projects' | 'myverse' | 'skills' | 'contact' | 'pricing' | 'credits';

const normalize = (message: string) => message.toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const joinMalay = (values: readonly string[]) => values.length < 2
  ? values[0] ?? ''
  : `${values.slice(0, -1).join(', ')} dan ${values[values.length - 1]}`;

const MALAY_MARKERS = new Set([
  'adakah', 'apa', 'apakah', 'atau', 'belakang', 'beliau', 'berapa', 'berapakah', 'boleh',
  'ceritakan', 'dan', 'dengan', 'di', 'dimana', 'harga', 'hubungi', 'ialah', 'kemahiran',
  'laman', 'latar', 'lihat', 'maklumat', 'pembangunan', 'pereka', 'pengalaman', 'projek',
  'saya', 'siapa', 'syarikat', 'tersedia', 'untuk', 'yang', 'diterbitkan', 'aset', 'kredit',
  'lesen', 'teknologi', 'digunakan', 'menghubungi', 'bolehkah',
]);
const ENGLISH_MARKERS = new Set([
  'about', 'and', 'can', 'could', 'does', 'how', 'his', 'is', 'me', 'my', 'of',
  'please', 'tell', 'the', 'what', 'where', 'which', 'who', 'why', 'would', 'you',
]);

function requestedLanguage(text: string): ReplyLanguage | null {
  const requests: readonly [ReplyLanguage, RegExp][] = [
    ['ms', /\b(?:please )?(?:answer|reply|respond|write)\b.{0,32}\b(?:in )?(?:bahasa )?(?:malay|melayu)\b/],
    ['en', /\b(?:please )?(?:answer|reply|respond|write)\b.{0,32}\b(?:in )?(?:bahasa )?(?:english|inggeris)\b/],
    ['ms', /\b(?:sila )?(?:jawab|balas|tulis)\b.{0,32}\b(?:dalam )?(?:bahasa )?(?:melayu|malay)\b/],
    ['en', /\b(?:sila )?(?:jawab|balas|tulis)\b.{0,32}\b(?:dalam )?(?:bahasa )?(?:inggeris|english)\b/],
  ];
  return requests.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function detectLanguage(text: string): ReplyLanguage {
  const explicit = requestedLanguage(text);
  if (explicit) return explicit;

  const words = new Set(text.split(' '));
  const malayScore = [...words].filter(word => MALAY_MARKERS.has(word)).length;
  const englishScore = [...words].filter(word => ENGLISH_MARKERS.has(word)).length;
  return malayScore > englishScore ? 'ms' : 'en';
}

function faqQuestion(text: string): string {
  return text
    .replace(/\s+(?:please )?(?:answer|reply|respond|write)\s+(?:in )?(?:bahasa )?(?:malay|melayu|english|inggeris)$/, '')
    .replace(/\s+(?:sila )?(?:jawab|balas|tulis)\s+(?:dalam )?(?:bahasa )?(?:melayu|malay|inggeris|english)$/, '')
    .trim();
}

const FAQ_PATTERNS: Record<FaqTopic, readonly RegExp[]> = {
  identity: [
    /^(?:who is (?:mohd )?hafiz(?: abd rahim)?|siapa(?:kah)? (?:mohd )?hafiz(?: abd rahim)?)$/,
  ],
  backend: [
    /^(?:what is|whats|tell me about) (?:hafizs|his) backend (?:development )?(?:experience|background)$/,
    /^(?:apa|apakah) pengalaman (?:dalam )?(?:pembangunan )?backend hafiz$/,
    /^(?:apa|apakah) latar belakang hafiz dalam (?:pembangunan )?backend$/,
    /^boleh terangkan pengalaman hafiz dalam pembangunan backend$/,
  ],
  projects: [
    /^(?:what published projects can visitors explore|what projects has hafiz published|which of hafizs projects are published)$/,
    /^(?:apakah projek yang diterbitkan|projek apa yang telah diterbitkan|projek terbitan apa yang boleh diterokai)$/,
    /^where can i (?:see|view) (?:his )?work$/,
    /^where can i find (?:his )?projects$/,
    /^show me (?:his )?projects$/,
    /^(?:di mana saya boleh (?:lihat|tengok) (?:hasil kerja|projek)|di mana boleh lihat (?:hasil kerja|projek) hafiz)$/,
  ],
  myverse: [
    /^(?:what is|whats) my ?verse$/,
    /^(?:apa itu|apakah) my ?verse$/,
  ],
  skills: [
    /^what is (?:hafizs|his) tech stack$/,
    /^what tech stack does (?:hafiz|he) use$/,
    /^(?:what|which) technologies does (?:hafiz|he) use$/,
    /^what programming languages does (?:hafiz|he) know$/,
    /^(?:what|which) technologies are listed as (?:hafizs|his) skills$/,
    /^(?:apakah|apa) teknologi yang digunakan hafiz$/,
    /^(?:apakah|apa) kemahiran teknologi hafiz$/,
    /^where can i (?:see|find) (?:his )?skills$/,
    /^where are (?:his )?skills listed$/,
    /^(?:di mana saya boleh lihat kemahiran hafiz|di mana kemahiran hafiz disenaraikan)$/,
  ],
  contact: [
    /^how (?:can i|do i) contact (?:hafiz|him)$/,
    /^where can i contact hafiz$/,
    /^(?:bagaimana saya boleh|bagaimana cara|bagaimana nak) menghubungi hafiz$/,
    /^bagaimana nak hubungi hafiz$/,
  ],
  pricing: [
    /^how much does (?:hafiz|he) charge(?: for (?:a project|a website|a web site|a 3d website|an interactive experience))?$/,
    /^what (?:are|is) (?:hafizs|his) (?:rates|pricing)$/,
    /^is hafiz available(?: for projects| (?:on|next) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week|next month))?$/,
    /^does hafiz have availability$/,
    /^can hafiz start(?: next (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month))?$/,
    /^(?:berapa|berapakah) (?:kadar|bayaran|harga|caj)(?: laman web hafiz| untuk (?:laman web|projek)(?: hafiz)?)?$/,
    /^adakah hafiz (?:tersedia|mempunyai kelapangan)$/,
    /^bolehkah hafiz mula(?: pada [a-z0-9 ]+)?$/,
  ],
  credits: [
    /^where can (?:i|visitors) (?:learn about|see) (?:the )?(?:third party )?asset credits$/,
    /^where can i see (?:the )?(?:asset )?credits$/,
    /^where are (?:the )?(?:asset )?credits(?: listed)?$/,
    /^(?:di mana saya boleh lihat|di mana) (?:kredit aset|kredit pencipta aset)$/,
    /^di mana kredit aset disenaraikan$/,
  ],
};

const FAQ_CONTENT: Record<FaqTopic, (language: ReplyLanguage) => PortfolioFaq> = {
  identity: language => ({
    kind: 'answer',
    reply: language === 'ms'
      ? `${PORTFOLIO_FACTS.identity.fullName} ialah ${PORTFOLIO_FACTS.identity.titleMs} dari ${PORTFOLIO_FACTS.identity.city}. Beliau menggabungkan reka bentuk antara muka dengan pembangunan frontend untuk menghasilkan laman web yang responsif dan interaktif. Lihat /about.`
      : `${PORTFOLIO_FACTS.identity.fullName} is a ${PORTFOLIO_FACTS.identity.city}-based ${PORTFOLIO_FACTS.identity.title}. ${PORTFOLIO_FACTS.identity.positioning} See /about.`,
    route: '/about',
  }),
  backend: language => ({
    kind: 'answer',
    reply: language === 'ms'
      ? `Pengalaman backend Hafiz yang disahkan merangkumi:\n${PORTFOLIO_FACTS.career.employers.slice(0, 4)
        .map(record => `- ${record.employer} (${record.period}), ${record.role}: ${record.responsibilities.ms} Teknologi yang disenaraikan: ${joinMalay(record.technologies)}.`)
        .join('\n')} Lihat /about.`
      : `Hafiz’s verified backend experience includes:\n${PORTFOLIO_FACTS.career.employers.slice(0, 4)
        .map(record => `- ${record.employer} (${record.period}), ${record.role}: ${record.responsibilities.en} Supported technologies: ${joinEnglish(record.technologies)}.`)
        .join('\n')} See /about.`,
    route: '/about',
  }),
  projects: language => ({
    kind: 'answer',
    reply: language === 'ms'
      ? `Kajian kes yang diterbitkan ialah ${PORTFOLIO_FACTS.projects.netflix.title}, pemasangan interaktif untuk promosi ${PORTFOLIO_FACTS.projects.netflix.campaign} oleh ${PORTFOLIO_FACTS.projects.netflix.brand} yang menggunakan ${PORTFOLIO_FACTS.projects.netflix.votingLogic} dan input fizikal. Satu lagi entri kerja ditandakan ${PORTFOLIO_FACTS.projects.comingSoon.label} dan ${PORTFOLIO_FACTS.projects.comingSoon.details}. Lihat /work.`
      : `The published case study is ${PORTFOLIO_FACTS.projects.netflix.title}, an interactive installation for ${PORTFOLIO_FACTS.projects.netflix.brand}’s ${PORTFOLIO_FACTS.projects.netflix.campaign} promotion using ${PORTFOLIO_FACTS.projects.netflix.votingLogic} and physical inputs. Another work entry is marked ${PORTFOLIO_FACTS.projects.comingSoon.label} and ${PORTFOLIO_FACTS.projects.comingSoon.details}. See /work.`,
    route: '/work',
  }),
  myverse: language => ({
    kind: 'answer',
    reply: language === 'ms'
      ? `${PORTFOLIO_FACTS.myVerse.name} ialah portfolio bilik 3D interaktif Hafiz, dibina menggunakan ${joinEnglish(PORTFOLIO_FACTS.myVerse.technologies)}. Anda sedang menerokainya sekarang.`
      : `${PORTFOLIO_FACTS.myVerse.name} is Hafiz’s immersive interactive 3D room portfolio, built with ${joinEnglish(PORTFOLIO_FACTS.myVerse.technologies)}. You are exploring it now.`,
    route: '/',
  }),
  skills: language => ({
    kind: 'answer',
    reply: language === 'ms'
      ? `Kemahiran umum Hafiz merangkumi ${joinEnglish(PORTFOLIO_FACTS.skills.general)}. Senarai ini tidak bermakna setiap teknologi digunakan dalam pekerjaan atau projek tertentu. Lihat /skills.`
      : `Hafiz’s general skills include ${joinEnglish(PORTFOLIO_FACTS.skills.general)}. This list does not imply each technology was used in a specific job or project. See /skills.`,
    route: '/skills',
  }),
  contact: language => ({
    kind: 'answer',
    reply: language === 'ms'
      ? `Anda boleh menghubungi Hafiz melalui e-mel di ${PORTFOLIO_FACTS.contact.publicEmail}. Halaman /contact turut menyediakan ${joinEnglish(PORTFOLIO_FACTS.contact.channels)}.`
      : `You can contact Hafiz by email at ${PORTFOLIO_FACTS.contact.publicEmail}. The /contact page also links to ${joinEnglish(PORTFOLIO_FACTS.contact.channels)}.`,
    route: '/contact',
  }),
  pricing: language => ({
    kind: 'information-unavailable',
    reply: language === 'ms'
      ? 'Maklumat harga dan ketersediaan semasa tidak diterbitkan dalam portfolio. Untuk pertanyaan projek, sila hubungi Hafiz melalui /contact.'
      : 'Pricing and current availability are not listed in the portfolio. For a project enquiry, please contact Hafiz at /contact.',
    route: '/contact',
  }),
  credits: language => ({
    kind: 'answer',
    reply: language === 'ms'
      ? `Halaman /credits menyenaraikan ${PORTFOLIO_FACTS.credits.attribution}.`
      : `The /credits page lists ${PORTFOLIO_FACTS.credits.attribution}.`,
    route: '/credits',
  }),
};

export function matchPortfolioFaq(message: string): PortfolioFaq | null {
  const text = normalize(message);
  const question = faqQuestion(text);
  const topic = (Object.keys(FAQ_PATTERNS) as FaqTopic[])
    .find(candidate => FAQ_PATTERNS[candidate].some(pattern => pattern.test(question)));
  return topic ? FAQ_CONTENT[topic](detectLanguage(text)) : null;
}

export type FallbackDecision =
  | { kind: 'deterministic'; reason: PortfolioFaq['kind']; reply: string; route: string }
  | { kind: 'ai-unavailable'; reply: string; retryable: true; routes: readonly ['/work', '/contact'] };

export function decideAiFallback(message: string, allowFaq = true): FallbackDecision {
  const faq = allowFaq ? matchPortfolioFaq(message) : null;
  if (faq) return { kind: 'deterministic', reason: faq.kind, reply: faq.reply, route: faq.route };
  const malay = detectLanguage(normalize(message)) === 'ms';
  return {
    kind: 'ai-unavailable',
    reply: malay
      ? 'Maaf, AI Companion tidak dapat menjawab soalan ini buat masa ini. Sila cuba lagi atau terokai /work dan /contact.'
      : 'Sorry, the AI Companion is temporarily unavailable. Please try again, or explore /work and /contact.',
    retryable: true,
    routes: ['/work', '/contact'],
  };
}
