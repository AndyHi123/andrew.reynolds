'use strict';
const VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
};

/* ---------- State ---------- */
const KEY = 'riffwise';
const DEFAULTS = { started: false, name: '', level: 'new', styles: [], goal: 10, done: {}, log: {}, path: [], best: {} };
let S = load();
function load() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return { ...DEFAULTS }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const secsOn = d => S.log[dayKey(d)] || 0;
const todaySecs = () => secsOn(new Date());
const fmtMins = s => (s < 60 ? `${Math.floor(s)}s` : `${Math.floor(s / 60)} min`);
const fmtClock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// A day counts toward the streak after one minute of practice
function streak() {
  const d = new Date();
  if (secsOn(d) < 60) d.setDate(d.getDate() - 1);
  let n = 0;
  while (secsOn(d) >= 60) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const totalSecs = () => Object.values(S.log).reduce((a, b) => a + b, 0);

/* ---------- Content lookups ---------- */
const COURSE = Object.fromEntries(COURSES.map(c => [c.id, c]));
const LESSON = {};
COURSES.forEach(c => c.lessons.forEach((l, i) => { LESSON[l.id] = { lesson: l, course: c, index: i }; }));
const LEVEL_NAMES = ['', 'Beginner', 'Intermediate', 'Advanced'];
const courseDone = c => c.lessons.filter(l => S.done[l.id]).length;
function buildPath(level, styles) {
  const base = PATH_BASE[level] || PATH_BASE.new;
  const wanted = new Set(STYLES.filter(s => styles.includes(s.id)).flatMap(s => s.courses));
  const head = base.order.slice(0, base.keep);
  const rest = base.order.slice(base.keep);
  return head.concat(rest.filter(id => wanted.has(id)), rest.filter(id => !wanted.has(id)));
}
function nextInPath() {
  for (const id of S.path) {
    const c = COURSE[id];
    const l = c.lessons.find(x => !S.done[x.id]);
    if (l) return { course: c, lesson: l };
  }
  return null;
}
const nextInCourse = c => c.lessons.find(l => !S.done[l.id]) || null;

/* ---------- Practice time ---------- */
// Seconds count toward today's total while a lesson or tool is open and on screen
let practicing = false, tickCount = 0;
setInterval(() => {
  if (!practicing || document.visibilityState !== 'visible') return;
  const k = dayKey();
  S.log[k] = (S.log[k] || 0) + 1;
  if (++tickCount % 10 === 0) save();
  onTick();
}, 1000);
let onTick = () => {};

/* ---------- Audio ---------- */
let actx = null, out = null, noiseBuf = null;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    const comp = actx.createDynamicsCompressor();
    const tone = actx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 5500;
    out = actx.createGain(); out.gain.value = 0.85;
    out.connect(tone); tone.connect(comp); comp.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.12, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (actx.state !== 'running') actx.resume();
  return actx;
}
// Karplus-Strong plucked string, rendered once per pitch and cached
const pluckCache = new Map();
function pluckBuffer(midi) {
  if (pluckCache.has(midi)) return pluckCache.get(midi);
  const sr = actx.sampleRate, f = 440 * 2 ** ((midi - 69) / 12), len = Math.floor(sr * 2.6);
  const N = Math.max(2, Math.round(sr / f - 0.5));
  const buf = actx.createBuffer(1, len, sr), d = buf.getChannelData(0), ring = new Float32Array(N);
  let prev = 0, mean = 0;
  for (let i = 0; i < N; i++) { prev = prev * 0.45 + (Math.random() * 2 - 1) * 0.55; ring[i] = prev; mean += prev; }
  mean /= N;
  for (let i = 0; i < N; i++) ring[i] -= mean;
  const damp = 1 - 0.0042 * Math.sqrt(82 / f);
  let peak = 0;
  for (let i = 0, j = 0; i < len; i++) {
    const jn = j + 1 === N ? 0 : j + 1, a = ring[j];
    d[i] = a; ring[j] = damp * 0.5 * (a + ring[jn]); j = jn;
    if (Math.abs(a) > peak) peak = Math.abs(a);
  }
  const fade = Math.floor(sr * 0.08);
  for (let i = 0; i < len; i++) d[i] = (d[i] / peak) * 0.5 * (i > len - fade ? (len - i) / fade : 1);
  pluckCache.set(midi, buf);
  return buf;
}
function playNote(bus, s, f, t, { vel = 1, dur = 1.5, tech = '' } = {}) {
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = pluckBuffer(OPEN[s] + f);
  const soft = tech.includes('h') || tech.includes('p');
  src.connect(g); g.connect(bus);
  src.start(t);
  g.gain.setValueAtTime(vel * (soft ? 0.5 : 0.75), t);
  if (tech.includes('m')) {
    g.gain.setTargetAtTime(0, t + 0.06, 0.03);
    src.stop(t + 0.35);
  } else {
    g.gain.setTargetAtTime(0, t + Math.max(0.08, dur), 0.07);
    src.stop(t + dur + 0.6);
  }
  if (tech.includes('b')) {
    src.playbackRate.setValueAtTime(1, t + 0.05);
    src.playbackRate.linearRampToValueAtTime(2 ** (2 / 12), t + 0.22);
  }
  if (tech.includes('~')) {
    const lfo = actx.createOscillator(), depth = actx.createGain();
    lfo.frequency.value = 5.5; depth.gain.value = 0.008;
    lfo.connect(depth); depth.connect(src.playbackRate);
    lfo.start(t + 0.18); lfo.stop(t + dur + 0.6);
  }
}
function strum(bus, notes, t, dir, dur) {
  // notes come low string first; an up-strum catches only the top four strings
  let ns = notes;
  if (dir === 'u') ns = notes.slice(-4).reverse();
  const gap = dir === 'u' ? 0.009 : 0.013;
  ns.forEach((n, i) => playNote(bus, n.s, n.f, t + i * gap, { vel: dir === 'u' ? 0.5 : 0.62, dur }));
}
function scratch(bus, t, dir) {
  const src = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf;
  bp.type = 'bandpass'; bp.frequency.value = dir === 'u' ? 2600 : 1800; bp.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(dir === 'u' ? 0.5 : 0.8, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  src.connect(bp); bp.connect(g); g.connect(bus);
  src.start(t); src.stop(t + 0.1);
}
function click(bus, t, accent) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = accent ? 1760 : 1100;
  g.gain.setValueAtTime(accent ? 0.5 : 0.32, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + 0.06);
}
function newBus() { const g = actx.createGain(); g.connect(out); return g; }
function silence(bus) {
  if (!bus) return;
  bus.gain.setTargetAtTime(0, actx.currentTime, 0.02);
  setTimeout(() => bus.disconnect(), 400);
}
function playChord(name, arpeggio = false) {
  audio();
  const bus = newBus(), t = actx.currentTime + 0.03;
  const notes = [];
  chordFrets(name).forEach((f, i) => { if (f !== null) notes.push({ s: 6 - i, f }); });
  if (arpeggio) notes.forEach((n, i) => playNote(bus, n.s, n.f, t + i * 0.22, { vel: 0.7, dur: 2 }));
  else strum(bus, notes, t, 'd', 2.2);
}
const sfx = {
  ok() { audio(); const t = actx.currentTime, b = newBus(); [72, 76, 79].forEach((m, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((m - 69) / 12); g.gain.setValueAtTime(0.18, t + i * 0.07); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.3); o.connect(g); g.connect(b); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.32); }); },
  no() { audio(); const t = actx.currentTime, b = newBus(), o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(150, t + 0.2); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(b); o.start(t); o.stop(t + 0.26); }
};

/* ---------- Drawing: chord diagrams, tab and fretboard ---------- */
function chordSVG(name) {
  const frets = chordFrets(name), fingers = chordFingers(name);
  const used = frets.filter(f => f > 0);
  const maxF = used.length ? Math.max(...used) : 0;
  const base = maxF > 4 ? Math.min(...used) : 1;
  const L = 18, T = 34, sx = 14, fy = 17, rows = 4;
  const x = i => L + i * sx, y = r => T + r * fy;
  let g = `<text class="nm" x="${x(2.5)}" y="14">${esc(name)}</text>`;
  for (let r = 0; r <= rows; r++) g += `<line class="${r === 0 && base === 1 ? 'nutl' : 'fr'}" x1="${x(0)}" x2="${x(5)}" y1="${y(r)}" y2="${y(r)}"/>`;
  for (let i = 0; i < 6; i++) g += `<line class="str" x1="${x(i)}" x2="${x(i)}" y1="${y(0)}" y2="${y(rows)}"/>`;
  if (base > 1) g += `<text class="bf" x="${x(5) + 6}" y="${y(0.5) + 3}">${base}fr</text>`;
  // barre: the same finger on the same fret across several strings
  const barre = {};
  frets.forEach((f, i) => { if (f && fingers[i]) { const k = fingers[i] + ':' + f; (barre[k] = barre[k] || []).push(i); } });
  const barred = new Set();
  Object.entries(barre).forEach(([k, idx]) => {
    if (idx.length < 2) return;
    const f = +k.split(':')[1], r = f - base + 0.5, a = Math.min(...idx), b = Math.max(...idx);
    g += `<rect class="dot" x="${x(a) - 6}" y="${y(r) - 6}" width="${x(b) - x(a) + 12}" height="12" rx="6"/><text class="fing" x="${x(a)}" y="${y(r)}">${k.split(':')[0]}</text>`;
    idx.forEach(i => barred.add(i));
  });
  frets.forEach((f, i) => {
    if (f === null) g += `<text class="mkx" x="${x(i)}" y="${T - 7}">✕</text>`;
    else if (f === 0) g += `<circle class="mk" cx="${x(i)}" cy="${T - 10}" r="4"/>`;
    else if (!barred.has(i)) {
      const r = f - base + 0.5;
      g += `<circle class="dot" cx="${x(i)}" cy="${y(r)}" r="6"/>`;
      if (fingers[i]) g += `<text class="fing" x="${x(i)}" y="${y(r)}">${fingers[i]}</text>`;
    }
  });
  return `<svg class="cd" viewBox="0 0 ${x(5) + 22} ${y(rows) + 6}">${g}</svg>`;
}

