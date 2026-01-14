const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'flexible';
  language?: string;
};

type TurnstileClient = {
  render: (element: string | HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  execute: (widgetId: string, options?: { reset?: boolean }) => void;
};

type TurnstileState = {
  scriptPromise: Promise<void> | null;
  widgetId: string | null;
  container: HTMLDivElement | null;
  activePromise: Promise<string> | null;
  activeResolver: ((token: string) => void) | null;
  activeRejecter: ((error: Error) => void) | null;
  warnedMissingKey: boolean;
  isExecuting: boolean;
};

declare global {
  interface Window {
    turnstile?: TurnstileClient;
    __blawbyTurnstileState__?: TurnstileState;
  }
}

const TURNSTILE_STATE_KEY = '__blawbyTurnstileState__';

const state: TurnstileState = (() => {
  const initial: TurnstileState = {
    scriptPromise: null,
    widgetId: null,
    container: null,
    activePromise: null,
    activeResolver: null,
    activeRejecter: null,
    warnedMissingKey: false,
    isExecuting: false
  };
  if (typeof window === 'undefined') {
    return initial;
  }

  const existing = window[TURNSTILE_STATE_KEY];
  if (existing) {
    return existing;
  }

  window[TURNSTILE_STATE_KEY] = initial;
  return initial;
})();

function finalizeActiveExecution() {
  state.activePromise = null;
  state.activeResolver = null;
  state.activeRejecter = null;
  state.isExecuting = false;
}

function ensureTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile is only available in the browser.'));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (state.scriptPromise) {
    return state.scriptPromise;
  }

  state.scriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile-script="true"]'
    );
    const script =
      existingScript ?? document.createElement('script');
    const shouldRemoveScript = !existingScript;

    const cleanup = (error: Error) => {
      if (shouldRemoveScript && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      state.scriptPromise = null;
      reject(error);
    };

    if (!existingScript) {
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      script.onerror = () => {
        cleanup(new Error('Failed to load the Turnstile script.'));
      };
      document.head.appendChild(script);
    }

    const start = Date.now();
    const checkReady = () => {
      if (window.turnstile) {
        resolve();
        return;
      }
      if (Date.now() - start > 10000) {
        cleanup(new Error('Turnstile script did not become ready in time.'));
        return;
      }
      setTimeout(checkReady, 50);
    };

    checkReady();
  });

  return state.scriptPromise;
}

async function ensureWidget(siteKey: string): Promise<string> {
  await ensureTurnstileScript();
  if (!window.turnstile) {
    throw new Error('Turnstile API is unavailable after script load.');
  }

  if (state.widgetId) {
    return state.widgetId;
  }

  state.container = document.createElement('div');
  state.container.style.position = 'fixed';
  state.container.style.bottom = '16px';
  state.container.style.right = '16px';
  state.container.style.zIndex = '2147483647';
  state.container.style.display = 'block';
  document.body.appendChild(state.container);

  try {
    state.widgetId = window.turnstile.render(state.container, {
      sitekey: siteKey,
      size: 'compact',
      callback: (token: string) => {
        if (state.activeResolver) {
          state.activeResolver(token);
          finalizeActiveExecution();
        }
      },
      'error-callback': (error: string) => {
        if (state.activeRejecter) {
          state.activeRejecter(new Error(`CAPTCHA error: ${error}`));
        }
        if (state.widgetId && window.turnstile) {
          window.turnstile.reset(state.widgetId);
        }
        finalizeActiveExecution();
      },
      'expired-callback': () => {
        if (state.widgetId && window.turnstile) {
          window.turnstile.reset(state.widgetId);
        }
        if (state.activeRejecter) {
          state.activeRejecter(new Error('CAPTCHA expired.'));
          finalizeActiveExecution();
        }
      }
    });
  } catch (error) {
    if (state.container?.parentNode) {
      state.container.parentNode.removeChild(state.container);
    }
    state.container = null;
    state.widgetId = null;
    throw error instanceof Error ? error : new Error('Failed to render Turnstile widget.');
  }

  return state.widgetId;
}

export async function getTurnstileToken(): Promise<string | null> {
  if (!TURNSTILE_SITE_KEY) {
    if (!state.warnedMissingKey) {
      console.error('[turnstile] VITE_TURNSTILE_SITE_KEY not set; cannot request CAPTCHA token.');
      state.warnedMissingKey = true;
    }
    throw new Error('VITE_TURNSTILE_SITE_KEY is required to request CAPTCHA tokens.');
  }

  if (state.activePromise) {
    return state.activePromise;
  }

  if (state.isExecuting && state.widgetId && window.turnstile?.reset) {
    window.turnstile.reset(state.widgetId);
    state.isExecuting = false;
  }

  state.activePromise = (async () => {
    try {
      const id = await ensureWidget(TURNSTILE_SITE_KEY);
      return new Promise<string>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          if (state.activeRejecter) {
            state.activeRejecter(new Error('CAPTCHA timed out.'));
          }
          if (state.widgetId && window.turnstile) {
            window.turnstile.reset(state.widgetId);
          }
          finalizeActiveExecution();
        }, 15000);

        state.activeResolver = (token: string) => {
          window.clearTimeout(timeoutId);
          resolve(token);
        };
        state.activeRejecter = (error: Error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        };
        state.isExecuting = true;

        try {
          window.turnstile?.execute(id, { reset: true });
        } catch (error) {
          finalizeActiveExecution();
          reject(error instanceof Error ? error : new Error('Failed to execute Turnstile.'));
        }
      });
    } catch (error) {
      finalizeActiveExecution();
      throw error;
    }
  })();

  return state.activePromise;
}

export function resetTurnstileWidget() {
  if (state.widgetId && window.turnstile) {
    window.turnstile.reset(state.widgetId);
  }
}
