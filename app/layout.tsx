import type { Metadata } from 'next';
import { Work_Sans } from 'next/font/google';
import './globals.css';

const workSans = Work_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-work-sans' });

export const metadata: Metadata = {
  title: 'Mohd Hafiz — Workspace study',
  description: 'Enter Mohd Hafiz’s developer room and drag to explore. Phase 2 entrance and camera preview.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={workSans.variable}>{children}</body></html>;
}
