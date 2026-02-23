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
 *   primaryColor  – Optional launcher color override; if omitted, uses practice accent_color from /api/practice/details/:slug
 *   launcherSize  – Size in pixels of the circular button (default: 56)
 *   zIndex        – CSS z-index for the widget layer      (default: 2147483647)
 *   label         – Accessible label for the launcher     (default: 'Chat with us')
 *   onEvent       – Optional callback for all widget events
 *   onChatStart   – Optional callback for first open ('chat_start')
 *   pushDataLayerOnChatStart – Push dataLayer event on chat_start (default: false)
 *   dataLayerEventName – chat start event name            (default: 'blawby_chat_start')
 */

(function (w, d) {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────────────── */
  var cfg = Object.assign({
    baseUrl: 'https://ai.blawby.com',
    position: 'bottom-right',
    primaryColor: null,
    launcherSize: 56,
    zIndex: 2147483647,
    label: 'Chat with us',
    pushDataLayerOnChatStart: false,
    dataLayerEventName: 'blawby_chat_start',
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
  var DEFAULT_PRIMARY_COLOR = '#d4af37';

  function normalizeHexColor(hex) {
    if (typeof hex !== 'string') return null;
    var value = hex.trim();
    if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) return null;
    if (value.length === 4) {
      return '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
    }
    return value;
  }

  // Compute contrasting foreground color for the launcher (white or black)
  function getForegroundColor(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
  }

  var configuredPrimaryColor = normalizeHexColor(cfg.primaryColor);
  var activePrimaryColor = configuredPrimaryColor || DEFAULT_PRIMARY_COLOR;
  var foregroundColor = getForegroundColor(activePrimaryColor);

  // A unique ID prefix so multiple widgets can coexist on a page safely
  var ID = 'blawby-widget-' + cfg.practiceSlug.replace(/[^a-z0-9]/gi, '-');

  /* ── State ───────────────────────────────────────────────────────────── */
  var isOpen = false;
  var unreadCount = 0;
  var hasStartedChat = false;
  var listeners = {};

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
    '  background: var(--blawby-widget-primary-color);',
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
    '  outline: 3px solid var(--blawby-widget-primary-color);',
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
    '  height: min(780px, calc(100vh - 156px));',
    '  border-radius: 16px;',
    '  border: none;',
    '  outline: none;',
    '  overflow: hidden;',
    '  box-shadow: 0 16px 36px rgba(0,0,0,0.28);',
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
    '  border-radius: 16px;',
    '  display: block;',
    '}',

    // Top-right close button (visible when widget is open)
    '#' + ID + '-top-close {',
    '  position: absolute;',
    '  top: 26px;',
    '  right: 22px;',
    '  width: 24px;',
    '  height: 24px;',
    '  border: none;',
    '  border-radius: 0;',
    '  background: transparent;',
    '  color: #fff;',
    '  display: none;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '  z-index: 4;',
    '  font-size: 0;',
    '  font-weight: 400;',
    '  line-height: 1;',
    '}',
    '#' + ID + '-top-close:hover { opacity: 0.9; }',
    '#' + ID + '-top-close:focus-visible {',
    '  outline: 2px solid #fff;',
    '  outline-offset: 2px;',
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

  var topClose = d.createElement('button');
  topClose.id = ID + '-top-close';
  topClose.setAttribute('type', 'button');
  topClose.setAttribute('aria-label', 'Close chat');
  topClose.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></line><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></line></svg>';

  frameWrap.appendChild(topClose);
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
  chatIcon.setAttribute('width', '28');
  chatIcon.setAttribute('height', '28');
  chatIcon.setAttribute('viewBox', '0 0 24 24');
  chatIcon.setAttribute('fill', 'none');
  chatIcon.setAttribute('stroke', foregroundColor);
  chatIcon.setAttribute('stroke-width', '2.2');
  chatIcon.setAttribute('stroke-linecap', 'round');
  chatIcon.setAttribute('stroke-linejoin', 'round');
  chatIcon.setAttribute('aria-hidden', 'true');
  chatIcon.innerHTML =
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>';

  // Close icon
  var closeIcon = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  closeIcon.setAttribute('width', '28');
  closeIcon.setAttribute('height', '28');
  closeIcon.setAttribute('viewBox', '0 0 24 24');
  closeIcon.setAttribute('fill', 'none');
  closeIcon.setAttribute('stroke', foregroundColor);
  closeIcon.setAttribute('stroke-width', '3');
  closeIcon.setAttribute('stroke-linecap', 'round');
  closeIcon.setAttribute('stroke-linejoin', 'round');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeIcon.style.display = 'none';
  closeIcon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';

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
  
  // Set initial primary color variable on container to avoids flash
  container.style.setProperty('--blawby-widget-primary-color', activePrimaryColor);

  d.body.appendChild(container);

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function applyPrimaryColor(primaryColor, source) {
    var normalized = normalizeHexColor(primaryColor);
    if (!normalized) return false;
    activePrimaryColor = normalized;
    foregroundColor = getForegroundColor(normalized);
    container.style.setProperty('--blawby-widget-primary-color', normalized);
    chatIcon.setAttribute('stroke', foregroundColor);
    closeIcon.setAttribute('stroke', foregroundColor);
    emitEvent('theme_applied', {
      primaryColor: normalized,
      source: source || 'unknown',
    });
    return true;
  }

  function loadPracticeAccentColor() {
    if (configuredPrimaryColor) {
      applyPrimaryColor(configuredPrimaryColor, 'config');
      return;
    }

    applyPrimaryColor(DEFAULT_PRIMARY_COLOR, 'default');

    var detailsUrl = cfg.baseUrl + '/api/practice/details/' + encodeURIComponent(cfg.practiceSlug);
    fetch(detailsUrl)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to load practice details: ' + response.status + ' ' + response.statusText);
        }
        return response.json();
      })
      .then(function (practiceDetails) {
        var accentColor = practiceDetails && typeof practiceDetails.accent_color === 'string'
          ? practiceDetails.accent_color
          : null;
        if (!accentColor) return;
        applyPrimaryColor(accentColor, 'practice_accent');
      })
      .catch(function (error) {
        console.warn('[BlawbyWidget] Failed to resolve practice accent color', error);
        throw error;
      });
  }

  function setOpen(next) {
    var previousOpenState = isOpen;
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
      emitEvent('widget_opened', { wasOpen: previousOpenState });
      if (!hasStartedChat) {
        hasStartedChat = true;
        emitEvent('chat_start', { conversationStarted: true });
      }
      topClose.style.display = 'flex';
    } else {
      postToIframe({ type: 'blawby:close' });
      emitEvent('widget_closed', { wasOpen: previousOpenState });
      topClose.style.display = 'none';
    }
  }

  function setUnread(count) {
    var previousUnreadCount = unreadCount;
    unreadCount = count;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 && !isOpen ? 'flex' : 'none';
    emitEvent('unread_changed', {
      previousUnreadCount: previousUnreadCount,
      unreadCount: unreadCount,
    });
  }

  function postToIframe(msg) {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify(msg), cfg.baseUrl);
      }
    } catch (_) { /* cross-origin post may fail; safe to ignore */ }
  }

  function addListener(eventName, callback) {
    if (typeof callback !== 'function') return;
    var key = String(eventName || '*');
    if (!Array.isArray(listeners[key])) listeners[key] = [];
    listeners[key].push(callback);
  }

  function removeListener(eventName, callback) {
    var key = String(eventName || '*');
    var bucket = listeners[key];
    if (!Array.isArray(bucket)) return;
    listeners[key] = bucket.filter(function (fn) { return fn !== callback; });
  }

  function notifyListeners(eventName, payload) {
    var all = (listeners['*'] || []).concat(listeners[eventName] || []);
    for (var i = 0; i < all.length; i++) {
      try { all[i](payload); } catch (err) {
        console.warn('[BlawbyWidget] Event listener failed', err);
      }
    }
  }

  function maybePushDataLayer(payload) {
    if (payload.type !== 'chat_start') return;
    if (!cfg.pushDataLayerOnChatStart) return;
    if (!w.dataLayer || typeof w.dataLayer.push !== 'function') return;
    try {
      w.dataLayer.push({
        event: cfg.dataLayerEventName || 'blawby_chat_start',
        blawby: payload,
      });
    } catch (err) {
      console.warn('[BlawbyWidget] dataLayer push failed', err);
    }
  }

  function emitEvent(eventName, detail) {
    var payload = Object.assign({
      type: eventName,
      practiceSlug: cfg.practiceSlug,
      isOpen: isOpen,
      unreadCount: unreadCount,
      timestamp: new Date().toISOString(),
    }, detail || {});

    if (typeof cfg.onEvent === 'function') {
      try { cfg.onEvent(payload); } catch (err) {
        console.warn('[BlawbyWidget] onEvent callback failed', err);
      }
    }

    if (eventName === 'chat_start' && typeof cfg.onChatStart === 'function') {
      try { cfg.onChatStart(payload); } catch (err) {
        console.warn('[BlawbyWidget] onChatStart callback failed', err);
      }
    }

    maybePushDataLayer(payload);
    notifyListeners(eventName, payload);

    try {
      w.dispatchEvent(new CustomEvent('blawby:widget-event', { detail: payload }));
    } catch (_) { /* CustomEvent may fail in legacy contexts; ignore */ }
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
        emitEvent('iframe_new_message', {});
        break;
      case 'blawby:close-request':
        setOpen(false);
        emitEvent('iframe_close_request', {});
        break;
      case 'blawby:ready':
        // Iframe signals it has mounted; send current visibility state
        postToIframe({ type: isOpen ? 'blawby:open' : 'blawby:close' });
        emitEvent('iframe_ready', {});
        break;
    }
  });

  /* ── Launcher click ──────────────────────────────────────────────────── */
  launcher.addEventListener('click', function () {
    setOpen(!isOpen);
  });

  topClose.addEventListener('click', function () {
    setOpen(false);
  });

  /* ── Public API ──────────────────────────────────────────────────────── */
  // Merge into existing BlawbyWidget object so callers can use:
  //   window.BlawbyWidget.open()  /  window.BlawbyWidget.close()
  var api = {
    open:  function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!isOpen); },
    on: function (eventName, callback) { addListener(eventName, callback); },
    off: function (eventName, callback) { removeListener(eventName, callback); },
  };
  w.BlawbyWidget = Object.assign(w.BlawbyWidget || {}, api);
  loadPracticeAccentColor();

})(window, document);
