export { handleHealth } from './health';
export { handleRoot } from './root';
export { handleAgentStreamV2 as handleAgentStream } from './agent';
export { handleForms } from './forms';
// Organization management is handled by remote API, but workspace endpoints remain for chatbot data
export { handleOrganizations } from './organizations';
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
export { handleUsage } from './usage';
// Stripe webhooks are handled by remote API
