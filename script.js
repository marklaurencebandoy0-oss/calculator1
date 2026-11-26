/* Calculator: engine, UI, sound, theme, background effects. No eval(). */
(() => {
'use strict';

const $ = s => document.querySelector(s);
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const curEl = $('#cur'), prevEl = $('#prev'), keysEl = $('#keys'), calcEl = $('.calc');
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const OPS = '+-*/';
const MAX_DIGITS = 15;

/* ---------- Calculation engine ---------- */
// expr alternates number, operator, number ... ; cur is the number being typed.
let expr = [], cur = '', done = false, err = false, prevText = '';

function evaluate(t) {
  const a = [t[0]];
  for (let i = 1; i < t.length; i += 2) {           // pass 1: × and ÷
    const op = t[i], b = t[i + 1];
    if (op === '*') a[a.length - 1] *= b;
    else if (op === '/') {
      if (b === 0) throw new Error('Cannot divide by zero');
      a[a.length - 1] /= b;
    } else a.push(op, b);
  }
  let r = a[0];
  for (let i = 1; i < a.length; i += 2) r = a[i] === '+' ? r + a[i + 1] : r - a[i + 1]; // pass 2
  if (!isFinite(r)) throw new Error('Number too large');
  return r;
}
function toStr(n) {                                  // clean floating-point noise, keep display sane
  if (!isFinite(n)) throw new Error('Number too large');
  n = Number(n.toPrecision(12));
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(n);
}
function fmt(s) {                                    // thousands separators
  if (/e/.test(s)) return s.replace('e+', 'e');
  const neg = s[0] === '-', [i, d] = (neg ? s.slice(1) : s).split('.');
  return (neg ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d !== undefined ? '.' + d : '');
}

/* ---------- Actions ---------- */
function clearAll() { expr = []; cur = ''; done = false; err = false; prevText = ''; curEl.classList.remove('error'); }
function fail(msg) {
  if (msg) { err = true; curEl.textContent = msg; curEl.classList.add('error'); fit(); }
  sfx.err();
  if (!reduce.matches) { curEl.classList.remove('shake'); void curEl.offsetWidth; curEl.classList.add('shake'); }
}
function digit(d) {
  if (done) { cur = ''; expr = []; done = false; prevText = ''; }
  if (cur.replace(/[-.]/g, '').length >= MAX_DIGITS) return fail();
  cur = cur === '0' ? d : cur === '-0' ? '-' + d : cur + d;
}
function dot() {
  if (done) { cur = ''; expr = []; done = false; prevText = ''; }
  if (cur.includes('.')) return fail();
  cur = cur === '' ? '0.' : cur === '-' ? '-0.' : cur + '.';
}
function operator(o) {
  if (cur !== '') { expr.push(parseFloat(cur), o); cur = ''; done = false; prevText = ''; }
  else if (!expr.length) expr.push(0, o);
  else expr[expr.length - 1] = o;                    // replace trailing operator
}
function equals() {
  if (!expr.length && cur === '') return;
  const t = [...expr];
  if (cur !== '') t.push(parseFloat(cur)); else if (typeof t[t.length - 1] === 'string') t.pop();
  if (!t.length) return;
  try {
    const r = toStr(evaluate(t));
    prevText = t.map(x => typeof x === 'number' ? fmt(toStr(x)) : SYM[x]).join(' ') + ' =';
    cur = r; expr = []; done = true;
    sfx.eq();
  } catch (e) { clearAll(); fail(e.message); }
}
function percent() {
  if (cur === '') return fail();
  const x = parseFloat(cur);
  const last = expr[expr.length - 1];
  if (expr.length >= 2 && (last === '+' || last === '-')) {   // 200 + 10% → 200 + 20
    cur = toStr(evaluate(expr.slice(0, -1)) * x / 100);
  } else cur = toStr(x / 100);
}
function negate() { cur = cur === '' ? '-0' : cur[0] === '-' ? cur.slice(1) : '-' + cur; if (cur === '') cur = '0'; }
function back() {
  if (done) { clearAll(); return; }
  cur = cur.slice(0, -1);
  if (cur === '-' ) cur = '';
}

function handle(k) {
  if (err) { clearAll(); if (!/^[\d.]$/.test(k)) { render(); return; } }
  if (/^\d$/.test(k)) { digit(k); sfx.num(); }
  else if (k === '.') { dot(); sfx.num(); }
  else if (OPS.includes(k)) { operator(k); sfx.op(); }
  else if (k === '=') equals();
  else if (k === 'ac') { clearAll(); sfx.fn(); }
  else if (k === 'neg') { negate(); sfx.fn(); }
  else if (k === 'pct') { percent(); sfx.fn(); }
  else if (k === 'back') { back(); sfx.fn(); }
  if (!err) render();
  if (k === '=') burst();
}

/* ---------- Rendering ---------- */
let lastMain = '', lastPrev = '';
const opKeys = [...keysEl.querySelectorAll('.op')];
function render() {
  const last = expr[expr.length - 1];
  const main = cur !== '' ? fmt(cur) : expr.length > 1 ? fmt(toStr(expr[expr.length - 2])) : '0';
  let prev = prevText || expr.map(x => typeof x === 'number' ? fmt(toStr(x)) : SYM[x]).join(' ');
  if (prev.length > 30) prev = '…' + prev.slice(-29);
  if (prev !== lastPrev) { prevEl.textContent = prev; lastPrev = prev; }
  if (main !== lastMain || curEl.classList.contains('error')) {
    curEl.classList.remove('error');
    curEl.textContent = main; lastMain = main;
    curEl.style.fontSize = ''; fit();
    if (!reduce.matches) curEl.animate(
      [{ transform: 'translateY(6px)', opacity: .35, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'none' }],
      { duration: 190, easing: 'ease-out' });
  }
  const pending = cur === '' && typeof last === 'string' ? last : null;
  opKeys.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === pending)));
}
function fit() {                                      // responsive font scaling / overflow protection
  const avail = curEl.clientWidth, sw = curEl.scrollWidth;
  if (sw > avail) curEl.style.fontSize = Math.max(16, parseFloat(getComputedStyle(curEl).fontSize) * avail / sw * .97) + 'px';
}

