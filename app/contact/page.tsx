import type { Metadata } from 'next';
import ContactPage from '@/components/contact/ContactPage';

export const metadata: Metadata = {
  title: 'Contact — Mohd Hafiz',
  description: 'Get in touch with Mohd Hafiz about a project or collaboration.',
  alternates: { canonical: '/contact' },
};

export default function ContactRoute() {
  return <ContactPage />;
}
