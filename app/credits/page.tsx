import CreditsDashboard from '@/components/credits/CreditsDashboard';
import { createPageMetadata } from '@/lib/site';

export const metadata = createPageMetadata(
  'Credits | Mohd Hafiz Abd Rahim',
  'Review the creators, sources, licenses, and modifications behind the MyVerse portfolio.',
  '/credits/',
);

export default function CreditsPage() {
  return <CreditsDashboard />;
}
