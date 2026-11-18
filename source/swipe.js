(() => {
  'use strict';
  function attach(surface, advance, onInteract = () => {}) {
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    let gesture;
    let suppressUntil = 0;
    let wheelTotal = 0, wheelAt = 0, wheelNext = 0;
    const excluded = '.stage-navigation,.stage-play,.pager-controls,.t-act,.r-act,.song-title,.preview-play,input,select,textarea,[contenteditable]';
    surface.classList.add('swipe-ready');
    surface.tabIndex = 0;
    surface.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');

    function detachTracking() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pagehide', cancel);
    }
    function reset() {
      const previous = gesture;
      gesture = null;
      detachTracking();
      surface.classList.remove('swipe-active', 'swipe-dragging');
      surface.style.removeProperty('--swipe-shift');
      if (previous && surface.hasPointerCapture?.(previous.id)) surface.releasePointerCapture(previous.id);
      return previous;
    }
    function cancel() { if (gesture) { reset(); onInteract(); } }
    function move(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (!surface.isConnected) { cancel(); return; }
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture.dx = dx;
      if (!gesture.horizontal) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.15) { cancel(); return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
        gesture.horizontal = true;
        surface.classList.add('swipe-dragging');
        try { surface.setPointerCapture(event.pointerId); } catch { /* Window tracking still completes the drag. */ }
      }
      event.preventDefault();
      const limit = Math.min(20, surface.clientWidth * .025);
      surface.style.setProperty('--swipe-shift', Math.max(-limit, Math.min(limit, dx * .2)) + 'px');
    }
    function finish(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const last = reset();
      onInteract();
      if (!last.horizontal) return;
      suppressUntil = performance.now() + 450;
      const distance = event.clientX - last.x;
      const threshold = Math.max(32, Math.min(64, surface.clientWidth * .1));
      if (Math.abs(distance) >= threshold) advance(distance < 0 ? 1 : -1, 'swipe');
    }
    surface.addEventListener('pointerdown', event => {
      if (gesture) { if (event.pointerId !== gesture.id) cancel(); return; }
      if (!event.isPrimary || event.button !== 0) return;
      suppressUntil = 0;
      if (event.target.closest(excluded)) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, horizontal: false };
      surface.classList.add('swipe-active');
      onInteract();
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('blur', cancel);
      window.addEventListener('pagehide', cancel);
    }, options);
    surface.addEventListener('lostpointercapture', event => {
      if (event.target === surface && gesture?.id === event.pointerId) cancel();
    }, options);
    surface.addEventListener('dragstart', event => event.preventDefault(), options);
    surface.addEventListener('click', event => {
      if (event.detail && performance.now() < suppressUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressUntil = 0;
      }
    }, { ...options, capture: true });
    surface.addEventListener('keydown', event => {
      if (event.target !== surface || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      onInteract();
      advance(event.key === 'ArrowRight' ? 1 : -1, 'swipe');
    }, options);
    surface.addEventListener('wheel', event => {
      if (event.ctrlKey || gesture || event.target.closest(excluded)) return;
      const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      const dy = event.shiftKey ? 0 : event.deltaY;
      if (!dx || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      event.preventDefault();
      const now = performance.now();
      onInteract();
      if (now < wheelNext) return;
      if (now - wheelAt > 180 || Math.sign(wheelTotal) !== Math.sign(dx)) wheelTotal = 0;
      wheelAt = now;
      wheelTotal += dx * (event.deltaMode === 1 ? 16 : 1);
      if (Math.abs(wheelTotal) >= 52) {
        advance(wheelTotal > 0 ? 1 : -1, 'swipe');
        wheelTotal = 0;
        wheelNext = now + 500;
      }
    }, { ...options, passive: false });
    return () => { reset(); lifecycle.abort(); };
  }
  window.SunnySwipe = Object.freeze({ attach });
})();
