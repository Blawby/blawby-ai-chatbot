// API Configuration
// This file provides endpoint builders for both Worker and Backend APIs
// All URL logic is centralized in src/config/urls.ts

import { getWorkerApiUrl } from './urls';

const API_CONFIG = {
  baseUrl: getWorkerApiUrl(),
  practicesEndpoint: '/api/practices',
  healthEndpoint: '/api/health',
  matterCreationEndpoint: '/api/matter-creation'
};

export const getApiConfig = () => {
  return API_CONFIG;
};

// Forms share the same backend API base as auth.
export const getFormsApiUrl = () => {
  return getWorkerApiUrl();
};

export const getFormsEndpoint = () => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/create`;
};

export const getPracticeClientIntakeSettingsEndpoint = (slug: string) => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/${encodeURIComponent(slug)}/intake`;
};

export const getPracticeClientIntakeCreateEndpoint = () => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/create`;
};

export const getPracticeClientIntakeUpdateEndpoint = (uuid: string) => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/${encodeURIComponent(uuid)}`;
};

export const getPracticeClientIntakeStatusEndpoint = (uuid: string) => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/${encodeURIComponent(uuid)}/status`;
};

export const getPracticeClientIntakeCheckoutSessionEndpoint = (uuid: string) => {
  return `${getFormsApiUrl()}/api/practice/client-intakes/${encodeURIComponent(uuid)}/checkout-session`;
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
  return `${getWorkerApiUrl()}/api/auth/subscription/billing-portal`;
};

export const getSubscriptionCancelEndpoint = () => {
  return `${getWorkerApiUrl()}/api/subscriptions/cancel`;
};

export const getSubscriptionListEndpoint = () => {
  return `${getWorkerApiUrl()}/api/auth/subscription/list`;
};

// Practice management endpoints - now handled by remote API
export const getPracticesManagementEndpoint = () => {
  return `${getWorkerApiUrl()}/api/practice`;
};

export const getPracticeManagementEndpoint = (practiceId: string) => {
  return `${getWorkerApiUrl()}/api/practice/${encodeURIComponent(practiceId)}`;
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

export const getConversationWsEndpoint = (conversationId: string) => {
  const config = getApiConfig();
  const url = new URL(`${config.baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

export const getParalegalStatusEndpoint = (practiceId: string, matterId: string) => {
  const baseUrl = getWorkerApiUrl();
  return `${baseUrl}/api/paralegal/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/status`;
};

export const getParalegalStatusWsEndpoint = (practiceId: string, matterId: string) => {
  const baseUrl = getWorkerApiUrl();
  const url = new URL(`${baseUrl}/api/paralegal/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
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
  return `${getWorkerApiUrl()}/api/conversations/${encodeURIComponent(conversationId)}/link`;
};

// Conversation message endpoints - handled by local worker
export const getConversationMessagesEndpoint = (conversationId: string) => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/messages`;
};

export const getConversationMessageReactionsEndpoint = (conversationId: string, messageId: string) => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`;
};