/* ---------- Sound (Web Audio, off by default) ---------- */
let soundOn = false, actx = null;
function tone(f, d = .07, type = 'sine', v = .035, when = 0, slide) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + .02);
}
const sfx = {
  num: () => tone(500 + Math.random() * 50, .05, 'sine', .03),
  op: () => tone(340, .09, 'triangle', .04),
  fn: () => tone(260, .08, 'triangle', .035),
  eq: () => { tone(523, .14, 'sine', .045); tone(784, .24, 'sine', .04, .08); },
  err: () => tone(160, .22, 'sawtooth', .025, 0, 90),
  theme: () => { tone(440, .1, 'sine', .035); tone(660, .16, 'sine', .03, .07); }
};
const soundBtn = $('#soundToggle');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  if (soundOn) {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { soundOn = false; }
  }
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.setAttribute('aria-label', soundOn ? 'Sound effects on. Turn off' : 'Sound effects off. Turn on');
  if (soundOn) sfx.op();
});

/* ---------- Theme ---------- */
const themeBtn = $('#themeToggle');
let themeTimer = 0, particleRGB = '128,207,255';
function applyTheme(t, animate) {
  if (animate && !reduce.matches) {
    root.classList.add('theming'); clearTimeout(themeTimer);
    themeTimer = setTimeout(() => root.classList.remove('theming'), 750);
  }
  root.dataset.theme = t;
  particleRGB = t === 'light' ? '22,110,200' : '128,207,255';
  themeBtn.setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
}
let saved = null;
try { saved = localStorage.getItem('calc-theme'); } catch (e) {}
applyTheme(saved === 'light' ? 'light' : 'dark', false);   // dark by default
themeBtn.addEventListener('click', () => {
  const t = root.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(t, true);
  try { localStorage.setItem('calc-theme', t); } catch (e) {}
  sfx.theme();
});

