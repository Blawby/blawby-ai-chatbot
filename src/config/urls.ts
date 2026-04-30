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
 *    - Handles: /api/conversations, /api/files
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
 *   /api/conversations/*           - Conversation management + messages
 *   /api/ai/chat                   - AI chat responses
 *   /api/files/*                   - File uploads/downloads
 *   /api/status                    - Status check
 *   /api/health                    - Health check
 *   /api/practices/:id/workspace/* - Practice workspace data (chatbot-specific)
 * 
 * BACKEND API (use getBackendApiUrl()):
 *   /api/auth/*                    - Better Auth endpoints (login, signup, etc.)
 *   /api/practices/*               - Practice CRUD operations
 *   /api/subscription/*            - Subscription management
 *   /api/members/*                 - Member management
 *   /api/practice-client-intakes/* - Intake settings, status, creation
 *   /api/clients/*                 - Client user details & memos
 *   /api/conversations/:id/link    - Conversation link generation
 */

import { isDevelopment } from '@/shared/utils/environment';

export const encodeSegment = (value: string): string => encodeURIComponent(value);

const appendQuery = (path: string, query?: Record<string, string | undefined>): string => {
	if (!query) return path;
	const params = new URLSearchParams();
	Object.entries(query).forEach(([key, value]) => {
		if (value !== undefined) {
			params.set(key, value);
		}
	});
	const queryString = params.toString();
	return queryString ? `${path}?${queryString}` : path;
};

export const clientIntakes = (
	practiceId: string,
	query?: Record<string, string | undefined>
): string => appendQuery(`/api/practice-client-intakes/${encodeSegment(practiceId)}`, query);

export const clientIntake = (
	practiceId: string,
	intakeId: string,
	query?: Record<string, string | undefined>
): string => appendQuery(
	`/api/practice-client-intakes/${encodeSegment(practiceId)}/${encodeSegment(intakeId)}`,
	query
);

export const clientIntakeStatus = (intakeId: string): string =>
	`/api/practice-client-intakes/${encodeSegment(intakeId)}/status`;

export const clientIntakeInvite = (intakeId: string): string =>
	`/api/practice-client-intakes/${encodeSegment(intakeId)}/invite`;


export const matterCollectionPath = (practiceId: string): string => `/api/matters/${encodeSegment(practiceId)}`;

export const matterItemPath = (practiceId: string, matterId: string): string =>
	`${matterCollectionPath(practiceId)}/${encodeSegment(matterId)}`;

export const matterNestedPath = (practiceId: string, matterId: string, resource: string): string =>
	`${matterItemPath(practiceId, matterId)}/${resource}`;

export const matterNestedItemPath = (
	practiceId: string,
	matterId: string,
	resource: string,
	itemId: string
): string => `${matterNestedPath(practiceId, matterId, resource)}/${encodeSegment(itemId)}`;

/**
 * Get URL for Cloudflare Worker API
 * 
 * This is the Worker that handles chat, conversations, files, etc.
 * In production, it's deployed on the same domain as the frontend.
 * 
 * Priority:
 * 1. VITE_WORKER_API_URL (primary override)
 * 2. Browser: window.location.origin (same as frontend)
 * 3. Development: http://localhost:8787
 * 4. SSR/Build: VITE_APP_BASE_URL / VITE_PUBLIC_APP_URL / VITE_APP_URL (required)
 *
 * NOTE: Base URL should NOT include `/api`. If it does, we normalize it away.
 * 
 * @returns The base URL for the Worker API
 */
