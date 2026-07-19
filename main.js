/**
 * PureGamma Research — main.js
 * Text layout: Pretext by Cheng Lou (https://github.com/chenglou/pretext)
 */

// ═══════════════════════════════════════════════════════════════════
// 1. SPRING-PHYSICS SCROLL REVEAL  (with sibling stagger)
// ═══════════════════════════════════════════════════════════════════
function initReveal() {
  const items = [...document.querySelectorAll('.reveal')];
  const K = 0.09;
  const D = 0.75;
  const states = items.map(() => ({ pos: 0, vel: 0, on: false, done: false }));

  // Precompute left-to-right stagger delay per sibling group
  items.forEach((el) => {
    const sibs = [...(el.parentElement
      ? el.parentElement.querySelectorAll(':scope > .reveal')
      : [])];
    el._staggerDelay = sibs.indexOf(el) * 90; // 90ms per card
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const i = items.indexOf(e.target);
      if (i < 0 || !e.isIntersecting || states[i].on) return;
      const delay = items[i]._staggerDelay || 0;
      if (delay > 0) {
        setTimeout(() => { if (!states[i].on) states[i].on = true; }, delay);
      } else {
        states[i].on = true;
      }
    });
  }, { threshold: 0.1 });

  items.forEach((el) => {
    // Elements marked data-stream-managed: streaming handles opacity, spring only does transform
    const managed = el.dataset.streamManaged;
    el.style.cssText += (managed ? ';opacity:1;' : ';opacity:0;')
      + 'transform:translateY(28px);transition:none;will-change:opacity,transform;';
    obs.observe(el);
  });

  function tick() {
    requestAnimationFrame(tick);
    states.forEach((s, i) => {
      if (!s.on || s.done) return;
      s.vel = s.vel * D + (1 - s.pos) * K;
      s.pos += s.vel;
      if (Math.abs(1 - s.pos) < 0.002 && Math.abs(s.vel) < 0.002) {
        s.done = true;
        if (!items[i].dataset.streamManaged) items[i].style.opacity = '1';
        items[i].style.transform = 'none';
        return;
      }
      if (!items[i].dataset.streamManaged) items[i].style.opacity = String(Math.min(1, s.pos));
      items[i].style.transform = `translateY(${((1 - s.pos) * 28).toFixed(2)}px)`;
    });
  }
  tick();
}

