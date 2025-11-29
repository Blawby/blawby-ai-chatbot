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
    const { worker } = await import('./browser');
    await worker.start({
      onUnhandledRequest: 'bypass'
    });
    mocksStarted = true;
    mocksStartedPromise = null;
  })();

  await mocksStartedPromise;
}
