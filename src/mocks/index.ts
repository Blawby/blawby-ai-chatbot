let mocksStarted = false;

export async function setupMocks(): Promise<void> {
  if (mocksStarted || typeof window === 'undefined') {
    return;
  }

  const { worker } = await import('./browser');
  await worker.start({
    onUnhandledRequest: 'bypass'
  });
  mocksStarted = true;
}
