/**
 * Environment detection utilities for client-side code
 * Replaces process.env usage with Vite-compatible alternatives
 */

/**
 * Environment configuration interface
 */
export interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
  nodeEnv: string;
}

/**
 * Get environment configuration
 * Uses Vite's import.meta.env for build-time environment detection
 */
export function getEnvironment(): EnvironmentConfig {
  // Use Vite's import.meta.env for environment detection
  const mode = import.meta.env?.MODE || 'development';
  const isDevelopment = mode === 'development';
  const isProduction = mode === 'production';
  const isTest = mode === 'test';

  return {
    isDevelopment,
    isProduction,
    isTest,
    nodeEnv: mode
  };
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return getEnvironment().isDevelopment;
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
  return getEnvironment().isProduction;
}

/**
 * Check if we're in test mode
 */
export function isTest(): boolean {
  return getEnvironment().isTest;
}

/**
 * Get the current environment mode
 */
export function getNodeEnv(): string {
  return getEnvironment().nodeEnv;
}