export function getWorkerApiUrl(): string {
	const normalizeWorkerBaseUrl = (value: string): string => value.replace(/\/api\/?$/, '');

	let baseUrl: string;

	// Browser: prefer same-origin to preserve auth/session cookies and avoid CORS in local dev.
	if (typeof window !== 'undefined' && window.location?.origin) {
		baseUrl = window.location.origin;
	} else if (import.meta.env.VITE_WORKER_API_URL) {
		// ENV VAR: VITE_WORKER_API_URL (primary override outside browser/runtime)
		baseUrl = import.meta.env.VITE_WORKER_API_URL;
	} else if (isDevelopment()) {
		// Development: use localhost
		baseUrl = 'http://localhost:8787';
	} else {
		// SSR/Build: require explicit frontend base URL
		const explicit =
			import.meta.env.VITE_APP_BASE_URL ||
			import.meta.env.VITE_PUBLIC_APP_URL ||
			import.meta.env.VITE_APP_URL;

		if (!explicit) {
			throw new Error(
				'Worker base URL could not be determined. ' +
				'Set VITE_WORKER_API_URL or VITE_APP_BASE_URL for SSR/build contexts.'
			);
		}

		baseUrl = explicit;
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
/**
 * Centralized API endpoint helpers
 */
export const urls = {
	clientIntakes,
	clientIntake,
	clientIntakeStatus,
	clientIntakeInvite,
	invoices: (practiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}`,
	invoice: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(invoiceId)}`,
	createInvoice: (practiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}`,
	updateInvoice: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(invoiceId)}`,
	deleteInvoice: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(invoiceId)}`,
	sendInvoice: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(invoiceId)}/send`,
	voidInvoice: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(invoiceId)}/void`,
	syncInvoice: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(invoiceId)}/sync`,
	invoiceRefundRequests: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/${encodeURIComponent(invoiceId)}/refund-requests`,
	clientInvoicesList: (practiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/client`,
	clientInvoice: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/client/${encodeURIComponent(invoiceId)}`,
	clientInvoiceRefundRequests: (practiceId: string, invoiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/client/${encodeURIComponent(invoiceId)}/refund-requests`,
	clientRefundRequests: (practiceId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/client/refund-requests`,
	cancelClientRefundRequest: (practiceId: string, refundRequestId: string) => `/api/invoices/${encodeURIComponent(practiceId)}/client/refund-requests/${encodeURIComponent(refundRequestId)}/cancel`,
	matterUnbilled: (practiceId: string, matterId: string) => `${matterItemPath(practiceId, matterId)}/unbilled`,
	matterCollectionPath,
	matterItemPath,
	matterNestedPath,
	matterNestedItemPath
};

/**
 * Widget/script helpers
 */
export function getWidgetScriptUrl(templateSlug?: string): string {
	// Prefer same-origin in browser to support self-hosted widget loaders.
	let base: string;
	if (typeof window !== 'undefined' && window.location?.origin) {
		base = window.location.origin;
	} else if (import.meta.env.VITE_WIDGET_ORIGIN) {
		base = import.meta.env.VITE_WIDGET_ORIGIN;
	} else if (isDevelopment()) {
		base = 'http://localhost:8787';
    } else {
        base = 'https://app.blawby.com';
    }

	const url = new URL('/widget.js', base);
	if (templateSlug) url.searchParams.set('template', String(templateSlug));
	return url.toString();
}

export function getPublicFormOrigin(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    if (import.meta.env.VITE_PUBLIC_FORM_ORIGIN) {
        return import.meta.env.VITE_PUBLIC_FORM_ORIGIN;
    }
    return 'https://app.blawby.com';
}

const WIDGET_TOKEN_ALLOWLIST_PATTERNS: RegExp[] = [
	/^\/api\/conversations(?:\/|$)/,
	/^\/api\/ai(?:\/|$)/,
	/^\/api\/widget\/bootstrap(?:\/|$)/,
	/^\/api\/widget\/practice-details(?:\/|$)/
];

const WIDGET_TOKEN_DENYLIST_PATTERNS: RegExp[] = [
];

const extractPathname = (requestUrl: string): string | null => {
	const trimmed = requestUrl.trim();
	if (!trimmed) return null;
	try {
		if (trimmed.startsWith('/')) {
			return new URL(trimmed, 'http://localhost').pathname;
		}
		return new URL(trimmed).pathname;
	} catch {
		return null;
	}
};

export const isWidgetTokenEligibleRequestUrl = (requestUrl: string): boolean => {
	const pathname = extractPathname(requestUrl);
	if (!pathname) return false;
	if (WIDGET_TOKEN_DENYLIST_PATTERNS.some((pattern) => pattern.test(pathname))) {
		return false;
	}
	return WIDGET_TOKEN_ALLOWLIST_PATTERNS.some((pattern) => pattern.test(pathname));
};
