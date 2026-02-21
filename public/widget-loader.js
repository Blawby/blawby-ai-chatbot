/**
 * Blawby Website Messenger — Widget Loader
 *
 * Paste this snippet into your website's <head> or before </body>.
 * Replace PRACTICE_SLUG with your practice slug from Settings → Practice.
 *
 * @example
 *   <script>
 *     window.BlawbyWidget = { practiceSlug: 'my-law-firm' };
 *   </script>
 *   <script src="https://ai.blawby.com/widget-loader.js" defer></script>
 *
 * Optional configuration (set on window.BlawbyWidget before the script loads):
 *   practiceSlug  – (required) Your practice slug
 *   baseUrl       – Override the Blawby app URL (default: https://ai.blawby.com)
 *   position      – 'bottom-right' (default) | 'bottom-left'
 *   primaryColor  – Hex color for the launcher button    (default: '#10B981')
 *   launcherSize  – Size in pixels of the circular button (default: 56)
 *   zIndex        – CSS z-index for the widget layer      (default: 2147483647)
 *   label         – Accessible label for the launcher     (default: 'Chat with us')
 */

(function (w, d) {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────────────── */
  var cfg = Object.assign({
    baseUrl: 'https://ai.blawby.com',
    position: 'bottom-right',
    primaryColor: '#10B981',
    launcherSize: 56,
    zIndex: 2147483647,
    label: 'Chat with us',
  }, w.BlawbyWidget || {});

  if (!cfg.practiceSlug) {
    console.warn('[BlawbyWidget] window.BlawbyWidget.practiceSlug is required.');
    return;
  }

  /* ── Derived values ──────────────────────────────────────────────────── */
  var WIDGET_URL = cfg.baseUrl +
    '/public/' + encodeURIComponent(cfg.practiceSlug) + '?v=widget';
  var isRight = cfg.position !== 'bottom-left';
  var SIZE = cfg.launcherSize;
  var Z = cfg.zIndex;
  var GAP = 20; // px gap from edge of viewport

  // A unique ID prefix so multiple widgets can coexist on a page safely
  var ID = 'blawby-widget-' + cfg.practiceSlug.replace(/[^a-z0-9]/gi, '-');

  /* ── State ───────────────────────────────────────────────────────────── */
  var isOpen = false;
  var unreadCount = 0;

  /* ── Build DOM ───────────────────────────────────────────────────────── */

  // Inject all styles once
  var styleEl = d.createElement('style');
  styleEl.textContent = [
    '#' + ID + '-container {',
    '  position: fixed;',
    '  bottom: ' + GAP + 'px;',
    (isRight ? 'right' : 'left') + ': ' + GAP + 'px;',
    '  z-index: ' + Z + ';',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: ' + (isRight ? 'flex-end' : 'flex-start') + ';',
    '  gap: 12px;',
    '  font-family: system-ui, -apple-system, sans-serif;',
    '}',

    // Launcher button
    '#' + ID + '-launcher {',
    '  width: ' + SIZE + 'px;',
    '  height: ' + SIZE + 'px;',
    '  border-radius: 50%;',
    '  border: none;',
    '  cursor: pointer;',
    '  background: ' + cfg.primaryColor + ';',
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.12);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  transition: transform 0.2s ease, box-shadow 0.2s ease;',
    '  outline: none;',
    '  flex-shrink: 0;',
    '}',
    '#' + ID + '-launcher:hover {',
    '  transform: scale(1.08);',
    '  box-shadow: 0 6px 24px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.16);',
    '}',
    '#' + ID + '-launcher:focus-visible {',
    '  outline: 3px solid ' + cfg.primaryColor + ';',
    '  outline-offset: 3px;',
    '}',

    // Unread badge
    '#' + ID + '-badge {',
    '  position: absolute;',
    '  top: 0; right: 0;',
    '  width: 18px; height: 18px;',
    '  background: #EF4444;',
    '  border-radius: 50%;',
    '  border: 2px solid #fff;',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-size: 10px; font-weight: 700; color: #fff;',
    '  pointer-events: none;',
    '}',

    // Iframe popup
    '#' + ID + '-frame-wrap {',
    '  width: min(380px, calc(100vw - ' + (GAP * 2) + 'px));',
    '  height: min(580px, calc(100vh - ' + (SIZE + GAP * 3 + 12) + 'px));',
    '  border-radius: 16px;',
    '  overflow: hidden;',
    '  box-shadow: 0 8px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.14);',
    '  transition: opacity 0.18s ease, transform 0.18s ease;',
    '  transform-origin: bottom ' + (isRight ? 'right' : 'left') + ';',
    '}',
    '#' + ID + '-frame-wrap[data-state="closed"] {',
    '  opacity: 0;',
    '  transform: scale(0.92) translateY(8px);',
    '  pointer-events: none;',
    '}',
    '#' + ID + '-frame-wrap[data-state="open"] {',
    '  opacity: 1;',
    '  transform: scale(1) translateY(0);',
    '}',
    '#' + ID + '-iframe {',
    '  width: 100%; height: 100%;',
    '  border: none; background: transparent;',
    '  display: block;',
    '}',
  ].join('\n');
  d.head.appendChild(styleEl);

  // Container
  var container = d.createElement('div');
  container.id = ID + '-container';

  // Iframe wrapper (rendered first in DOM so it appears above launcher visually)
  var frameWrap = d.createElement('div');
  frameWrap.id = ID + '-frame-wrap';
  frameWrap.setAttribute('data-state', 'closed');
  frameWrap.setAttribute('aria-live', 'polite');

  var iframe = d.createElement('iframe');
  iframe.id = ID + '-iframe';
  iframe.title = 'Blawby Messenger';
  iframe.allow = 'microphone; camera';
  // Allow same-origin cookies when the practice uses a link domain
  iframe.setAttribute('allow', 'microphone; camera');
  // Lazy-load; src set on first open to avoid network hit before user asks
  iframe.setAttribute('loading', 'lazy');

  frameWrap.appendChild(iframe);

  // Launcher button
  var launcher = d.createElement('button');
  launcher.id = ID + '-launcher';
  launcher.setAttribute('type', 'button');
  launcher.setAttribute('aria-label', cfg.label);
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', ID + '-frame-wrap');
  launcher.style.position = 'relative'; // for badge positioning

  // Chat icon (open state)
  var chatIcon = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chatIcon.setAttribute('width', '24');
  chatIcon.setAttribute('height', '24');
  chatIcon.setAttribute('viewBox', '0 0 24 24');
  chatIcon.setAttribute('fill', 'none');
  chatIcon.setAttribute('stroke', 'white');
  chatIcon.setAttribute('stroke-width', '2');
  chatIcon.setAttribute('stroke-linecap', 'round');
  chatIcon.setAttribute('stroke-linejoin', 'round');
  chatIcon.setAttribute('aria-hidden', 'true');
  chatIcon.innerHTML =
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>';

  // Close icon
  var closeIcon = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  closeIcon.setAttribute('width', '22');
  closeIcon.setAttribute('height', '22');
  closeIcon.setAttribute('viewBox', '0 0 24 24');
  closeIcon.setAttribute('fill', 'none');
  closeIcon.setAttribute('stroke', 'white');
  closeIcon.setAttribute('stroke-width', '2.5');
  closeIcon.setAttribute('stroke-linecap', 'round');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeIcon.style.display = 'none';
  closeIcon.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';

  // Unread badge (hidden by default)
  var badge = d.createElement('div');
  badge.id = ID + '-badge';
  badge.style.display = 'none';
  badge.setAttribute('aria-label', 'new messages');

  launcher.appendChild(chatIcon);
  launcher.appendChild(closeIcon);
  launcher.appendChild(badge);

  container.appendChild(frameWrap);
  container.appendChild(launcher);
  d.body.appendChild(container);

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function setOpen(next) {
    isOpen = next;

    if (next && !iframe.src) {
      // Inject src on first open so we don't incur a network hit eagerly
      iframe.src = WIDGET_URL;
    }

    frameWrap.setAttribute('data-state', next ? 'open' : 'closed');
    chatIcon.style.display = next ? 'none' : 'block';
    closeIcon.style.display = next ? 'block' : 'none';
    launcher.setAttribute('aria-expanded', String(next));

    if (next) {
      // Clear badge when opening
      setUnread(0);
      // Post open event so the iframe app knows it is visible
      postToIframe({ type: 'blawby:open' });
    } else {
      postToIframe({ type: 'blawby:close' });
    }
  }

  function setUnread(count) {
    unreadCount = count;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 && !isOpen ? 'flex' : 'none';
  }

  function postToIframe(msg) {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify(msg), cfg.baseUrl);
      }
    } catch (_) { /* cross-origin post may fail; safe to ignore */ }
  }

  /* ── postMessage bridge ──────────────────────────────────────────────── */
  w.addEventListener('message', function (event) {
    // Only accept messages from the Blawby origin
    var expectedOrigin = new URL(cfg.baseUrl).origin;
    if (event.origin !== expectedOrigin) return;

    var data;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (_) { return; }

    if (!data || typeof data.type !== 'string') return;

    switch (data.type) {
      case 'blawby:new-message':
        if (!isOpen) setUnread(unreadCount + 1);
        break;
      case 'blawby:close-request':
        setOpen(false);
        break;
      case 'blawby:ready':
        // Iframe signals it has mounted; send current visibility state
        postToIframe({ type: isOpen ? 'blawby:open' : 'blawby:close' });
        break;
    }
  });

  /* ── Launcher click ──────────────────────────────────────────────────── */
  launcher.addEventListener('click', function () {
    setOpen(!isOpen);
  });

  /* ── Public API ──────────────────────────────────────────────────────── */
  // Merge into existing BlawbyWidget object so callers can use:
  //   window.BlawbyWidget.open()  /  window.BlawbyWidget.close()
  var api = {
    open:  function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!isOpen); },
  };
  w.BlawbyWidget = Object.assign(w.BlawbyWidget || {}, api);

}(window, document));