// ═══════════════════════════════════════════════════════════════════
// 2. HERO BACKGROUND — animated soft gradient blobs
// ═══════════════════════════════════════════════════════════════════
function initHeroBg() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  hero.insertBefore(cv, hero.firstChild);

  const ctx = cv.getContext('2d');
  let w = 0, h = 0;

  function resize() {
    w = cv.width  = hero.offsetWidth;
    h = cv.height = hero.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const blobs = [
    { cx: 0.10, cy: 0.30, ax: 0.10, ay: 0.20, ft: 0.59, r: 0.52, rgb: '11,111,106', a: 0.06 },
    { cx: 0.90, cy: 0.60, ax: 0.08, ay: 0.18, ft: 0.43, r: 0.44, rgb: '199,133,45', a: 0.05 },
    { cx: 0.50, cy: 0.85, ax: 0.13, ay: 0.12, ft: 0.35, r: 0.32, rgb: '11,111,106', a: 0.03 },
  ];

  let t = 0;
  function frame() {
    t += 0.003;
    ctx.clearRect(0, 0, w, h);
    blobs.forEach((b, i) => {
      const x = w * (b.cx + Math.cos(t * b.ft + i * 1.8) * b.ax);
      const y = h * (b.cy + Math.sin(t * b.ft * 0.73 + i * 1.2) * b.ay);
      const r = Math.min(w, h) * b.r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0,   `rgba(${b.rgb},${b.a})`);
      g.addColorStop(0.55,`rgba(${b.rgb},${(b.a * 0.4).toFixed(3)})`);
      g.addColorStop(1,   `rgba(${b.rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  frame();
}

// ═══════════════════════════════════════════════════════════════════
// 3. PRETEXT HERO TEXT WRAP
//    3-orb system: halos drawn behind text, cores drawn above text
// ═══════════════════════════════════════════════════════════════════
async function initHeroWrap() {
  await document.fonts.ready;

  const para = document.querySelector('.hero-grid .reveal > p');
  if (!para) return;

  const rawText = para.textContent.trim();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;margin:0 0 24px;';
  para.parentNode.insertBefore(wrapper, para);
  wrapper.appendChild(para);
  para.style.visibility = 'hidden';
  para.style.margin = '0';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
  wrapper.appendChild(canvas);

  let cw = 0, ch = 0;
  function resize() {
    const r = wrapper.getBoundingClientRect();
    cw = Math.round(r.width  * dpr);
    ch = Math.round(r.height * dpr);
    canvas.width  = cw;
    canvas.height = ch;
  }
  resize();
  new ResizeObserver(resize).observe(wrapper);

  const ctx = canvas.getContext('2d');
  const fontSize = 16.8 * dpr;
  const lineH    = fontSize * 1.7;
  const fontStr  = `${fontSize}px "Source Serif 4", Georgia, serif`;

  if (!window.Pretext) throw new Error('Pretext not loaded');
  const { prepareWithSegments, layoutNextLine } = window.Pretext;
  const prepared = prepareWithSegments(rawText, fontStr);

  // Fade-in alpha for canvas on first load
  let alpha = 0;
  let t = 0;
  const BASE_SPEED = 0.007;

  // Three orbs — each with independent Lissajous path
  function getOrbs() {
    return [
      { // Primary — large teal
        x: cw * 0.73 + Math.cos(t * BASE_SPEED * 0.53) * cw * 0.16,
        y: ch * 0.45 + Math.sin(t * BASE_SPEED * 0.40) * ch * 0.29,
        r: 22 * dpr,
        c0: '#0c7470', c1: '#18aea8',
        haloRgb: '11,111,106', haloA: 0.22,
      },
      { // Secondary — gold
        x: cw * 0.56 + Math.cos(t * BASE_SPEED * 0.63 - 1.4) * cw * 0.17,
        y: ch * 0.54 + Math.sin(t * BASE_SPEED * 0.50 - 0.8) * ch * 0.24,
        r: 13 * dpr,
        c0: '#c7852d', c1: '#e09a40',
        haloRgb: '199,133,45', haloA: 0.15,
      },
      { // Accent — tiny, fast
        x: cw * 0.83 + Math.cos(t * BASE_SPEED * 1.10 + 0.6) * cw * 0.09,
        y: ch * 0.27 + Math.sin(t * BASE_SPEED * 0.90 + 1.3) * ch * 0.19,
        r: 6 * dpr,
        c0: '#0b6f6a', c1: '#c7852d',
        haloRgb: '11,111,106', haloA: 0.10,
      },
    ];
  }

  function drawHalo(x, y, r, rgb, a) {
    const h = ctx.createRadialGradient(x, y, 0, x, y, r * 6.5);
    h.addColorStop(0,    `rgba(${rgb},${(a * 1.0).toFixed(3)})`);
    h.addColorStop(0.35, `rgba(${rgb},${(a * 0.45).toFixed(3)})`);
    h.addColorStop(1,    `rgba(${rgb},0)`);
    ctx.fillStyle = h;
    ctx.beginPath(); ctx.arc(x, y, r * 6.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawOrb(x, y, r, c0, c1) {
    // Soft outer glow ring
    const outerGlow = ctx.createRadialGradient(x, y, r * 0.75, x, y, r * 2.0);
    outerGlow.addColorStop(0, c0 + '44');
    outerGlow.addColorStop(1, c0 + '00');
    ctx.fillStyle = outerGlow;
    ctx.beginPath(); ctx.arc(x, y, r * 2.0, 0, Math.PI * 2); ctx.fill();

    // Core gradient ball
    const core = ctx.createRadialGradient(x - r * 0.28, y - r * 0.33, r * 0.04, x, y, r);
    core.addColorStop(0,   c1);
    core.addColorStop(0.6, c0);
    core.addColorStop(1,   c0 + 'bb');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // Specular highlight
    const spec = ctx.createRadialGradient(x - r * 0.26, y - r * 0.30, 0, x - r * 0.26, y - r * 0.30, r * 0.52);
    spec.addColorStop(0, 'rgba(255,255,255,0.38)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function frame() {
    t++;
    alpha = Math.min(1, alpha + 0.022); // gradual fade-in
    if (!cw || !ch) { requestAnimationFrame(frame); return; }

    ctx.clearRect(0, 0, cw, ch);
    ctx.globalAlpha = alpha;

    const orbs = getOrbs();
    const primary = orbs[0];
    const gap = 11 * dpr;

    // ── Layer 1: atmospheric halos (behind text) ──
    orbs.forEach(o => drawHalo(o.x, o.y, o.r, o.haloRgb, o.haloA));

    // ── Layer 2: Pretext text layout ──
    ctx.font         = fontStr;
    ctx.fillStyle    = '#2a2a2a';
    ctx.textBaseline = 'top';

    const excR = primary.r + gap;
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y = 0;

    while (y < ch + lineH) {
      const midY = y + lineH * 0.5;
      const dy   = midY - primary.y;
      let x0 = 0, maxW = cw;

      if (Math.abs(dy) < excR + lineH * 0.5) {
        const chord  = Math.sqrt(Math.max(0, excR * excR - dy * dy));
        const blockL = primary.x - chord;
        const blockR = primary.x + chord;
        if (blockL > cw * 0.20) {
          maxW = blockL;
        } else if (blockR < cw * 0.80) {
          x0   = blockR;
          maxW = cw - x0;
        }
      }

      if (maxW < 50 * dpr) { y += lineH; continue; }
      const line = layoutNextLine(prepared, cursor, maxW);
      if (line === null) break;
      ctx.fillText(line.text, x0, y);
      cursor = line.end;
      y += lineH;
    }

    // ── Layer 3: orb cores (float above text) ──
    orbs.forEach(o => drawOrb(o.x, o.y, o.r, o.c0, o.c1));

    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  frame();
}

// ═══════════════════════════════════════════════════════════════════
// 4. CARD 3D TILT — mouse-tracking perspective tilt on hover
// ═══════════════════════════════════════════════════════════════════
function initCardTilt() {
  const cards = [...document.querySelectorAll('.card, .research-card, .hero-card')];
  const TILT = 5;   // max tilt degrees
  const LIFT = 4;   // px vertical lift

  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'none';
    });

    card.addEventListener('mousemove', (e) => {
      const r  = card.getBoundingClientRect();
      const dx = ((e.clientX - r.left)  / r.width  - 0.5) * 2;  // -1..1
      const dy = ((e.clientY - r.top)   / r.height - 0.5) * 2;
      card.style.transform  = `perspective(700px) rotateY(${dx * TILT}deg) rotateX(${-dy * TILT * 0.6}deg) translateY(-${LIFT}px)`;
      card.style.boxShadow  = `${-dx * 8}px ${dy * 6 + 10}px 32px rgba(11,111,106,0.11)`;
      card.style.borderColor= `rgba(11,111,106,${0.18 + Math.abs(dx + dy) * 0.08})`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition   = 'transform 0.45s ease, box-shadow 0.45s ease, border-color 0.3s ease';
      card.style.transform    = '';
      card.style.boxShadow    = '';
      card.style.borderColor  = '';
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// 5. SVG HERO ILLUSTRATION — path draw-on + circle pulse
// ═══════════════════════════════════════════════════════════════════
function initSvgAnimate() {
  document.querySelectorAll('.hero-illustration svg').forEach((svg) => {
    // Draw-on for paths
    svg.querySelectorAll('path').forEach((p, i) => {
      try {
        const len = p.getTotalLength();
        p.style.strokeDasharray  = String(len);
        p.style.strokeDashoffset = String(len);
        p.style.animation = `dashDraw ${1.6 + i * 0.35}s ease forwards ${0.4 + i * 0.3}s`;
      } catch (_) { /* SVGPathElement.getTotalLength not available */ }
    });

    // Pulse for circles
    svg.querySelectorAll('circle').forEach((c, i) => {
      c.style.transformOrigin = 'center';
      c.style.animation = `svgPulse 2.8s ease-in-out ${i * 0.55}s infinite`;
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// 6. SECTION TITLE PARALLAX
// ═══════════════════════════════════════════════════════════════════
function initParallax() {
  const titles = [...document.querySelectorAll('.section-title h2')];
  if (!titles.length) return;

  function onScroll() {
    const vh = window.innerHeight;
    titles.forEach((el) => {
      const { top, height } = el.getBoundingClientRect();
      const offset = ((vh / 2 - (top + height / 2)) * 0.05).toFixed(2);
      // Don't override shimmer sweep background-position via transform conflict
      el.style.transform = `translateY(${offset}px)`;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ═══════════════════════════════════════════════════════════════════
// 7. METRIC COUNTER
// ═══════════════════════════════════════════════════════════════════
function initCounters() {
  document.querySelectorAll('.metric strong').forEach((el) => {
    const raw = el.textContent.trim();
    const num = parseInt(raw, 10);
    if (isNaN(num) || String(num) !== raw) return;

    let fired = false;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || fired) return;
      fired = true; obs.disconnect();
      const from = num > 100 ? num - 20 : 0;
      const dur = 1200, t0 = performance.now();
      function step(now) {
        const p    = Math.min(1, (now - t0) / dur);
        const ease = 1 - (1 - p) ** 3;
        el.textContent = String(Math.round(from + (num - from) * ease));
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = raw;
      }
      requestAnimationFrame(step);
    }, { threshold: 0.5 });
    obs.observe(el);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 8. SCROLL PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════
function initScrollProgress() {
  const bar = document.createElement('div');
  bar.style.cssText = [
    'position:fixed;top:0;left:0;height:2px;width:100%',
    'background:linear-gradient(90deg,#0b6f6a,#c7852d)',
    'transform:scaleX(0);transform-origin:left',
    'z-index:9999;pointer-events:none;will-change:transform',
  ].join(';');
  document.body.appendChild(bar);

  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    bar.style.transform = `scaleX(${(window.scrollY / max).toFixed(4)})`;
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════════
// 9. ACTIVE NAV HIGHLIGHTING
// ═══════════════════════════════════════════════════════════════════
function initActiveNav() {
  const sections = [...document.querySelectorAll('main section[id]')];
  const links    = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  if (!sections.length || !links.length) return;

  function mark(id) {
    links.forEach((a) => {
      const active = a.getAttribute('href') === `#${id}`;
      a.style.borderBottom   = active ? '1px solid currentColor' : '';
      a.style.paddingBottom  = active ? '2px' : '';
    });
  }

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) mark(e.target.id); });
  }, { threshold: 0.35, rootMargin: '-80px 0px 0px 0px' });

  sections.forEach((s) => obs.observe(s));
}

