// Compass — chat-style career assessment. Everything is stored in
// localStorage on this device; nothing is sent anywhere.

const KEY = 'compass-v1';
const DEFAULTS = { answers: {}, idx: 0, done: false, saved: [], planFor: null, checks: {}, letter: {}, tab: 'profile' };
let S = load();
let LS = false; // true while the chat is animating

function load() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return Object.assign({}, DEFAULTS); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const wait = ms => new Promise(r => setTimeout(r, ms));
const money = n => '$' + Math.round(n / 1000) + 'k';
const firstName = () => (S.answers.name || '').trim().split(/\s+/)[0] || 'there';
const fill = s => s.replace(/\{name\}/g, firstName());

function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('hidden', el.id !== id));
}

/* ---------- Scoring ---------- */

function answerLabel(q, a) {
  if (q.type === 'text') return a || 'Skipped';
  if (q.type === 'scale') return q.labels[a];
  return q.opts[a].label;
}

function computeProfile() {
  const sum = {}, lo = {}, hi = {};
  const add = (k, v, min, max) => {
    sum[k] = (sum[k] || 0) + v; lo[k] = (lo[k] || 0) + min; hi[k] = (hi[k] || 0) + max;
  };
  for (const q of QUESTIONS) {
    const a = S.answers[q.id];
    if (q.type === 'scale') {
      const v = a === undefined ? 0 : a / (q.labels.length - 1) * 2 - 1;
      for (const k in q.s) add(k, v * q.s[k], -Math.abs(q.s[k]), Math.abs(q.s[k]));
    } else if (q.type === 'choice' && q.opts[0].s) {
      const keys = new Set(q.opts.flatMap(o => Object.keys(o.s)));
      for (const k of keys) {
        const vals = q.opts.map(o => o.s[k] || 0);
        add(k, a === undefined ? 0 : (q.opts[a].s[k] || 0), Math.min(...vals), Math.max(...vals));
      }
    }
  }
  const n = k => hi[k] === lo[k] ? .5 : (sum[k] - lo[k]) / (hi[k] - lo[k]);
  const eduQ = QUESTIONS.find(q => q.id === 'edu');
  return {
    areas: Object.fromEntries(Object.keys(AREAS).map(k => [k, n(k)])),
    traits: Object.fromEntries(Object.keys(TRAITS).map(k => [k, n(k)])),
    values: Object.fromEntries(Object.keys(VALUES).map(k => [k, n(k)])),
    phys: n('phys'), remote: n('remote'),
    edu: S.answers.edu === undefined ? 4 : eduQ.opts[S.answers.edu].v
  };
}

function scoreCareer(c, p) {
  const keys = Object.keys(AREAS);
  const u = keys.map(k => p.areas[k]);
  const cv = keys.map(k => { const i = c.code.indexOf(k); return i < 0 ? 0 : 3 - i; });
  const center = v => { const m = v.reduce((a, b) => a + b) / v.length; return v.map(x => x - m); };
  const a = center(u), b = center(cv);
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const mag = Math.hypot(...a) * Math.hypot(...b) || 1;
  const interest = (dot / mag + 1) / 2;

  const people = .6 * p.traits.X + .4 * p.traits.Ag;
  const structure = .6 * p.traits.Co + .4 * (1 - p.traits.O);
  const style = 1 - (Math.abs(people - c.people / 2) + Math.abs(structure - c.structure / 2) + 1.3 * Math.abs(p.phys - c.phys / 2)) / 3.3;
  const value = c.values.reduce((s, k) => s + p.values[k], 0) / c.values.length;

  let penalty = Math.max(0, c.edu - p.edu) * .07;
  if (c.remote === 0) penalty += .08 * p.remote; else if (c.remote === 1) penalty += .03 * p.remote;

  const raw = .6 * interest + .22 * style + .18 * value - penalty;
  return { raw, interest, style, value, people, structure };
}