function tabSVG(p, total) {
  const minD = Math.min(1, ...p.events.map(e => e.d));
  const px = Math.max(60, Math.min(110, 22 / minD));
  const L = 30, T = 34, sp = 18, off = 14;
  const W = L + total * px + 16, H = T + 5 * sp + 46;
  const xAt = t => L + t * px + off;
  let g = '';
  'eBGDAE'.split('').forEach((n, i) => {
    g += `<text class="lbl" x="10" y="${T + i * sp + 4}">${n}</text><line class="str" x1="${L - 4}" x2="${W - 12}" y1="${T + i * sp}" y2="${T + i * sp}"/>`;
  });
  for (let b = 0; b <= total + 1e-6; b += 4) {
    const xb = b === 0 ? L - 4 : L + b * px;
    g += `<line class="barl" x1="${xb}" x2="${xb}" y1="${T}" y2="${T + 5 * sp}"/>`;
  }
  // beat counts under the tab
  const cy = T + 5 * sp + 38;
  for (let b = 0; b < total; b++) g += `<text class="cnt" x="${xAt(b)}" y="${cy}">${(b % 4) + 1}</text>`;
  const subs = new Set();
  p.events.forEach(e => {
    const fr = Math.round((e.t % 1) * 12) / 12;
    if (fr === 0.5) subs.add(`${e.t}|&`);
    else if (fr === 0.25) subs.add(`${e.t}|e`);
    else if (fr === 0.75) subs.add(`${e.t}|a`);
  });
  subs.forEach(k => { const [t, s] = k.split('|'); g += `<text class="cnt" x="${xAt(+t)}" y="${cy}">${s}</text>`; });
  p.labels.forEach(l => { g += `<text class="chordn" x="${xAt(l.t) - 6}" y="${T - 18}">${esc(l.text)}</text>`; });
  let lastChord = null;
  p.events.forEach((e, i) => {
    const x = xAt(e.t);
    let eg = '';
    if (e.chord && e.chord !== 'X' && (e.chord !== lastChord || e.t % 4 === 0)) eg += `<text class="chordn" x="${x - 6}" y="${T - 18}">${esc(e.chord)}</text>`;
    if (e.chord && e.chord !== 'X') lastChord = e.chord;
    if (e.scratch) {
      for (let s = 1; s <= 4; s++) eg += `<rect class="nbg" x="${x - 6}" y="${T + (s - 1) * sp - 8}" width="12" height="16"/><text class="n" x="${x}" y="${T + (s - 1) * sp}">x</text>`;
    } else {
      e.notes.forEach(n => {
        const label = n.f + (n.tech.match(/[bhp~]/g) || []).join('');
        const w = 8 + label.length * 8;
        eg += `<rect class="nbg" x="${x - w / 2}" y="${T + (n.s - 1) * sp - 8}" width="${w}" height="16" rx="3"/><text class="n" x="${x}" y="${T + (n.s - 1) * sp}">${label}</text>`;
      });
      if (e.notes.some(n => n.tech.includes('m'))) eg += `<text class="ann" x="${x}" y="${T - 6}">PM</text>`;
    }
    if (e.chord) eg += `<text class="ann" x="${x}" y="${T + 5 * sp + 20}" style="font-size:14px">${e.dir === 'u' ? '↑' : '↓'}</text>`;
    g += `<g class="ev" data-i="${i}">${eg}</g>`;
  });
  g += `<rect class="cur" x="${xAt(0) - 1}" y="${T - 12}" width="2.5" height="${5 * sp + 24}" rx="1"/>`;
  return { svg: `<svg class="tab-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`, xAt };
}

function fretboardSVG(maxFret, { scale, names } = {}) {
  const nut = 30, fw = 42, T = 14, sp = 17;
  const W = nut + maxFret * fw + 8, H = T + 5 * sp + 24;
  const fx = f => (f === 0 ? nut - 13 : nut + (f - 0.5) * fw), sy = s => T + (s - 1) * sp;
  let g = `<rect class="wood" x="${nut}" y="${T - 7}" width="${maxFret * fw}" height="${5 * sp + 14}" rx="3"/>`;
  [3, 5, 7, 9, 15, 17].filter(f => f <= maxFret).forEach(f => { g += `<circle class="inlay" cx="${fx(f)}" cy="${T + 2.5 * sp}" r="5"/>`; });
  if (maxFret >= 12) g += `<circle class="inlay" cx="${fx(12)}" cy="${T + 1.5 * sp}" r="5"/><circle class="inlay" cx="${fx(12)}" cy="${T + 3.5 * sp}" r="5"/>`;
  for (let f = 1; f <= maxFret; f++) g += `<line class="fret" x1="${nut + f * fw}" x2="${nut + f * fw}" y1="${T - 7}" y2="${T + 5 * sp + 7}"/>`;
  g += `<line class="nut" x1="${nut}" x2="${nut}" y1="${T - 8}" y2="${T + 5 * sp + 8}"/>`;
  for (let s = 1; s <= 6; s++) g += `<line class="gs" x1="${nut - 4}" x2="${W - 8}" y1="${sy(s)}" y2="${sy(s)}" stroke-width="${0.8 + (s - 1) * 0.35}"/>`;
  [3, 5, 7, 9, 12, 15, 17].filter(f => f <= maxFret).forEach(f => { g += `<text class="fnum" x="${fx(f)}" y="${H - 3}">${f}</text>`; });
  if (scale) {
    const steps = SCALES[scale.type].steps;
    for (let s = 1; s <= 6; s++) for (let f = 0; f <= maxFret; f++) {
      const pc = (OPEN[s] + f) % 12, deg = (pc - scale.root + 12) % 12;
      if (!steps.includes(deg)) continue;
      g += `<circle class="sd${deg === 0 ? ' root' : ''}" cx="${fx(f)}" cy="${sy(s)}" r="7.5"/>`;
      if (names || scale.names) g += `<text class="sdt" x="${fx(f)}" y="${sy(s)}">${NOTE_NAMES[pc]}</text>`;
    }
  }
  g += '<g class="live"></g>';
  return { svg: `<svg class="fb" viewBox="0 0 ${W} ${H}">${g}</svg>`, fx, sy };
}

