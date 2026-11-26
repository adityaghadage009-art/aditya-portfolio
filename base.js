/* ===== shared: dot field, cursor, nav, clock, magnetic, page transitions ===== */
(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const touch = matchMedia('(hover:none)').matches;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---------- interactive dot field ----------
   Every dot is a tiny spring. The cursor pushes nearby dots outward, they swell and warm in colour,
   the cursor's speed leaves a wake, and a click sends a ripple through the whole grid. */
const cv = $('#dots'), ctx = cv.getContext('2d');
const GAP = 8, R0 = 0.95, BG = '#eeeae6';
let W, H, dpr, cols, rows, N, ox, oy, vx, vy, heat, base;
function build() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cols = Math.ceil(W / GAP) + 1; rows = Math.ceil(H / GAP) + 1; N = cols * rows;
  ox = new Float32Array(N); oy = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N); heat = new Float32Array(N);
  // static layer drawn once
  base = document.createElement('canvas'); base.width = cv.width; base.height = cv.height;
  const b = base.getContext('2d'); b.scale(dpr, dpr); b.fillStyle = BG; b.fillRect(0, 0, W, H); b.fillStyle = '#d3cfca';
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { b.beginPath(); b.arc(i * GAP + 4, j * GAP + 4, R0, 0, 6.2832); b.fill(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0);
}
build(); addEventListener('resize', () => { build(); });
let mx = -999, my = -999, pmx = -999, pmy = -999, mvx = 0, mvy = 0, ripples = [], active = true;
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; active = true; }, { passive: true });
addEventListener('pointerdown', e => { ripples.push({ x: e.clientX, y: e.clientY, t: 0 }); active = true; });
document.addEventListener('mouseleave', () => { mx = my = -999; });
const RAD = 120;
function lerpCol(t) { // base #d3cfca -> soft mustard -> warm brown (never fully dark)
  const a = [211, 207, 202], m = [221, 175, 92], k = [120, 92, 60];
  let c = t < .5 ? a.map((v, i) => v + (m[i] - v) * t * 2) : m.map((v, i) => v + (k[i] - v) * (t - .5) * 2);
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}
const live = new Set();                    // only dots that are currently displaced or warm get touched each frame
function step(k, i, j, near, speed) {
  const px = i * GAP + 4, py = j * GAP + 4;
  let fx = 0, fy = 0, h = 0;
  if (near) {
    const dx = px - mx, dy = py - my, d = Math.hypot(dx, dy);
    if (d < RAD) { const f = 1 - d / RAD, s = f * f * (3 - 2 * f);
      fx += dx / (d + .001) * s * 6 + mvx * s * .12; fy += dy / (d + .001) * s * 6 + mvy * s * .12; h = s * (.32 + .22 * speed); }
  }
  for (const r of ripples) {
    const dx = px - r.x, dy = py - r.y, d = Math.hypot(dx, dy), z = (d - r.t * 900) / 46;
    if (Math.abs(z) < 2.2) { const a = Math.exp(-z * z) * (1 - r.t / 1.6); fx += dx / (d + .001) * a * 5; fy += dy / (d + .001) * a * 5; h = Math.max(h, a * .4); }
  }
  vx[k] = (vx[k] + (fx - ox[k]) * .14) * .78; vy[k] = (vy[k] + (fy - oy[k]) * .14) * .78;
  ox[k] += vx[k]; oy[k] += vy[k]; heat[k] += (h - heat[k]) * (h > heat[k] ? .35 : .06);
  if (!near && !ripples.length && Math.abs(ox[k]) < .02 && Math.abs(oy[k]) < .02 && Math.abs(vx[k]) < .02 && heat[k] < .01) { ox[k] = oy[k] = vx[k] = vy[k] = 0; heat[k] = 0; live.delete(k); }
  else live.add(k);
}
function frame() {
  requestAnimationFrame(frame);
  if (!active || reduce || scrollY > innerHeight * 1.05) return;     // the field only lives behind the hero
  mvx = mvx * .8 + (mx - pmx) * .2; mvy = mvy * .8 + (my - pmy) * .2; pmx = mx; pmy = my;
  ripples.forEach(r => r.t += 1 / 60); ripples = ripples.filter(r => r.t < 1.6);
  const speed = Math.min(1, Math.hypot(mvx, mvy) / 30);
  if (ripples.length) { for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) step(j * cols + i, i, j, false, speed); }
  const i0 = Math.max(0, ((mx - RAD - 8) / GAP) | 0), i1 = Math.min(cols - 1, ((mx + RAD + 8) / GAP) | 0);
  const j0 = Math.max(0, ((my - RAD - 8) / GAP) | 0), j1 = Math.min(rows - 1, ((my + RAD + 8) / GAP) | 0);
  const seen = new Set();
  if (mx > -900) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * cols + i; seen.add(k); step(k, i, j, true, speed); }
  if (!ripples.length) for (const k of [...live]) if (!seen.has(k)) step(k, k % cols, (k / cols) | 0, false, speed);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const k of live) {
    const px = (k % cols) * GAP + 4, py = ((k / cols) | 0) * GAP + 4;
    ctx.fillStyle = BG; ctx.fillRect(px - 1.6, py - 1.6, 3.2, 3.2);
    ctx.fillStyle = lerpCol(Math.min(1, heat[k]));
    ctx.beginPath(); ctx.arc(px + ox[k], py + oy[k], R0 + heat[k] * .8, 0, 6.2832); ctx.fill();
  }
  if (!live.size && !ripples.length && mx < -900) active = false;
}
requestAnimationFrame(frame);

