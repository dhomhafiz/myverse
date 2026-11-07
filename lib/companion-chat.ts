export interface ConversationProvider {
  respond(prompt: string, signal: AbortSignal): Promise<string>;
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
  if (containsAny(text, ['contact', 'hubungi', 'email', 'e mel', 'whatsapp', 'reach'])) {
    return 'You can reach Hafiz at build@dhomhafiz.dev, or use CONTACT in the room navigation for WhatsApp and social links.';
  }
  if (containsAny(text, ['project', 'projek', 'portfolio', 'work', 'kerja', 'netflix'])) {
    return 'Open WORK in the room navigation to see selected work. The published case study is a Python-based interactive voting installation for Netflix’s Squid Game 2 promotion in Kuala Lumpur. MyVerse is the interactive 3D portfolio you are exploring now.';
  }
  if (containsAny(text, ['technology', 'technologies', 'tech', 'stack', 'tools', 'framework', 'teknologi', 'guna', 'kemahiran', 'skills'])) {
    return 'The portfolio lists React, Next.js, JavaScript, TypeScript, Three.js, React Three Fiber, Drei, GSAP, CSS, and Tailwind CSS. Hafiz’s About page also describes earlier Java and Spring Boot work.';
  }
  if (containsAny(text, ['who', 'about', 'siapa', 'tentang', 'mengenai'])) {
    return 'Mohd Hafiz Abd Rahim is a Kuala Lumpur-based creative developer and web designer. He brings interface design and frontend engineering together to create useful, engaging digital experiences.';
  }
  if (containsAny(text, ['build', 'make', 'create', 'website', 'websites', 'interactive', 'bina', 'buat', 'laman', 'interaktif'])) {
    return 'Yes. Hafiz builds responsive websites and interactive frontend experiences. The portfolio highlights MyVerse, an immersive 3D room, and a published interactive voting installation.';
  }
  return 'I’m currently a demo companion, so I can only answer from a small set of portfolio topics. Try asking about Hafiz, his projects, technologies, or contact details.';
}

export const mockConversationProvider: ConversationProvider = {
  async respond(prompt, signal) {
    await responseDelay(signal);
    return answerFor(prompt);
  },
};
