const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'flexible' | 'invisible';
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
      if (import.meta.env.DEV) {
        console.error('[turnstile] Script load failed:', error.message);
      }
      reject(error);
    };

    if (!existingScript) {
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      script.onerror = () => {
        cleanup(new Error('Failed to load the Turnstile script. This may be due to Cloudflare challenge blocking the script.'));
      };
      document.head.appendChild(script);
    }

    const start = Date.now();
    const checkReady = () => {
      if (window.turnstile) {
        if (import.meta.env.DEV) {
          console.log('[turnstile] Script loaded successfully');
        }
        resolve();
        return;
      }
      if (Date.now() - start > 10000) {
        cleanup(new Error('Turnstile script did not become ready in time. This may be due to Cloudflare challenge blocking the script.'));
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
  state.container.style.bottom = '0';
  state.container.style.right = '0';
  state.container.style.width = '0';
  state.container.style.height = '0';
  state.container.style.opacity = '0';
  state.container.style.pointerEvents = 'none';
  state.container.style.zIndex = '2147483647';
  document.body.appendChild(state.container);

  try {
    state.widgetId = window.turnstile.render(state.container, {
      sitekey: siteKey,
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
        }
        finalizeActiveExecution();
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

export async function getTurnstileToken(): Promise<string> {
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

  // If already executing, wait for it to complete or reset
  if (state.isExecuting) {
    if (state.widgetId && window.turnstile?.reset) {
      window.turnstile.reset(state.widgetId);
      state.isExecuting = false;
      finalizeActiveExecution();
    } else {
      // Wait a bit and retry
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          getTurnstileToken().then(resolve).catch(reject);
        }, 100);
      });
    }
  }

  state.activePromise = (async () => {
    try {
      const id = await ensureWidget(TURNSTILE_SITE_KEY);

      // Double-check we're not already executing
      if (state.isExecuting) {
        throw new Error('Turnstile widget is already executing');
      }

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

        // Set executing flag BEFORE calling execute
        state.isExecuting = true;

        try {
          if (import.meta.env.DEV) {
            console.log('[turnstile] Executing widget:', id);
          }
          // Don't use reset: true if already executing - just execute normally
          window.turnstile?.execute(id);
        } catch (error) {
          state.isExecuting = false;
          finalizeActiveExecution();
          const errorMessage = error instanceof Error ? error.message : 'Failed to execute Turnstile.';
          if (import.meta.env.DEV) {
            console.error('[turnstile] Execute failed:', errorMessage);
          }
          // If widget is already executing, wait a bit and retry
          if (errorMessage.includes('already executing')) {
            state.isExecuting = false;
            finalizeActiveExecution();
            // Reset and try again after a short delay
            setTimeout(() => {
              if (state.widgetId && window.turnstile) {
                window.turnstile.reset(state.widgetId);
              }
              getTurnstileToken().then(resolve).catch(reject);
            }, 200);
            return;
          }
          reject(new Error(errorMessage));
        }
      });
    } catch (error) {
      state.isExecuting = false;
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
