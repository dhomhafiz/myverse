import type { Metadata, Viewport } from 'next';
import { Space_Mono, Work_Sans } from 'next/font/google';
import './globals.css';
import ExperienceShell from '@/components/ui/ExperienceShell';
import { NO_INDEX, OWNER_NAME, SITE_NAME, SITE_URL } from '@/lib/site';
import { CONTACT_EMAIL, contactSocialLinks } from '@/lib/contact';

const workSans = Work_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-work-sans' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], display: 'swap', variable: '--font-space-mono' });
const description = 'Mohd Hafiz Abd Rahim is a Kuala Lumpur-based creative developer and web designer creating interactive web experiences.';
const socialImage = {
  url: new URL('/images/social-preview.jpg', SITE_URL).toString(),
  alt: 'Portrait of Mohd Hafiz Abd Rahim against a charcoal background.',
};
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': `${SITE_URL}#person`,
      name: OWNER_NAME,
      url: SITE_URL.toString(),
      email: CONTACT_EMAIL,
      sameAs: contactSocialLinks.map(link => link.href),
      jobTitle: 'Creative Developer and Web Designer',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kuala Lumpur',
        addressCountry: 'MY',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}#website`,
      name: SITE_NAME,
      url: SITE_URL.toString(),
      inLanguage: 'en-MY',
      publisher: { '@id': `${SITE_URL}#person` },
    },
  ],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: 'Mohd Hafiz Abd Rahim | Creative Developer & Web Designer',
  description,
  applicationName: SITE_NAME,
  authors: [{ name: OWNER_NAME }],
  creator: OWNER_NAME,
  publisher: OWNER_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_MY',
    title: 'Mohd Hafiz Abd Rahim | Creative Developer & Web Designer',
    description,
    url: SITE_URL.toString(),
    images: [{ ...socialImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mohd Hafiz Abd Rahim | Creative Developer & Web Designer',
    description,
    images: [socialImage.url],
  },
  alternates: { canonical: '/' },
  robots: NO_INDEX ? { index: false, follow: true } : { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-MY">
      <body className={`${workSans.variable} ${spaceMono.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
        <ExperienceShell>{children}</ExperienceShell>
      </body>
    </html>
  );
}