/* ---------- Play-along player ---------- */
class Player {
  constructor(host, step, { onLap } = {}) {
    this.step = step;
    this.p = parseTab(step.tab);
    this.total = Math.max(4, Math.ceil(this.p.len / 4 - 1e-6) * 4);
    this.pct = 100; this.loop = true; this.metro = !!step.click; this.countIn = !step.jam;
    this.playing = false; this.onLap = onLap; this.lastActive = -1;
    const maxUsed = Math.max(0, ...this.p.events.flatMap(e => (e.notes || []).map(n => n.f)));
    const tab = tabSVG(this.p, this.total);
    const fb = fretboardSVG(Math.min(17, Math.max(12, maxUsed + 2)), { scale: step.scale });
    this.xAt = tab.xAt; this.fb = fb;
    host.innerHTML = `
      <div class="player">
        <div class="tabwrap">${tab.svg}</div>
        <div class="fbwrap">${fb.svg}</div>
        <div class="countin hidden"></div>
        <div class="pctl">
          <button class="playbtn" data-a="play" aria-label="Play">${ICON.play}</button>
          <div class="tempo">
            <button data-a="slower" aria-label="Slower">−</button>
            <div><b class="bpm"></b><small class="pct"></small></div>
            <button data-a="faster" aria-label="Faster">+</button>
          </div>
        </div>
        <div class="toggles">
          <button class="tog" data-a="loop">🔁 Loop</button>
          <button class="tog" data-a="metro">🥁 Click</button>
          <button class="tog" data-a="count">⏱ Count-in</button>
          <button class="tog" data-a="restart">⏮ Restart</button>
        </div>
      </div>`;
    this.el = host.firstElementChild;
    this.wrap = $('.tabwrap', this.el);
    this.cur = $('.cur', this.el);
    this.evEls = $$('.ev', this.el);
    this.live = $('.live', this.el);
    this.el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'play') this.playing ? this.stop() : this.start();
      else if (a === 'slower') this.setPct(this.pct - 5);
      else if (a === 'faster') this.setPct(this.pct + 5);
      else if (a === 'loop') this.loop = !this.loop;
      else if (a === 'metro') this.metro = !this.metro;
      else if (a === 'count') this.countIn = !this.countIn;
      else if (a === 'restart') { const was = this.playing; this.stop(); this.draw(0); this.wrap.scrollLeft = 0; if (was) this.start(); }
      this.sync();
    });
    this.sync(); this.draw(0);
  }
  get bpm() { return Math.round(this.step.bpm * this.pct / 100); }
  get spb() { return 60 / this.bpm; }
  sync() {
    $('.bpm', this.el).textContent = this.bpm + ' BPM';
    $('.pct', this.el).textContent = this.pct === 100 ? 'Full speed' : this.pct + '% speed';
    $('[data-a=loop]', this.el).classList.toggle('on', this.loop);
    $('[data-a=metro]', this.el).classList.toggle('on', this.metro);
    $('[data-a=count]', this.el).classList.toggle('on', this.countIn);
    const pb = $('[data-a=play]', this.el);
    pb.innerHTML = this.playing ? ICON.pause : ICON.play;
    pb.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
  }
  setPct(v) {
    v = Math.max(40, Math.min(150, v));
    if (this.playing) { // keep the cursor where it is and continue at the new speed
      const now = actx.currentTime, beat = (now - this.t0) / this.spb;
      this.pct = v; this.t0 = now - beat * this.spb;
    } else this.pct = v;
  }
  evTime(ev, lap) {
    let b = lap * this.total + ev.t;
    if (this.step.swing && Math.abs((ev.t % 1) - 0.5) < 1e-3) b += 1 / 6;
    return this.t0 + b * this.spb;
  }
  start() {
    audio();
    this.bus = newBus();
    const ci = this.countIn ? 4 : 0;
    this.t0 = actx.currentTime + 0.1 + ci * this.spb;
    this.idx = 0; this.lap = 0; this.nextClick = -ci; this.lapsDone = 0;
    this.playing = true;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    const frame = () => { if (!this.playing) return; this.frame(); this.raf = requestAnimationFrame(frame); };
    this.raf = requestAnimationFrame(frame);
    this.sync();
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer); cancelAnimationFrame(this.raf);
    silence(this.bus); this.bus = null;
    $('.countin', this.el).classList.add('hidden');
    this.sync();
  }
  schedule() {
    const ahead = actx.currentTime + 0.15, evs = this.p.events;
    for (;;) {
      const tb = this.t0 + this.nextClick * this.spb;
      if (tb > ahead) break;
      const inSong = this.loop || this.nextClick < this.total;
      if (this.nextClick < 0 || (this.metro && inSong)) click(this.bus, tb, ((this.nextClick % 4) + 4) % 4 === 0);
      this.nextClick++;
    }
    while (evs.length) {
      if (this.idx >= evs.length) { if (!this.loop) break; this.idx = 0; this.lap++; }
      const e = evs[this.idx], t = this.evTime(e, this.lap);
      if (t > ahead) break;
      this.sound(e, Math.max(t, actx.currentTime));
      this.idx++;
    }
  }
  sound(e, t) {
    const dur = this.step.ring ? Math.max(e.gap * this.spb, 1.6) : e.gap * this.spb + 0.04;
    if (e.scratch) scratch(this.bus, t, e.dir);
    else if (e.chord) strum(this.bus, e.notes.slice().sort((a, b) => b.s - a.s), t, e.dir, dur);
    else e.notes.forEach(n => playNote(this.bus, n.s, n.f, t, { dur, tech: n.tech, vel: e.notes.length > 1 ? 0.8 : 1 }));
  }
  frame() {
    const pos = (actx.currentTime - this.t0) / this.spb;
    const ci = $('.countin', this.el);
    if (pos < 0) { ci.classList.remove('hidden'); ci.textContent = Math.ceil(-pos); }
    else ci.classList.add('hidden');
    const laps = Math.floor(Math.max(0, pos) / this.total);
    if (laps > this.lapsDone) { this.lapsDone = laps; this.onLap && this.onLap(); }
    if (!this.loop && pos >= this.total) { this.stop(); this.draw(0); return; }
    this.draw(pos < 0 ? 0 : pos % this.total);
  }
  draw(p) {
    const x = this.xAt(p);
    this.cur.setAttribute('x', x - 1);
    if (this.playing) this.wrap.scrollLeft = x - this.wrap.clientWidth * 0.3;
    const evs = this.p.events;
    let active = -1;
    for (let i = 0; i < evs.length; i++) {
      if (evs[i].t > p + 1e-6) break;
      if (p < evs[i].t + Math.min(evs[i].d, evs[i].gap) + 1e-6) active = i;
    }
    if (active === this.lastActive) return;
    if (this.lastActive >= 0) this.evEls[this.lastActive].classList.remove('on');
    this.lastActive = active;
    let dots = '';
    if (active >= 0) {
      this.evEls[active].classList.add('on');
      (evs[active].notes || []).forEach(n => {
        dots += `<circle class="on" cx="${this.fb.fx(n.f)}" cy="${this.fb.sy(n.s)}" r="8"/><text class="ont" x="${this.fb.fx(n.f)}" y="${this.fb.sy(n.s)}">${n.f}</text>`;
      });
    }
    this.live.innerHTML = dots;
  }
  destroy() { this.stop(); }
}

