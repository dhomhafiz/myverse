export type CompanionHistoryMessage = { role: 'user' | 'assistant'; content: string };
export type CompanionReply = { reply: string; source: 'ai' | 'faq' | 'mock' };

export interface ConversationProvider {
  respond(prompt: string, signal: AbortSignal, history?: readonly CompanionHistoryMessage[]): Promise<CompanionReply>;
}

const responseDelay = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) {
    reject(signal.reason ?? new DOMException('The demo response was cancelled.', 'AbortError'));
    return;
  }
  const timer = globalThis.setTimeout(() => {
    signal.removeEventListener('abort', abort);
    resolve();
  }, 520);
  const abort = () => {
    globalThis.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    reject(signal.reason ?? new DOMException('The demo response was cancelled.', 'AbortError'));
  };
  signal.addEventListener('abort', abort, { once: true });
});

const containsAny = (text: string, terms: readonly string[]) => terms.some(term => text.includes(term));

function answerFor(prompt: string) {
  const text = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const isMalay = /\b(?:apakah|bagaimana|bolehkah|ceritakan|kemahiran|menghubungi|mengupah|pembangunan|pengalaman|projek|teknologi)\b/.test(text);
  if (containsAny(text, ['contact', 'hubungi', 'email', 'e mel', 'whatsapp', 'reach'])) {
    return isMalay
      ? 'Hafiz boleh dihubungi melalui build@dhomhafiz.dev, atau pilih CONTACT dalam navigasi bilik untuk WhatsApp dan pautan sosial.'
      : 'You can reach Hafiz at build@dhomhafiz.dev, or use CONTACT in the room navigation for WhatsApp and social links.';
  }
  if (containsAny(text, ['hire', 'upah', 'mengupah'])) {
    return isMalay
      ? 'Portfolio Hafiz menampilkan laman web responsif dan pengalaman frontend interaktif, termasuk MyVerse. Untuk pertanyaan projek, pilih CONTACT dalam navigasi bilik atau lawati /contact.'
      : 'Hafiz’s portfolio highlights responsive websites and interactive frontend work, including MyVerse. For a project enquiry, use CONTACT in the room navigation or visit /contact.';
  }
  if (containsAny(text, ['project', 'projek', 'portfolio', 'work', 'kerja', 'netflix'])) {
    return isMalay
      ? 'Buka WORK dalam navigasi bilik untuk melihat hasil kerja terpilih. Kajian kes yang diterbitkan ialah pemasangan undian interaktif berasaskan Python untuk promosi Squid Game 2 Netflix di Kuala Lumpur. MyVerse ialah portfolio 3D interaktif yang sedang anda terokai.'
      : 'Open WORK in the room navigation to see selected work. The published case study is a Python-based interactive voting installation for Netflix’s Squid Game 2 promotion in Kuala Lumpur. MyVerse is the interactive 3D portfolio you are exploring now.';
  }
  if (containsAny(text, ['technology', 'technologies', 'tech', 'stack', 'tools', 'framework', 'teknologi', 'kemahiran', 'skills'])) {
    return isMalay
      ? 'Portfolio ini menyenaraikan React, Next.js, JavaScript, TypeScript, Three.js, React Three Fiber, Drei, GSAP, CSS dan Tailwind CSS. Halaman About turut menerangkan pengalaman terdahulu dengan Java dan Spring Boot.'
      : 'The portfolio lists React, Next.js, JavaScript, TypeScript, Three.js, React Three Fiber, Drei, GSAP, CSS, and Tailwind CSS. Hafiz’s About page also describes earlier Java and Spring Boot work.';
  }
  if (containsAny(text, ['experience', 'pengalaman', 'development', 'pembangunan'])) {
    return isMalay
      ? 'Pengalaman Hafiz merangkumi pembangunan frontend kreatif dan reka bentuk laman web, serta pengalaman backend terdahulu dengan Java dan Spring Boot. Lihat /about untuk maklumat kerjayanya.'
      : 'Hafiz’s experience spans creative frontend development and web design, alongside earlier backend work with Java and Spring Boot. See /about for his career details.';
  }
  if (containsAny(text, ['who', 'about', 'siapa', 'tentang', 'mengenai'])) {
    return isMalay
      ? 'Mohd Hafiz Abd Rahim ialah pembangun kreatif dan pereka laman web yang berpangkalan di Kuala Lumpur. Beliau menggabungkan reka bentuk antara muka dan pembangunan frontend untuk menghasilkan pengalaman digital yang berguna dan menarik.'
      : 'Mohd Hafiz Abd Rahim is a Kuala Lumpur-based creative developer and web designer. He brings interface design and frontend engineering together to create useful, engaging digital experiences.';
  }
  if (containsAny(text, ['build', 'make', 'create', 'website', 'websites', 'interactive', 'bina', 'buat', 'laman', 'interaktif'])) {
    return isMalay
      ? 'Hafiz membangunkan laman web responsif dan pengalaman frontend interaktif. Portfolio ini menampilkan MyVerse, sebuah bilik 3D imersif, dan pemasangan undian interaktif yang diterbitkan.'
      : 'Hafiz builds responsive websites and interactive frontend experiences. The portfolio highlights MyVerse, an immersive 3D room, and a published interactive voting installation.';
  }
  return isMalay
    ? 'Saya boleh membantu dengan maklumat portfolio Hafiz yang disahkan. Cuba tanya tentang latar belakang, projek, teknologi atau cara menghubunginya.'
    : 'I can help with verified information from Hafiz’s portfolio. Try asking about his background, projects, technologies, or how to contact him.';
}

export const mockConversationProvider: ConversationProvider = {
  async respond(prompt, signal) {
    await responseDelay(signal);
    return { reply: answerFor(prompt), source: 'mock' };
  },
};