// ═══════════════════════════════════════════════════════════════════
// 10. STREAMING TEXT — OpenAI-style token-by-token reveal
//     Hero H1 + kicker on load; section h2 on scroll; gradient shimmer
// ═══════════════════════════════════════════════════════════════════
function initStreamText() {
  // Mark elements as stream-managed: initReveal() will skip opacity for these,
  // only animating transform (slide-up). Streaming controls visibility instead.
  const heroReveal = document.querySelector('.hero-grid > .reveal');
  if (heroReveal) heroReveal.dataset.streamManaged = '1';

  const abstractCard = document.querySelector('#abstract .card');
  if (abstractCard) abstractCard.dataset.streamManaged = '1';

  // ── tokenize(el) ──
  // Walk DOM text nodes, replace each word with a token <span> at opacity:0.
  // Preserves <strong>, <em>, and all other HTML tags.
  // Returns the array of token spans (animation NOT started yet).
  function tokenize(el) {
    if (!el || el.dataset.streamed) return [];
    el.dataset.streamed = '1';
    el.classList.add('stream-wrap');
    const tokens = [];
    function walk(node) {
      if (node.nodeType === 3) {
        const parts = node.textContent.split(/(\s+)/);
        const frag  = document.createDocumentFragment();
        parts.forEach(p => {
          if (!p.trim()) {
            frag.appendChild(document.createTextNode(p));
          } else {
            const s = document.createElement('span');
            s.className    = 'token';
            s.textContent  = p;
            s.style.opacity = '0';
            tokens.push(s);
            frag.appendChild(s);
          }
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1) {
        [...node.childNodes].forEach(walk);
      }
    }
    [...el.childNodes].forEach(walk);
    return tokens;
  }

  // ── animate(tokens, baseDelay, interval) ──
  // Fire setTimeout for each token to transition opacity 0→1.
  // Returns total ms duration of the stream.
  function animate(tokens, baseDelay, interval) {
    tokens.forEach((t, i) => {
      setTimeout(() => {
        t.style.transition = 'opacity 0.38s ease';
        t.style.opacity    = '1';
      }, baseDelay + i * interval);
    });
    return tokens.length * interval;
  }

  // Convenience: tokenize + animate immediately
  function streamEl(el, baseDelay, interval) {
    return animate(tokenize(el), baseDelay, interval);
  }

  function shimmerAfter(el, ms) {
    setTimeout(() => el.classList.add('shimmer-active'), ms + 500);
  }

  // ── Hero: stream immediately on page load ──
  const kicker = document.querySelector('.hero .kicker');
  const heroH1  = document.querySelector('.hero h1');
  let off = 180;

  if (kicker) { off += streamEl(kicker, off, 65) + 60; }

  if (heroH1) {
    heroH1.style.visibility = 'visible';
    const dur = streamEl(heroH1, off, 48);
    const cursor = document.createElement('span');
    cursor.className = 'stream-cursor';
    heroH1.appendChild(cursor);
    setTimeout(() => cursor.remove(), off + dur + 700);
  }

  // ── Section h2: stream on scroll entry ──
  document.querySelectorAll('.section-title h2').forEach((el) => {
    let fired = false;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || fired) return;
      fired = true; obs.disconnect();
      el.classList.add('stream-heading');
      shimmerAfter(el, streamEl(el, 0, 55));
    }, { threshold: 0.25 });
    obs.observe(el);
  });

  // ── Section description p: word-by-word on scroll ──
  document.querySelectorAll('.section-title p').forEach((el) => {
    let fired = false;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || fired) return;
      fired = true; obs.disconnect();
      streamEl(el, 200, 22);
    }, { threshold: 0.25 });
    obs.observe(el);
  });

  // ── Abstract paragraphs (research.html) ──
  // Pre-tokenize at init so text is hidden before card slides in.
  // Animate each paragraph individually when it enters the viewport.
  if (abstractCard) {
    const paras      = [...abstractCard.querySelectorAll('p')];
    const paraTokens = paras.map(p => tokenize(p));   // all hidden immediately

    paraTokens.forEach((tokens, i) => {
      let fired = false;
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting || fired) return;
        fired = true; obs.disconnect();
        animate(tokens, 0, 18);   // 18ms per word — fast dense prose cadence
      }, { threshold: 0.05 });
      obs.observe(paras[i]);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 11. CONTACT FORM — AJAX submit → contact.php → SMTP → chris@pgresearch.org
