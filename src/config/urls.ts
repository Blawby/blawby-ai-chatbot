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
 *    - Dev: https://staging-api.blawby.com (default)
 *    - Prod: https://production-api.blawby.com (must be set via env var)
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
 *   /api/practice-client-intakes/* - Form submissions
 *   /api/conversations/:id/link    - Conversation link generation
 */

import { isDevelopment } from '@/shared/utils/environment';

/**
 * Get URL for Cloudflare Worker API
 * 
 * This is the Worker that handles chat, conversations, inbox, files, etc.
 * In production, it's deployed on the same domain as the frontend.
 * 
 * Priority:
 * 1. VITE_WORKER_API_URL (if explicitly set)
 * 2. Development: http://localhost:8787
 * 3. Production: window.location.origin (same as frontend)
 * 4. SSR/Build fallback: https://ai.blawby.com
 *
 * NOTE: Base URL should NOT include `/api`. If it does, we normalize it away.
 * 
 * @returns The base URL for the Worker API
 */
export function getWorkerApiUrl(): string {
	const normalizeWorkerBaseUrl = (value: string): string => value.replace(/\/api\/?$/, '');

	let baseUrl: string;

	// ENV VAR: VITE_WORKER_API_URL (optional - auto-detected if not set)
	if (import.meta.env.VITE_WORKER_API_URL) {
		baseUrl = import.meta.env.VITE_WORKER_API_URL;
	} else if (isDevelopment()) {
		// 2. Development: use localhost
		baseUrl = 'http://localhost:8787';
	} else if (typeof window !== 'undefined' && window.location?.origin) {
		// 3. Production: same origin as frontend (Worker is deployed with frontend)
		baseUrl = window.location.origin;
	} else {
		// 4. SSR/Build fallback (shouldn't be used at runtime)
		baseUrl = 'https://ai.blawby.com';
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
 * 1. VITE_BACKEND_API_URL (REQUIRED in production)
 * 2. Development: https://staging-api.blawby.com (fallback with warning)
 * 3. Production: throws error if not set
 * 
 * Special handling for MSW (Mock Service Worker):
 * - If VITE_ENABLE_MSW=true and in development, returns window.location.origin
 *   so MSW can intercept same-origin requests
 * 
 * @returns The base URL for the backend API
 * @throws {Error} In production if VITE_BACKEND_API_URL is not set
 */
export function getBackendApiUrl(): string {
	// ENV VAR: VITE_BACKEND_API_URL (REQUIRED in production, .env file)
	// Points to Better Auth backend (e.g., http://localhost:3000 or https://production-api.blawby.com)
	if (import.meta.env.VITE_BACKEND_API_URL) {
		return import.meta.env.VITE_BACKEND_API_URL;
	}

	// 2. Development fallback with MSW support
	if (isDevelopment()) {
		const enableMocks = import.meta.env.VITE_ENABLE_MSW === 'true';

		if (enableMocks) {
			// MSW enabled - use same origin for interception
			if (typeof window !== 'undefined' && window.location?.origin) {
				console.log('[getBackendApiUrl] DEV mode with MSW - using window.location.origin');
				return window.location.origin;
			}
			// SSR context - MSW can't intercept anyway
			console.warn('[getBackendApiUrl] MSW enabled but window unavailable (SSR context). Falling back to staging.');
			return 'https://staging-api.blawby.com';
		} else {
			// MSW disabled - use staging fallback
			console.warn(
				'[getBackendApiUrl] VITE_BACKEND_API_URL not set. ' +
				'Using staging fallback: https://staging-api.blawby.com'
			);
			return 'https://staging-api.blawby.com';
		}
	}

	// 3. Production - require explicit configuration
	throw new Error(
		'VITE_BACKEND_API_URL is required in production. ' +
		'Please set this environment variable in Cloudflare Pages ' +
		'(Settings > Environment Variables) to your backend API URL. ' +
		'Example: https://production-api.blawby.com'
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
	if (typeof window !== 'undefined' && window.location?.origin) {
		try {
			return new URL(window.location.origin).host;
		} catch {
			// Should not happen
			throw new Error(`Invalid frontend origin: ${window.location.origin}`);
		}
	}

	// Try explicit env vars
	const explicit =
		import.meta.env.VITE_APP_BASE_URL ||
		import.meta.env.VITE_PUBLIC_APP_URL ||
		import.meta.env.VITE_APP_URL;

	if (explicit) {
		try {
			return new URL(explicit).host;
		} catch {
			throw new Error(`Invalid frontend URL from env: ${explicit}`);
		}
	}

	throw new Error(
		'Frontend host could not be determined. ' +
		'Set VITE_APP_BASE_URL or ensure window.location is available.'
	);
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
