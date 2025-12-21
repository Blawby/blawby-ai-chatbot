let mocksStarted = false;
let mocksStartedPromise: Promise<void> | null = null;

export async function setupMocks(): Promise<void> {
  if (typeof window === 'undefined' || mocksStarted) {
    return;
  }

  if (mocksStartedPromise) {
    await mocksStartedPromise;
    return;
  }

  mocksStartedPromise = (async () => {
    try {
      const { worker } = await import('./browser');
      console.log('[MSW] Starting worker...');
      await worker.start({
        onUnhandledRequest: (req) => {
          // Log unhandled requests for debugging
          if (req.url.includes('/api/')) {
            console.warn('[MSW] Unhandled request:', req.method, req.url);
          }
        },
        serviceWorker: {
          url: '/mockServiceWorker.js',
          options: {
            scope: '/'
          }
        }
      });
      console.log('[MSW] Mock service worker started successfully');
      mocksStarted = true;
      mocksStartedPromise = null;
    } catch (error) {
      console.error('[MSW] Failed to start mock service worker:', error);
      mocksStartedPromise = null;
      throw error;
    }
  })();

  await mocksStartedPromise;
}
