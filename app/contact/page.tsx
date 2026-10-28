import ContactPage from '@/components/contact/ContactPage';
import { createPageMetadata } from '@/lib/site';

export const metadata = createPageMetadata(
  'Contact | Mohd Hafiz Abd Rahim',
  'Contact Mohd Hafiz Abd Rahim in Kuala Lumpur, Malaysia, about web design, creative development, or interactive web experiences.',
  '/contact/',
);

export default function ContactRoute() {
  return <ContactPage />;
}
