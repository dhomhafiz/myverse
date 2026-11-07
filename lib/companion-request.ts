import type { ConversationProvider } from './companion-chat.ts';
import { validateCompanionPrompt } from './companion-api.ts';

type Callbacks = { onStart: (prompt: string) => void; onReply: (reply: string) => void;
  onError: (error: unknown, prompt: string) => void; onSettled: () => void };

// Shared lifecycle for the one responsive desktop/mobile chat. No transcript is sent.
export function createCompanionRequest(provider: ConversationProvider) {
  let active: AbortController | null = null;
  return {
    get pending() { return active !== null; },
    cancel() {
      const previous = active;
      active = null; // Invalidate before abort callbacks can run.
      previous?.abort();
    },
    submit(raw: string, callbacks: Callbacks): boolean {
      if (active) return false;
      const prompt = validateCompanionPrompt(raw);
      const controller = new AbortController();
      active = controller;
      callbacks.onStart(prompt);
      void (async () => {
        try {
          const reply = await provider.respond(prompt, controller.signal);
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
