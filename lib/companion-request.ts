import type { ConversationProvider } from './companion-chat.ts';
import type { CompanionHistoryMessage } from './companion-chat.ts';
import { validateCompanionPrompt } from './companion-api.ts';

type Callbacks = { onStart: (prompt: string) => void; onReply: (reply: Awaited<ReturnType<ConversationProvider['respond']>>) => void;
  onError: (error: unknown, prompt: string) => void; onSettled: () => void };

export function appendCompanionHistory(
  history: readonly CompanionHistoryMessage[],
  prompt: string,
  reply: string,
): CompanionHistoryMessage[] {
  const assistantContent = reply.length > 1_000 ? `${reply.slice(0, 997)}...` : reply;
  return [
    ...history,
    { role: 'user' as const, content: prompt },
    { role: 'assistant' as const, content: assistantContent },
  ].slice(-10);
}

// Shared lifecycle for the one responsive desktop/mobile chat.
export function createCompanionRequest(provider: ConversationProvider) {
  let active: AbortController | null = null;
  return {
    get pending() { return active !== null; },
    cancel() {
      const previous = active;
      active = null; // Invalidate before abort callbacks can run.
      previous?.abort();
    },
    submit(raw: string, history: readonly CompanionHistoryMessage[], callbacks: Callbacks): boolean {
      if (active) return false;
      const prompt = validateCompanionPrompt(raw);
      const controller = new AbortController();
      active = controller;
      callbacks.onStart(prompt);
      void (async () => {
        try {
          const reply = await provider.respond(prompt, controller.signal, history);
          if (active === controller && !controller.signal.aborted) callbacks.onReply(reply);
        } catch (error) {
          if (active === controller && !controller.signal.aborted) callbacks.onError(error, prompt);
        } finally {
          if (active === controller) { active = null; callbacks.onSettled(); }
        }
      })();
      return true;
    },
  };
}
