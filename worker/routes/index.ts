export { handleHealth } from './health';
export { handleRoot } from './root';
// Practice management is handled by remote API, but workspace endpoints remain for chatbot data
export { handlePractices } from './practices';
// Sessions removed - using activity endpoint instead
export { handleActivity } from './activity';
// Auth is now handled by remote server - removed handleAuth
export { handleConfig } from './config';
export { handlePracticeDetails } from './practiceDetails';

export { handleFiles } from './files';
export { handleAnalyze } from './analyze';
export { handleNotifications } from './notifications';

// Payment, subscription, onboarding, and user management are handled by remote API
export { handlePDF } from './pdf';
export { handleDebug } from './debug';
// Stripe webhooks are handled by remote API
