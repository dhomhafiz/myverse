import type { Metadata } from 'next';

export const SITE_URL = new URL('https://dhomhafiz.dev/');
export const SITE_NAME = 'MyVerse';
export const OWNER_NAME = 'Mohd Hafiz Abd Rahim';
export const NO_INDEX = process.env.MYVERSE_NO_INDEX === 'true';

const defaultSocialImage = {
  url: '/images/selectedwork1.webp',
  alt: 'AI-generated concept visual of a Squid Game 2 interactive voting installation.',
};

export function createPageMetadata(
  title: string,
  description: string,
  path: string,
  options: {
    image?: { url: string; alt: string };
    type?: 'website' | 'article';
  } = {},
): Metadata {
  const image = options.image ?? defaultSocialImage;
  const absoluteImageUrl = new URL(image.url, SITE_URL).toString();

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: options.type ?? 'website',
      siteName: SITE_NAME,
      title,
      description,
      url: new URL(path, SITE_URL).toString(),
      images: [{ url: absoluteImageUrl, alt: image.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteImageUrl],
    },
  };
}
