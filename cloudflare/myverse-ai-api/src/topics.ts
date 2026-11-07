import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from './knowledge.ts';
import type { KnowledgeProfile } from './knowledge.ts';
import type { ChatRequest } from './validation.ts';

export type TopicSelection = {
  categories: readonly KnowledgeCategory[];
  reason: 'single-topic' | 'multi-topic' | 'contextual-follow-up' | 'ambiguous-fallback' | 'focused-career-profile';
  usedFullKnowledge: boolean;
  knowledgeProfile?: KnowledgeProfile;
};

const ALL_CATEGORIES: readonly KnowledgeCategory[] = KNOWLEDGE_CATEGORIES;
const FOLLOW_UP = /\b(?:it|they|them|those|these|that|there|this|same|former|latter|compare|compared|comparison|difference|different|versus|vs|what about|and those|and these)\b/;
const COMPARE = /\b(?:compare|compared|comparison|difference|differences|different|versus|vs)\b/;
const PROFILE_PERSON = /\b(?:hafiz|he|him|his|dia|beliau)\b/;
const PROFILE_ROLE = /\b(?:developer|dev|backend|back end|frontend|front end|software engineer|pembangun(?: web)?|jurutera perisian)\b/;
const PROFILE_CANDIDATE = /\b(?:candidate|calon)\b/;
const PROFILE_EVALUATION = /\b(?:interesting|suitable|fit|strengths?|advantages?|kelebihan|menarik|sesuai|background|experience|pengalaman|latar belakang)\b/;
const HIRING_ACTION_TO_PERSON = /\b(?:hire|hiring|recruit|recruiting|consider|employ|ambil|mengambil|mengupah|rekrut|merekrut)\b.{0,40}\b(?:hafiz|him|dia|beliau)\b/;
const CAREER_TIMELINE_REQUEST = /\b(?:timeline|chronolog(?:y|ical)|oldest[- ]first|full career|complete career|entire career|garis masa|kronologi)\b/;

