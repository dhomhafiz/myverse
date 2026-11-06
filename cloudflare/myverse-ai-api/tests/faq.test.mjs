import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideAiFallback, matchPortfolioFaq } from '../src/faq.ts';

for (const [question, route, kind] of [
  ['Who is Hafiz?', '/about', 'answer'],
  ['Siapa Hafiz?', '/about', 'answer'],
  ['What is his backend experience?', '/about', 'answer'],
  ['Apa pengalaman backend Hafiz?', '/about', 'answer'],
  ["What is Hafiz's backend experience?", '/about', 'answer'],
  ['Tell me about Hafiz’s backend background.', '/about', 'answer'],
  ['Boleh terangkan pengalaman Hafiz dalam pembangunan backend?', '/about', 'answer'],
  ['What published projects can visitors explore?', '/work', 'answer'],
  ['Apakah projek yang diterbitkan?', '/work', 'answer'],
  ['Where can I see his work?', '/work', 'answer'],
  ['What is MyVerse?', '/', 'answer'],
  ['Where can I see his skills?', '/skills', 'answer'],
  ['What technologies does Hafiz use?', '/skills', 'answer'],
  ['Apakah teknologi yang digunakan Hafiz?', '/skills', 'answer'],
  ['How can I contact Hafiz?', '/contact', 'answer'],
  ['Bagaimana saya boleh menghubungi Hafiz?', '/contact', 'answer'],
  ['Where are the asset credits?', '/credits', 'answer'],
  ['Where are the asset credits listed?', '/credits', 'answer'],
  ['How much does Hafiz charge for a 3D website?', '/contact', 'information-unavailable'],
  ['How much does he charge?', '/contact', 'information-unavailable'],
  ['Is Hafiz available next Monday?', '/contact', 'information-unavailable'],
  ['Adakah Hafiz tersedia?', '/contact', 'information-unavailable'],
  ['Berapakah harga laman web Hafiz?', '/contact', 'information-unavailable'],
]) {
  test(`matches deterministic FAQ: ${question}`, () => {
    const result = matchPortfolioFaq(question);
    assert.equal(result?.route, route);
    assert.equal(result?.kind, kind);
    assert.ok(result?.reply);
  });
}

for (const question of [
  'How would Hafiz design a 3D experience for a hospital?',
  'Compare Hafiz’s backend and frontend experience.',
  'What did Hafiz learn from his previous employers?',
  'How could MyVerse be adapted into a game?',
  'Does Hafiz have experience with Kubernetes?',
  'Tell me something interesting about Hafiz’s career.',
  'What technologies did Hafiz use for the Netflix installation?',
  'Who is Hafiz and what is his backend experience?',
  "What is Hafiz's backend experience and what is MyVerse built with?",
  'Boleh terangkan pengalaman Hafiz dalam pembangunan backend dan teknologi yang pernah digunakan?',
  'What technologies does Hafiz use and how could MyVerse be adapted into a game?',
  'How much does Hafiz charge and can he deliver it by Friday?',
  'How do they compare to MyVerse?',
  'Which companies used those technologies?',
  'Ceritakan latar belakang profesional Hafiz',
  'Tell me about Hafiz’s professional background',
]) {
  test(`routes open-ended, contextual or multi-intent question to AI: ${question}`, () => {
    assert.equal(matchPortfolioFaq(question), null);
  });
}

test('known deterministic answers remain distinct from AI-generated responses', () => {
  assert.deepEqual(decideAiFallback('Where can I see his work?'), {
    kind: 'deterministic',
    reason: 'answer',
    reply: 'The published case study is Interactive Poll System, an interactive installation for Netflix’s Squid Game 2 promotion using Python voting logic and physical inputs. Another work entry is marked Coming Soon and has no published case study. See /work.',
    route: '/work',
  });
});

