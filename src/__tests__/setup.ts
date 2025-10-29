import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock fetch globally - will be overridden in individual tests
global.fetch = vi.fn();

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader
const FileReaderMock = vi.fn().mockImplementation(() => ({
  readAsDataURL: vi.fn(),
  readAsText: vi.fn(),
  readAsArrayBuffer: vi.fn(),
  result: null,
  error: null,
  onload: null,
  onerror: null,
  onloadend: null,
  readyState: 0
}));

// Add static properties to the mock constructor using Object.defineProperty
Object.defineProperty(FileReaderMock, 'EMPTY', {
  value: 0,
  writable: false,
  enumerable: true,
  configurable: false
});

Object.defineProperty(FileReaderMock, 'LOADING', {
  value: 1,
  writable: false,
  enumerable: true,
  configurable: false
});

Object.defineProperty(FileReaderMock, 'DONE', {
  value: 2,
  writable: false,
  enumerable: true,
  configurable: false
});

global.FileReader = FileReaderMock as unknown as typeof FileReader; 