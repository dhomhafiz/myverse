export type ContactMethod =
  | {
    id: 'email';
    title: 'EMAIL ME';
    description: string;
    href: `mailto:${string}` | null;
    actionLabel: string;
    external: false;
  }
  | {
    id: 'whatsapp';
    title: 'WHATSAPP';
    description: string;
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
    href: null,
    actionLabel: 'SEND AN EMAIL',
    external: false,
  },
  {
    id: 'whatsapp',
    title: 'WHATSAPP',
    description: 'Prefer a quick conversation? Reach out directly on WhatsApp.',
    href: null,
    actionLabel: 'OPEN WHATSAPP',
    external: true,
  },
] satisfies readonly ContactMethod[];

export const contactSocialLinks: readonly ContactSocialLink[] = [];
