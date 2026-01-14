const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ??
  import.meta.env.REACT_APP_TURNSTILE_SITE_KEY ??
  '';

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'invisible';
  language?: string;
};

type TurnstileClient = {
  render: (element: string | HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  execute: (widgetId: string, options?: { reset?: boolean }) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileClient;
  }
}

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
let container: HTMLDivElement | null = null;
let activePromise: Promise<string> | null = null;
let activeResolver: ((token: string) => void) | null = null;
let activeRejecter: ((error: Error) => void) | null = null;
let warnedMissingKey = false;

function finalizeActiveExecution() {
  activePromise = null;
  activeResolver = null;
  activeRejecter = null;
}

function ensureTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile is only available in the browser.'));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
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
      scriptPromise = null;
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

  return scriptPromise;
}

async function ensureWidget(siteKey: string): Promise<string> {
  await ensureTurnstileScript();
  if (!window.turnstile) {
    throw new Error('Turnstile API is unavailable after script load.');
  }

  if (widgetId) {
    return widgetId;
  }

  container = document.createElement('div');
  container.style.display = 'none';
  document.body.appendChild(container);

  try {
    widgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      size: 'invisible',
      callback: (token: string) => {
        if (activeResolver) {
          activeResolver(token);
          finalizeActiveExecution();
        }
      },
      'error-callback': (error: string) => {
        if (activeRejecter) {
          activeRejecter(new Error(`CAPTCHA error: ${error}`));
          finalizeActiveExecution();
        }
      },
      'expired-callback': () => {
        if (widgetId && window.turnstile) {
          window.turnstile.reset(widgetId);
        }
      }
    });
  } catch (error) {
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    widgetId = null;
    throw error instanceof Error ? error : new Error('Failed to render Turnstile widget.');
  }

  return widgetId;
}

export async function getTurnstileToken(): Promise<string | null> {
  if (!TURNSTILE_SITE_KEY) {
    if (import.meta.env.DEV) {
      if (!warnedMissingKey) {
        console.warn('[turnstile] VITE_TURNSTILE_SITE_KEY not set; skipping CAPTCHA token.');
        warnedMissingKey = true;
      }
      return null;
    }
    throw new Error('Turnstile site key is required to request CAPTCHA tokens.');
  }

  if (activePromise) {
    return activePromise;
  }

  activePromise = (async () => {
    try {
      const id = await ensureWidget(TURNSTILE_SITE_KEY);
      return new Promise<string>((resolve, reject) => {
        activeResolver = resolve;
        activeRejecter = reject;

        try {
          window.turnstile?.execute(id);
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

  return activePromise;
}

export function resetTurnstileWidget() {
  if (widgetId && window.turnstile) {
    window.turnstile.reset(widgetId);
  }
}
