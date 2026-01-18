// API Configuration
// This file provides endpoint builders for both Worker and Backend APIs
// All URL logic is centralized in src/config/urls.ts

import { getWorkerApiUrl, getBackendApiUrl } from './urls';

/**
 * Get the base URL for Worker API requests
 * @deprecated Use getWorkerApiUrl() from '@/config/urls' directly
 */
function getBaseUrl(): string {
  return getWorkerApiUrl();
}

/**
 * Get the base URL for backend API requests
 * @deprecated Use getBackendApiUrl() from '@/config/urls' directly
 */
export function getRemoteApiUrl(): string {
  return getBackendApiUrl();
}

const API_CONFIG = {
  baseUrl: getBaseUrl(),
  chatEndpoint: '/api/chat',
  practicesEndpoint: '/api/practices',
  healthEndpoint: '/api/health',
  matterCreationEndpoint: '/api/matter-creation'
};

export const getApiConfig = () => {
  return API_CONFIG;
};

export const getChatEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.chatEndpoint}`;
};

// Forms share the same remote API base as auth/backend.
export const getFormsApiUrl = () => {
  return getRemoteApiUrl();
};

export const getFormsEndpoint = () => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/create`;
};

export const getPracticeClientIntakeSettingsEndpoint = (slug: string) => {
  return `${getFormsApiUrl()}/api/practice-client-intakes/${encodeURIComponent(slug)}/intake`;
};

export const getPracticeClientIntakeCreateEndpoint = () => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/create`;
};

export const getPracticeClientIntakeUpdateEndpoint = (uuid: string) => {
  return `${getFormsApiUrl()}/api/practice-client-intakes/${encodeURIComponent(uuid)}`;
};

export const getPracticeClientIntakeStatusEndpoint = (uuid: string) => {
  return `${getFormsApiUrl()}/api/practice-client-intakes/${encodeURIComponent(uuid)}/status`;
};

// Practice workspace endpoints (chatbot data) - still local
export const getPracticesEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.practicesEndpoint}`;
};

export const getHealthEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.healthEndpoint}`;
};

export const getMatterCreationEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.matterCreationEndpoint}`;
};

// Subscription endpoints - now handled by remote API
export const getSubscriptionBillingPortalEndpoint = () => {
  return `${getRemoteApiUrl()}/api/auth/subscription/billing-portal`;
};

export const getSubscriptionCancelEndpoint = () => {
  return `${getRemoteApiUrl()}/api/subscription/cancel`;
};

export const getSubscriptionListEndpoint = () => {
  return `${getRemoteApiUrl()}/api/auth/subscription/list`;
};

// Practice management endpoints - now handled by remote API
export const getPracticesManagementEndpoint = () => {
  return `${getRemoteApiUrl()}/api/practices`;
};

export const getPracticeManagementEndpoint = (practiceId: string) => {
  return `${getRemoteApiUrl()}/api/practices/${encodeURIComponent(practiceId)}`;
};

export const getPracticeWorkspaceEndpoint = (practiceId: string, resource: string) => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/practices/${encodeURIComponent(practiceId)}/workspace/${encodeURIComponent(resource)}`;
};

// Session endpoints - now handled by remote API
// Session endpoints removed - using conversations instead
/**
 * @deprecated Sessions have been migrated to conversations. Use getConversationsEndpoint() instead.
 * This function is kept for backward compatibility with legacy code.
 */
export const getSessionsEndpoint = () => {
  return getConversationsEndpoint();
};

// Conversation endpoints - handled by local worker
export const getConversationsEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/conversations`;
};

export const getConversationEndpoint = (conversationId: string) => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/conversations/${encodeURIComponent(conversationId)}`;
};

export const getCurrentConversationEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/conversations/active`;
};

export const getConversationParticipantsEndpoint = (conversationId: string) => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/participants`;
};

export const getConversationLinkEndpoint = (conversationId: string) => {
  return `${getRemoteApiUrl()}/api/conversations/${encodeURIComponent(conversationId)}/link`;
};

// Chat message endpoints - handled by local worker
export const getChatMessagesEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/chat/messages`;
};

// Intake confirmation endpoint - handled by local worker
export const getIntakeConfirmEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/intakes/confirm`;
};
