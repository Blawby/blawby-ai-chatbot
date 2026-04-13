const FOCUSABLE_SELECTOR = [
 'a[href]',
 'area[href]',
 'button:not([disabled])',
 'input:not([disabled]):not([type="hidden"])',
 'select:not([disabled])',
 'textarea:not([disabled])',
 'iframe',
 'object',
 'embed',
 '[contenteditable="true"]',
 '[tabindex]:not([tabindex="-1"])',
].join(', ');

const isVisible = (element: HTMLElement) => {
 let current: HTMLElement | null = element;

 while (current) {
  if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') {
   return false;
  }

  if (window.getComputedStyle(current).visibility === 'hidden') {
   return false;
  }

  current = current.parentElement;
 }

 return element.getClientRects().length > 0;
};

export const getFocusableElements = (container: HTMLElement) =>
 Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);

export const focusInitialElement = (container: HTMLElement) => {
 const focusable = getFocusableElements(container);
 const autofocusTarget = container.querySelector<HTMLElement>('[data-autofocus]');
 const preferred =
  (autofocusTarget && focusable.includes(autofocusTarget) ? autofocusTarget : null) ??
  focusable[0] ??
  container;

 const isContainerFallback = preferred === container;
 const previousTabIndex = container.getAttribute('tabindex');

 if (isContainerFallback && container.tabIndex < 0) {
  container.setAttribute('tabindex', '-1');
 }

 preferred.focus();

 if (isContainerFallback && previousTabIndex === null) {
  container.removeAttribute('tabindex');
 }
};

export const trapFocusWithin = (event: KeyboardEvent, container: HTMLElement) => {
 if (event.key !== 'Tab') {
  return;
 }

 const focusable = getFocusableElements(container);
 if (focusable.length === 0) {
  event.preventDefault();
  container.focus();
  return;
 }

 const first = focusable[0];
 const last = focusable[focusable.length - 1];
 const activeElement = document.activeElement as HTMLElement | null;

 if (!activeElement || !container.contains(activeElement)) {
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
  return;
 }

 if (!event.shiftKey && activeElement === last) {
  event.preventDefault();
  first.focus();
 }

 if (event.shiftKey && activeElement === first) {
  event.preventDefault();
  last.focus();
 }
};
