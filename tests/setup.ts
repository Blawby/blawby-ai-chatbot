import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { vi, beforeAll } from 'vitest';
import { initI18n } from '../src/i18n';

// Only mock fetch if it's not already available (for real API tests)
if (!global.fetch) {
  global.fetch = vi.fn();
}

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
global.FileReader = vi.fn().mockImplementation(() => ({
  readAsDataURL: vi.fn(),
  readAsText: vi.fn(),
  readAsArrayBuffer: vi.fn(),
  result: null,
  error: null,
  onload: null,
  onerror: null,
  onloadend: null,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: 'div',
    span: 'span',
    button: 'button',
    section: 'section',
    article: 'article',
    header: 'header',
    footer: 'footer',
    nav: 'nav',
    main: 'main',
    aside: 'aside',
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    h5: 'h5',
    h6: 'h6',
    p: 'p',
    a: 'a',
    img: 'img',
    ul: 'ul',
    ol: 'ol',
    li: 'li',
    table: 'table',
    tr: 'tr',
    td: 'td',
    th: 'th',
    thead: 'thead',
    tbody: 'tbody',
    tfoot: 'tfoot',
    form: 'form',
    input: 'input',
    textarea: 'textarea',
    select: 'select',
    option: 'option',
    label: 'label',
    fieldset: 'fieldset',
    legend: 'legend',
  },
  AnimatePresence: ({ children }: { children: any }) => children,
  usePresence: () => [true, null],
}));

// Mock @heroicons/react/24/outline
vi.mock('@heroicons/react/24/outline', () => ({
  UserIcon: 'svg',
  ArrowLeftIcon: 'svg',
  PencilIcon: 'svg',
  BuildingOfficeIcon: 'svg',
  PlusIcon: 'svg',
  MinusIcon: 'svg',
  XMarkIcon: 'svg',
  CheckIcon: 'svg',
  Cog6ToothIcon: 'svg',
  SparklesIcon: 'svg',
  QuestionMarkCircleIcon: 'svg',
  ArrowRightOnRectangleIcon: 'svg',
  ChevronRightIcon: 'svg',
  LinkIcon: 'svg',
  PhoneIcon: 'svg',
  ChevronDownIcon: 'svg',
  EyeIcon: 'svg',
  EyeSlashIcon: 'svg',
  EnvelopeIcon: 'svg',
  UserGroupIcon: 'svg',
  ExclamationTriangleIcon: 'svg',
  HandThumbUpIcon: 'svg',
  HandThumbDownIcon: 'svg',
  StarIcon: 'svg',
  ChatBubbleLeftRightIcon: 'svg',
  ClipboardIcon: 'svg',
  KeyIcon: 'svg',
  FaceSmileIcon: 'svg',
  CheckBadgeIcon: 'svg',
  MapPinIcon: 'svg',
  BellIcon: 'svg',
}));


// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
    reload: vi.fn(),
    assign: vi.fn(),
    replace: vi.fn(),
  },
  writable: true,
});

// Mock window.history
Object.defineProperty(window, 'history', {
  value: {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    go: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
  writable: true,
});

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
});

// IndexedDB is now mocked by fake-indexeddb/auto import above

// Initialize i18n before all tests
beforeAll(async () => {
  await initI18n();
});

