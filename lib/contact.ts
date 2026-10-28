export type ContactMethod =
  | {
    id: 'email';
    title: 'EMAIL ME';
    description: string;
    destinationLabel: string;
    href: `mailto:${string}` | null;
    actionLabel: string;
    external: false;
  }
  | {
    id: 'whatsapp';
    title: 'WHATSAPP';
    description: string;
    destinationLabel: string;
    href: `https://wa.me/${string}` | null;
    actionLabel: string;
    external: true;
  };

export type ContactSocialLink = {
  label: string;
  href: `https://${string}`;
};

export const CONTACT_EMAIL = 'build@dhomhafiz.dev';
export const WHATSAPP_ENQUIRY_MESSAGE = "Hi Hafiz, I'm interested in discussing a website project.";

export const contactMethods = [
  {
    id: 'email',
    title: 'EMAIL ME',
    description: 'For project enquiries, collaboration, or a quick hello.',
    href: `mailto:${CONTACT_EMAIL}?subject=Project%20Enquiry`,
    destinationLabel: CONTACT_EMAIL,
    actionLabel: 'SEND AN EMAIL',
    external: false,
  },
  {
    id: 'whatsapp',
    title: 'WHATSAPP',
    description: 'Prefer a quick conversation? Reach out directly on WhatsApp.',
    href: `https://wa.me/60197860823?text=${encodeURIComponent(WHATSAPP_ENQUIRY_MESSAGE)}`,
    destinationLabel: '+60 19-786 0823',
    actionLabel: 'OPEN WHATSAPP',
    external: true,
  },
] satisfies readonly ContactMethod[];

export const contactSocialLinks: readonly ContactSocialLink[] = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mohd-hafiz-abd-rahim-b23a9667/' },
  { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=100064737337327' },
  { label: 'Instagram', href: 'https://www.instagram.com/dhomhafiz/' },
];
