// Removed @testing-library/jest-dom - using Playwright for UI testing
// Removed fake-indexeddb - using real IndexedDB in Playwright tests
import { vi, beforeAll } from 'vitest';
import { initI18n } from '../src/i18n';

// Only mock fetch if it's not already available (for real API tests)
if (!global.fetch) {
  global.fetch = vi.fn();
}

// Removed DOM mocks - using Playwright for UI testing

// Removed UI component mocks - using Playwright for UI testing


// Removed browser API mocks - using Playwright for UI testing

// Initialize i18n before all tests
beforeAll(async () => {
  await initI18n();
});