/* ---------- Button effects ---------- */
function ripple(btn, x, y) {
  if (reduce.matches) return;
  const r = btn.getBoundingClientRect(), s = document.createElement('span');
  s.className = 'ripple'; s.style.left = (x ?? r.width / 2) + 'px'; s.style.top = (y ?? r.height / 2) + 'px';
  btn.appendChild(s); s.addEventListener('animationend', () => s.remove(), { once: true });
}
function burst() {
  const eq = keysEl.querySelector('.eq'); eq.classList.remove('burst'); void eq.offsetWidth; eq.classList.add('burst');
}
keysEl.addEventListener('pointerdown', e => {
  const b = e.target.closest('.key'); if (!b) return;
  const r = b.getBoundingClientRect(); ripple(b, e.clientX - r.left, e.clientY - r.top);
});
keysEl.addEventListener('click', e => {
  const b = e.target.closest('.key'); if (!b) return;
  if (e.detail === 0) ripple(b);                      // keyboard-activated
  handle(b.dataset.k);
});
keysEl.addEventListener('pointermove', e => {         // glass highlight + subtle magnetic pull
  const b = e.target.closest('.key'); if (!b || e.pointerType === 'touch') return;
  const r = b.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  b.style.setProperty('--bx', x + 'px'); b.style.setProperty('--by', y + 'px');
  b.style.setProperty('--tx', ((x / r.width - .5) * 4).toFixed(1) + 'px');
  b.style.setProperty('--ty', ((y / r.height - .5) * 4).toFixed(1) + 'px');
});
keysEl.addEventListener('pointerout', e => {
  const b = e.target.closest('.key'); if (b) { b.style.setProperty('--tx', '0px'); b.style.setProperty('--ty', '0px'); }
});
calcEl.addEventListener('pointermove', e => {
  const r = calcEl.getBoundingClientRect();
  calcEl.style.setProperty('--px', (e.clientX - r.left) + 'px'); calcEl.style.setProperty('--py', (e.clientY - r.top) + 'px');
}, { passive: true });

/* ---------- Keyboard ---------- */
const KEYMAP = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'ac', '%': 'pct', x: '*', X: '*', ',': '.' };
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;     // keep browser shortcuts
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.toggle')) return;
  const k = KEYMAP[e.key] || (/^[\d.]$/.test(e.key) || OPS.includes(e.key) ? e.key : null);
  if (!k) return;
  e.preventDefault();
  if (e.repeat && k !== 'back') return;
  handle(k);
  const b = keysEl.querySelector(`[data-k="${CSS.escape(k)}"]`);
  if (b) { b.classList.add('kbd'); ripple(b); setTimeout(() => b.classList.remove('kbd'), 140); }
});

/* ---------- Background: particles, parallax, cursor light ---------- */
const cv = $('#particles'), cx = cv.getContext('2d');
const layers = [...document.querySelectorAll('.layer')], light = $('.cursor-light');
let W = 0, H = 0, P = [], mx = innerWidth / 2, my = innerHeight / 2, sx = mx, sy = my, raf = 0;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || W < 600;
  const n = Math.round(Math.min(70, Math.max(18, W * H / 26000)) * (lowPower ? .55 : 1));
  P = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + .4,
    vx: (Math.random() - .5) * .15, vy: -Math.random() * .25 - .05, a: Math.random() * .5 + .25, p: Math.random() * 6.28 }));
  fit();
  if (reduce.matches) drawParticles(0);
}
function drawParticles(t) {
  cx.clearRect(0, 0, W, H);
  for (const p of P) {
    if (!reduce.matches) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
      if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
    }
    cx.fillStyle = `rgba(${particleRGB},${(p.a * (.65 + .35 * Math.sin(t * .0012 + p.p))).toFixed(3)})`;
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.2832); cx.fill();
  }
}
function loop(t) {
  sx += (mx - sx) * .08; sy += (my - sy) * .08;
  light.style.transform = `translate3d(${(sx - 310).toFixed(1)}px,${(sy - 310).toFixed(1)}px,0)`;
  if (!reduce.matches) {
    const ox = sx / W - .5, oy = sy / H - .5;
    for (const l of layers) { const d = +l.dataset.depth; l.style.transform = `translate3d(${(-ox * d).toFixed(1)}px,${(-oy * d).toFixed(1)}px,0)`; }
  }
  drawParticles(t);
  raf = requestAnimationFrame(loop);
}
function start() { if (!raf && !(reduce.matches && raf)) raf = requestAnimationFrame(loop); }
function stop() { cancelAnimationFrame(raf); raf = 0; }
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
let rt = 0;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
reduce.addEventListener?.('change', resize);

/* ---------- Init ---------- */
keysEl.classList.add('locked');                       // unlock once the intro finishes
setTimeout(() => keysEl.classList.remove('locked'), reduce.matches ? 0 : 2500);
resize(); render(); start();
})();
