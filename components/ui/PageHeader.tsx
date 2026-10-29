'use client';

import Link from 'next/link';
import type { MouseEventHandler } from 'react';
import ReturnToRoom from './ReturnToRoom';

type PageHeaderProps = {
  label: string;
  className?: string;
  brandHref?: string;
  onBrandClick?: MouseEventHandler<HTMLAnchorElement>;
  backLink?: { href: string; label: string };
  onReturn?: () => void;
  returnSize?: 'default' | 'prominent';
};

export default function PageHeader({
  label,
  className,
  brandHref,
  onBrandClick,
  backLink,
  onReturn,
  returnSize = 'prominent',
}: PageHeaderProps) {
  const brand = (
    <>
      MYVERSE<span> / {label}</span>
    </>
  );

  return (
    <header className={`work-header myverse-page-header${backLink ? ' myverse-page-header--with-back-link' : ''}${className ? ` ${className}` : ''}`}>
      <div className="myverse-page-header-start">
        {brandHref
          ? <Link href={brandHref} className="work-brand" onClick={onBrandClick}>{brand}</Link>
          : <span className="work-brand">{brand}</span>}
        {backLink && <Link href={backLink.href} className="work-link">{backLink.label}</Link>}
      </div>
      <nav aria-label="Return to workspace">
        <ReturnToRoom size={returnSize} onActivate={onReturn} />
      </nav>
    </header>
  );
}