/* ---------- Navigation ---------- */
const SCREENS = ['onboard', 'main', 'course', 'lesson', 'tool', 'done'];
function show(id) { SCREENS.forEach(s => $('#' + s).classList.toggle('hidden', s !== id)); }
let currentTab = 'home';
function goTab(tab) {
  currentTab = tab;
  practicing = false; onTick = () => {};
  show('main');
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['home', 'learn', 'tools', 'me'].forEach(t => $('#tab-' + t).classList.toggle('hidden', t !== tab));
  ({ home: renderHome, learn: renderLearn, tools: renderTools, me: renderMe })[tab]();
}
$$('.nav button').forEach(b => { b.onclick = () => goTab(b.dataset.tab); });
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function ringSVG(frac, size = 46, stroke = 5) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${size} ${size}"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#rg)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, frac))}"/></svg>`;
}
const thumb = c => `<div class="thumb" style="background:${c.cover}">${c.emoji}</div>`;

/* ---------- Home ---------- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function renderHome() {
  const el = $('#tab-home');
  const secs = todaySecs(), goalS = S.goal * 60, st = streak();
  const next = nextInPath();
  const sessionDone = S.sessionDay === dayKey();
  const blocks = sessionBlocks();
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const maxDay = Math.max(goalS, ...days.map(secsOn));
  el.innerHTML = `<div class="wrap">
    <div class="hello">
      <div><div class="muted small">${greeting()}</div><h1>${esc(S.name || 'Guitarist')}</h1></div>
      <span class="pill" title="Day streak">🔥 ${st}</span>
      <div class="ring" title="Today's goal">${ringSVG(secs / goalS)}<span>${Math.floor(secs / 60)}/${S.goal}</span></div>
    </div>

    <div class="hero${sessionDone ? ' complete' : ''}">
      <div class="eyebrow">${sessionDone ? 'Done for today' : 'Today\'s practice'}</div>
      <h2>${sessionDone ? 'Session complete! 🎉' : `Your ${S.goal}-minute session`}</h2>
      <p>${sessionDone ? 'Nice work. Play it again or keep going on your pathway.' : 'A warm-up, your next skill and a review, built from your pathway.'}</p>
      <div class="blocks">${blocks.map(b => `<span>${esc(b.block)}<small>${Math.round(b.timer / 60)} min</small></span>`).join('')}</div>
      <button class="btn" id="h-session">${ICON.play} ${sessionDone ? 'Practice again' : 'Start practice'}</button>
    </div>

    <div class="section">
      <div class="sec-h"><h2>Up next</h2></div>
      ${next ? `<button class="next-card" id="h-next">${thumb(next.course)}
        <div class="meta"><small>${esc(next.course.title)} · Lesson ${next.course.lessons.indexOf(next.lesson) + 1}</small><b>${esc(next.lesson.title)}</b>
        <div class="progress"><i style="width:${(courseDone(next.course) / next.course.lessons.length) * 100}%"></i></div></div>
        <span class="play-dot">${ICON.play}</span></button>`
        : '<div class="next-card"><div class="meta"><b>Pathway complete 🏆</b><small>You finished every course in your pathway. Explore to replay any lesson.</small></div></div>'}
    </div>

    <div class="section">
      <div class="sec-h"><h2>Your pathway</h2><button id="h-all">See all</button></div>
      <div class="hscroll">${S.path.map((id, i) => {
        const c = COURSE[id], d = courseDone(c), full = d === c.lessons.length;
        return `<button class="path-card" data-course="${id}"><div class="cv" style="background:${c.cover}"><em>STAGE ${i + 1}</em>${full ? '<span class="tick">✓</span>' : ''}${c.emoji}</div>
          <div class="info"><b>${esc(c.title)}</b><div class="progress"><i style="width:${(d / c.lessons.length) * 100}%"></i></div></div></button>`;
      }).join('')}</div>
    </div>

    <div class="section">
      <div class="sec-h"><h2>This week</h2><span class="muted small">${fmtMins(days.reduce((a, d) => a + secsOn(d), 0))} played</span></div>
      <div class="week">${days.map((d, i) => {
        const s = secsOn(d);
        return `<div><i class="${s >= goalS ? 'hit' : ''}${i === 6 ? ' today' : ''}" style="height:${Math.max(4, (s / maxDay) * 100)}%" title="${fmtMins(s)}"></i><span>${'SMTWTFS'[d.getDay()]}</span></div>`;
      }).join('')}</div>
    </div>

    <div class="section">
      <div class="sec-h"><h2>Tools</h2></div>
      <div class="quick">
        <button data-tool="tuner"><span>🎯</span>Tuner</button>
        <button data-tool="metronome"><span>🥁</span>Metronome</button>
        <button data-tool="chords"><span>✋</span>Chords</button>
      </div>
    </div>
  </div>`;
  $('#h-session', el).onclick = startSession;
  if (next) $('#h-next', el).onclick = () => openLesson(next.lesson.id);
  $('#h-all', el).onclick = () => goTab('learn');
  $$('[data-course]', el).forEach(b => { b.onclick = () => openCourse(b.dataset.course, 'home'); });
  $$('[data-tool]', el).forEach(b => { b.onclick = () => openTool(b.dataset.tool, 'home'); });
}

/* ---------- Explore ---------- */
let learnFilter = 'All', learnQuery = '';
const FILTERS = ['All', 'My pathway', 'Beginner', 'Intermediate', 'Advanced', 'Rock', 'Blues', 'Pop & Acoustic', 'Funk & Soul', 'Theory'];
function renderLearn() {
  const el = $('#tab-learn');
  el.innerHTML = `<div class="wrap">
    <div class="page-h"><h1>Explore</h1><p class="muted" style="margin-top:4px">${COURSES.length} courses · ${Object.keys(LESSON).length} lessons</p></div>
    <label class="search">${ICON.search}<input id="l-q" type="search" placeholder="Search courses and lessons" value="${esc(learnQuery)}"></label>
    <div class="chips">${FILTERS.map(f => `<button class="chip${f === learnFilter ? ' on' : ''}" data-f="${esc(f)}">${esc(f)}</button>`).join('')}</div>
    <div class="course-list" id="l-list"></div>
  </div>`;
  const list = () => {
    const q = learnQuery.trim().toLowerCase();
    const cs = COURSES.filter(c => {
      if (learnFilter === 'My pathway' && !S.path.includes(c.id)) return false;
      if (LEVEL_NAMES.includes(learnFilter) && LEVEL_NAMES[c.level] !== learnFilter) return false;
      if (!['All', 'My pathway', ...LEVEL_NAMES].includes(learnFilter) && c.genre !== learnFilter) return false;
      if (!q) return true;
      return (c.title + ' ' + c.genre + ' ' + c.desc + ' ' + c.lessons.map(l => l.title).join(' ')).toLowerCase().includes(q);
    });
    $('#l-list', el).innerHTML = cs.length ? cs.map(c => {
      const d = courseDone(c);
      return `<button class="course-card" data-course="${c.id}">
        <div class="cv" style="background:${c.cover}"><div class="tags"><span class="tag">${LEVEL_NAMES[c.level]}</span><span class="tag">${esc(c.genre)}</span></div><span class="emo">${c.emoji}</span></div>
        <div class="info"><b>${esc(c.title)}</b><p>${esc(c.desc)}</p>
        <div class="stats"><span>${c.lessons.length} lessons · ${c.lessons.reduce((a, l) => a + l.mins, 0)} min</span><div class="progress"><i style="width:${(d / c.lessons.length) * 100}%"></i></div><span>${d}/${c.lessons.length}</span></div></div>
      </button>`;
    }).join('') : '<p class="empty">No courses match that search.</p>';
    $$('[data-course]', el).forEach(b => { b.onclick = () => openCourse(b.dataset.course, 'learn'); });
  };
  $('#l-q', el).oninput = e => { learnQuery = e.target.value; list(); };
  $$('[data-f]', el).forEach(b => { b.onclick = () => { learnFilter = b.dataset.f; $$('[data-f]', el).forEach(x => x.classList.toggle('on', x === b)); list(); }; });
  list();
}

/* ---------- Course ---------- */
let courseReturn = 'home';
function openCourse(id, from) {
  if (from) courseReturn = from;
  practicing = false;
  const c = COURSE[id], el = $('#course'), next = nextInCourse(c), d = courseDone(c);
  el.innerHTML = `
    <div class="float-bar"><button class="icon-btn" id="c-back" aria-label="Back">${ICON.back}</button></div>
    <div class="scroll">
      <div class="course-hero" style="background:${c.cover}">
        <div class="wrap" style="padding:0">
          <div class="emo">${c.emoji}</div>
          <h1>${esc(c.title)}</h1>
          <p>${esc(c.desc)}</p>
          <div class="tags"><span class="tag">${LEVEL_NAMES[c.level]}</span><span class="tag">${esc(c.genre)}</span><span class="tag">${d}/${c.lessons.length} done</span></div>
        </div>
      </div>
      <div class="wrap" style="padding-top:8px;padding-bottom:20px">
        ${c.lessons.map((l, i) => {
          const done = !!S.done[l.id], isNext = next && next.id === l.id;
          return `<button class="lesson-row${done ? ' done' : ''}${isNext ? ' next' : ''}" data-lesson="${l.id}">
            <span class="num">${done ? '✓' : i + 1}</span>
            <span class="lt"><b>${esc(l.title)}</b><small>${l.mins} min · ${((n) => `${n} play-along${n === 1 ? '' : 's'}`)(l.steps.filter(s => s.type === 'play').length)}</small></span>
            <span class="muted">${ICON.play.replace('<svg', '<svg width="16" height="16"')}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
    <div class="sticky-foot"><div class="wrap" style="padding:0"><button class="btn grad" id="c-go">${next ? (d ? 'Continue: ' : 'Start: ') + esc(next.title) : 'Replay course'}</button></div></div>`;
  show('course');
  $('.scroll', el).scrollTop = 0;
  $('#c-back', el).onclick = () => goTab(courseReturn);
  $('#c-go', el).onclick = () => openLesson((next || c.lessons[0]).id);
  $$('[data-lesson]', el).forEach(b => { b.onclick = () => openLesson(b.dataset.lesson); });
}

/* ---------- Lesson player ---------- */
let LS = null, player = null;
function openLesson(id) {
  const { lesson, course } = LESSON[id];
  LS = { id, title: lesson.title, course, steps: lesson.steps, i: 0, start: todaySecs() };
  runLesson();
}
function sessionBlocks() {
  const goal = S.goal * 60;
  const lvl = ['new', 'beginner', 'intermediate', 'advanced'].indexOf(S.level);
  const warm = { type: 'play', block: 'Warm-up', title: 'The spider', tip: 'Stay relaxed and keep one finger per fret. Speed up a little each day.', tab: SPIDER, bpm: [60, 70, 90, 110][lvl] || 60, timer: Math.round(goal * 0.25) };
  const next = nextInPath();
  const pick = (l, block, timer) => {
    const st = l.steps.find(s => s.type === 'play');
    return st && { ...st, block, title: `${l.title}: ${st.title}`, timer, from: l.id };
  };
  const focus = (next && pick(next.lesson, 'Focus', Math.round(goal * 0.5))) ||
    { type: 'play', block: 'Focus', title: 'Free jam in A minor', tab: `e ${campfire('Am')} ${campfire('Dm')} ${campfire('Am')} ${campfire('Em')}`, bpm: 85, jam: true, scale: { root: 9, type: 'minorPent' }, timer: Math.round(goal * 0.5) };
  // Review: the play-along from the most recently finished lesson that isn't today's focus
  const doneIds = Object.keys(S.done).filter(id => LESSON[id] && id !== focus.from).sort((a, b) => S.done[b] - S.done[a]);
  const reviewLesson = doneIds.map(id => LESSON[id].lesson).find(l => l.steps.some(s => s.type === 'play'));
  const review = (reviewLesson && pick(reviewLesson, 'Review', goal - warm.timer - focus.timer)) ||
    { type: 'play', block: 'Review', title: 'Chord changes: Em and Am', tab: '{[Em]d [Em]d [Am]d [Am]d |}x4', bpm: 70, timer: goal - warm.timer - focus.timer };
  return [warm, focus, review];
}
function startSession() {
  LS = { session: true, title: 'Today\'s practice', steps: sessionBlocks(), i: 0, start: todaySecs() };
  runLesson();
}
function runLesson() {
  practicing = true;
  show('lesson');
  renderStep();
}
function closeLesson() {
  if (player) { player.destroy(); player = null; }
  const c = LS && LS.course;
  LS = null;
  save();
  if (c) openCourse(c.id); else goTab('home');
}
function renderStep() {
  if (player) { player.destroy(); player = null; }
  const el = $('#lesson'), st = LS.steps[LS.i], last = LS.i === LS.steps.length - 1;
  LS.blockStart = todaySecs();
  el.innerHTML = `
    <div class="lbar">
      <button class="icon-btn" id="ls-x" aria-label="Close">${ICON.close}</button>
      <div class="segs">${LS.steps.map((_, i) => `<i class="${i <= LS.i ? 'on' : ''}"></i>`).join('')}</div>
      <span class="timer-chip" id="ls-t"></span>
    </div>
    <div class="scroll"><div class="wrap step" id="ls-body"></div></div>
    <div class="foot">
      ${LS.i > 0 ? `<button class="btn ghost back" id="ls-prev" aria-label="Previous step">${ICON.back}</button>` : ''}
      <button class="btn grad" id="ls-next">${last ? (LS.session ? 'Finish session' : 'Complete lesson') : 'Continue'}</button>
    </div>`;
  const body = $('#ls-body', el);
  const kicker = LS.session ? `Block ${LS.i + 1} of ${LS.steps.length} · ${st.block}` : `${esc(LS.course.title)} · ${esc(LS.title)}`;
  const nextBtn = $('#ls-next', el);
  if (st.type === 'read') {
    body.innerHTML = `<div class="kicker">${kicker}</div><h2>${esc(st.title)}</h2><div class="prose">${st.body}</div>
      ${st.chords ? `<div class="diagrams">${st.chords.map(c => `<button class="diagram-btn" data-chord="${esc(c)}" aria-label="Play ${esc(c)}">${chordSVG(c)}</button>`).join('')}</div>` : ''}
      ${st.scale ? `<div class="fb-scroll">${fretboardSVG(15, { scale: st.scale, names: true }).svg}</div>` : ''}
      ${st.tool ? `<button class="btn ghost" id="ls-tool" style="margin-top:14px">🎯 Open the tuner</button>` : ''}`;
    $$('[data-chord]', body).forEach(b => { b.onclick = () => playChord(b.dataset.chord); });
    if (st.tool) $('#ls-tool', body).onclick = () => openTool(st.tool, 'lesson');
  } else if (st.type === 'play') {
    body.innerHTML = `<div class="kicker">${kicker}</div><h2>${esc(st.title)}</h2>
      ${st.tip ? `<div class="tip">💡 <span>${esc(st.tip)}</span></div>` : ''}
      ${st.swing ? '<div class="tip">🎶 <span>Swing feel: eighth notes are played long-short.</span></div>' : ''}
      <div id="ls-player"></div>`;
    player = new Player($('#ls-player', body), st);
  } else if (st.type === 'quiz') {
    body.innerHTML = `<div class="kicker">${kicker} · Quick check</div><h2>${esc(st.q)}</h2>
      <div class="quiz-opts">${st.options.map((o, i) => `<button class="quiz-opt" data-o="${i}">${esc(o)}</button>`).join('')}</div><div id="ls-fb"></div>`;
    nextBtn.disabled = true;
    $$('[data-o]', body).forEach(b => {
      b.onclick = () => {
        if (!nextBtn.disabled) return;
        const right = +b.dataset.o === st.answer;
        b.classList.remove('wrong'); void b.offsetWidth;
        b.classList.add(right ? 'right' : 'wrong');
        $('#ls-fb', body).innerHTML = right
          ? `<div class="feedback ok">Correct! ${esc(st.explain || '')}</div>`
          : '<div class="feedback no">Not quite. Try again.</div>';
        if (right) { nextBtn.disabled = false; sfx.ok(); } else sfx.no();
      };
    });
  }
  const chip = $('#ls-t', el);
  onTick = () => {
    if (LS && LS.session && st.timer) {
      const left = st.timer - (todaySecs() - LS.blockStart);
      chip.textContent = left > 0 ? fmtClock(left) + ' left' : '✓ Time\'s up';
      chip.classList.toggle('up', left <= 0);
    } else chip.textContent = '⏱ ' + fmtClock(todaySecs()) + ' today';
  };
  onTick();
  $('#ls-x', el).onclick = closeLesson;
  if (LS.i > 0) $('#ls-prev', el).onclick = () => { LS.i--; renderStep(); };
  nextBtn.onclick = () => {
    if (last) finishLesson();
    else { LS.i++; renderStep(); $('.scroll', el).scrollTop = 0; }
  };
}
function finishLesson() {
  if (player) { player.destroy(); player = null; }
  practicing = false; onTick = () => {};
  const wasStreak = streak();
  const played = todaySecs() - LS.start;
  let nextId = null;
  if (LS.session) S.sessionDay = dayKey();
  else {
    S.done[LS.id] = Date.now();
    const n = nextInCourse(LS.course);
    nextId = n ? n.id : (nextInPath() || {}).lesson?.id || null;
  }
  save();
  sfx.ok();
  const st = streak();
  const el = $('#done');
  const course = LS.course, session = LS.session, title = LS.title;
  el.innerHTML = `<div class="done-wrap">
    <div class="badge">${session ? '🎸' : '✓'}</div>
    <h1>${session ? 'Practice complete!' : 'Lesson complete!'}</h1>
    <p class="muted">${esc(title)}${st > wasStreak ? ` · 🔥 Streak extended to ${st} day${st === 1 ? '' : 's'}!` : ''}</p>
    <div class="stat-grid">
      <div class="stat"><b>${fmtMins(played)}</b><small>this ${session ? 'session' : 'lesson'}</small></div>
      <div class="stat"><b>${Math.floor(todaySecs() / 60)}/${S.goal}</b><small>min today</small></div>
      <div class="stat"><b>🔥 ${st}</b><small>day streak</small></div>
    </div>
  </div>
  <div class="wrap" style="width:100%;padding-bottom:calc(16px + env(safe-area-inset-bottom))">
    ${nextId ? `<button class="btn grad" id="d-next">Next: ${esc(LESSON[nextId].lesson.title)}</button><div style="height:10px"></div>` : ''}
    <button class="btn ghost" id="d-home">${course ? 'Back to course' : 'Back home'}</button>
  </div>`;
  LS = null;
  show('done');
  if (nextId) $('#d-next', el).onclick = () => openLesson(nextId);
  $('#d-home', el).onclick = () => (course ? openCourse(course.id) : goTab('home'));
}

/* ---------- Tools ---------- */
const TOOLS = {
  tuner: { name: 'Tuner', emoji: '🎯', desc: 'Tune by ear or with your mic' },
  metronome: { name: 'Metronome', emoji: '🥁', desc: 'Keep perfect time, tap tempo' },
  chords: { name: 'Chord library', emoji: '✋', desc: `${Object.keys(CHORDS).length} shapes with sound` },
  scales: { name: 'Scale explorer', emoji: '🗺️', desc: 'Any scale, any key, on the neck' },
  changes: { name: 'Chord changes', emoji: '⏱', desc: 'One-minute change challenge' },
  jam: { name: 'Jam tracks', emoji: '🎶', desc: 'Loop a backing and improvise' }
};
function renderTools() {
  $('#tab-tools').innerHTML = `<div class="wrap">
    <div class="page-h"><h1>Practice</h1><p class="muted" style="margin-top:4px">Tools for every session. Time spent here counts toward your daily goal.</p></div>
    <div class="tool-grid">${Object.entries(TOOLS).map(([id, t]) => `<button class="tool-card" data-tool="${id}"><span class="ti">${t.emoji}</span><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
  </div>`;
  $$('[data-tool]', $('#tab-tools')).forEach(b => { b.onclick = () => openTool(b.dataset.tool, 'tools'); });
}
let toolCleanup = null, toolReturn = 'tools';
function openTool(id, from) {
  toolReturn = from;
  if (from === 'lesson' && player) player.stop();
  const el = $('#tool');
  el.innerHTML = `<div class="bar"><button class="icon-btn" id="t-back" aria-label="Back">${ICON.back}</button><h2>${TOOLS[id].name}</h2><span style="width:40px"></span></div>
    <div class="scroll"><div class="wrap tool-body" id="t-body"></div></div>`;
  show('tool');
  practicing = true;
  const prevTick = onTick; onTick = () => {};
  $('#t-back', el).onclick = () => {
    if (toolCleanup) { toolCleanup(); toolCleanup = null; }
    if (toolReturn === 'lesson' && LS) { show('lesson'); onTick = prevTick; return; }
    goTab(toolReturn);
  };
  ({ tuner: toolTuner, metronome: toolMetronome, chords: toolChords, scales: toolScales, changes: toolChanges, jam: toolJam })[id]($('#t-body', el));
}

/* Tuner */
function detectPitch(b, sr) {
  const n = b.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += b[i] * b[i];
  if (Math.sqrt(rms / n) < 0.01) return null;
  const minLag = Math.floor(sr / 1100), maxLag = Math.min(Math.floor(sr / 60), n >> 1), W = n - maxLag - 2;
  const c = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let j = 0; j < W; j++) s += b[j] * b[j + lag];
    c[lag] = s;
  }
  let lag = minLag;
  while (lag < maxLag && c[lag] > c[lag + 1]) lag++;
  let max = -Infinity;
  for (let i = lag; i <= maxLag; i++) if (c[i] > max) max = c[i];
  if (max / c[0] < 0.5) return null;
  let T = -1;
  for (let i = lag; i <= maxLag; i++) {
    if (c[i] >= 0.9 * max && c[i] >= c[i - 1] && c[i] >= c[i + 1]) { T = i; break; }
  }
  if (T < 0) return null;
  const a = c[T - 1], bb = c[T], d = c[T + 1], den = a - 2 * bb + d;
  const shift = den ? (a - d) / (2 * den) : 0;
  return sr / (T + shift);
}
function toolTuner(el) {
  const targets = [6, 5, 4, 3, 2, 1].map(s => ({ s, midi: OPEN[s], name: NOTE_NAMES[OPEN[s] % 12] }));
  el.innerHTML = `
    <div class="tuner-note"><b id="tu-n">–</b><sub id="tu-o"></sub></div>
    <div class="gauge"><div class="scale">${Array.from({ length: 21 }, (_, i) => `<i class="${i === 10 ? 'mid' : i % 5 === 0 ? 'q' : ''}"></i>`).join('')}</div>
      <div class="needle" id="tu-needle"></div><div class="lab"><span>−50</span><span>flat · sharp</span><span>+50</span></div></div>
    <div class="tuner-msg" id="tu-msg">Tap Start and play a string</div>
    <div class="strings">${targets.map(t => `<button data-s="${t.s}">${t.name}<small>${t.s}</small></button>`).join('')}</div>
    <p class="muted small" style="text-align:center;margin-bottom:16px">Tap a string to hear its reference note.</p>
    <button class="btn grad" id="tu-go">🎤 Start tuner</button>`;
  let stream = null, raf = 0, hist = [];
  $$('[data-s]', el).forEach(b => {
    b.onclick = () => { audio(); const bus = newBus(); playNote(bus, +b.dataset.s, 0, actx.currentTime + 0.02, { dur: 2.4 }); };
  });
  const stop = () => {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
  };
  $('#tu-go', el).onclick = async () => {
    if (stream) { stop(); $('#tu-go', el).textContent = '🎤 Start tuner'; $('#tu-msg', el).textContent = 'Tap Start and play a string'; return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#tu-msg', el).textContent = 'This browser can\'t use the microphone. Tune by ear with the reference notes.'; return; }
    try {
      audio();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      $('#tu-msg', el).textContent = 'Microphone access was blocked. Allow it in your browser settings, or tune by ear.';
      return;
    }
    $('#tu-go', el).textContent = 'Stop tuner';
    const src = actx.createMediaStreamSource(stream), an = actx.createAnalyser();
    an.fftSize = 4096; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let last = 0;
    const loop = ts => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 60) return;
      last = ts;
      an.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, actx.sampleRate);
      if (!f) return;
      hist.push(f); if (hist.length > 5) hist.shift();
      const med = [...hist].sort((a, b) => a - b)[hist.length >> 1];
      const m = 69 + 12 * Math.log2(med / 440), near = Math.round(m), cents = Math.round((m - near) * 100);
      $('#tu-n', el).textContent = NOTE_NAMES[((near % 12) + 12) % 12];
      $('#tu-o', el).textContent = Math.floor(near / 12) - 1;
      const nd = $('#tu-needle', el), ok = Math.abs(cents) <= 5;
      nd.style.left = (50 + cents) + '%'; nd.classList.toggle('ok', ok);
      // the closest open string decides the hint
      const t = targets.reduce((a, b) => (Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a));
      const off = Math.round((m - t.midi) * 100);
      const msg = $('#tu-msg', el);
      msg.className = 'tuner-msg' + (Math.abs(off) <= 5 ? ' ok' : '');
      msg.textContent = Math.abs(off) <= 5 ? `String ${t.s} (${t.name}) is in tune ✓` : Math.abs(off) > 250 ? `${NOTE_NAMES[((near % 12) + 12) % 12]}, not near an open string` : `String ${t.s} (${t.name}): tune ${off < 0 ? 'up ↑' : 'down ↓'}`;
      $$('[data-s]', el).forEach(b => {
        b.classList.toggle('near', +b.dataset.s === t.s && Math.abs(off) > 5);
        b.classList.toggle('tuned', +b.dataset.s === t.s && Math.abs(off) <= 5);
      });
    };
    raf = requestAnimationFrame(loop);
  };
  toolCleanup = stop;
}

/* Metronome */
function toolMetronome(el) {
  let bpm = S.metroBpm || 80, beats = 4, sub = 1, on = false, timer = 0, raf = 0, bus = null, next = 0, n = 0, queue = [], taps = [];
  el.innerHTML = `
    <div class="big-bpm"><b id="m-bpm">${bpm}</b><small>BPM</small></div>
    <div class="beats" id="m-beats"></div>
    <div class="ctl-row"><button class="round" id="m-dn" aria-label="Slower">−</button><input type="range" id="m-r" min="30" max="240" value="${bpm}" aria-label="Tempo"><button class="round" id="m-up" aria-label="Faster">+</button></div>
    <div class="ctl-row"><span>Beats per bar</span><div class="chips wrapit" id="m-b">${[2, 3, 4, 6].map(b => `<button class="chip${b === beats ? ' on' : ''}" data-b="${b}">${b}</button>`).join('')}</div></div>
    <div class="ctl-row"><span>Subdivision</span><div class="chips wrapit" id="m-s">${[[1, '♩'], [2, '♫'], [3, '3'], [4, '𝅘𝅥𝅯']].map(([s, l]) => `<button class="chip${s === sub ? ' on' : ''}" data-sub="${s}">${l}</button>`).join('')}</div></div>
    <div class="row-btns" style="margin-top:20px"><button class="btn ghost" id="m-tap">Tap tempo</button><button class="btn grad" id="m-go">${ICON.play} Start</button></div>`;
  const dots = () => { $('#m-beats', el).innerHTML = Array.from({ length: beats }, (_, i) => `<i class="${i === 0 ? 'first' : ''}"></i>`).join(''); };
  const setBpm = v => { bpm = Math.max(30, Math.min(240, Math.round(v))); $('#m-bpm', el).textContent = bpm; $('#m-r', el).value = bpm; S.metroBpm = bpm; };
  const schedule = () => {
    while (next < actx.currentTime + 0.12) {
      const beat = Math.floor(n / sub) % beats, isBeat = n % sub === 0;
      if (isBeat) { click(bus, next, beat === 0); queue.push({ t: next, beat }); }
      else { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 800; g.gain.setValueAtTime(0.12, next); g.gain.exponentialRampToValueAtTime(0.001, next + 0.03); o.connect(g); g.connect(bus); o.start(next); o.stop(next + 0.04); }
      next += 60 / bpm / sub; n++;
    }
  };
  const draw = () => {
    raf = requestAnimationFrame(draw);
    while (queue.length && queue[0].t <= actx.currentTime) {
      const q = queue.shift(), ds = $$('#m-beats i', el);
      ds.forEach((d, i) => d.classList.toggle('lit', i === q.beat));
      setTimeout(() => ds[q.beat] && ds[q.beat].classList.remove('lit'), 110);
    }
  };
  const stop = () => { on = false; clearInterval(timer); cancelAnimationFrame(raf); silence(bus); bus = null; queue = []; $('#m-go', el).innerHTML = `${ICON.play} Start`; save(); };
  const start = () => { audio(); bus = newBus(); on = true; n = 0; next = actx.currentTime + 0.06; timer = setInterval(schedule, 25); schedule(); draw(); $('#m-go', el).innerHTML = `${ICON.pause} Stop`; };
  $('#m-go', el).onclick = () => (on ? stop() : start());
  $('#m-r', el).oninput = e => setBpm(+e.target.value);
  $('#m-dn', el).onclick = () => setBpm(bpm - 1);
  $('#m-up', el).onclick = () => setBpm(bpm + 1);
  $('#m-tap', el).onclick = () => {
    const now = performance.now();
    taps = taps.filter(t => now - t < 2500); taps.push(now);
    if (taps.length >= 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  };
  $$('[data-b]', el).forEach(b => { b.onclick = () => { beats = +b.dataset.b; $$('[data-b]', el).forEach(x => x.classList.toggle('on', x === b)); dots(); n = 0; }; });
  $$('[data-sub]', el).forEach(b => { b.onclick = () => { sub = +b.dataset.sub; $$('[data-sub]', el).forEach(x => x.classList.toggle('on', x === b)); n = 0; }; });
  dots();
  toolCleanup = () => { if (on) stop(); };
}

/* Chord library */
function toolChords(el) {
  const cats = ['All', ...new Set(Object.values(CHORDS).map(c => c.cat))];
  let cat = 'All';
  el.innerHTML = `<div class="chips">${cats.map(c => `<button class="chip${c === cat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="chord-grid" id="ch-g"></div>`;
  const draw = () => {
    $('#ch-g', el).innerHTML = Object.entries(CHORDS).filter(([, c]) => cat === 'All' || c.cat === cat)
      .map(([n]) => `<button class="diagram-btn" style="max-width:none" data-chord="${esc(n)}">${chordSVG(n)}</button>`).join('');
    $$('[data-chord]', el).forEach(b => { b.onclick = () => chordSheet(b.dataset.chord); });
  };
  $$('[data-cat]', el).forEach(b => { b.onclick = () => { cat = b.dataset.cat; $$('[data-cat]', el).forEach(x => x.classList.toggle('on', x === b)); draw(); }; });
  draw();
}
function chordSheet(name) {
  playChord(name);
  const notes = [];
  chordFrets(name).forEach((f, i) => { if (f !== null) { const n = NOTE_NAMES[(OPEN[6 - i] + f) % 12]; if (!notes.includes(n)) notes.push(n); } });
  const sh = $('#sheet');
  sh.innerHTML = `<div class="panel"><div class="grab"></div>
    <div style="max-width:220px;margin:0 auto 10px">${chordSVG(name)}</div>
    <p class="muted" style="text-align:center;margin-bottom:16px">${esc(CHORDS[name].cat)} · Notes: <b style="color:var(--text)">${notes.join(' ')}</b></p>
    <div class="row-btns"><button class="btn ghost" id="sh-arp">Pick notes</button><button class="btn grad" id="sh-strum">Strum</button></div>
  </div>`;
  sh.classList.remove('hidden');
  $('#sh-strum', sh).onclick = () => playChord(name);
  $('#sh-arp', sh).onclick = () => playChord(name, true);
  sh.onclick = e => { if (e.target === sh) sh.classList.add('hidden'); };
}

/* Scale explorer */
function toolScales(el) {
  let root = S.scaleRoot ?? 9, type = S.scaleType || 'minorPent';
  el.innerHTML = `<div class="sel-row">
      <select id="sc-r" aria-label="Key">${NOTE_NAMES.map((n, i) => `<option value="${i}"${i === root ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <select id="sc-t" aria-label="Scale">${Object.entries(SCALES).map(([k, s]) => `<option value="${k}"${k === type ? ' selected' : ''}>${s.name}</option>`).join('')}</select>
    </div>
    <div class="fb-scroll" id="sc-fb"></div>
    <p class="muted small" style="margin:10px 0 18px" id="sc-notes"></p>
    <button class="btn grad" id="sc-play">${ICON.play} Play the scale</button>`;
  const draw = () => {
    S.scaleRoot = root; S.scaleType = type; save();
    $('#sc-fb', el).innerHTML = fretboardSVG(15, { scale: { root, type }, names: true }).svg;
    $('#sc-notes', el).innerHTML = 'Notes: <b style="color:var(--text)">' + SCALES[type].steps.map(s => NOTE_NAMES[(root + s) % 12]).join(' ') + '</b> · pink = root';
  };
  $('#sc-r', el).onchange = e => { root = +e.target.value; draw(); };
  $('#sc-t', el).onchange = e => { type = e.target.value; draw(); };
  $('#sc-play', el).onclick = () => {
    audio();
    // one position starting at the root on the low E string, played up and back down
    const rf = (root - 4 + 12) % 12, lo = Math.max(0, rf - (rf > 0 ? 1 : 0)), hi = lo + 4;
    const steps = SCALES[type].steps, seq = [];
    let lastMidi = -1;
    for (let s = 6; s >= 1; s--) for (let f = lo; f <= hi; f++) {
      const m = OPEN[s] + f;
      if (m > lastMidi && steps.includes(((m - root) % 12 + 12) % 12)) { seq.push({ s, f }); lastMidi = m; }
    }
    const firstRoot = seq.findIndex(n => (OPEN[n.s] + n.f - root) % 12 === 0);
    const up = seq.slice(Math.max(0, firstRoot));
    const all = up.concat(up.slice(0, -1).reverse());
    const bus = newBus(), t0 = actx.currentTime + 0.05;
    all.forEach((n, i) => playNote(bus, n.s, n.f, t0 + i * 0.28, { dur: 0.3 }));
  };
  draw();
}

/* One-minute chord changes */
function toolChanges(el) {
  const names = ['Em', 'Am', 'E', 'A', 'D', 'C', 'G', 'Dm', 'Fmaj7', 'E7', 'A7', 'D7', 'G7', 'F', 'Bm'];
  let a = S.chgA || 'Em', b = S.chgB || 'Am', count = 0, left = 0, timer = 0;
  el.innerHTML = `<p class="muted" style="margin-bottom:14px;line-height:1.45">Switch between two chords as many times as you can in one minute, strumming once each time. Tap the pad for every clean change. Beat your best score every day.</p>
    <div class="sel-row">
      <select id="cg-a" aria-label="First chord">${names.map(n => `<option${n === a ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <select id="cg-b" aria-label="Second chord">${names.map(n => `<option${n === b ? ' selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="diagrams" id="cg-d"></div>
    <div class="count-big" id="cg-c">0</div>
    <p class="muted" style="text-align:center;margin-top:6px" id="cg-info"></p>
    <button class="tap-pad" id="cg-pad" disabled>+1 change</button>
    <button class="btn grad" id="cg-go">Start 1 minute</button>`;
  const key = () => [a, b].sort().join('–');
  const info = () => {
    const best = S.best[key()];
    $('#cg-info', el).textContent = left > 0 ? `${left}s left` : best ? `Best for ${a} ↔ ${b}: ${best} changes` : `No score yet for ${a} ↔ ${b}`;
    $('#cg-d', el).innerHTML = [a, b].map(c => `<button class="diagram-btn" data-chord="${c}">${chordSVG(c)}</button>`).join('');
    $$('[data-chord]', el).forEach(x => { x.onclick = () => playChord(x.dataset.chord); });
  };
  $('#cg-a', el).onchange = e => { a = S.chgA = e.target.value; info(); };
  $('#cg-b', el).onchange = e => { b = S.chgB = e.target.value; info(); };
  $('#cg-pad', el).onclick = () => { count++; $('#cg-c', el).textContent = count; };
  const end = () => {
    clearInterval(timer); left = 0;
    $('#cg-pad', el).disabled = true; $('#cg-go', el).disabled = false;
    const prev = S.best[key()] || 0;
    if (count > prev) { S.best[key()] = count; toast(prev ? `New best: ${count}! 🎉` : `First score: ${count}`); }
    save(); sfx.ok(); info();
  };
  $('#cg-go', el).onclick = () => {
    count = 0; left = 60;
    $('#cg-c', el).textContent = 0;
    $('#cg-pad', el).disabled = false; $('#cg-go', el).disabled = true;
    audio(); const bus = newBus(); click(bus, actx.currentTime + 0.02, true);
    info();
    timer = setInterval(() => { left--; if (left <= 0) end(); else info(); }, 1000);
  };
  info();
  toolCleanup = () => clearInterval(timer);
}

/* Jam tracks */
const JAMS = [
  { title: 'Slow blues in A', sub: 'A minor pentatonic', bpm: 75, swing: true, scale: { root: 9, type: 'minorPent' },
    tab: `e ${shuffle(5, 4)} ${shuffle(4, 3)} ${shuffle(5, 4)} ${shuffle(5, 4)} ${shuffle(4, 3)} ${shuffle(4, 3)} ${shuffle(5, 4)} ${shuffle(5, 4)} ${shuffle(6, 5)} ${shuffle(4, 3)} ${shuffle(5, 4)} ${shuffle(6, 5)}` },
  { title: 'Moody rock in A minor', sub: 'A minor pentatonic', bpm: 90, scale: { root: 9, type: 'minorPent' },
    tab: `e ${campfire('Am')} ${campfire('Dm')} ${campfire('Am')} ${campfire('Em')}` },
  { title: 'Feel-good pop in G', sub: 'G major pentatonic', bpm: 95, scale: { root: 7, type: 'majorPent' },
    tab: `e ${campfire('G')} ${campfire('D')} ${campfire('Em')} ${campfire('C')}` },
  { title: 'Funk vamp on E9', sub: 'E minor pentatonic', bpm: 98, scale: { root: 4, type: 'minorPent' },
    tab: `s ${funkBar('E9')} ${funkBar('E9')} ${funkBar('D9')} ${funkBar('E9')}` }
];
function toolJam(el) {
  let jp = null;
  el.innerHTML = `<div class="chips" id="jm-c">${JAMS.map((j, i) => `<button class="chip${i ? '' : ' on'}" data-j="${i}">${esc(j.title)}</button>`).join('')}</div>
    <p class="muted" style="margin:14px 0" id="jm-s"></p><div id="jm-p"></div>`;
  const pick = i => {
    if (jp) jp.destroy();
    const j = JAMS[i];
    $('#jm-s', el).innerHTML = `Improvise with the <b style="color:var(--text)">${j.sub}</b> scale highlighted on the fretboard.`;
    jp = new Player($('#jm-p', el), { ...j, jam: true });
  };
  $$('[data-j]', el).forEach(b => { b.onclick = () => { $$('[data-j]', el).forEach(x => x.classList.toggle('on', x === b)); pick(+b.dataset.j); }; });
  pick(0);
  toolCleanup = () => jp && jp.destroy();
}

/* ---------- Profile ---------- */
function renderMe() {
  const el = $('#tab-me');
  const lessonsDone = Object.keys(S.done).filter(id => LESSON[id]).length;
  const level = LEVELS.find(l => l.id === S.level);
  // 5 weeks of days, Sunday first, ending this week
  const end = new Date(); end.setDate(end.getDate() + (6 - end.getDay()));
  const cells = [];
  for (let i = 34; i >= 0; i--) { const d = new Date(end); d.setDate(end.getDate() - i); cells.push(d); }
  const today = dayKey(), goalS = S.goal * 60;
  let best = 0, run = 0;
  Object.keys(S.log).sort().forEach((k, i, arr) => {
    if (S.log[k] < 60) { run = 0; return; }
    const prev = arr[i - 1], d = new Date(k + 'T12:00'); d.setDate(d.getDate() - 1);
    run = prev === dayKey(d) && S.log[prev] >= 60 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  el.innerHTML = `<div class="wrap">
    <div class="profile-top"><div class="avatar">${esc((S.name || 'G')[0].toUpperCase())}</div>
      <div><h1>${esc(S.name || 'Guitarist')}</h1><p class="muted">${esc(level ? level.label : '')} · ${S.styles.map(s => (STYLES.find(x => x.id === s) || {}).label).filter(Boolean).join(', ') || 'All styles'}</p></div></div>
    <div class="stat-grid">
      <div class="stat"><b>🔥 ${streak()}</b><small>day streak</small></div>
      <div class="stat"><b>${Math.round(totalSecs() / 60)}</b><small>total minutes</small></div>
      <div class="stat"><b>${lessonsDone}</b><small>lessons done</small></div>
    </div>
    <div class="section">
      <div class="sec-h"><h2>Practice calendar</h2><span class="muted small">Best streak: ${best} day${best === 1 ? '' : 's'}</span></div>
      <div class="heat">${'SMTWTFS'.split('').map(d => `<span>${d}</span>`).join('')}${cells.map(d => {
        const s = secsOn(d), k = dayKey(d);
        const lv = s <= 0 ? '' : s >= goalS ? 'l3' : s >= goalS / 2 ? 'l2' : 'l1';
        return `<i class="${lv}${k > today ? ' future' : ''}${k === today ? ' today' : ''}" title="${k}: ${fmtMins(s)}"></i>`;
      }).join('')}</div>
    </div>
    <div class="section">
      <div class="sec-h"><h2>Daily goal</h2></div>
      <div class="chips wrapit">${[5, 10, 15, 20, 30, 45].map(g => `<button class="chip${g === S.goal ? ' on' : ''}" data-g="${g}">${g} min</button>`).join('')}</div>
    </div>
    <div class="section">
      <div class="sec-h"><h2>Settings</h2></div>
      <button class="list-row" id="me-retake">Retake the pathway quiz <span class="muted">›</span></button>
      <button class="list-row danger" id="me-reset">Reset all progress <span>›</span></button>
      <p class="muted small" style="text-align:center;margin-top:16px">Riffwise v${VERSION} · progress is saved on this device</p>
    </div>
  </div>`;
  $$('[data-g]', el).forEach(b => { b.onclick = () => { S.goal = +b.dataset.g; save(); renderMe(); }; });
  $('#me-retake', el).onclick = () => onboard(1);
  $('#me-reset', el).onclick = () => {
    if (!confirm('Erase your lessons, practice history and streak? This can\'t be undone.')) return;
    S = { ...DEFAULTS }; save(); onboard(0);
  };
}

/* ---------- Onboarding ---------- */
function onboard(stepNo = 0) {
  const draft = { name: S.name, level: S.level, styles: [...S.styles], goal: S.goal };
  let step = stepNo;
  const el = $('#onboard');
  show('onboard');
  const TOTAL = 4;
  const frame = (inner, canGo, label = 'Continue') => `<div class="ob">
      <div class="ob-top"><button class="icon-btn" id="ob-back" aria-label="Back">${ICON.back}</button><div class="segs">${Array.from({ length: TOTAL }, (_, i) => `<i class="${i < step ? 'on' : ''}"></i>`).join('')}</div></div>
      <div class="grow">${inner}</div>
      <button class="btn grad" id="ob-go"${canGo ? '' : ' disabled'}>${label}</button>
    </div>`;
  const render = () => {
    if (step === 0) {
      el.innerHTML = `<div class="ob"><div class="welcome"><div class="logo">🎸</div><h1>Riffwise</h1><p>Learn guitar with a pathway built for you, play-along lessons and daily practice.</p></div>
        <button class="btn grad" id="ob-go">Get started</button></div>`;
      $('#ob-go', el).onclick = () => { audio(); step = 1; render(); };
      return;
    }
    if (step === 1) {
      el.innerHTML = frame(`<h1>What should we call you?</h1><p class="lead">We'll use it to personalise your practice.</p>
        <input class="ob-input" id="ob-name" maxlength="24" placeholder="Your first name" value="${esc(draft.name)}" autocomplete="given-name">`, draft.name.trim());
      const inp = $('#ob-name', el);
      inp.oninput = () => { draft.name = inp.value; $('#ob-go', el).disabled = !inp.value.trim(); };
      inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) $('#ob-go', el).click(); };
      setTimeout(() => inp.focus(), 50);
    } else if (step === 2) {
      el.innerHTML = frame(`<h1>How well do you play?</h1><p class="lead">Be honest. We'll start you in the right place.</p>
        <div class="ob-opts">${LEVELS.map((l, i) => `<button class="ob-opt${draft.level === l.id ? ' on' : ''}" data-v="${l.id}"><span class="e">${['🌱', '🎵', '🎸', '🚀'][i]}</span><span><b>${l.label}</b><small>${l.sub}</small></span></button>`).join('')}</div>`, true);
      $$('[data-v]', el).forEach(b => { b.onclick = () => { draft.level = b.dataset.v; $$('[data-v]', el).forEach(x => x.classList.toggle('on', x === b)); }; });
    } else if (step === 3) {
      el.innerHTML = frame(`<h1>What do you want to play?</h1><p class="lead">Pick as many as you like.</p>
        <div class="ob-opts grid2">${STYLES.map(s => `<button class="ob-opt${draft.styles.includes(s.id) ? ' on' : ''}" data-v="${s.id}"><span class="e">${s.emoji}</span><b>${s.label}</b></button>`).join('')}</div>`, draft.styles.length);
      $$('[data-v]', el).forEach(b => {
        b.onclick = () => {
          const v = b.dataset.v;
          draft.styles = draft.styles.includes(v) ? draft.styles.filter(x => x !== v) : [...draft.styles, v];
          b.classList.toggle('on');
          $('#ob-go', el).disabled = !draft.styles.length;
        };
      });
    } else if (step === 4) {
      el.innerHTML = frame(`<h1>How much time each day?</h1><p class="lead">Little and often beats long and rare. You can change this later.</p>
        <div class="ob-opts">${[[5, 'Casual'], [10, 'Regular'], [15, 'Serious'], [30, 'Intense']].map(([g, l]) => `<button class="ob-opt${draft.goal === g ? ' on' : ''}" data-v="${g}"><span class="e">⏱</span><span><b>${g} minutes a day</b><small>${l}</small></span></button>`).join('')}</div>`, true, 'Build my pathway');
      $$('[data-v]', el).forEach(b => { b.onclick = () => { draft.goal = +b.dataset.v; $$('[data-v]', el).forEach(x => x.classList.toggle('on', x === b)); }; });
    } else if (step === 5) {
      el.innerHTML = `<div class="ob"><div class="welcome"><div class="spinner"></div><h2>Building your pathway…</h2><p>Matching courses to your level and styles</p></div></div>`;
      setTimeout(() => { step = 6; render(); }, 1300);
      return;
    } else if (step === 6) {
      const path = buildPath(draft.level, draft.styles);
      el.innerHTML = `<div class="ob"><div class="grow"><h1>Your pathway is ready, ${esc(draft.name.trim())} 🎉</h1><p class="lead">${path.length} stages, in the order we recommend. Every day you'll get a ${draft.goal}-minute session built from it.</p>
        <div class="path-list">${path.map((id, i) => { const c = COURSE[id]; return `<div class="path-item">${thumb(c)}<div><small>STAGE ${i + 1}</small><b style="display:block">${esc(c.title)}</b></div></div>`; }).join('')}</div></div>
        <button class="btn grad" id="ob-go">Let's play</button></div>`;
      $('#ob-go', el).onclick = () => {
        Object.assign(S, { started: true, name: draft.name.trim(), level: draft.level, styles: draft.styles, goal: draft.goal, path });
        save(); goTab('home');
      };
      return;
    }
    $('#ob-back', el).onclick = () => { if (step === 1 && S.started) goTab('me'); else { step--; render(); } };
    $('#ob-go', el).onclick = () => { step++; render(); };
  };
  render();
}

/* ---------- Boot ---------- */
if (S.started && S.path.length) goTab('home'); else onboard(0);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (player) player.stop(); }
  else if (!$('#main').classList.contains('hidden') && currentTab === 'home') renderHome();
});
// A new version takes over as soon as it's published; the page reloads into
// it unless a lesson is open, in which case it waits for the next launch
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !LS) location.reload(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
