export { handleHealth } from './health';
export { handleRoot } from './root';
export { handleForms } from './forms';
// Organization management is handled by remote API, but workspace endpoints remain for chatbot data
export { handlePractices } from './practices';
export { handleSessions } from './sessions';
export { handleActivity } from './activity';
// Auth is now handled by remote server - removed handleAuth
export { handleConfig } from './config';

export { handleFiles } from './files';
export { handleAnalyze } from './analyze';

export { handleReview } from './review';
// Payment, subscription, onboarding, and user management are handled by remote API
export { handlePDF } from './pdf';
export { handleDebug } from './debug';
// Stripe webhooks are handled by remote API
