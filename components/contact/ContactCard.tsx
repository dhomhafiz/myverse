import type { ContactMethod } from '@/lib/contact';

function ContactIcon({ method }: { method: ContactMethod['id'] }) {
  return method === 'email' ? (
    <svg className="contact-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="7" y="13" width="50" height="38" rx="5" />
      <path d="m9 16 23 19 23-19M9 48l15-14m31 14L40 34" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="contact-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.87 11.87 0 0 0 12.06 0C5.48 0 .13 5.35.13 11.93c0 2.1.55 4.15 1.6 5.96L0 24l6.25-1.64a11.94 11.94 0 0 0 5.8 1.48h.01C18.64 23.84 24 18.49 24 11.91c0-3.18-1.24-6.17-3.48-8.43ZM12.06 21.82a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.71.97.99-3.62-.24-.37a9.86 9.86 0 0 1-1.52-5.28c0-5.46 4.44-9.91 9.9-9.91a9.84 9.84 0 0 1 7 2.9 9.84 9.84 0 0 1 2.89 7c0 5.46-4.45 9.9-9.91 9.9Zm5.44-7.42c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.21 5.08 4.5.71.3 1.27.49 1.7.63.72.23 1.38.2 1.9.12.58-.09 1.76-.72 2.01-1.42.25-.69.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}

export default function ContactCard({ method }: { method: ContactMethod }) {
  const content = <>
    <div className="contact-card-topline">
      <ContactIcon method={method.id} />
      <span className="contact-card-index">/ {method.id === 'email' ? '01' : '02'}</span>
    </div>
    <h2>{method.title}</h2>
    <p className="contact-description">{method.description}</p>
    {method.href ? <>
      <p className="contact-destination">{method.destinationLabel}</p>
      <span className="contact-action">{method.actionLabel}<span aria-hidden="true"> &gt;</span></span>
    </> : <p className="contact-unavailable">This contact method is currently unavailable.</p>}
  </>;
  return method.href ? (
    <a className="contact-card is-actionable" href={method.href} aria-label={`${method.actionLabel}: ${method.destinationLabel}`}
      {...(method.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {content}
    </a>
  ) : <article className="contact-card is-unavailable">{content}</article>;
}