function results() {
  const p = computeProfile();
  const list = CAREERS.map(c => ({ c, ...scoreCareer(c, p) })).sort((x, y) => y.raw - x.raw);
  const top = list[0].raw, bottom = list[list.length - 1].raw;
  for (const r of list) {
    // Spread raw scores into a readable range, anchored to how good the best match really is
    const rel = (r.raw - bottom) / ((top - bottom) || 1);
    r.fit = Math.round(Math.min(98, 30 + rel * 40 + r.raw * 30));
  }
  const ranked = Object.keys(AREAS).sort((x, y) => p.areas[y] - p.areas[x]);
  return { p, list, ranked };
}

function archetype(ranked) {
  return `The ${AREAS[ranked[1]].adj} ${AREAS[ranked[0]].noun}`;
}

function strengths(p, ranked) {
  const t = p.traits, out = [];
  const pick = (k, hiS, loS) => { if (t[k] >= .62) out.push(hiS); else if (t[k] <= .38) out.push(loS); };
  pick('O', 'Curious learner', 'Practical and grounded');
  pick('Co', 'Reliable and organized', 'Adaptable');
  pick('X', 'Natural communicator', 'Deep thinker');
  pick('Ag', 'Supportive team player', 'Honest and direct');
  pick('Cm', 'Cool under pressure', 'Emotionally aware');
  const extra = { R: 'Good with your hands', I: 'Strong problem solver', A: 'Original thinker', S: 'Great with people', E: 'Takes initiative', C: 'Eye for detail' };
  for (const k of ranked.slice(0, 2)) if (!out.includes(extra[k])) out.push(extra[k]);
  return out.slice(0, 5);
}

function reasons(r, p, ranked) {
  const c = r.c, out = [];
  const shared = c.code.split('').filter(k => ranked.slice(0, 3).includes(k)).map(k => AREAS[k].name.toLowerCase());
  if (shared.length) out.push(['✅', `Uses your top interests: ${shared.join(' and ')}`]);
  else out.push(['➖', `Leans on ${AREAS[c.code[0]].name.toLowerCase()}, which isn't one of your top interests`]);
  if (r.people >= .6 && c.people === 2) out.push(['✅', 'Lots of time with people — great for someone outgoing']);
  else if (r.people <= .4 && c.people <= 1) out.push(['✅', 'Room for focused, independent work']);
  else if (r.people <= .4 && c.people === 2) out.push(['➖', 'Very people-heavy — could be draining for you']);
  if (p.phys >= .6 && c.phys === 2) out.push(['✅', 'Active, on-your-feet work like you want']);
  else if (p.phys <= .35 && c.phys === 2) out.push(['➖', 'Physically demanding — you said you prefer a desk']);
  const vals = c.values.filter(k => p.values[k] >= .6).map(k => VALUES[k].name.toLowerCase());
  if (vals.length) out.push(['✅', `Strong on ${vals.join(' and ')}, ${vals.length > 1 ? 'which matter' : 'which matters'} to you`]);
  if (p.remote >= .6 && c.remote === 2) out.push(['✅', 'Often remote-friendly']);
  else if (p.remote >= .6 && c.remote === 0) out.push(['➖', 'Usually done in person, not from home']);
  if (c.edu <= p.edu) out.push(['✅', 'Reachable with the training you\'re up for']);
  else out.push(['➖', `Needs a ${EDU[c.edu].toLowerCase()} — more school than you planned`]);
  if (c.growth === 3) out.push(['🚀', 'Demand is booming']);
  return out;
}

/* ---------- Welcome ---------- */

function start() {
  if (S.done) { openMain(); return; }
  $('#n-careers').textContent = CAREERS.length;
  $('#n-questions').textContent = QUESTIONS.length;
  if (S.idx > 0) { $('#start-btn').textContent = 'Continue where you left off'; }
  show('welcome');
}

$('#start-btn').addEventListener('click', () => { show('chat'); renderChat(); });

/* ---------- Chat ---------- */

const log = $('#log');

function bubble(html, who) {
  const el = document.createElement('div');
  el.className = 'msg ' + who;
  el.innerHTML = html;
  log.appendChild(el);
  return el;
}

