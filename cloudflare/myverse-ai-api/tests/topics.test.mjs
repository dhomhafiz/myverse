import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_KNOWLEDGE, KNOWLEDGE, KNOWLEDGE_CATEGORIES, PORTFOLIO_FACTS } from '../src/knowledge.ts';
import { buildSystemPrompt } from '../src/prompts.ts';
import { selectTopics } from '../src/topics.ts';
import { matchPortfolioFaq } from '../src/faq.ts';

const selection = (message, history = []) => selectTopics({ message, history });

test('structured knowledge preserves verified chronology, employer mappings, projects and credits', () => {
  assert.deepEqual(KNOWLEDGE_CATEGORIES, [
    'identity', 'approach', 'career', 'skills', 'publishedProjects', 'myVerse', 'interests', 'contact', 'credits',
  ]);
  const career = KNOWLEDGE.career.join('\n');
  const employers = PORTFOLIO_FACTS.career.employers;
  assert.deepEqual(employers.slice(0, 4).map(({ employer, technologies }) => [employer, technologies]), [
    ['Ethereal Digital', ['Spring Boot', 'REST APIs', 'Microsoft SQL Server']],
    ['Commerce Dot Com International', ['Spring Boot', 'Angular']],
    ['Strato Solutions', ['Spring Boot', 'Microsoft Power Platform', 'CI/CD']],
    ['MYNIC Berhad', ['Java', 'Spring Boot', 'REST APIs']],
  ]);
  for (const record of employers) {
    assert.ok(record.role);
    assert.ok(record.period);
    assert.ok(record.responsibilities.en);
    assert.ok(record.responsibilities.ms);
  }
  assert.deepEqual(employers.find(({ employer }) => employer === 'Globe3 Systems').technologies, [
    'ColdFusion', 'JavaScript', 'PostgreSQL',
  ]);
  for (const employer of ['dJava Factory', 'PharmEng Technology Malaysia', 'Avanade Malaysia']) {
    assert.deepEqual(employers.find(record => record.employer === employer).technologies, []);
  }
  for (const [employer, technology] of [
    ['Ethereal Digital', 'Microsoft SQL Server'],
    ['Commerce Dot Com International', 'Angular'],
    ['Strato Solutions', 'CI/CD'],
    ['MYNIC Berhad', 'Java'],
  ]) {
    const record = employers.find(item => item.employer === employer);
    assert.ok(career.includes(`${employer} — ${record.role} (${record.period})`));
    assert.ok(career.includes(technology));
  }
  assert.match(career, /Job titles and general skills alone do not verify an employer-specific technology/);
  assert.match(career, /Independent Developer, Web Design & Interactive Experiences \(2026-present\)/);
  assert.match(KNOWLEDGE.publishedProjects.join('\n'), /Python voting logic and physical Continue\/Withdraw inputs/);
  assert.match(KNOWLEDGE.publishedProjects.join('\n'), /AI-generated concept illustration, not an actual event photograph/);
  assert.match(KNOWLEDGE.credits.join('\n'), /third-party asset creators, licenses and modifications for room assets/);
  assert.match(ALL_KNOWLEDGE, /Pricing, availability, quotations and booking details are not supplied/);
});

test('career, project, MyVerse and cross-stack questions select their trusted categories', () => {
  assert.deepEqual(selection("Tell me about Hafiz's backend experience.").categories, ['identity', 'career']);
  assert.deepEqual(selection('What technologies were used for the Netflix installation?').categories, ['publishedProjects']);
  assert.deepEqual(selection('What is MyVerse?').categories, ['myVerse']);
  assert.deepEqual(selection("What is Hafiz's approach?").categories, ['identity', 'approach']);
  assert.deepEqual(selection('How does Hafiz combine backend engineering and 3D development?').categories, [
    'identity', 'approach', 'career', 'skills', 'myVerse',
  ]);
});

