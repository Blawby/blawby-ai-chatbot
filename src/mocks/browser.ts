import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

console.log('[MSW] Registering', handlers.length, 'handlers');
export const worker = setupWorker(...handlers);
