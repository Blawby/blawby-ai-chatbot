import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';
import '@testing-library/jest-dom';
import { resetTestState } from './test-utils';

afterEach(() => {
  cleanup();
  resetTestState();
});