test('backend answer preserves employer-specific technology relationships', () => {
  const english = matchPortfolioFaq('What is Hafiz’s backend development background?');
  assert.match(english.reply, /Ethereal Digital \(2024-Feb 2026\), Software Developer \/ Senior Backend Developer/);
  assert.match(english.reply, /Supported technologies: Spring Boot, REST APIs and Microsoft SQL Server/);
  assert.match(english.reply, /Commerce Dot Com International \(2023\), Senior Java Developer/);
  assert.match(english.reply, /Supported technologies: Spring Boot and Angular/);
  assert.match(english.reply, /Strato Solutions \(2022-2023\), Java Developer \/ DevOps Engineer/);
  assert.match(english.reply, /Supported technologies: Spring Boot, Microsoft Power Platform and CI\/CD/);
  assert.match(english.reply, /MYNIC Berhad \(2018-2019\), Senior Developer - Backend/);
  assert.match(english.reply, /Supported technologies: Java, Spring Boot and REST APIs/);
  assert.doesNotMatch(english.reply, /Ethereal Digital[^\n]*Angular/);
  assert.doesNotMatch(english.reply, /scalable|high-performance/i);

  const malay = matchPortfolioFaq('Boleh terangkan pengalaman Hafiz dalam pembangunan backend?');
  assert.match(malay.reply, /^Pengalaman backend Hafiz yang disahkan/);
  assert.match(malay.reply, /Ethereal Digital \(2024-Feb 2026\)[\s\S]*?Microsoft SQL Server/);
  assert.match(malay.reply, /Commerce Dot Com International \(2023\)[\s\S]*?Spring Boot dan Angular/);
  assert.match(malay.reply, /Strato Solutions \(2022-2023\)[\s\S]*?Microsoft Power Platform dan CI\/CD/);
  assert.match(malay.reply, /MYNIC Berhad \(2018-2019\)[\s\S]*?Java, Spring Boot dan REST APIs/);
  assert.doesNotMatch(malay.reply, /pengembang|proyek|informasi|perangkat lunak|berbasis|mencakup/i);
});

test('published projects distinguish the case study from Coming Soon', () => {
  const result = matchPortfolioFaq('What published projects can visitors explore?');
  assert.match(result.reply, /Interactive Poll System/);
  assert.match(result.reply, /Coming Soon/);
  assert.match(result.reply, /no published case study/);
});

test('skills answer distinguishes general skills from technologies used in a specific project', () => {
  const result = matchPortfolioFaq('What technologies does Hafiz use?');
  assert.match(result.reply, /React, Next\.js, JavaScript, TypeScript, Three\.js/);
  assert.match(result.reply, /does not imply each technology was used in a specific job or project/);
});

test('contact answer gives the public email and Contact page', () => {
  const result = matchPortfolioFaq('How can I contact Hafiz?');
  assert.match(result.reply, /build@dhomhafiz\.dev/);
  assert.equal(result.route, '/contact');
});

test('unlisted pricing and availability are not invented', () => {
  for (const question of ['How much does Hafiz charge for a 3D website?', 'Berapakah harga laman web Hafiz?', 'Adakah Hafiz tersedia?']) {
    const result = matchPortfolioFaq(question);
    assert.equal(result.kind, 'information-unavailable');
    assert.match(result.reply, /pricing and current availability are not listed|harga dan ketersediaan semasa tidak diterbitkan/i);
    assert.equal(result.route, '/contact');
    assert.doesNotMatch(result.reply, /\$\d|available next Monday|tersedia pada/i);
  }
});

test('temporary failure fallback is friendly, retryable and points to existing routes', () => {
  for (const [message, language] of [
    ['Tell me about Hafiz’s professional background.', 'English'],
    ['Ceritakan latar belakang profesional Hafiz', 'Malay'],
  ]) {
    const result = decideAiFallback(message);
    assert.equal(result.kind, 'ai-unavailable');
    assert.equal(result.retryable, true);
    assert.deepEqual(result.routes, ['/work', '/contact']);
    assert.match(result.reply, language === 'Malay' ? /Maaf/ : /Sorry/);
  }
});

test('explicit language requests take precedence for deterministic and unavailable replies', () => {
  const malay = matchPortfolioFaq('Who is Hafiz? Please answer in Malay.');
  const english = matchPortfolioFaq('Siapa Hafiz? Sila jawab dalam bahasa Inggeris.');
  assert.match(malay.reply, /^Mohd Hafiz/);
  assert.match(english.reply, /^Mohd Hafiz/);
  assert.match(malay.reply, /ialah pembangun/);
  assert.match(english.reply, /is a Kuala Lumpur-based/);

  const unavailableMalay = decideAiFallback('Tell me about Hafiz’s professional background. Please answer in Malay.');
  const unavailableEnglish = decideAiFallback('Ceritakan latar belakang Hafiz. Sila jawab dalam bahasa Inggeris.');
  assert.match(unavailableMalay.reply, /^Maaf,/);
  assert.match(unavailableEnglish.reply, /^Sorry,/);
});

test('mixed or ambiguous text uses the deterministic English-on-tie policy', () => {
  const result = decideAiFallback('Tell me about Hafiz’s background dan pengalaman beliau');
  assert.match(result.reply, /^Sorry,/);
});

test('contextual failures do not replace the follow-up with a single-turn FAQ answer', () => {
  const result = decideAiFallback('Who is Hafiz?', false);
  assert.equal(result.kind, 'ai-unavailable');
  assert.match(result.reply, /^Sorry,/);
});
