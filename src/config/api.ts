// API Configuration
// Set this to 'local' to use local development server, 'deployed' to use the live API
const API_MODE = 'deployed' as const;

const API_CONFIG = {
  local: {
    baseUrl: 'http://localhost:8787',
    chatEndpoint: '/api/chat',
    organizationsEndpoint: '/api/organizations',
    healthEndpoint: '/api/health',
    matterCreationEndpoint: '/api/matter-creation'
  },
  deployed: {
    baseUrl: 'https://blawby-ai-chatbot.paulchrisluke.workers.dev',
    chatEndpoint: '/api/chat',
    organizationsEndpoint: '/api/organizations',
    healthEndpoint: '/api/health',
    matterCreationEndpoint: '/api/matter-creation'
  }
};

export const getApiConfig = () => {
  return API_CONFIG[API_MODE];
};

export const getChatEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.chatEndpoint}`;
};

export const getFormsEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/forms`;
};

export const getFeedbackEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/feedback`;
};

export const getOrganizationsEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.organizationsEndpoint}`;
};

export const getHealthEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.healthEndpoint}`;
};

export const getMatterCreationEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.matterCreationEndpoint}`;
}; 