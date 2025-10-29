// Helper functions for waiting for AI messages in tests
export async function waitForCompleteAiMessage(
  container: HTMLElement,
  timeout = 5000
): Promise<HTMLElement | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const message = container.querySelector('[data-testid="ai-message"]');
    if (message && message.textContent && !message.textContent.includes('...')) {
      return message as HTMLElement;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

export async function waitForLastCompleteAiMessage(
  container: HTMLElement,
  timeout = 5000
): Promise<HTMLElement | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const messages = container.querySelectorAll('[data-testid="ai-message"]');
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.textContent && !lastMessage.textContent.includes('...')) {
        return lastMessage as HTMLElement;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