/* ---------- cursor ---------- */
const cur = $('.cur'), dot = $('.cur-dot');
let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; dot.style.transform = `translate(${tx}px,${ty}px)`; });
document.addEventListener('mouseleave', () => { cur.classList.add('hide'); dot.classList.add('hide'); });
document.addEventListener('mouseenter', () => { cur.classList.remove('hide'); dot.classList.remove('hide'); });
(function loop() { cx += (tx - cx) * .16; cy += (ty - cy) * .16; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
window.bindCursor = (root = document) => $$('a,button,[data-cursor]', root).forEach(el => {
  if (el._cb) return; el._cb = 1;
  el.addEventListener('mouseenter', () => {
    const k = el.dataset.cursor || (el.closest('.card') ? 'view' : 'link');
    cur.dataset.k = k; cur.classList.add(k === 'view' ? 'view' : 'link');
    if (el.dataset.label) cur.querySelector('span').textContent = el.dataset.label.replace(/<br\s*\/?>/gi, '\n').replace(/^VIEW CASE STUDY$/, 'VIEW\nCASE STUDY').replace(/^COMING SOON$/, 'COMING\nSOON').replace(/^VIEW ON INSTAGRAM$/, 'VIEW ON\nINSTAGRAM'); else cur.querySelector('span').textContent = 'VIEW';
    dot.classList.toggle('hide', k === 'view');
  });
  el.addEventListener('mouseleave', () => { cur.classList.remove('view', 'link'); dot.classList.remove('hide'); });
});

/* ---------- live clock (India) ---------- */
function tick() {
  const d = new Date();
  const c = $('#clock'), dt = $('#date'); if (!c) return;
  c.textContent = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).toLowerCase();
  dt.textContent = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}
tick(); setInterval(tick, 10000);

/* ---------- nav highlight ---------- */
const pill = $('.pill'), hl = pill && pill.querySelector('.hl');
function moveHL(el) { if (!hl) return; hl.style.width = el.offsetWidth + 'px'; hl.style.transform = `translateX(${el.offsetLeft}px)`; }
window.syncNav = () => { const on = pill && pill.querySelector('.tab.on'); on && moveHL(on); };
pill && $$('.tab', pill).forEach(t => {
  if (!t.querySelector('span')) t.innerHTML = `<span>${t.textContent}</span>`;
  t.addEventListener('click', e => {
    if (t.classList.contains('on')) { e.preventDefault(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    pill.querySelector('.tab.on')?.classList.remove('on'); t.classList.add('on'); moveHL(t);
    setTimeout(() => { document.body.classList.add('leaving'); setTimeout(() => location.href = t.getAttribute('href'), 600); }, 380);
  }, true);
});
/* hide nav on scroll down, show on scroll up */
let ly = scrollY; const nav = $('.nav');
addEventListener('scroll', () => { const y = scrollY; nav && nav.classList.toggle('away', y > ly && y > 240); ly = y; }, { passive: true });

/* ---------- magnetic ---------- */
window.magnet = (sel, k = .3) => $$(sel).forEach(el => {
  el.addEventListener('mousemove', e => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * k}px,${(e.clientY - r.top - r.height / 2) * k * 1.3}px)`; });
  el.addEventListener('mouseleave', () => { el.style.transform = ''; });
});
magnet('.links a', .18);

/* ---------- page transitions ---------- */
$$('a[data-go]').forEach(a => a.addEventListener('click', e => {
  const href = a.getAttribute('href'); if (!href || href.startsWith('#')) return;
  e.preventDefault(); document.body.classList.add('leaving'); setTimeout(() => location.href = href, 650);
}));
addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leaving'); });

/* ---------- scroll reveal ---------- */
const ro = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
window.observeReveal = () => $$('.rv:not(.in)').forEach(el => ro.observe(el));

addEventListener('load', () => { syncNav(); bindCursor(); observeReveal(); requestAnimationFrame(() => document.body.classList.add('ready')); });
addEventListener('resize', () => syncNav());
document.fonts && document.fonts.ready.then(() => syncNav());
})();

/* ---------- shared footer (both pages) ---------- */
(() => {
  const I = {
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></svg>',
    in: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3.5" y="9" width="3.6" height="11" rx=".6"/><circle cx="5.3" cy="5.4" r="2.1"/><path d="M10 9h3.4v1.6c.6-1 1.9-1.9 3.8-1.9 3 0 3.8 2 3.8 4.6V20h-3.6v-6c0-1.4-.4-2.4-1.8-2.4s-2 1-2 2.4v6H10z"/></svg>',
    cv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5"/><path d="M6 11l6-6 6 6"/></svg>'
  };
  const arrowDown = '<svg viewBox="0 0 40 40"><path d="M20 4c-3 10 3 18 0 30"/><path d="M13 27l7 8 7-8"/></svg>';
  const arrowUp = '<svg viewBox="0 0 40 40"><path d="M20 36c3-10-3-18 0-30"/><path d="M13 13l7-8 7 8"/></svg>';
  const K = [
    { k: 'mail', name: 'Say hi', c: '#e2a523', ic: '#231e1a', href: 'mailto:adityaghadage009@gmail.com', hi: 1, note: 'WhatsApp<br>or email me', pos: 'below' },
    { k: 'in', name: 'LinkedIn', c: '#6f6b34', href: 'https://www.linkedin.com/in/aditya-ghadage', ext: 1, note: 'let’s connect here', pos: 'above' },
    { k: 'cv', name: 'Resume', c: '#f4ece0', ic: '#231e1a', href: 'assets/Aditya-Ghadage-Resume.pdf', ext: 1, note: 'my resume,<br>all in two pages', pos: 'below' },
    { k: 'up', name: 'Back to top', c: '#2f2924', href: '#top', note: 'take me back up', pos: 'above' }
  ];
  const f = document.createElement('footer'); f.className = 'foot'; f.id = 'contact';
  const nums = n => Array.from({ length: n }, (_, i) => `<b style="left:calc(${i * 100}*var(--u))">${i * 100}</b>`).join('');
  f.innerHTML = `<div class="fst">
    <div class="ruler">${nums(18)}</div><div class="ruler v"></div>
    <div class="flabel"><span>#</span><span>Say hello</span><em class="xy">X 0 · Y 0</em></div>
    <h2>Let’s make something people come back to.</h2>
    <div class="keys">${K.map(o => `<div class="kw">
      ${o.pos === 'above' ? `<span class="note" data-pos="above">${o.note}${arrowDown}</span>` : ''}
      <a class="key" data-name="${o.name}" ${o.href ? `href="${o.href}"` : 'role="button" tabindex="0"'} ${o.ext ? 'target="_blank" rel="noopener"' : ''} ${o.hi ? 'data-hi' : ''} ${o.off ? 'aria-disabled="true"' : ''} aria-label="${o.name}" style="--c:${o.c};${o.ic ? `--ic:${o.ic}` : ''}"><span class="cap">${I[o.k]}</span></a>
      ${o.pos === 'below' ? `<span class="note" data-pos="below">${arrowUp}${o.note}</span>` : ''}
    </div>`).join('')}</div>
    <div class="sel"><i></i><i></i><i></i><i></i><span></span></div>
    <div class="fbar"><span>© ${new Date().getFullYear()} Aditya Ghadage</span><span>Designed &amp; built with care · Maharashtra, India</span><span class="ftime"></span></div>
  </div>`;
  if (document.body.hasAttribute('data-nofooter')) return;
  const old = document.querySelector('footer.page'); if (old) old.replaceWith(f); else (document.querySelector('main.page') || document.body).appendChild(f);
  if (!document.getElementById('top')) { const t = document.createElement('span'); t.id = 'top'; t.style.cssText = 'position:absolute;top:0'; document.body.prepend(t); }
  const st = f.querySelector('.fst'), sel = f.querySelector('.sel'), lab = sel.querySelector('span'), xy = f.querySelector('.xy');
  /* notes sit beside their keys in the desktop canvas */
  const placeNotes = () => {
    if (innerWidth <= 900) { f.querySelectorAll('.note').forEach(n => n.style.cssText = ''); return; }
    const sr = f.querySelector('.keys').getBoundingClientRect();
    f.querySelectorAll('.kw').forEach(w => { const key = w.querySelector('.key').getBoundingClientRect(), n = w.querySelector('.note'); if (!n) return;
      const nr = n.getBoundingClientRect(), cx = key.left - sr.left + key.width / 2;
      n.style.left = (cx - nr.width / 2) + 'px';
      n.style.top = (n.dataset.pos === 'above' ? key.top - sr.top - nr.height - 6 : key.bottom - sr.top + 14) + 'px'; });
  };
  document.fonts.ready.then(placeNotes); addEventListener('resize', placeNotes); setTimeout(placeNotes, 300);
  /* Figma-style selection follows the key you point at */
  f.querySelectorAll('.key').forEach(k => {
    const show = () => { const sr = st.getBoundingClientRect(), r = k.getBoundingClientRect(), pad = 8;
      const first = !sel.classList.contains('on'); if (first) sel.style.transition = 'opacity .3s cubic-bezier(.2,.8,.2,1)'; sel.style.transform = `translate(${r.left - sr.left - pad}px,${r.top - sr.top - pad}px)`; sel.style.width = r.width + pad * 2 + 'px'; sel.style.height = r.height + pad * 2 + 'px';
      lab.textContent = `${k.dataset.name} · ${Math.round(r.width)} × ${Math.round(r.height)}`; sel.classList.add('on'); if (first) { void sel.offsetWidth; sel.style.transition = ''; } };
    k.addEventListener('mouseenter', show); k.addEventListener('focus', show);
    k.addEventListener('mouseleave', () => sel.classList.remove('on')); k.addEventListener('blur', () => sel.classList.remove('on'));
    k.addEventListener('click', e => { if (k.getAttribute('aria-disabled') === 'true') { e.preventDefault(); k.classList.remove('nope'); void k.offsetWidth; k.classList.add('nope'); }
      if (k.getAttribute('href') === '#top') { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); } });
    k.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { k.classList.add('press'); setTimeout(() => k.classList.remove('press'), 160); } });
  });
  f.addEventListener('mousemove', e => { const r = st.getBoundingClientRect(), u = r.width / 1728; xy.textContent = `X ${Math.round((e.clientX - r.left) / u)} · Y ${Math.round((e.clientY - r.top) / u)}`; });
  const ft = f.querySelector('.ftime'), tick = () => { ft.textContent = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + ' IST'; };
  tick(); setInterval(tick, 30000);
  if (window.bindCursor) bindCursor(f);
})();

/* ---------- phone visitors: one friendly suggestion per visit ---------- */
(() => {
  let seen = false; try { seen = sessionStorage.getItem('bigscreen') === '1'; } catch (e) {}
  if (seen || !matchMedia('(max-width: 900px) and (pointer: coarse)').matches) return;
  setTimeout(() => {
    const el = document.createElement('div'); el.className = 'bigscreen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'bsT');
    el.innerHTML = `<div class="sheet"><button class="x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <img class="ill" src="assets/face.svg" alt="" aria-hidden="true"><h3 id="bsT">Made for a bigger screen</h3>
      <p>Everything works on your phone, but the motion, illustrations and case studies really come alive on a laptop or desktop.</p>
      <div class="acts"><button class="go" type="button">Continue on phone</button><button class="cp" type="button">Copy link for later</button></div></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
    const close = () => { try { sessionStorage.setItem('bigscreen', '1'); } catch (e) {} el.classList.remove('on'); setTimeout(() => el.remove(), 500); };
    el.querySelector('.x').onclick = close; el.querySelector('.go').onclick = close;
    el.addEventListener('click', e => { if (e.target === el) close(); });
    const cp = el.querySelector('.cp');
    cp.onclick = () => { const u = location.href.split('#')[0];
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => { cp.textContent = 'Link copied ✓'; setTimeout(close, 900); })
        .catch(() => { if (navigator.share) navigator.share({ url: u }).finally(close); else close(); }); };
    el.querySelector('.go').focus({ preventScroll: true });
  }, 1600);
})();