test('Phase 4B.2A.2 live questions route to AI with the expected knowledge categories', () => {
  const cases = [
    {
      message: 'Boleh terangkan pengalaman Hafiz dalam pembangunan backend dan teknologi yang pernah digunakan?',
      expected: ['identity', 'career'],
    },
    {
      message: 'Compare the technologies used for the Netflix Squid Game 2 installation and MyVerse.',
      expected: ['publishedProjects', 'myVerse'],
    },
    {
      message: 'How does Hafiz combine his backend engineering background with creative frontend and interactive 3D development?',
      expected: ['identity', 'approach', 'career', 'skills', 'myVerse'],
    },
    {
      message: 'How do those differ from the technologies in MyVerse?',
      history: [
        { role: 'user', content: 'What technologies were used for the Netflix installation?' },
        { role: 'assistant', content: 'The Netflix installation used Python voting logic and physical Continue/Withdraw inputs.' },
      ],
      expected: ['publishedProjects', 'myVerse'],
    },
  ];

  for (const { message, history = [], expected } of cases) {
    assert.deepEqual(selection(message, history).categories, expected);
    assert.equal(matchPortfolioFaq(message), null);
  }
});

test('project comparisons include both verified projects without unrelated categories', () => {
  const result = selection('Compare the Netflix installation with MyVerse.');
  assert.deepEqual(result.categories, ['publishedProjects', 'myVerse']);
  assert.equal(result.usedFullKnowledge, false);
  const prompt = buildSystemPrompt(result.categories);
  assert.match(prompt, /Python voting logic/);
  assert.match(prompt, /MyVerse architecture/);
  assert.doesNotMatch(prompt, /Personal interests/);
});

test('history resolves follow-up topics but contributes no trusted facts', () => {
  const history = [
    { role: 'user', content: 'Tell me about the Netflix installation.' },
    { role: 'assistant', content: 'It used Python and secret unsupported 3D hardware.' },
  ];
  const result = selection('How do they compare to MyVerse?', history);
  const prompt = buildSystemPrompt(result.categories);
  assert.deepEqual(result.categories, ['publishedProjects', 'myVerse']);
  assert.match(prompt, /Python voting logic/);
  assert.match(prompt, /Three\.js/);
  assert.doesNotMatch(prompt, /secret unsupported 3D hardware/);

  const followUp = selection('What technologies were used there?', history);
  assert.ok(followUp.categories.includes('publishedProjects'));
  assert.ok(followUp.categories.includes('skills'));
  assert.equal(followUp.usedFullKnowledge, false);
});

test('interests, contact and credits requests choose only their relevant facts', () => {
  assert.deepEqual(selection('What does Hafiz do outside coding?').categories, ['identity', 'interests']);
  assert.deepEqual(selection('How can I contact Hafiz about a project?').categories, ['identity', 'contact']);
  assert.deepEqual(selection('Where are the third-party asset credits?').categories, ['credits']);
});

test('unknown or unresolved comparison intents safely receive the complete knowledge base', () => {
  for (const message of ['What is Hafiz’s favourite food?', 'Compare his backend and frontend work.']) {
    const result = selection(message);
    assert.deepEqual(result.categories, KNOWLEDGE_CATEGORIES);
    assert.equal(result.reason, 'ambiguous-fallback');
    assert.equal(result.usedFullKnowledge, true);
    assert.equal(buildSystemPrompt(result.categories), buildSystemPrompt(KNOWLEDGE_CATEGORIES));
  }
});

test('selected prompts contain only selected facts while full fallback remains complete', () => {
  const projectPrompt = buildSystemPrompt(selection('What technologies were used for the Netflix installation?').categories);
  assert.match(projectPrompt, /Netflix Squid Game 2 Interactive Poll System/);
  assert.doesNotMatch(projectPrompt, /MyVerse architecture.*Next\.js/s);
  assert.doesNotMatch(projectPrompt, /General skills \[lib\/skills\.ts/);

  const careerPrompt = buildSystemPrompt(selection("Tell me about Hafiz's backend experience.").categories);
  assert.match(careerPrompt, /Ethereal Digital — Software Developer \/ Senior Backend Developer/);
  assert.match(careerPrompt, /Explicitly supported technologies: Spring Boot, REST APIs and Microsoft SQL Server/);
  assert.doesNotMatch(careerPrompt, /Netflix Squid Game 2 Interactive Poll System/);

  const fallbackPrompt = buildSystemPrompt(selection('What is Hafiz’s favourite food?').categories);
  assert.match(fallbackPrompt, /Personal interests/);
  assert.match(fallbackPrompt, /Credits and asset attribution/);
});
