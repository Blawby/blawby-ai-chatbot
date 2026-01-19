/**
 * URL Configuration - Single Source of Truth
 * 
 * This file centralizes all URL configuration logic to prevent duplication
 * and confusion. All other files should import from here instead of directly
 * accessing environment variables.
 * 
 * ARCHITECTURE:
 * This application uses TWO separate backends:
 * 
 * 1. WORKER API (Cloudflare Worker)
 *    - Handles: /api/chat, /api/conversations, /api/inbox, /api/files, /api/lawyers
 *    - Dev: http://localhost:8787
 *    - Prod: Same origin as frontend (ai.blawby.com)
 * 
 * 2. BACKEND API (Remote Node.js server - blawby-ts repository)
 *    - Handles: /api/auth/*, /api/practices, /api/subscription/*, /api/members/*
 *    - Dev/Prod: must be set via env var
 * 
 * ENDPOINT ROUTING GUIDE:
 * 
 * WORKER API (use getWorkerApiUrl()):
 *   /api/chat/*                    - AI chat conversations
 *   /api/conversations/*           - Conversation management
 *   /api/inbox/*                   - Inbox messages
 *   /api/files/*                   - File uploads/downloads
 *   /api/lawyers/*                 - Lawyer search
 *   /api/status                    - Status check
 *   /api/health                    - Health check
 *   /api/practices/:id/workspace/* - Practice workspace data (chatbot-specific)
 * 
 * BACKEND API (use getBackendApiUrl()):
 *   /api/auth/*                    - Better Auth endpoints (login, signup, etc.)
 *   /api/practices/*               - Practice CRUD operations
 *   /api/subscription/*            - Subscription management
 *   /api/members/*                 - Member management
 *   /api/practice/client-intakes/* - Intake settings, status, creation
 *   /api/conversations/:id/link    - Conversation link generation
 */

import { isDevelopment } from '@/shared/utils/environment';

/**
 * Get base URL for the frontend application.
 *
 * Priority:
 * 1. Browser: window.location.origin
 * 2. SSR/Build: VITE_APP_BASE_URL
 *
 * @returns The base URL for the frontend
 * @throws {Error} If the frontend base URL cannot be determined
 */
export function getFrontendBaseUrl(): string {
	if (typeof window !== 'undefined' && window.location?.origin) {
		return window.location.origin;
	}

	const explicit = import.meta.env.VITE_APP_BASE_URL;
	if (explicit) {
		return explicit;
	}

	throw new Error(
		'Frontend base URL could not be determined. ' +
		'Set VITE_APP_BASE_URL or ensure window.location is available.'
	);
}

/**
 * Get URL for Cloudflare Worker API
 * 
 * This is the Worker that handles chat, conversations, inbox, files, etc.
 * In production, it's deployed on the same domain as the frontend.
 * 
 * Priority:
 * 1. VITE_WORKER_API_URL (primary override)
 * 2. Browser: window.location.origin (same as frontend)
 * 3. Development: http://localhost:8787
 * 4. SSR/Build: VITE_APP_BASE_URL (required)
 *
 * NOTE: Base URL should NOT include `/api`. If it does, we normalize it away.
 * 
 * @returns The base URL for the Worker API
 */
export function getWorkerApiUrl(): string {
	const normalizeWorkerBaseUrl = (value: string): string => value.replace(/\/api\/?$/, '');

	let baseUrl: string;

	// Prefer explicit override when provided.
	if (import.meta.env.VITE_WORKER_API_URL) {
		// ENV VAR: VITE_WORKER_API_URL (primary override)
		baseUrl = import.meta.env.VITE_WORKER_API_URL;
	} else if (typeof window !== 'undefined' && window.location?.origin) {
		// Browser: same-origin to support session cookies.
		baseUrl = getFrontendBaseUrl();
	} else if (isDevelopment()) {
		// Development: use localhost
		baseUrl = 'http://localhost:8787';
	} else {
		// SSR/Build: require explicit frontend base URL
		baseUrl = getFrontendBaseUrl();
	}

	return normalizeWorkerBaseUrl(baseUrl);
}

/**
 * Get URL for remote backend API
 * 
 * This is the Node.js server (blawby-ts repository) that handles
 * authentication, practice management, subscriptions, etc.
 * 
 * Priority:
 * 1. VITE_BACKEND_API_URL (required)
 * 2. Throws error if not set
 * 
 * @returns The base URL for the backend API
 * @throws {Error} If VITE_BACKEND_API_URL is not set
 */
export function getBackendApiUrl(): string {
	// ENV VAR: VITE_BACKEND_API_URL (required in all environments)
	// Points to Better Auth backend (e.g., http://localhost:3000 or https://production-api.blawby.com)
	const explicit = import.meta.env.VITE_BACKEND_API_URL;
	if (explicit) {
		return explicit;
	}

	throw new Error(
		'VITE_BACKEND_API_URL is required. ' +
		'Set it for local development and in Cloudflare Pages. ' +
		'Example: http://localhost:3000 or https://production-api.blawby.com'
	);
}
/**
 * Extract host from backend API URL
 * 
 * Useful for trusted URL validation (e.g., payment callbacks)
 * 
 * @returns The hostname of the backend API
 * @throws {Error} If backend URL is invalid
 */
export function getBackendHost(): string {
	try {
		const url = getBackendApiUrl();
		return new URL(url).host;
	} catch (error) {
		if (error instanceof Error && error.message.includes('VITE_BACKEND_API_URL')) {
			// Re-throw configuration errors as-is
			throw error;
		}
		// Invalid URL format
		throw new Error(`Invalid backend API URL: ${getBackendApiUrl()}`);
	}
}

/**
 * Extract host from frontend URL
 * 
 * Useful for trusted URL validation (e.g., payment callbacks)
 * 
 * @returns The hostname of the frontend
 * @throws {Error} If frontend URL cannot be determined
 */
export function getFrontendHost(): string {
	const baseUrl = getFrontendBaseUrl();
	try {
		return new URL(baseUrl).host;
	} catch {
		throw new Error(`Invalid frontend URL from env: ${baseUrl}`);
	}
}

/**
 * Get list of trusted hosts for URL validation
 * 
 * Used for validating return URLs (e.g., payment callbacks)
 * to prevent open-redirect vulnerabilities.
 * 
 * @returns Array of trusted hostnames
 */
export function getTrustedHosts(): string[] {
	const hosts: string[] = [];

	try {
		hosts.push(getBackendHost());
	} catch {
		// Backend host not available (shouldn't happen in browser context)
	}

	try {
		hosts.push(getFrontendHost());
	} catch {
		// Frontend host not available (shouldn't happen in browser context)
	}

	return Array.from(new Set(hosts));
}