// ═══════════════════════════════════════════════════════════════════
function initContactForm() {
  const form   = document.getElementById('contact-form');
  if (!form) return;
  const status = document.getElementById('form-status');
  const btn    = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled    = true;
    btn.textContent = 'Sending…';
    status.className = 'form-status';
    status.textContent = '';

    try {
      const res  = await fetch('contact.php', { method: 'POST', body: new FormData(form) });
      const data = await res.json();
      if (data.ok) {
        status.className   = 'form-status success';
        status.textContent = 'Message sent — we will be in touch shortly.';
        form.reset();
      } else {
        throw new Error(data.error || 'Send failed');
      }
    } catch (err) {
      status.className   = 'form-status error';
      status.textContent = `Could not send: ${err.message}`;
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Send Message';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// BOOT
// initStreamText must run first to mark hero .reveal before initReveal
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initStreamText();   // ← first: marks hero .reveal
  initReveal();
  initHeroBg();
  initParallax();
  initCounters();
  initScrollProgress();
  initActiveNav();
  initCardTilt();
  initSvgAnimate();
  initContactForm();

  initHeroWrap().catch((err) => {
    console.warn('[Pretext] Hero wrap failed, showing fallback text.', err);
    const para = document.querySelector('.hero-grid .reveal > p');
    if (para) para.style.visibility = 'visible';
  });
});
