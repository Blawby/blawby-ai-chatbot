import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { webcrypto, randomUUID } from 'node:crypto';

// Mock Cloudflare Workers environment for Node.js tests
// Use Node's full WebCrypto implementation and only add randomUUID if missing
if (!global.crypto) {
  // Set global.crypto to Node's full WebCrypto implementation only when undefined
  global.crypto = webcrypto as any;
}

// Add randomUUID if it's missing from the crypto object
if (global.crypto && !global.crypto.randomUUID) {
  global.crypto.randomUUID = randomUUID;
}

// Mock console methods to avoid noise in tests
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Mock TextEncoder/TextDecoder for Node.js compatibility
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = NodeTextEncoder as unknown as typeof globalThis.TextEncoder;
}
if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = NodeTextDecoder as unknown as typeof globalThis.TextDecoder;
}

// Use real fetch for integration tests, but provide a mock for unit tests
if (!global.fetch) {
  // Only mock if fetch doesn't exist (shouldn't happen in Node 18+)
  global.fetch = vi.fn();
}

export {};