function scrollDown() { const sc = $('#chat .scroll'); sc.scrollTop = sc.scrollHeight; }

function updateProgress() {
  const pct = Math.round(S.idx / QUESTIONS.length * 100);
  $('#progress span').style.width = pct + '%';
  let sec = 'About you';
  for (let i = 0; i <= Math.min(S.idx, QUESTIONS.length - 1); i++) if (QUESTIONS[i].section) sec = QUESTIONS[i].section;
  $('#chat-sec').textContent = sec;
  $('#chat-count').textContent = `${Math.min(S.idx + 1, QUESTIONS.length)} / ${QUESTIONS.length}`;
  $('#back-btn').disabled = S.idx === 0 || LS;
}

function renderChat() {
  log.innerHTML = '';
  for (let i = 0; i < S.idx; i++) {
    const q = QUESTIONS[i];
    q.say.forEach(s => bubble(md(fill(s)), 'bot'));
    bubble(esc(answerLabel(q, S.answers[q.id])), 'me');
  }
  ask(true);
}

async function ask(instant) {
  const input = $('#input');
  input.innerHTML = '';
  updateProgress();
  if (S.idx >= QUESTIONS.length) { finish(); return; }
  const q = QUESTIONS[S.idx];
  LS = true; updateProgress();
  for (const s of q.say) {
    if (!instant) {
      const t = bubble('<i></i><i></i><i></i>', 'bot typing');
      scrollDown();
      await wait(Math.min(900, 300 + s.length * 6));
      t.remove();
    }
    bubble(md(fill(s)), 'bot');
    scrollDown();
  }
  LS = false; updateProgress();
  renderInput(q);
  scrollDown();
}