/* ---------- say hi: the mascot chats first, then hands off to WhatsApp, a call or email ---------- */
(() => {
  const PHONE = '917666486099', SHOWN = '+91 76664 86099', MAIL = 'adityaghadage009@gmail.com';
  const NEEDS = [
    { k: 'Hiring', reply: 'Love that! Tell me about the role and I’ll send over anything you need, including my resume.', msg: 'Hi Aditya! I came across your portfolio and would love to talk about a role on our team.' },
    { k: 'A project', reply: 'Ooh, a project! Share a little about it and we’ll figure out the best next step together.', msg: 'Hi Aditya! I saw your portfolio and have a project I’d like to discuss with you.' },
    { k: 'Just saying hi', reply: 'Hi right back! 👋 Always happy to meet people who care about good design.', msg: 'Hi Aditya! Just went through your portfolio and wanted to say hi 👋' }
  ];
  const I = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.3 4.8 4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.9c-1.5 0-3-.4-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1zm4.5-6c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-.9.9-.9 2.2s1 2.6 1.1 2.8c.1.2 1.9 3 4.7 4.2 1.8.7 2.4.8 3.3.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></svg>',
    go: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  let open = null;
  async function openHi(from) {
    if (open) return;
    const name = (() => { try { return localStorage.getItem('visitorName') || ''; } catch (e) { return ''; } })();
    const scrim = document.createElement('div'); scrim.className = 'sh-scrim';
    const el = document.createElement('div'); el.className = 'sh'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'hiT'); el.tabIndex = -1;
    el.innerHTML = `<span class="face"><img src="assets/face.svg" alt=""></span><button class="x" type="button" aria-label="Close">${I.x}</button>
      <div class="scroll"><h3 id="hiT">Hey${name ? ' ' + name : ''}, glad you stopped by!</h3><p class="sub">I read every message myself. Pick what brings you here and I’ll point you the right way.</p>
      <div class="chat" aria-live="polite"></div></div>`;
    document.body.append(scrim, el); document.body.classList.add('shlock');
    const r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    const ox = r ? r.left + r.width / 2 - innerWidth / 2 : 0, oy = r ? r.top + r.height / 2 - innerHeight / 2 : 60;
    el.animate([{ transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(.2)`, opacity: 0, borderRadius: '40px' }, { transform: 'translate(-50%,-50%)', opacity: 1, borderRadius: '26px' }],
      { duration: reduce ? 1 : 620, easing: 'cubic-bezier(.2,1.1,.3,1)' });
    requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('in'); });
    open = { el, scrim, from };
    const close = () => closeHi(); scrim.onclick = close; el.querySelector('.x').onclick = close;
    const chat = el.querySelector('.chat'), sc = el.querySelector('.scroll');
    const bubble = (cls, html) => { const b = document.createElement('div'); b.className = 'b ' + cls; b.innerHTML = html; chat.appendChild(b); sc.scrollTop = sc.scrollHeight; return b; };
    const typing = async ms => { const t = bubble('me typing', '<i></i><i></i><i></i>'); await wait(ms); t.remove(); };
    await wait(450); await typing(700);
    bubble('me', 'So, what brings you here?');
    const chips = document.createElement('div'); chips.className = 'chips';
    chips.innerHTML = NEEDS.map((n, i) => `<button type="button" data-i="${i}">${n.k}</button>`).join(''); chat.appendChild(chips);
    chips.querySelector('button').focus({ preventScroll: true });
    chips.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return; const n = NEEDS[+b.dataset.i]; chips.remove();
      bubble('you', n.k); await typing(900); bubble('me', n.reply);
      const text = encodeURIComponent(n.msg + (name ? ` — ${name}` : ''));
      const ways = document.createElement('div'); ways.className = 'ways';
      ways.innerHTML = `
        <a class="way wa" href="https://wa.me/${PHONE}?text=${text}" target="_blank" rel="noopener"><span class="ic" style="background:#25d366">${I.wa}</span><span><b>Message me on WhatsApp</b><small>Your note is already written, just hit send</small></span><span class="go">${I.go}</span></a>
        <a class="way" href="mailto:${MAIL}?subject=${encodeURIComponent(n.k === 'Hiring' ? 'Let’s talk about a role' : n.k === 'A project' ? 'A project idea' : 'Hi from your portfolio')}&body=${text}"><span class="ic" style="background:var(--mustard);color:var(--text)">${I.mail}</span><span><b>Prefer email?</b><small>${MAIL}</small></span><span class="go">${I.go}</span></a>`;
      chat.appendChild(ways); requestAnimationFrame(() => sc.scrollTop = sc.scrollHeight); sc.scrollTop = sc.scrollHeight;
      const note = document.createElement('p'); note.className = 'foot-note'; note.textContent = 'I usually reply within a day. Talk soon!'; chat.appendChild(note);
      ways.querySelector('a').focus({ preventScroll: true });
      ways.addEventListener('click', async ev => { if (!ev.target.closest('a')) return; await wait(300); bubble('me', 'Perfect, see you on the other side 🙌'); });
    };
  }
  function closeHi() {
    if (!open) return; const { el, scrim, from } = open; open = null;
    scrim.classList.remove('on');
    el.animate([{ opacity: 1, transform: 'translate(-50%,-50%)' }, { opacity: 0, transform: 'translate(-50%,-46%) scale(.94)' }], { duration: reduce ? 1 : 320, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
      .finished.then(() => { el.remove(); scrim.remove(); document.body.classList.remove('shlock'); from && from.focus && from.focus({ preventScroll: true }); });
  }
  window.openHi = openHi;
  document.addEventListener('click', e => { const t = e.target.closest('[data-hi]'); if (!t) return; e.preventDefault(); e.stopPropagation(); openHi(t); }, true);
  addEventListener('keydown', e => { if (!open) return;
    if (e.key === 'Escape') closeHi();
    else if (e.key === 'Tab') { const f = [...open.el.querySelectorAll('button,a')]; if (!f.length) return; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); } });
})();
