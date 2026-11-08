const destinationRoutes = {
  about: '/about',
  work: '/work',
  skills: '/skills',
  contact: '/contact',
  beyond: '/beyond',
  credits: '/credits',
  room: '/',
  myverse: '/',
  bilik: '/',
} as const;

const navigationReferencePattern = /(^|[\s([{])\/(work\/(?:netflix|coming-soon|project-preview)|about|work|skills|contact|beyond|credits)\/?(?=$|[\s)\]},.;:!?'"'])|(^|[^\w\[])(ABOUT|About|WORK|Work|SKILLS|Skills|CONTACT|Contact|contact|BEYOND|Beyond|CREDITS|Credits|ROOM|Room|room|BILIK|Bilik|bilik|MyVerse|MYVERSE)(?=$|[^\w])/g;
const existingMarkdownLinkPattern = /\[[^\]]+\]\([^)]+\)/g;

function linkifyPlainText(text: string) {
  return text.replace(navigationReferencePattern, (
    _match,
    routePrefix: string | undefined,
    route: string | undefined,
    labelPrefix: string | undefined,
    label: string | undefined,
  ) => {
    if (route && routePrefix !== undefined) {
      const path = `/${route.toLowerCase()}`;
      return `${routePrefix}[/${route}](${path})`;
    }
    if (!label || labelPrefix === undefined) return _match;
    const destination = label.toLowerCase() as keyof typeof destinationRoutes;
    return `${labelPrefix}[${label}](${destinationRoutes[destination]})`;
  });
}

export function linkifyCompanionNavigation(text: string) {
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(existingMarkdownLinkPattern)) {
    const index = match.index;
    result += linkifyPlainText(text.slice(cursor, index));
    result += match[0];
    cursor = index + match[0].length;
  }

  return result + linkifyPlainText(text.slice(cursor));
}
