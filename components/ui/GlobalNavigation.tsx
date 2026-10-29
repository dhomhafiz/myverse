'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useExperienceNavigation } from './ExperienceNavigation';

const primaryDestinations = [
  { number: '01', label: 'PROJECTS', href: '/work' },
  { number: '02', label: 'SKILLS', href: '/skills' },
  { number: '03', label: 'ABOUT ME', href: '/about' },
  { number: '04', label: 'BEYOND THE CODE', href: '/beyond' },
  { number: '05', label: 'CONTACT', href: '/contact' },
] as const;

function normalizedPath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function isCurrentDestination(pathname: string, href: string) {
  const path = normalizedPath(pathname);
  return href === '/work' ? path === href || path.startsWith(`${href}/`) : path === href;
}

export default function GlobalNavigation({
  placement = 'destination',
  onReturn,
}: {
  placement?: 'room' | 'destination';
  onReturn?: () => void;
}) {
  const pathname = usePathname();
  const { navigateToDestination, requestRoomReturn } = useExperienceNavigation();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const open = openPath === pathname;
  const panelId = useId();
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpenPath(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!open || !overlayRoot || !panel.current) return;
    const menu = panel.current;
    let frame = 0;
    // Track scrolling, resizing and in-flight page reveals only while open.
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const safe = getComputedStyle(overlayRoot);
      const width = document.documentElement.clientWidth, height = window.innerHeight;
      const leftInset = parseFloat(safe.paddingLeft), rightInset = parseFloat(safe.paddingRight);
      const topInset = parseFloat(safe.paddingTop), bottomInset = parseFloat(safe.paddingBottom);
      const top = Math.max(topInset, Math.min(anchor.bottom + 8, height - bottomInset - 44));
      const right = Math.max(rightInset, Math.min(width - anchor.right, width - menu.offsetWidth - leftInset));
      menu.style.top = `${top}px`;
      menu.style.right = `${right}px`;
      menu.style.maxHeight = `${Math.max(0, height - top - bottomInset)}px`;
      frame = requestAnimationFrame(position);
    };
    position();
    menu.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [open, overlayRoot]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu(true);
      } else if (event.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('a, button');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (!panel.current?.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [closeMenu, open]);

  const handleNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    closeMenu(normalizedPath(pathname) === href);
    navigateToDestination(href);
  };

  return (
    <div className={`global-navigation global-navigation--${placement}`} data-open={open}>
      <div className="global-navigation-controls">
        <button
          ref={trigger}
          className="global-navigation-trigger"
          type="button"
          aria-label={open ? 'Close MyVerse navigation' : 'Open MyVerse navigation'}
          aria-expanded={open}
          aria-controls={overlayRoot ? panelId : undefined}
          onClick={() => {
            setOverlayRoot(document.getElementById('myverse-navigation-layer'));
            setOpenPath(open ? null : pathname);
          }}
        >
          <span className="global-navigation-icon" aria-hidden="true"><i /><i /></span>
          <span>MENU</span>
        </button>
      </div>
      {overlayRoot && createPortal(
        <div className="global-navigation-overlay" data-open={open}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}>
        {open && <div className="global-navigation-backdrop" aria-hidden="true"
          onPointerDown={event => event.preventDefault()}
          onClick={() => closeMenu(true)} />}
        <nav
          ref={panel}
          id={panelId}
          className="global-navigation-panel"
          aria-label="MyVerse global navigation"
          aria-hidden={!open}
          inert={!open}
        >
          <header className="global-navigation-heading">
            <p>NAVIGATE / MYVERSE</p>
            <button type="button" onClick={() => closeMenu(true)}>CLOSE</button>
          </header>
          <ol className="global-navigation-list">
            {primaryDestinations.map(destination => {
              const active = isCurrentDestination(pathname, destination.href);
              return (
                <li key={destination.href}>
                  <Link
                    href={destination.href}
                    prefetch={false}
                    aria-current={active ? 'page' : undefined}
                    onClick={event => handleNavigation(event, destination.href)}
                  >
                    <span>{destination.number} /</span>
                    <span>{destination.label}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="global-navigation-divider" />
          <ul className="global-navigation-list global-navigation-list--secondary">
            <li><button className="global-navigation-room-return" type="button"
              aria-current={normalizedPath(pathname) === '/' ? 'page' : undefined}
              onClick={() => {
                closeMenu(true);
                if (normalizedPath(pathname) !== '/') {
                  onReturn?.();
                  requestRoomReturn();
                }
              }}>BACK TO 3D ROOM</button></li>
            <li><Link href="/credits" prefetch={false}
              aria-current={isCurrentDestination(pathname, '/credits') ? 'page' : undefined}
              onClick={event => handleNavigation(event, '/credits')}>CREDITS</Link></li>
          </ul>
        </nav>
        </div>, overlayRoot,
      )}
    </div>
  );
}
