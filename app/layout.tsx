import type { Metadata } from 'next';
import { Space_Mono, Work_Sans } from 'next/font/google';
import './globals.css';
import ExperienceShell from '@/components/ui/ExperienceShell';

const workSans = Work_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-work-sans' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], display: 'swap', variable: '--font-space-mono' });
export const metadata: Metadata = {
  title: 'Mohd Hafiz — Workspace study',
  description: 'Enter Mohd Hafiz’s developer room and drag to explore. Phase 2 entrance and camera preview.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${workSans.variable} ${spaceMono.variable}`}>
    <ExperienceShell>{children}</ExperienceShell>
  </body></html>;
}
