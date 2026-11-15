/* Vaigarai · demo landing page
   The scroll position is the time of day. Everything else follows from that. */
(() => {
  'use strict';

  const d = document;
  const root = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => [...c.querySelectorAll(s)];
  const clamp01 = v => Math.min(1, Math.max(0, v));

  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  const motion = root.classList.contains('motion') && hasGsap;
  if (!motion) root.classList.remove('motion');

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);

  /* ─────────────────────────────────────────────────────────
     Sikku kolam. One closed line around a grid of dots.
     It is the path of a ball bouncing at 45° inside the grid:
     straight through every crossing, a quarter-arc round every
     edge dot. When cols and rows share no factor, a single line
     visits the whole grid and returns to its start.
     ───────────────────────────────────────────────────────── */
  function kolam(cols, rows, u) {
    const W = cols * 2, H = rows * 2;
    const pts = [];
    let x = 1, y = 0, dx = 1, dy = 1;
    do {
      pts.push([x, y]);
      if (x + dx < 0 || x + dx > W) dx = -dx;
      if (y + dy < 0 || y + dy > H) dy = -dy;
      x += dx; y += dy;
    } while (!(x === 1 && y === 0) && pts.length < 5000);

    const n = pts.length;
    const f = v => (v * u).toFixed(2);
    const mid = (a, b) => f((a[0] + b[0]) / 2) + ' ' + f((a[1] + b[1]) / 2);
    const r = (Math.SQRT1_2 * u).toFixed(2);

    let path = 'M' + mid(pts[n - 1], pts[0]);
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = pts[(k - 1 + n) % n], b = pts[(k + 1) % n];
      const onEdge = p[0] === 0 || p[0] === W || p[1] === 0 || p[1] === H;
      if (onEdge) {
        const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
        path += `A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${mid(p, b)}`;
      } else {
        path += 'L' + mid(p, b);
      }
    }
    path += 'Z';

    const dots = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) dots.push([(2 * i + 1) * u, (2 * j + 1) * u]);
    return { path, dots, w: W * u, h: H * u };
  }

  function drawKolam(svg, cols, rows) {
    const width = svg.getBoundingClientRect().width || 200;
    const u = width / (cols * 2);
    const k = kolam(cols, rows, u);
    const r = Math.max(1, u * 0.085).toFixed(2);
    svg.setAttribute('viewBox', `0 0 ${k.w.toFixed(2)} ${k.h.toFixed(2)}`);
    svg.innerHTML =
      `<g class="kolam__dots">${k.dots.map(p => `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${r}"/>`).join('')}</g>` +
      `<path class="kolam__line" pathLength="1" d="${k.path}"/>`;
    svg.dataset.drawn = cols + 'x' + rows + '@' + Math.round(width);
  }

  const bandCols = () => (innerWidth >= 1100 ? 16 : innerWidth >= 700 ? 11 : 7);
  function drawAllKolams() {
    $$('svg[data-kolam]').forEach(svg => {
      let cols, rows;
      if (svg.dataset.kolam === 'band') { cols = bandCols(); rows = 3; }
      else [cols, rows] = svg.dataset.kolam.split('x').map(Number);
      const key = cols + 'x' + rows + '@' + Math.round(svg.getBoundingClientRect().width || 200);
      if (svg.dataset.drawn !== key) drawKolam(svg, cols, rows);
    });
  }
  drawAllKolams();

  /* ─────────────────────────────────────────────────────────
     The clock. Whichever scene sits on the middle of the screen
     sets the time, the ritual name, the colour of the daylight
     and whether the fixed chrome reads light or dark.
     ───────────────────────────────────────────────────────── */
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const fmt = m => { m = Math.round(m); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const hex = h => [1, 3, 5].map(i => parseInt(h.trim().slice(i, i + 2), 16));
  const mix = (list, p) => {
    const n = list.length - 1;
    if (n <= 0) return `rgb(${list[0].join(',')})`;
    const t = clamp01(p) * n, i = Math.min(n - 1, Math.floor(t)), k = t - i;
    return 'rgb(' + list[i].map((v, c) => Math.round(v + (list[i + 1][c] - v) * k)).join(',') + ')';
  };

  const scenes = $$('[data-t0]').map(el => ({
    el,
    t0: toMin(el.dataset.t0),
    t1: toMin(el.dataset.t1),
    en: el.dataset.en,
    ta: el.dataset.ta,
    bg: el.dataset.bg ? el.dataset.bg.split(',').map(hex) : null,
    top: 0
  }));
  const DAY_START = scenes[0].t0, DAY_END = scenes[scenes.length - 1].t1;
  const clocks = $$('[data-clock]');
  const labelEn = $('[data-label-en]'), labelTa = $('[data-label-ta]');
  const dayline = $('[data-dayline]');
  const chrome = $$('[data-ui]');
  const navEl = $('.nav'), hudEl = $('.hud');

  /* what is actually painted under a point: night, daylight, or a photograph */
  const inkAt = (x, y) => {
    const el = d.elementFromPoint(x, y);
    if (!el) return null;
    if (el.closest('.films__frame, .films__over, .hero__img')) return 'light';
    const host = el.closest('[data-ink]');
    return host && !host.hasAttribute('data-ui') ? host.dataset.ink : null;
  };
  const dayEls = $$('.day, .morning, .morning__cap, .scene--day, .films');

  let target = DAY_START, shown = DAY_START - 30, lastText = '', lastScene = null, lastBg = '', lastLine = '';

  function measure() {
    const mid = innerHeight * 0.5;
    let cur = scenes[0], p = 0;
    for (const s of scenes) {
      const r = s.el.getBoundingClientRect();
      s.top = r.top;
      if (r.top <= mid) { cur = s; p = clamp01((mid - r.top) / Math.max(1, r.height)); }
    }
    target = cur.t0 + (cur.t1 - cur.t0) * p;

    if (cur !== lastScene) {
      lastScene = cur;
      labelEn.textContent = cur.en;
      labelTa.textContent = cur.ta;
    }
    if (cur.bg) {
      const c = mix(cur.bg, p);
      if (c !== lastBg) {
        lastBg = c;
        for (const el of dayEls) el.style.backgroundColor = c;
        navEl.style.setProperty('--veil-day', c);
      }
    }
    for (const ui of chrome) {
      const top = ui === navEl;
      if (!top && !hudEl.getClientRects().length) continue;
      const x = top ? innerWidth / 2 : hudEl.getBoundingClientRect().left + 6;
      const ink = inkAt(x, top ? 34 : mid);
      if (ink && ui.dataset.ink !== ink) ui.dataset.ink = ink;
    }
  }

  function frame() {
    measure();
    shown += (target - shown) * 0.16;
    if (Math.abs(target - shown) < 0.4) shown = target;
    const text = fmt(shown);
    if (text !== lastText) { lastText = text; for (const c of clocks) c.textContent = text; }
    const line = clamp01((shown - DAY_START) / (DAY_END - DAY_START)).toFixed(3);
    if (line !== lastLine) { lastLine = line; dayline.style.transform = `scaleY(${line})`; }
  }
  /* one frame loop for everything: GSAP's ticker when it loaded, plain rAF otherwise */
  if (hasGsap) gsap.ticker.add(frame);
  else (function loop() { frame(); requestAnimationFrame(loop); })();

  /* ─────────────────────────────────────────────────────────
     Smooth scroll and in-page links
     ───────────────────────────────────────────────────────── */
  let lenis = null;
  if (motion && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const to = id === '#top' ? d.body : $(id);
    if (!to) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(id === '#top' ? 0 : to, { duration: 1.7 });
    else if (id === '#top') window.scrollTo({ top: 0 });
    else to.scrollIntoView();
    if (id !== '#top') { to.setAttribute('tabindex', '-1'); to.focus({ preventScroll: true }); }
  }));

  /* ─────────────────────────────────────────────────────────
     Motion. Built top to bottom so pinned scenes are measured
     in page order.
     ───────────────────────────────────────────────────────── */
  if (motion) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    const small = () => innerWidth < 700;

    /* shared reveals, scoped to one scene at a time */
    const reveals = scope => {
      $$('.display, .story__names', scope).forEach(h => {
        const lines = $$('.ln > span', h);
        if (!lines.length) return;
        gsap.from(lines, { yPercent: 114, duration: 1.15, ease: 'expo.out', stagger: 0.09,
          scrollTrigger: { trigger: h, start: 'top 90%', once: true } });
      });

      const fades = $$('[data-reveal]', scope);
      if (fades.length) {
        gsap.set(fades, { autoAlpha: 0, y: 26 });
        ScrollTrigger.batch(fades, { start: 'top 90%', once: true,
          onEnter: els => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.95, ease: 'power3.out', stagger: 0.08, overwrite: true }) });
      }

      /* photographs open bottom-up, but only once the file has actually arrived */
      $$('.ph[data-wipe]', scope).forEach(ph => {
        const img = $('img', ph);
        const open = gsap.timeline({ paused: true })
          .fromTo(ph, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.35, ease: 'expo.out', clearProps: 'clipPath' }, 0)
          .fromTo(img, { scale: 1.35 }, { scale: 1, duration: 1.8, ease: 'expo.out' }, 0);
        ScrollTrigger.create({ trigger: ph, start: 'top 92%', once: true, onEnter: () => {
          img.loading = 'eager';
          if (img.complete && img.naturalWidth) open.play();
          else { img.addEventListener('load', () => open.play(), { once: true }); img.addEventListener('error', () => open.play(), { once: true }); }
        } });
      });

      $$('.ph[data-drift] img', scope).forEach(img => {
        gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: 'none',
          scrollTrigger: { trigger: img.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      $$('[data-speed]', scope).forEach(el => {
        const s = parseFloat(el.dataset.speed);
        const amt = () => s * innerHeight * (small() ? 0.035 : 0.09);
        gsap.fromTo(el, { y: () => amt() }, { y: () => -amt(), ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
      });
    };

    /* 04:30 · hero */
    const stage = $('.hero__stage');
    const sv = n => getComputedStyle(stage).getPropertyValue(n).trim();
    const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter('ta', { granularity: 'grapheme' }) : null;
    let perWord = 1;
    $$('.hero__word').forEach(w => {
      const parts = seg ? [...seg.segment(w.textContent)].map(s => s.segment) : [w.textContent];
      perWord = parts.length;
      w.innerHTML = parts.map(s => `<span class="g"><span>${s}</span></span>`).join('');
    });

    /* the intro never blocks scrolling: if someone scrolls early, it simply finishes fast */
    gsap.set(stage, { autoAlpha: 1 });
    let introRushed = false;
    const rushIntro = () => {
      if (introRushed || intro.progress() === 1) return;
      introRushed = true;
      gsap.to(intro, { progress: 1, duration: 0.45, ease: 'power2.out' });
    };
    const intro = gsap.timeline({ delay: 0.1 })
      .fromTo(stage, { '--it': '50%', '--ib': '50%' }, { '--it': sv('--it0'), '--ib': sv('--ib0'), duration: 1.25, ease: 'expo.inOut' }, 0)
      .fromTo('.hero__img img', { scale: 1.45, yPercent: 7.5 }, { scale: 1.1, yPercent: 7.5, duration: 1.5, ease: 'expo.out' }, 0.05)
      .from('.hero__word .g > span', { yPercent: 118, duration: 1, ease: 'expo.out', stagger: i => (i % perWord) * 0.08 }, 0.3)
      .fromTo('.kolam--mark', { '--draw': 1 }, { '--draw': 0, duration: 1.5, ease: 'power2.inOut' }, 0.3)
      .from('.nav > *, .hud, [data-intro]', { autoAlpha: 0, duration: 0.7, ease: 'power2.out', stagger: 0.05 }, 0.75)
      .from('[data-intro]', { y: 18, duration: 0.8, ease: 'power3.out', stagger: 0.07 }, 0.75);

    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '.hero', pin: stage, start: 'top top', end: '+=140%', scrub: true, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: self => { if (self.progress > 0) rushIntro(); } }
    })
      .fromTo(stage, { '--it': () => sv('--it0'), '--ib': () => sv('--ib0'), '--ix': () => sv('--ix0') },
        { '--it': '0%', '--ib': '0%', '--ix': '0%', duration: 0.62, ease: 'power2.inOut', immediateRender: false }, 0)
      .fromTo('.hero__img img', { scale: 1.1, yPercent: 7.5 }, { scale: 1, yPercent: 0, duration: 0.62, ease: 'power2.inOut', immediateRender: false }, 0)
      .fromTo('.hero__copy, .hero__cue', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -24, duration: 0.14, immediateRender: false }, 0)
      .fromTo('.hero__word--solid', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, immediateRender: false }, 0.06)
      .fromTo('.hero__word', { scale: 1 }, { scale: 1.1, duration: 0.62, ease: 'power1.in', immediateRender: false }, 0)
      .fromTo('.hero__word--line', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2, immediateRender: false }, 0.42)
      .fromTo('.hero__caption', { autoAlpha: 0, y: 44 }, { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out' }, 0.6)
      .to({}, { duration: 0.16 });

    /* 05:04 · kolam */
    const kolamsec = $('.kolamsec'), band = $('.kolam--band');
    gsap.fromTo(band, { '--dots': 0 }, { '--dots': 0.85, duration: 1.2, ease: 'power2.out',
      scrollTrigger: { trigger: band, start: 'top 92%', once: true } });
    gsap.fromTo(band, { '--draw': 1 }, { '--draw': 0, ease: 'none',
      scrollTrigger: { trigger: band, start: 'top 80%', end: 'bottom 36%', scrub: true } });
    reveals(kolamsec);

    /* 05:20 · muhurtham morning */
    const morning = $('.morning'), track = $('.morning__track');
    gsap.fromTo('.morning__cap', { scaleY: 1 }, { scaleY: 0, ease: 'none',
      scrollTrigger: { trigger: morning, start: 'top bottom', end: 'top 6%', scrub: true } });

    const run = () => Math.max(0, track.scrollWidth - innerWidth);
    const slide = gsap.to(track, { x: () => -run(), ease: 'none',
      scrollTrigger: { trigger: morning, pin: '.morning__pin', start: 'top top', end: () => '+=' + run(), scrub: true, invalidateOnRefresh: true, anticipatePin: 1 } });

    $$('.rite .ph img', track).forEach(img => {
      gsap.fromTo(img, { xPercent: -6.5 }, { xPercent: 6.5, ease: 'none',
        scrollTrigger: { containerAnimation: slide, trigger: img.parentNode, start: 'left right', end: 'right left', scrub: true } });
    });
    $$('.rite__tx, .morning__end', track).forEach(tx => {
      gsap.from(tx.children, { autoAlpha: 0, y: 34, duration: 0.9, ease: 'power3.out', stagger: 0.09,
        scrollTrigger: { containerAnimation: slide, trigger: tx, start: 'left 86%', toggleActions: 'play none none reverse' } });
    });

    /* 09:40 to 17:20 · weddings, packages, golden hour */
    reveals($('.stories'));
    reveals($('.meals'));
    reveals($('.golden'));

    /* 18:10 · films */
    const films = $('.films'), fpin = $('.films__pin');
    const fv = n => getComputedStyle(fpin).getPropertyValue(n).trim();
    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: films, pin: fpin, start: 'top top', end: '+=130%', scrub: true, invalidateOnRefresh: true, anticipatePin: 1
      }
    })
      .fromTo(fpin, { '--fx': () => fv('--fx0'), '--fy': () => fv('--fy0') }, { '--fx': '0%', '--fy': '0%', duration: 0.6, ease: 'power2.inOut' }, 0)
      .fromTo('.films__frame img', { scale: 1.22, yPercent: 10 }, { scale: 1, yPercent: 0, duration: 0.6, ease: 'power2.inOut' }, 0)
      .set('.films__over', { visibility: 'visible' }, 0)
      .fromTo('.films__over > *', { autoAlpha: 0, y: 38 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power2.out', stagger: 0.05 }, 0.56)
      .to({}, { duration: 0.1 });

    /* 19:30 · reception */
    const evening = $('.evening');
    reveals(evening);
    const quote = $('[data-words]', evening);
    quote.innerHTML = quote.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
    gsap.fromTo($$('.w', quote), { opacity: 0.16 }, { opacity: 1, ease: 'none', stagger: 0.08,
      scrollTrigger: { trigger: quote, start: 'top 82%', end: 'bottom 46%', scrub: true } });

    /* 21:00 · pathirikai */
    const enquiry = $('.enquiry');
    reveals(enquiry);
    gsap.fromTo('.card-wrap', { rotate: -5, y: 110, scale: 0.95 }, { rotate: 0, y: 0, scale: 1, ease: 'none',
      scrollTrigger: { trigger: '.card-wrap', start: 'top bottom', end: 'top 42%', scrub: true } });

    /* 23:00 · night */
    const foot = $('.foot');
    reveals(foot);
    gsap.fromTo('.kolam--foot', { '--draw': 1 }, { '--draw': 0, duration: 3.4, ease: 'power2.inOut',
      scrollTrigger: { trigger: '.kolam--foot', start: 'top 90%', once: true } });

    if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => ScrollTrigger.refresh());
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawAllKolams, 180);
  });

  /* ─────────────────────────────────────────────────────────
     Teaser button and the pathirikai form (demo only)
     ───────────────────────────────────────────────────────── */
  const play = $('.play');
  if (play) play.addEventListener('click', () => {
    $('#play-note').textContent = 'The teaser plays here on the live site. This demo has no video yet.';
  });

  const form = $('#card');
  if (form) {
    const err = $('#card-err'), done = $('#card-done');
    const required = ['you', 'partner', 'phone'];
    form.addEventListener('input', e => {
      if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = form.elements;
      const missing = required.filter(n => !f[n].value.trim());
      const digits = f.phone.value.replace(/\D/g, '');
      if (!missing.includes('phone') && digits.length < 10) missing.push('phone');
      required.forEach(n => missing.includes(n) ? f[n].setAttribute('aria-invalid', 'true') : f[n].removeAttribute('aria-invalid'));

      if (missing.length) {
        const names = missing.includes('you') || missing.includes('partner');
        const phone = missing.includes('phone');
        err.textContent = names && phone ? 'Add both your names and a 10-digit phone number, so we know who to call.'
          : names ? 'Add both your names, so we know whose wedding it is.'
          : 'Add a 10-digit phone number, so we can call you back.';
        err.hidden = false;
        f[missing[0]].setAttribute('aria-describedby', 'card-err');
        f[missing[0]].focus();
        return;
      }

      err.hidden = true;
      $('#card-done-line').textContent = `Received, ${f.you.value.trim()} and ${f.partner.value.trim()}.`;
      form.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: true });
      if (motion) gsap.from(done.children, { autoAlpha: 0, y: 18, duration: 0.7, ease: 'power3.out', stagger: 0.08 });
    });
  }
})();