function categoriesIn(text: string): Set<KnowledgeCategory> {
  const categories = new Set<KnowledgeCategory>();
  const hasMyVerse = /\bmy\s?verse\b|\b3d room portfolio\b/.test(text);
  const hasNetflixProject = /\bnetflix\b|\bsquid game(?: 2)?\b|\binteractive poll system\b|\bpoll installation\b|\bpromotional activation\b/.test(text);
  const hasBackend = /\bbackend\b|\bback end\b|\bserver[- ]side\b|\bprofessional background\b|\bcareer\b|\bemployer\b|\bjob roles?\b|\bwork experience\b|\bsoftware developer\b/.test(text);
  const hasInteractiveDevelopment = /\b3d\b|\bthree dimensional\b|\binteractive (?:web|frontend|front end|experience|development)\b|\bfrontend development\b|\bfront end development\b/.test(text);
  const hasBroadIdentity = /\b(?:who is|who's|identity|about hafiz|tell me about hafiz|siapa hafiz)\b/.test(text)
    || (/\b(?:cerita|ceritakan|pasal|tentang)\b/.test(text) && /\b(?:hafiz|dia|beliau)\b/.test(text));
  const hasBroadProjectQuestion = /\b(?:projects|published projects?|case stud(?:y|ies)|work entries|project details|projek(?:-projek)?|hasil kerja|kerja-kerja)\b/.test(text);

  if (hasBroadIdentity) categories.add('identity');
  if (hasBroadIdentity && !hasMyVerse && !hasNetflixProject) categories.add('career');
  if (hasBackend) {
    categories.add('identity');
    categories.add('career');
  }
  if (/\bapproach\b/.test(text)) {
    categories.add('identity');
    categories.add('approach');
  }
  if (/\b(?:combine|combines|combining|bridge|bridging|integrate|integrating)\b/.test(text)
    && (hasBackend || hasInteractiveDevelopment)) categories.add('approach');
  if (/\b(?:skill|skills|technology|technologies|tech stack|frameworks?|libraries|programming languages?)\b/.test(text)
    && !hasMyVerse && !hasNetflixProject) categories.add('skills');
  if (/\b(?:general skills|listed skills|skills list|what can he do)\b/.test(text)) categories.add('skills');
  if (hasMyVerse) categories.add('myVerse');
  if (hasNetflixProject || hasBroadProjectQuestion) {
    categories.add('publishedProjects');
    if (hasBroadIdentity && hasBroadProjectQuestion && !hasNetflixProject && !hasMyVerse) {
      categories.add('career');
      categories.add('myVerse');
    }
  }
  if (/\b(?:outside coding|outside work|hobbies|interests|free time|what does he do outside)\b/.test(text)) {
    categories.add('identity');
    categories.add('interests');
  }
  if (/\b(?:contact|email|e-mail|collaborat|project enquir|project inquiry|pricing|price|charge|rates|availability|available|quotation|booking)\b/.test(text)) {
    categories.add('identity');
    categories.add('contact');
  }
  if (/\b(?:credits?|attribution|third[- ]party assets?|licenses?|licences?|asset creators?)\b/.test(text)) {
    categories.add('credits');
  }
  if (hasBackend && hasInteractiveDevelopment) {
    categories.add('identity');
    categories.add('career');
    categories.add('approach');
    categories.add('skills');
    categories.add('myVerse');
  }
  return categories;
}

function ordered(categories: ReadonlySet<KnowledgeCategory>): KnowledgeCategory[] {
  return ALL_CATEGORIES.filter(category => categories.has(category));
}

function fullFallback(): TopicSelection {
  return { categories: ALL_CATEGORIES, reason: 'ambiguous-fallback', usedFullKnowledge: true };
}

function focusedCareerProfile(text: string): boolean {
  if (CAREER_TIMELINE_REQUEST.test(text) || !PROFILE_PERSON.test(text) || !PROFILE_ROLE.test(text)) return false;
  return HIRING_ACTION_TO_PERSON.test(text)
    || PROFILE_CANDIDATE.test(text)
    || PROFILE_EVALUATION.test(text);
}

export function selectTopics(input: ChatRequest): TopicSelection {
  const current = input.message.toLowerCase();
  const currentCategories = categoriesIn(current);

  if (COMPARE.test(current)) {
    const projectCategories = new Set<KnowledgeCategory>();
    for (const text of [...input.history.map(message => message.content.toLowerCase()), current]) {
      const categories = categoriesIn(text);
      if (categories.has('publishedProjects')) projectCategories.add('publishedProjects');
      if (categories.has('myVerse')) projectCategories.add('myVerse');
    }
    if (projectCategories.has('publishedProjects') && projectCategories.has('myVerse')) {
      return {
        categories: ['publishedProjects', 'myVerse'],
        reason: 'multi-topic',
        usedFullKnowledge: false,
      };
    }
    return fullFallback();
  }

  if (focusedCareerProfile(current)) {
    const categories = new Set<KnowledgeCategory>(['identity', 'career', 'skills', 'myVerse']);
    for (const category of currentCategories) categories.add(category);
    return {
      categories: ordered(categories),
      reason: 'focused-career-profile',
      usedFullKnowledge: false,
      knowledgeProfile: 'focused-career',
    };
  }

  if (currentCategories.size === 0) return fullFallback();

  if (FOLLOW_UP.test(current)) {
    const contextual = new Set(currentCategories);
    for (const message of input.history) {
      for (const category of categoriesIn(message.content.toLowerCase())) contextual.add(category);
    }
    const categories = ordered(contextual);
    return {
      categories,
      reason: categories.length > 1 ? 'multi-topic' : 'contextual-follow-up',
      usedFullKnowledge: false,
    };
  }

  const categories = ordered(currentCategories);
  return {
    categories,
    reason: categories.length > 1 ? 'multi-topic' : 'single-topic',
    usedFullKnowledge: false,
  };
}