function renderInput(q) {
  const input = $('#input');
  if (q.type === 'text') {
    input.innerHTML = `<form class="text-in"><input id="txt" autocomplete="off" maxlength="120" placeholder="${esc(q.placeholder)}"><button class="send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>` +
      (q.optional ? '<button class="skip" id="skip">Skip</button>' : '');
    const f = input.querySelector('form'), t = $('#txt');
    t.value = S.answers[q.id] || '';
    setTimeout(() => t.focus(), 50);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = t.value.trim();
      if (!v && !q.optional) { t.focus(); return; }
      answer(q, v);
    });
    if (q.optional) $('#skip').addEventListener('click', () => answer(q, ''));
  } else if (q.type === 'scale') {
    input.innerHTML = `<div class="scale n${q.labels.length}">${q.labels.map((l, i) => `<button data-i="${i}"><b style="--s:${.55 + i / (q.labels.length - 1) * .45}"></b><span>${esc(l)}</span></button>`).join('')}</div>`;
    input.querySelectorAll('button').forEach(b => b.addEventListener('click', () => answer(q, +b.dataset.i)));
  } else {
    input.innerHTML = `<div class="opts">${q.opts.map((o, i) => `<button data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`;
    input.querySelectorAll('button').forEach(b => b.addEventListener('click', () => answer(q, +b.dataset.i)));
  }
}

function answer(q, v) {
  if (LS) return;
  S.answers[q.id] = v;
  S.idx++;
  save();
  bubble(esc(answerLabel(q, v)), 'me');
  scrollDown();
  ask(false);
}

$('#back-btn').addEventListener('click', () => {
  if (S.idx === 0 || LS) return;
  S.idx--;
  delete S.answers[QUESTIONS[S.idx].id];
  save();
  renderChat();
});

$('#chat-close').addEventListener('click', () => { if (!LS) start(); });

async function finish() {
  S.done = true; save();
  show('analyzing');
  const steps = document.querySelectorAll('#analyzing li');
  steps.forEach(li => li.className = '');
  for (const li of steps) {
    li.className = 'doing';
    await wait(850);
    li.className = 'done';
  }
  await wait(350);
  S.tab = 'profile'; S.planFor = null; save();
  openMain();
}

/* ---------- Main ---------- */

let R = null; // cached results

function openMain() {
  R = results();
  if (S.planFor === null || !CAREERS[S.planFor]) S.planFor = R.list[0].c.id;
  show('main');
  renderProfile(); renderCareers(); renderPlan(); renderLetter();
  setTab(S.tab);
}

function setTab(t) {
  S.tab = t; save();
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('hidden', el.id !== 'tab-' + t));
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#tab-' + t).scrollTop = 0;
}
document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

function bar(label, pct, color, note) {
  return `<div class="bar-row"><div class="bar-top"><span>${label}</span><b>${Math.round(pct * 100)}%</b></div>
    <div class="meter"><span style="width:${Math.max(4, pct * 100)}%;background:${color}"></span></div>${note ? `<p class="small muted">${note}</p>` : ''}</div>`;
}

function careerCard(r) {
  const c = r.c, saved = S.saved.includes(c.id);
  return `<button class="career" data-id="${c.id}">
    <span class="emo">${c.emoji}</span>
    <span class="cinfo"><b>${esc(c.title)}${saved ? ' <span class="star">★</span>' : ''}</b>
      <span class="small muted">${money(c.pay)}/yr · ${GROWTH[c.growth]} · ${c.edu <= 1 ? 'No degree' : EDU[c.edu].replace(' degree', '')}</span></span>
    <span class="fit" style="--p:${r.fit}"><span>${r.fit}%</span></span>
  </button>`;
}

function bindCards(root) {
  root.querySelectorAll('.career').forEach(b => b.addEventListener('click', () => openCareer(+b.dataset.id)));
}

function renderProfile() {
  const { p, list, ranked } = R;
  const st = strengths(p, ranked);
  const vals = Object.keys(VALUES).sort((a, b) => p.values[b] - p.values[a]);
  const stage = S.answers.stage !== undefined ? QUESTIONS[1].opts[S.answers.stage].v : 'explore';
  $('#tab-profile').innerHTML = `<div class="wrap">
    <header class="top"><div><p class="muted small">Hi ${esc(firstName())} 👋</p><h1>Your career profile</h1></div>
      <button class="icon-btn" id="menu-btn" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg></button></header>
    <section class="hero">
      <p class="eyebrow">Your type</p>
      <h2>${archetype(ranked)}</h2>
      <p>${AREAS[ranked[0]].desc} You also have a strong ${AREAS[ranked[1]].name.toLowerCase()} side.</p>
      <div class="code">${ranked.slice(0, 3).map(k => `<span style="background:${AREAS[k].color}">${k}</span>`).join('')}<small>Your interest code</small></div>
    </section>
    <section class="card">
      <h3>Top match</h3>
      ${careerCard(list[0])}
      <button class="btn ghost sm full" id="see-all">See all ${CAREERS.length} careers</button>
    </section>
    <section class="card">
      <h3>Strengths</h3>
      <div class="tags">${st.map(s => `<span>${esc(s)}</span>`).join('')}</div>
    </section>
    <section class="card">
      <h3>Interests</h3>
      ${ranked.map(k => bar(`${AREAS[k].name} <span class="muted small">(${k})</span>`, p.areas[k], AREAS[k].color)).join('')}
    </section>
    <section class="card">
      <h3>Personality</h3>
      ${Object.keys(TRAITS).map(k => `<div class="trait"><div class="bar-top"><span>${TRAITS[k].lo}</span><b>${TRAITS[k].name}</b><span>${TRAITS[k].hi}</span></div>
        <div class="slider"><span style="left:${p.traits[k] * 100}%"></span></div></div>`).join('')}
    </section>
    <section class="card">
      <h3>What you value most</h3>
      <ol class="values">${vals.map(k => `<li><span>${VALUES[k].icon} ${VALUES[k].name}</span><div class="meter"><span style="width:${Math.max(4, p.values[k] * 100)}%"></span></div></li>`).join('')}</ol>
    </section>
    <section class="card">
      <h3>Your ideal setup</h3>
      <ul class="facts">
        <li>${p.traits.X >= .6 ? '🗣️ Plenty of people contact' : p.traits.X <= .4 ? '🎧 Quiet, independent work' : '⚖️ A balance of team and solo time'}</li>
        <li>${p.phys >= .6 ? '🏃 Active, on your feet' : p.phys <= .35 ? '🪑 Desk-based' : '🚶 A mix of desk and moving around'}</li>
        <li>${p.remote >= .6 ? '🏠 Remote or flexible location' : '🏢 In person is fine'}</li>
        <li>${p.traits.Co >= .6 ? '📋 Clear goals and structure' : p.traits.O >= .6 ? '🧪 Variety and new challenges' : '🔀 Some structure, some variety'}</li>
        <li>🎓 Up for: ${EDU[p.edu].toLowerCase().replace('no degree needed', 'no more school')}</li>
      </ul>
      <p class="small muted">You're ${STAGES[stage]}. Your plan is tailored to that.</p>
    </section>
  </div>`;
  $('#see-all').addEventListener('click', () => setTab('careers'));
  $('#menu-btn').addEventListener('click', openMenu);
  bindCards($('#tab-profile'));
}

let filter = 'all', query = '';
const FILTERS = [['all', 'Best fit'], ['saved', 'Saved'], ['nodeg', 'No degree'], ['remote', 'Remote-friendly'], ['pay', '$100k+'], ['growth', 'Growing']];

function renderCareers() {
  $('#tab-careers').innerHTML = `<div class="wrap">
    <header class="top"><div><h1>Career matches</h1><p class="muted small">Ranked by how well each one fits you</p></div></header>
    <input id="search" class="search" type="search" placeholder="Search careers" value="${esc(query)}">
    <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip${filter === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div id="clist"></div>
  </div>`;
  document.querySelectorAll('#tab-careers .chip').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; renderCareers(); }));
  $('#search').addEventListener('input', e => { query = e.target.value; renderList(); });
  renderList();
}

function renderList() {
  const q = query.trim().toLowerCase();
  const rows = R.list.filter(({ c }) =>
    (filter !== 'saved' || S.saved.includes(c.id)) &&
    (filter !== 'nodeg' || c.edu <= 1) &&
    (filter !== 'remote' || c.remote === 2) &&
    (filter !== 'pay' || c.pay >= 100000) &&
    (filter !== 'growth' || c.growth >= 2) &&
    (!q || c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)));
  $('#clist').innerHTML = rows.length ? rows.map(careerCard).join('') :
    `<p class="empty">${filter === 'saved' ? 'Tap ☆ Save on a career to keep it here.' : 'No careers match that.'}</p>`;
  bindCards($('#clist'));
}

/* ---------- Career detail sheet ---------- */

function openCareer(id) {
  const r = R.list.find(x => x.c.id === id), c = r.c;
  const saved = S.saved.includes(id);
  const jobs = 'https://www.indeed.com/jobs?q=' + encodeURIComponent(c.title);
  $('#sheet-body').innerHTML = `
    <div class="sheet-head"><span class="emo big">${c.emoji}</span><div><h2>${esc(c.title)}</h2><p class="muted small">${esc(c.desc)}</p></div></div>
    <div class="fitbar"><span>Your fit</span><div class="meter"><span style="width:${r.fit}%"></span></div><b>${r.fit}%</b></div>
    <div class="stats">
      <div><b>${money(c.pay)}</b><span>Median pay</span></div>
      <div><b>${GROWTH[c.growth]}</b><span>Job outlook</span></div>
      <div><b>${['On site', 'Hybrid', 'Remote OK'][c.remote]}</b><span>Location</span></div>
    </div>
    <h3>Why it fits you</h3>
    <ul class="why">${reasons(r, R.p, R.ranked).map(([i, t]) => `<li><span>${i}</span>${esc(t)}</li>`).join('')}</ul>
    <h3>Training</h3><p>${EDU[c.edu]}</p>
    <h3>Key skills</h3><div class="tags">${c.skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>
    <h3>How to start</h3><ol class="steps">${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="sheet-actions">
      <button class="btn ghost" id="save-c">${saved ? '★ Saved' : '☆ Save'}</button>
      <button class="btn grad" id="plan-c">Build my plan</button>
    </div>
    <div class="sheet-actions">
      <a class="btn ghost" href="${jobs}" target="_blank" rel="noopener">Find jobs ↗</a>
      <button class="btn ghost" id="letter-c">Cover letter</button>
    </div>
    <p class="small muted note">Pay is an approximate US median. Check local data before deciding.</p>`;
  $('#save-c').addEventListener('click', () => {
    S.saved = saved ? S.saved.filter(x => x !== id) : [...S.saved, id];
    save(); openCareer(id); renderProfile(); renderList();
  });
  $('#plan-c').addEventListener('click', () => { S.planFor = id; save(); renderPlan(); closeSheet(); setTab('plan'); });
  $('#letter-c').addEventListener('click', () => { S.letter.role = c.title; save(); renderLetter(); closeSheet(); setTab('letter'); });
  $('#sheet').classList.remove('hidden');
  requestAnimationFrame(() => $('#sheet').classList.add('open'));
  $('#sheet .panel').scrollTop = 0;
}

function closeSheet() {
  $('#sheet').classList.remove('open');
  setTimeout(() => $('#sheet').classList.add('hidden'), 220);
}
$('#sheet .scrim').addEventListener('click', closeSheet);
$('#sheet-close').addEventListener('click', closeSheet);

/* ---------- Plan ---------- */

function planFor(c) {
  const p = R.p;
  const stage = S.answers.stage !== undefined ? QUESTIONS[1].opts[S.answers.stage].v : 'explore';
  const mine = (S.answers.skills || '').trim();
  const stageStep = {
    hs: `Ask your school counselor about classes or programs that lead to ${c.title.toLowerCase()} work`,
    college: 'Visit your campus career center and look for internships in this field',
    early: `Update your resume to put skills that matter for a ${c.title.toLowerCase()} first`,
    switch: `List the skills that carry over${mine ? ` (like ${mine})` : ''} and add them to your resume`,
    return: 'Refresh your resume and LinkedIn with your most recent experience',
    explore: `Spend an hour watching "day in the life" videos of a ${c.title.toLowerCase()}`
  }[stage];
  return [
    ['This week', [
      `Read 5 job postings for ${c.title} and note what they ask for`,
      c.steps[0],
      `Find one ${c.title.toLowerCase()} to talk to — friends, family or LinkedIn`
    ]],
    ['Next 30 days', [
      c.steps[1],
      `Learn the basics of ${c.skills[0].toLowerCase()} and ${c.skills[1].toLowerCase()}`,
      stageStep
    ]],
    ['Next 90 days', [
      c.steps[2],
      'Apply to at least 5 openings, programs or apprenticeships',
      c.edu > p.edu ? `Research costs and financial aid for a ${EDU[c.edu].toLowerCase()}` : 'Write a cover letter you can reuse (see the Letter tab)'
    ]]
  ];
}

function renderPlan() {
  const c = CAREERS[S.planFor];
  const phases = planFor(c);
  const checks = S.checks[c.id] || [];
  const total = phases.reduce((n, [, items]) => n + items.length, 0);
  const done = checks.filter(Boolean).length;
  const choices = [...new Set([...S.saved, ...R.list.slice(0, 8).map(r => r.c.id), c.id])];
  let k = 0;
  $('#tab-plan').innerHTML = `<div class="wrap">
    <header class="top"><div><h1>Action plan</h1><p class="muted small">Small steps toward your next career</p></div></header>
    <label class="field"><span>Plan for</span>
      <select id="plan-sel">${choices.map(id => `<option value="${id}"${id === c.id ? ' selected' : ''}>${CAREERS[id].emoji} ${esc(CAREERS[id].title)}</option>`).join('')}</select></label>
    <section class="hero slim">
      <div class="plan-prog"><div><p class="eyebrow">Progress</p><h2>${done} of ${total} steps</h2></div>
        <span class="fit light" style="--p:${Math.round(done / total * 100)}"><span>${Math.round(done / total * 100)}%</span></span></div>
    </section>
    ${phases.map(([title, items]) => `<section class="card"><h3>${title}</h3>
      ${items.map(t => { const i = k++; return `<label class="check"><input type="checkbox" data-i="${i}"${checks[i] ? ' checked' : ''}><span>${esc(t)}</span></label>`; }).join('')}
    </section>`).join('')}
    <a class="btn ghost" href="https://www.indeed.com/jobs?q=${encodeURIComponent(c.title)}" target="_blank" rel="noopener">Browse ${esc(c.title)} jobs ↗</a>
  </div>`;
  $('#plan-sel').addEventListener('change', e => { S.planFor = +e.target.value; save(); renderPlan(); });
  document.querySelectorAll('#tab-plan .check input').forEach(cb => cb.addEventListener('change', () => {
    const arr = S.checks[c.id] || [];
    arr[+cb.dataset.i] = cb.checked;
    S.checks[c.id] = arr; save(); renderPlan();
  }));
}

/* ---------- Cover letter ---------- */

function renderLetter() {
  const L = S.letter;
  const st = strengths(R.p, R.ranked);
  const defaults = {
    name: (S.answers.name || '').trim(), role: R.list[0].c.title, company: '', background: '',
    skills: (S.answers.skills || '').trim(), why: '', tone: 'pro'
  };
  for (const k in defaults) if (L[k] === undefined) L[k] = defaults[k];
  $('#tab-letter').innerHTML = `<div class="wrap">
    <header class="top"><div><h1>Cover letter</h1><p class="muted small">Built from your profile. Edit anything.</p></div></header>
    <form id="lform" class="card form">
      <label class="field"><span>Your name</span><input name="name" value="${esc(L.name)}" required></label>
      <label class="field"><span>Job title</span><input name="role" list="roles" value="${esc(L.role)}" required>
        <datalist id="roles">${R.list.slice(0, 12).map(r => `<option value="${esc(r.c.title)}">`).join('')}</datalist></label>
      <label class="field"><span>Company</span><input name="company" value="${esc(L.company)}" placeholder="e.g. Riverside Health" required></label>
      <label class="field"><span>Your background</span><input name="background" value="${esc(L.background)}" placeholder="e.g. two years in retail management"></label>
      <label class="field"><span>Skills to highlight</span><input name="skills" value="${esc(L.skills)}" placeholder="e.g. scheduling, Excel, customer service"></label>
      <label class="field"><span>Why this company? <em>(optional)</em></span><input name="why" value="${esc(L.why)}" placeholder="e.g. your focus on community care"></label>
      <div class="field"><span>Tone</span><div class="seg">${[['pro', 'Professional'], ['warm', 'Friendly'], ['bold', 'Confident']].map(([v, l]) =>
        `<label><input type="radio" name="tone" value="${v}"${L.tone === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <button class="btn grad">Write my letter</button>
    </form>
    <div id="letter-out"></div>
  </div>`;
  const f = $('#lform');
  f.addEventListener('input', () => { Object.assign(S.letter, Object.fromEntries(new FormData(f))); save(); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    Object.assign(S.letter, Object.fromEntries(new FormData(f))); save();
    showLetter(writeLetter(S.letter, st));
  });
  if (L.text) showLetter(L.text);
}

function list3(arr) {
  const a = arr.filter(Boolean);
  return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

function writeLetter(L, st) {
  const role = L.role.trim(), co = L.company.trim(), tone = L.tone;
  const area = AREAS[R.ranked[0]], area2 = AREAS[R.ranked[1]];
  const skills = list3(L.skills.split(/,|;/).map(s => s.trim()).slice(0, 3));
  const ADJ = {
    'Curious learner': 'curious', 'Practical and grounded': 'practical', 'Reliable and organized': 'reliable',
    'Adaptable': 'adaptable', 'Natural communicator': 'outgoing', 'Deep thinker': 'thoughtful',
    'Supportive team player': 'supportive', 'Honest and direct': 'direct', 'Cool under pressure': 'calm under pressure',
    'Emotionally aware': 'empathetic', 'Good with your hands': 'hands-on', 'Strong problem solver': 'analytical',
    'Original thinker': 'creative', 'Great with people': 'people-focused', 'Takes initiative': 'proactive', 'Eye for detail': 'detail-oriented'
  };
  const traits = list3(st.slice(0, 3).map(s => ADJ[s] || s.toLowerCase()));
  const open = {
    pro: `I am writing to apply for the ${role} position at ${co}.`,
    warm: `I'm excited to apply for the ${role} role at ${co}!`,
    bold: `I'm confident I can make an immediate impact as ${co}'s next ${role}.`
  }[tone];
  const fitLine = {
    pro: `I am drawn to this field because I do my best work when a role calls for ${area.name.toLowerCase()} and ${area2.name.toLowerCase()}.`,
    warm: `What I love most is work that combines ${area.name.toLowerCase()} and ${area2.name.toLowerCase()}, and this role does exactly that.`,
    bold: `My strengths are ${area.name.toLowerCase()} and ${area2.name.toLowerCase()}, and that is exactly what this role demands.`
  }[tone];
  const p2 = [
    L.background.trim() ? `Through ${L.background.trim().replace(/\.$/, '')}, I've built experience that carries directly into this role.` : '',
    skills ? `I bring practical skills in ${skills}.` : '',
    traits ? `People who work with me would describe me as ${traits}.` : ''
  ].filter(Boolean).join(' ');
  const why = L.why.trim()
    ? `I'm especially drawn to ${co} because of ${L.why.trim().replace(/\.$/, '')}.`
    : `I admire the work ${co} does and would be proud to contribute to it.`;
  const close = {
    pro: 'Thank you for considering my application. I would welcome the opportunity to discuss how I can contribute to your team.',
    warm: "Thanks so much for reading. I'd love to chat about how I could help your team!",
    bold: "I'd like to show you what I can do. Let's set up a time to talk."
  }[tone];
  const sign = { pro: 'Sincerely', warm: 'Warm regards', bold: 'Best' }[tone];
  const greet = tone === 'warm' ? `Dear ${co} team,` : 'Dear Hiring Manager,';
  return [greet, `${open} ${fitLine}`, p2, why, close, `${sign},\n${L.name.trim()}`].filter(Boolean).join('\n\n');
}

function showLetter(text) {
  S.letter.text = text; save();
  $('#letter-out').innerHTML = `<section class="card letter">
    <textarea id="ltext" rows="16">${esc(text)}</textarea>
    <div class="row-btns"><button class="btn ghost" id="copy-l">Copy</button><button class="btn ghost" id="dl-l">Download</button></div>
  </section>`;
  const ta = $('#ltext');
  ta.addEventListener('input', () => { S.letter.text = ta.value; save(); });
  $('#copy-l').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
    $('#copy-l').textContent = 'Copied ✓';
    setTimeout(() => { const b = $('#copy-l'); if (b) b.textContent = 'Copy'; }, 1500);
  });
  $('#dl-l').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ta.value], { type: 'text/plain' }));
    a.download = `Cover letter - ${(S.letter.company || 'company').replace(/[^\w -]/g, '')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#letter-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Menu ---------- */

function openMenu() { $('#menu').classList.remove('hidden'); }
$('#menu').addEventListener('click', e => { if (e.target.id === 'menu' || e.target.dataset.act === 'close') $('#menu').classList.add('hidden'); });
$('#retake').addEventListener('click', () => {
  if (!confirm('Retake the assessment? Your saved careers and plan progress stay.')) return;
  Object.assign(S, { answers: { name: S.answers.name }, idx: 1, done: false });
  save(); $('#menu').classList.add('hidden'); show('chat'); renderChat();
});
$('#reset').addEventListener('click', () => {
  if (!confirm('Erase everything on this device and start over?')) return;
  S = Object.assign({}, DEFAULTS, { answers: {}, saved: [], checks: {}, letter: {} });
  save(); $('#menu').classList.add('hidden'); start();
});

start();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !LS && !S.done) location.reload(); });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
