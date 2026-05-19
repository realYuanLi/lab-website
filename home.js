/* Welcome-page reveal animation
   - Hero elements fade up in sequence on load
   - Sections below the fold fade in as they enter the viewport
   - Respects prefers-reduced-motion (handled in CSS) */

(() => {
  if (!document.body.classList.contains('home')) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  // 1) Staggered hero reveal on load
  const heroEls = document.querySelectorAll('.home-hero [data-reveal]');
  heroEls.forEach((el, i) => {
    el.style.transitionDelay = `${80 + i * 110}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  });

  // 2) Scroll-triggered reveal for sections below the fold
  const sections = document.querySelectorAll('.home-section[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    sections.forEach(s => s.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  sections.forEach(s => io.observe(s));
})();
