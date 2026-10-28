import type { MetadataRoute } from 'next';
import { projects } from '@/lib/projects';
import { NO_INDEX, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

const staticPaths = ['/', '/work/', '/skills/', '/about/', '/contact/', '/credits/'];

export default function sitemap(): MetadataRoute.Sitemap {
  if (NO_INDEX) return [];

  const publishedProjectPaths = projects
    .filter(project => project.status === 'published')
    .map(project => `/work/${project.slug}/`);

  return [...staticPaths, ...publishedProjectPaths].map(path => ({
    url: new URL(path, SITE_URL).toString(),
  }));
}
