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

export const contactMethods = [
  {
    id: 'email',
    title: 'EMAIL ME',
    description: 'For project enquiries, collaboration, or a quick hello.',
    href: 'mailto:dhomhafiz@gmail.com',
    destinationLabel: 'dhomhafiz@gmail.com',
    actionLabel: 'SEND AN EMAIL',
    external: false,
  },
  {
    id: 'whatsapp',
    title: 'WHATSAPP',
    description: 'Prefer a quick conversation? Reach out directly on WhatsApp.',
    href: 'https://wa.me/60197860823',
    destinationLabel: '+60 19-786 0823 / MY',
    actionLabel: 'OPEN WHATSAPP',
    external: true,
  },
] satisfies readonly ContactMethod[];

export const contactSocialLinks: readonly ContactSocialLink[] = [];
