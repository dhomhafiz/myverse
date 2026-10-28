import type { MetadataRoute } from 'next';
import { NO_INDEX, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    ...(NO_INDEX ? {} : { sitemap: new URL('/sitemap.xml', SITE_URL).toString() }),
  };
}
