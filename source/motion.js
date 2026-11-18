(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new WeakMap();
  let observer;
  let mounted;
  function reveal(node, delay = 0) {
    node.classList.remove('motion-await');
    node.style.setProperty('--pop-delay', delay + 'ms');
    node.classList.add('motion-reveal');
    observer?.unobserve(node);
  }
  function mount(root) {
    observer?.disconnect();
    mounted = root;
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    const surface = root.querySelector('.content');
    observer = new IntersectionObserver((entries) => {
      let order = 0;
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target, Math.min(order++ * 85, 170));
    }, { root: surface, threshold: .06, rootMargin: '0px 0px -16px 0px' });
    const modules = root.dataset.view === 'home'
      ? root.querySelectorAll('.artist-stage,.listen-library,.hub-section,.home-collections,.portrait-section,.track-panel')
      : root.querySelectorAll('.hero,.playlist-hero,.chart,.list-card,.search-hero,.two-col,.player,.hot-section');
    for (const node of modules) {
      node.classList.add('motion-await');
      observer.observe(node);
    }
  }
  function bounce(node) {
    if (reduced.matches || !node?.animate) return;
    active.get(node)?.cancel();
    active.set(node, node.animate([
      { scale: '1', offset: 0 },
      { scale: '.88', offset: .18 },
      { scale: '1.105', offset: .48 },
      { scale: '.97', offset: .74 },
      { scale: '1', offset: 1 },
    ], { duration: 530, easing: 'cubic-bezier(.2,.7,.25,1)' }));
  }
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a,[role="button"],[data-track-id]');
    if (!target || target.matches(':disabled,[aria-disabled="true"]') || target.closest('[data-kind="video"] iframe')) return;
    bounce(target);
    if (reduced.matches || !event.detail) return;
    const spark = document.createElement('span');
    spark.className = 'touch-spark';
    spark.style.left = event.clientX + 'px';
    spark.style.top = event.clientY + 'px';
    spark.setAttribute('aria-hidden', 'true');
    document.body.append(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
    setTimeout(() => spark.remove(), 850);
  }, true);
  reduced.addEventListener('change', () => {
    observer?.disconnect();
    mounted?.querySelectorAll('.motion-await').forEach((node) => reveal(node));
  });
  window.SunnyMotion = Object.freeze({ mount, bounce });
})();
