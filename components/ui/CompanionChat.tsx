'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { mockConversationProvider } from '@/lib/companion-chat';

type Message = { id: number; role: 'assistant' | 'user'; text: string };
type ViewportMetrics = { height: number; offsetTop: number } | null;

const MAX_MESSAGES = 40;
const subscribeToPortal = () => () => {};
const getPortalSnapshot = () => document.body;
const getServerPortalSnapshot = () => null;
const initialMessages: Message[] = [{
  id: 0,
  role: 'assistant',
  text: 'Hi, I’m MyVerse’s AI Companion preview. Ask me about Hafiz’s projects, skills, or contact details.',
}];

export default function CompanionChat({ onClose, onAcknowledge, reducedMotion }: {
  onClose: () => void;
  onAcknowledge: () => void;
  reducedMotion: boolean;
}) {
  const portalRoot = useSyncExternalStore(subscribeToPortal, getPortalSnapshot, getServerPortalSnapshot);
  const [viewport, setViewport] = useState<ViewportMetrics>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const request = useRef<AbortController | null>(null);
  const requestPending = useRef(false);
  const mounted = useRef(false);
  const nextId = useRef(1);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const updateViewport = () => {
      const next = visualViewport
        ? { height: visualViewport.height, offsetTop: visualViewport.offsetTop }
        : { height: window.innerHeight, offsetTop: 0 };
      setViewport(current => current?.height === next.height && current.offsetTop === next.offsetTop ? current : next);
    };
    updateViewport();
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useLayoutEffect(() => {
    if (!portalRoot) return;
    const focusTarget = window.matchMedia('(max-width: 820px), (max-width: 960px) and (pointer: coarse)').matches
      ? panel.current?.querySelector<HTMLButtonElement>('.companion-chat-close')
      : input.current;
    focusTarget?.focus({ preventScroll: true });
  }, [portalRoot]);

  useLayoutEffect(() => {
    if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [messages, pending, error]);

  const addMessage = useCallback((role: Message['role'], text: string) => {
    setMessages(current => [...current, { id: nextId.current++, role, text }].slice(-MAX_MESSAGES));
  }, []);

  const requestResponse = useCallback(async (prompt: string) => {
    if (requestPending.current) return;
    requestPending.current = true;
    setPending(true);
    setError('');
    onAcknowledge();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await mockConversationProvider.respond(prompt, controller.signal);
      if (mounted.current && !controller.signal.aborted) {
        addMessage('assistant', response);
        onAcknowledge();
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        console.error('AI Companion demo response failed:', reason);
        if (mounted.current) setError('The demo reply could not be generated. Try again, or ask about projects, skills, or contact details.');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        requestPending.current = false;
        if (mounted.current) setPending(false);
      }
    }
  }, [addMessage, onAcknowledge]);

  const send = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || requestPending.current) return;
    setLastPrompt(prompt);
    addMessage('user', prompt);
    setDraft('');
    void requestResponse(prompt);
  }, [addMessage, draft, requestResponse]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey &&
      !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const controls = panel.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!panel.current.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  if (!portalRoot) return null;
  const style: CSSProperties = viewport ? {
    '--companion-viewport-height': `${viewport.height}px`,
    '--companion-viewport-offset': `${viewport.offsetTop}px`,
  } as CSSProperties : {};

  return createPortal(
    <div className="companion-chat-overlay" style={style} data-reduced-motion={reducedMotion}>
      <div className="companion-chat-scrim" aria-hidden="true" />
      <section ref={panel} className="companion-chat-panel" role="dialog" aria-modal="true"
        aria-labelledby="companion-chat-title" aria-describedby="companion-chat-subtitle">
        <header className="companion-chat-header">
          <div className="companion-chat-heading">
            <p id="companion-chat-title">MYVERSE // AI COMPANION</p>
            <p id="companion-chat-subtitle">ASK ABOUT THE CREATOR <span>· DEMO PREVIEW</span></p>
          </div>
          <button className="companion-chat-close" type="button" onClick={onClose} aria-label="Back to Room">
            <span aria-hidden="true">×</span>
            <span>BACK TO ROOM</span>
          </button>
        </header>
        <ol ref={messageList} className="companion-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.map(message => (
            <li className={`companion-chat-message companion-chat-message--${message.role}`} key={message.id}>
              <span className="companion-chat-sender">{message.role === 'assistant' ? 'COMPANION' : 'YOU'}</span>
              <p>{message.text}</p>
            </li>
          ))}
          {pending && (
            <li className="companion-chat-thinking" role="status">
              <span className="companion-chat-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
              THINKING
            </li>
          )}
        </ol>
        {error && (
          <div className="companion-chat-error" role="alert">
            <p>{error}</p>
            <button type="button" disabled={pending || !lastPrompt}
              onClick={() => void requestResponse(lastPrompt)}>RETRY</button>
          </div>
        )}
        <form className="companion-chat-composer" onSubmit={send}>
          <label className="companion-visually-hidden" htmlFor="companion-chat-input">Message the AI Companion demo</label>
          <textarea ref={input} id="companion-chat-input" value={draft} maxLength={1000} rows={2}
            placeholder="Ask about Hafiz’s work..." onChange={event => setDraft(event.currentTarget.value)}
            onKeyDown={onInputKeyDown} />
          <button type="submit" disabled={!draft.trim() || pending} aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M4 12h15M13 5l7 7-7 7" />
            </svg>
          </button>
        </form>
        <p className="companion-chat-disclaimer">PREDEFINED RESPONSES · NO LIVE AI SERVICE</p>
      </section>
    </div>,
    portalRoot,
  );
}
