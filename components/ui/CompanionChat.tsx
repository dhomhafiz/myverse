'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { companionConversation, CompanionChatError, MAX_COMPANION_MESSAGE_LENGTH } from '@/lib/companion-api';
import { createCompanionRequest } from '@/lib/companion-request';

type Message = { id: number; role: 'assistant' | 'user'; text: string };
type ViewportMetrics = { height: number; offsetTop: number } | null;

const MAX_MESSAGES = 40;
const markdownElements = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'a'];
const subscribeToPortal = () => () => {};
const getPortalSnapshot = () => document.body;
const getServerPortalSnapshot = () => null;
const isSafeMarkdownHref = (href: string) => {
  const value = href.trim();
  if (!value || value.startsWith('//')) return false;
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1].toLowerCase();
  return !protocol || ['http', 'https', 'mailto'].includes(protocol);
};
const initialMessages: Message[] = [{
  id: 0,
  role: 'assistant',
  text: 'Hi, I’m MyVerse’s AI Companion. Ask me about Hafiz’s projects, skills, or contact details.',
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
  const [request] = useState(() => createCompanionRequest(companionConversation.provider));
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const lastAutoScrolledMessage = useRef(0);
  const nextId = useRef(1);

  useEffect(() => () => request.cancel(), [request]);

  const closeChat = useCallback(() => {
    request.cancel();
    onClose();
  }, [onClose, request]);

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
    const list = messageList.current;
    const latest = messages[messages.length - 1];
    if (!list || !latest || latest.id === lastAutoScrolledMessage.current) return;
    lastAutoScrolledMessage.current = latest.id;
    if (latest.id === 0) return;
    if (latest.role === 'user') {
      list.scrollTop = list.scrollHeight;
      return;
    }
    const message = list.querySelector<HTMLElement>(`[data-message-id="${latest.id}"]`);
    if (message) {
      list.scrollTop += message.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientTop;
    }
  }, [messages]);

  const addMessage = useCallback((role: Message['role'], text: string) => {
    setMessages(current => [...current, { id: nextId.current++, role, text }].slice(-MAX_MESSAGES));
  }, []);

  const requestResponse = useCallback((raw: string) => {
    try {
      request.submit(raw, {
        onStart(prompt) {
          addMessage('user', prompt);
          setDraft('');
          setPending(true);
          setError('');
          onAcknowledge();
        },
        onReply(response) { addMessage('assistant', response); onAcknowledge(); },
        onError(reason, prompt) {
          setError(reason instanceof CompanionChatError ? reason.message : 'The reply could not be loaded. Your message is still here.');
          setDraft(current => current || prompt);
        },
        onSettled() { setPending(false); },
      });
    } catch (reason) {
      setError(reason instanceof CompanionChatError ? reason.message : 'That message could not be sent.');
    }
  }, [addMessage, onAcknowledge, request]);

  const send = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestResponse(draft);
  }, [draft, requestResponse]);

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
        closeChat();
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
  }, [closeChat]);

  if (!portalRoot) return null;
  const tooLong = draft.length > MAX_COMPANION_MESSAGE_LENGTH;
  const visibleError = tooLong ? 'Please keep your message within 500 characters.' : error;
  const style: CSSProperties = viewport ? {
    '--companion-viewport-height': `${viewport.height}px`,
    '--companion-viewport-offset': `${viewport.offsetTop}px`,
  } as CSSProperties : {};

  return createPortal(
    <div className="companion-chat-overlay" style={style} data-reduced-motion={reducedMotion}
      data-conversation-active={messages.some(message => message.role === 'user')}>
      <div className="companion-chat-scrim" aria-hidden="true" />
      <section ref={panel} className="companion-chat-panel" role="dialog" aria-modal="true"
        aria-busy={pending}
        aria-labelledby="companion-chat-title" aria-describedby="companion-chat-subtitle">
        <header className="companion-chat-header">
          <div className="companion-chat-heading">
            <p id="companion-chat-title">MYVERSE // AI COMPANION</p>
            <p id="companion-chat-subtitle">ASK ABOUT THE CREATOR</p>
          </div>
          <button className="companion-chat-close" type="button" onClick={closeChat} aria-label="Back to Room">
            <span aria-hidden="true">×</span>
            <span>BACK TO ROOM</span>
          </button>
        </header>
        <ol ref={messageList} className="companion-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.map(message => (
            <li className={`companion-chat-message companion-chat-message--${message.role}`} data-message-id={message.id} key={message.id}>
              <span className="companion-chat-sender">{message.role === 'assistant' ? 'COMPANION' : 'YOU'}</span>
              {message.role === 'assistant' ? (
                <div className="companion-chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkBreaks]} allowedElements={markdownElements}
                    components={{
                      a: ({ href, children }) => isSafeMarkdownHref(href ?? '')
                        ? <a href={href} rel="noopener noreferrer">{children}</a>
                        : <>{children}</>,
                    }}>
                    {message.text}
                  </ReactMarkdown>
                </div>
              ) : <p>{message.text}</p>}
            </li>
          ))}
          {pending && (
            <li className="companion-chat-thinking" role="status">
              <span className="companion-chat-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
              THINKING
            </li>
          )}
        </ol>
        {visibleError && (
          <div className="companion-chat-error" role="alert">
            <p>{visibleError}</p>
          </div>
        )}
        <form className="companion-chat-composer" onSubmit={send}>
          <label className="companion-visually-hidden" htmlFor="companion-chat-input">Message the AI Companion</label>
          <textarea ref={input} id="companion-chat-input" value={draft} rows={2}
            aria-invalid={tooLong} aria-describedby="companion-chat-limit"
            placeholder="Ask about Hafiz’s work..." onChange={event => setDraft(event.currentTarget.value)}
            onKeyDown={onInputKeyDown} />
          <button type="submit" disabled={!draft.trim() || pending || tooLong} aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M4 12h15M13 5l7 7-7 7" />
            </svg>
          </button>
        </form>
        <p id="companion-chat-limit" className="companion-chat-disclaimer">{draft.length} / {MAX_COMPANION_MESSAGE_LENGTH}</p>
        <p className="companion-chat-disclaimer">{companionConversation.mode === 'local-api'
          ? 'PORTFOLIO FAQ · AI GENERATION DISABLED' : companionConversation.mode === 'worker-api'
            ? 'MYVERSE COMPANION · CLOUDFLARE API' : 'PREDEFINED RESPONSES · NO LIVE AI SERVICE'}</p>
      </section>
    </div>,
    portalRoot,
  );
}
