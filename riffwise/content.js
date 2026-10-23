// Riffwise content: chord shapes, courses and lessons, plus the parser for
// the little tab format the lessons are written in.
//
// Tab format (tokens separated by spaces):
//   6.3        a note: string (1 = high e … 6 = low E) and fret
//   6.3+5.5    notes played together
//   suffixes   b bend a whole step · h hammer-on · p pull-off · m palm mute · ~ vibrato
//   [Em]d      strum a chord down (d) or up (u); [X] is a muted "chk" scratch
//   -          rest
//   w h q e s t   set the length of the notes that follow:
//              whole, half, quarter, eighth, sixteenth, triplet eighth (add . to dot)
//   @A7        a label shown above the tab (use _ for spaces)
//   |          bar line (only checked, never needed)
//   {…}x4      repeat what's inside
'use strict';

// Open-string pitches as MIDI numbers, indexed by string number
const OPEN = [0, 64, 59, 55, 50, 45, 40];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Frets from the low E string to the high e string (x = don't play).
// Use commas when any fret is 10 or higher. fg = fingers (1 index … 4 pinky).
const CHORDS = {
  'E':     { f: '022100', fg: '023100', cat: 'Major' },
  'A':     { f: 'x02220', fg: 'x01230', cat: 'Major' },
  'D':     { f: 'xx0232', fg: 'xx0132', cat: 'Major' },
  'G':     { f: '320003', fg: '210003', cat: 'Major' },
  'C':     { f: 'x32010', fg: 'x32010', cat: 'Major' },
  'F':     { f: '133211', fg: '134211', cat: 'Major' },
  'Em':    { f: '022000', fg: '023000', cat: 'Minor' },
  'Am':    { f: 'x02210', fg: 'x02310', cat: 'Minor' },
  'Dm':    { f: 'xx0231', fg: 'xx0231', cat: 'Minor' },
  'Bm':    { f: 'x24432', fg: 'x13421', cat: 'Minor' },
  'F#m':   { f: '244222', fg: '134111', cat: 'Minor' },
  'E7':    { f: '020100', fg: '020100', cat: '7th' },
  'A7':    { f: 'x02020', fg: 'x02030', cat: '7th' },
  'D7':    { f: 'xx0212', fg: 'xx0213', cat: '7th' },
  'G7':    { f: '320001', fg: '320001', cat: '7th' },
  'C7':    { f: 'x32310', fg: 'x32410', cat: '7th' },
  'B7':    { f: 'x21202', fg: 'x21304', cat: '7th' },
  'Cmaj7': { f: 'x32000', fg: 'x32000', cat: 'Maj7 & m7' },
  'Fmaj7': { f: 'xx3210', fg: 'xx3210', cat: 'Maj7 & m7' },
  'Amaj7': { f: 'x02120', fg: 'x02130', cat: 'Maj7 & m7' },
  'Em7':   { f: '022030', fg: '012030', cat: 'Maj7 & m7' },
  'Am7':   { f: 'x02010', fg: 'x02010', cat: 'Maj7 & m7' },
  'Dm7':   { f: 'xx0211', fg: 'xx0211', cat: 'Maj7 & m7' },
  'Dsus2': { f: 'xx0230', fg: 'xx0130', cat: 'Sus & add' },
  'Dsus4': { f: 'xx0233', fg: 'xx0134', cat: 'Sus & add' },
  'Asus2': { f: 'x02200', fg: 'x01200', cat: 'Sus & add' },
  'Asus4': { f: 'x02230', fg: 'x01230', cat: 'Sus & add' },
  'Cadd9': { f: 'x32030', fg: 'x21030', cat: 'Sus & add' },
  'E5':    { f: '022xxx', fg: '013xxx', cat: 'Power' },
  'A5':    { f: 'x022xx', fg: 'x013xx', cat: 'Power' },
  'D5':    { f: 'xx023x', fg: 'xx013x', cat: 'Power' },
  'G5':    { f: '355xxx', fg: '134xxx', cat: 'Power' },
  'C5':    { f: 'x355xx', fg: 'x134xx', cat: 'Power' },
  'E9':    { f: 'x,7,6,7,7,7', fg: 'x21333', cat: 'Funk' },
  'D9':    { f: 'x,5,4,5,5,5', fg: 'x21333', cat: 'Funk' }
};

// Frets/fingers as arrays from string 6 to string 1 (null = not played)
function chordFrets(name) {
  const f = CHORDS[name].f;
  return (f.includes(',') ? f.split(',') : f.split('')).map(x => (x === 'x' ? null : +x));
}
function chordFingers(name) {
  return CHORDS[name].fg.split('').map(x => (x === 'x' || x === '0' ? null : +x));
}

const SCALES = {
  major:     { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor:     { name: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  minorPent: { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  majorPent: { name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  blues:     { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] }
};

function parseTab(src) {
  let s = src;
  const rep = /\{([^{}]*)\}x(\d+)/;
  while (rep.test(s)) s = s.replace(rep, (_, body, n) => Array(+n).fill(body).join(' '));
  const DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3 };
  const events = [], labels = [], barErrors = [];
  let t = 0, cur = 1;
  for (const tok of s.split(/\s+/).filter(Boolean)) {
    if (tok === '|') {
      if (Math.abs(t / 4 - Math.round(t / 4)) > 1e-6) barErrors.push(t);
      continue;
    }
    const dm = /^([whqest])(\.?)$/.exec(tok);
    if (dm) { cur = DUR[dm[1]] * (dm[2] ? 1.5 : 1); continue; }
    if (tok === '-') { t += cur; continue; }
    if (tok[0] === '@') { labels.push({ t, text: tok.slice(1).replace(/_/g, ' ') }); continue; }
    const cm = /^\[([^\]]+)\]([du]?)$/.exec(tok);
    if (cm) {
      const name = cm[1], dir = cm[2] || 'd';
      const ev = { t, d: cur, chord: name, dir };
      if (name === 'X') ev.scratch = true;
      else {
        if (!CHORDS[name]) throw new Error('Unknown chord ' + name);
        ev.notes = [];
        chordFrets(name).forEach((f, i) => { if (f !== null) ev.notes.push({ s: 6 - i, f, tech: '' }); });
      }
      events.push(ev); t += cur; continue;
    }
    const notes = tok.split('+').map(n => {
      const q = /^([1-6])\.(\d{1,2})([bhpm~]*)$/.exec(n);
      if (!q) throw new Error('Bad tab token ' + tok);
      return { s: +q[1], f: +q[2], tech: q[3] };
    });
    events.push({ t, d: cur, notes }); t += cur;
  }
  events.forEach((e, i) => { e.gap = (i + 1 < events.length ? events[i + 1].t : t) - e.t; });
  return { events, labels, len: t, barErrors };
}

/* ---------- Building blocks reused across lessons ---------- */
const strum4 = c => `[${c}]d [${c}]d [${c}]d [${c}]d |`;
const campfire = c => `[${c}]d - [${c}]d [${c}]u - [${c}]u [${c}]d [${c}]u |`;
const shuffle = (root, s) => { // boogie on a root string, fifth/sixth on the next string up
  const a = `${root}.0+${s}.2`, b = `${root}.0+${s}.4`;
  return `${a} ${a} ${b} ${b} ${a} ${a} ${b} ${b} |`;
};
const SPIDER = 'e 6.1 6.2 6.3 6.4 5.1 5.2 5.3 5.4 | 4.1 4.2 4.3 4.4 3.1 3.2 3.3 3.4 | 2.1 2.2 2.3 2.4 1.1 1.2 1.3 1.4 |';
const funkBar = c => `[${c}]d [X]u [X]d [${c}]u [X]d [X]u [${c}]d [X]u [X]d [X]u [${c}]d [X]u [X]d [X]u [X]d [X]u |`;

const COURSES = [
  {
    id: 'found', title: 'Guitar Foundations', level: 1, genre: 'All styles', emoji: '🎸',
    cover: 'linear-gradient(135deg,#ff6a5c,#ffb347)',
    desc: 'Start from zero: hold the guitar, read tab, and play your first six chords and the progression behind thousands of songs.',
    lessons: [
      { id: 'found-1', title: 'Meet your guitar', mins: 5, steps: [
        { type: 'read', title: 'The six strings', tool: 'tuner', body:
          '<p>Strings are numbered from <b>1</b> (the thinnest, closest to the floor) to <b>6</b> (the thickest).</p><p>In standard tuning they are, from thickest to thinnest: <b>E A D G B E</b>. Remember it as <i>Eddie Ate Dynamite, Good Bye Eddie</i>.</p><p>Before every session, tune up. Tap below to open the tuner.</p>' },
        { type: 'read', title: 'Reading tab', body:
          '<p>Tab draws the six strings as lines, with the <b>high e on top</b>, as if you were looking down at the neck.</p><p>A number tells you which fret to press. <b>0</b> means play the string open. Read left to right; notes stacked on top of each other are played together.</p>' },
        { type: 'play', title: 'Open strings', bpm: 70, tip: 'Pluck each string with a downstroke and let it ring.',
          tab: 'q 6.0 5.0 4.0 3.0 | 2.0 1.0 2.0 3.0 | 4.0 5.0 6.0 - |' },
        { type: 'quiz', q: 'Which one is string 6?', options: ['The thinnest (high e)', 'The thickest (low E)', 'The G string in the middle'], answer: 1,
          explain: 'String 6 is the thick low E, at the bottom of the tab.' }
      ] },
      { id: 'found-2', title: 'Fretting your first notes', mins: 6, steps: [
        { type: 'read', title: 'One finger per fret', body:
          '<p>Press with your fingertip <b>just behind the fret wire</b>, not on top of it. Keep your thumb behind the neck.</p><p>Give each finger its own fret: index on fret 1, middle on 2, ring on 3, pinky on 4.</p>' },
        { type: 'play', title: 'One finger per fret', bpm: 60, tip: 'Leave each finger down until you need it again.',
          tab: 'q 1.0 1.1 1.2 1.3 | 1.4 1.3 1.2 1.1 | 2.0 2.1 2.2 2.3 | 2.4 2.3 2.2 2.1 |' },
        { type: 'play', title: 'The spider warm-up', bpm: 60, tip: 'Slow and even beats fast and messy. Use alternate picking: down, up, down, up.',
          tab: SPIDER },
        { type: 'quiz', q: 'Where should your fingertip press the string?', options: ['Halfway between two frets', 'Just behind the fret wire', 'Right on top of the fret wire'], answer: 1,
          explain: 'Just behind the fret needs the least pressure and buzzes the least.' }
      ] },
      { id: 'found-3', title: 'Your first chord: E minor', mins: 6, steps: [
        { type: 'read', title: 'E minor', chords: ['Em'], body:
          '<p>Two fingers: <b>middle</b> on string 5, fret 2 and <b>ring</b> on string 4, fret 2. Strum all six strings.</p><p>Tap the diagram to hear it.</p>' },
        { type: 'play', title: 'Quarter-note strums', bpm: 70, click: true, tip: 'Count 1-2-3-4 out loud and strum on each number.',
          tab: `{${strum4('Em')}}x4` },
        { type: 'read', title: 'Em becomes E', chords: ['Em', 'E'], body:
          '<p>Add your <b>index</b> to string 3, fret 1 and E minor becomes <b>E major</b>.</p><p>Minor chords sound sad, major chords sound bright.</p>' },
        { type: 'play', title: 'Em to E', bpm: 70, tab: `{${strum4('Em')} ${strum4('E')}}x2` },
        { type: 'quiz', q: 'Which strings do you fret for Em?', options: ['Strings 5 and 4 at fret 2', 'Strings 3 and 2 at fret 1', 'Strings 6 and 1 at fret 3'], answer: 0 }
      ] },
      { id: 'found-4', title: 'A minor and chord changes', mins: 7, steps: [
        { type: 'read', title: 'A minor', chords: ['E', 'Am'], body:
          '<p>Am: index on string 2 fret 1, middle on string 4 fret 2, ring on string 3 fret 2. Strum from string 5.</p><p><b>Trick:</b> Am is the E shape moved across by one string. Keep your hand shaped and just shift it.</p>' },
        { type: 'play', title: 'E to Am', bpm: 65, tab: `{${strum4('E')} ${strum4('Am')}}x2` },
        { type: 'play', title: 'Two beats each', bpm: 70, tip: 'Start moving to the next chord on beat 2, not on beat 3.',
          tab: '{[Em]d [Em]d [Am]d [Am]d |}x4' },
        { type: 'quiz', q: 'What\'s the trick for switching from E to Am?', options: ['Lift every finger as high as you can', 'Move the same shape across one string', 'Play it with one finger'], answer: 1 }
      ] },
      { id: 'found-5', title: 'C and G', mins: 7, steps: [
        { type: 'read', title: 'C and G', chords: ['C', 'G'], body:
          '<p><b>C:</b> ring on string 5 fret 3, middle on string 4 fret 2, index on string 2 fret 1. Strum from string 5.</p><p><b>G:</b> middle on string 6 fret 3, index on string 5 fret 2, ring on string 1 fret 3. Strum all six.</p>' },
        { type: 'play', title: 'C to G', bpm: 65, tab: `{${strum4('C')} ${strum4('G')}}x2` },
        { type: 'quiz', q: 'Which strings do you strum for C?', options: ['All six', 'Strings 5 to 1', 'Only strings 3 to 1'], answer: 1 }
      ] },
      { id: 'found-6', title: 'D and the four-chord progression', mins: 8, steps: [
        { type: 'read', title: 'D major', chords: ['D'], body:
          '<p>Index on string 3 fret 2, ring on string 2 fret 3, middle on string 1 fret 2. Strum <b>only the top four strings</b>.</p>' },
        { type: 'read', title: 'G – D – Em – C', chords: ['G', 'D', 'Em', 'C'], body:
          '<p>These four chords, one bar each, power a huge number of pop songs. Once you can loop this, you can play along with the radio.</p>' },
        { type: 'play', title: 'The four-chord progression', bpm: 70, click: true,
          tab: `${strum4('G')} ${strum4('D')} ${strum4('Em')} ${strum4('C')}` },
        { type: 'quiz', q: 'How many strings do you strum on D?', options: ['Four', 'Five', 'Six'], answer: 0 }
      ] }
    ]
  },
  {
    id: 'rhythm', title: 'Rhythm & Strumming', level: 1, genre: 'Pop & Acoustic', emoji: '🔥',
    cover: 'linear-gradient(135deg,#3a7bd5,#00d2ff)',
    desc: 'Lock in with the beat: counting, down-up strumming, the campfire strum and percussive mutes.',
    lessons: [
      { id: 'rhythm-1', title: 'Counting & down-strums', mins: 6, steps: [
        { type: 'read', title: 'Feel the beat', body:
          '<p>Most songs are in <b>4/4</b>: four beats in every bar. Count <b>1 2 3 4</b> and strum on every number.</p><p>Keep your strumming arm swinging like a pendulum from the elbow.</p>' },
        { type: 'play', title: 'Quarter notes on G', bpm: 80, click: true, tab: `{${strum4('G')}}x4` },
        { type: 'play', title: 'Eighth-note downs', bpm: 70, tip: 'Twice as many strums: 1 & 2 & 3 & 4 &.',
          tab: 'e {[G]d [G]d [G]d [G]d [G]d [G]d [G]d [G]d |}x2 {[C]d [C]d [C]d [C]d [C]d [C]d [C]d [C]d |}x2' },
        { type: 'quiz', q: 'In 4/4, how many quarter notes fit in a bar?', options: ['Two', 'Three', 'Four'], answer: 2 }
      ] },
      { id: 'rhythm-2', title: 'Down-up strumming', mins: 6, steps: [
        { type: 'read', title: 'Down on the numbers, up on the "&"', body:
          '<p>Eighth notes split each beat in two: <b>1 & 2 & 3 & 4 &</b>. Strum <b>down</b> on the numbers and <b>up</b> on the "&".</p><p>Up-strums are lighter. Just catch the top three or four strings.</p>' },
        { type: 'play', title: 'Down-ups on Em', bpm: 70, tab: 'e {[Em]d [Em]u [Em]d [Em]u [Em]d [Em]u [Em]d [Em]u |}x4' },
        { type: 'play', title: 'Down-ups through G and C', bpm: 75, tab: 'e {{[G]d [G]u}x4 | {[C]d [C]u}x4 |}x2' },
        { type: 'quiz', q: 'When do you strum up?', options: ['On the numbers', 'On the "&"s', 'Only at the end of the bar'], answer: 1 }
      ] },
      { id: 'rhythm-3', title: 'The campfire strum', mins: 8, steps: [
        { type: 'read', title: 'D, D-U, U-D-U', body:
          '<p>The most useful strumming pattern there is: <b>Down, Down-Up, Up-Down-Up</b>.</p><p>Your arm never stops moving down-up. On the gaps you swing past the strings without touching them.</p>' },
        { type: 'play', title: 'Campfire strum on C', bpm: 70, tab: `e {${campfire('C')}}x4` },
        { type: 'play', title: 'With chord changes', bpm: 75, tab: `e ${campfire('G')} ${campfire('D')} ${campfire('Em')} ${campfire('C')}` },
        { type: 'quiz', q: 'What does your hand do on a missed strum?', options: ['Stops and waits', 'Keeps moving but misses the strings', 'Strums twice as hard'], answer: 1 }
      ] },
      { id: 'rhythm-4', title: 'Percussive mutes', mins: 6, steps: [
        { type: 'read', title: 'The "chk"', body:
          '<p>Relax your fretting fingers so they touch the strings without pressing them, then strum: you get a muted <b>chk</b>.</p><p>Put it on beats <b>2 and 4</b> and your guitar sounds like it has a snare drum built in.</p>' },
        { type: 'play', title: 'Mute on 2 and 4', bpm: 75, tab: 'e {[Am]d [Am]u [X]d [Am]u [Am]d [Am]u [X]d [Am]u |}x4' },
        { type: 'quiz', q: 'Where do the muted strums go in this groove?', options: ['Beats 1 and 3', 'Beats 2 and 4', 'Every "&"'], answer: 1 }
      ] },
      { id: 'rhythm-5', title: 'Song study: "Late Summer"', mins: 8, steps: [
        { type: 'read', title: 'Meet Fmaj7', chords: ['Am', 'Fmaj7', 'C', 'G'], body:
          '<p>Fmaj7 is the friendly cousin of F: ring on string 4 fret 3, middle on string 3 fret 2, index on string 2 fret 1. Strum strings 4 to 1.</p>' },
        { type: 'play', title: 'Late Summer', bpm: 80, tip: 'Start at 70% and speed up once the changes feel easy.',
          tab: `e ${campfire('Am')} ${campfire('Fmaj7')} ${campfire('C')} ${campfire('G')}` },
        { type: 'quiz', q: 'Which strings do you strum on Fmaj7?', options: ['All six', 'Strings 4 to 1', 'Strings 6 to 3'], answer: 1 }
      ] }
    ]
  },
  {
    id: 'finger', title: 'Fingerstyle Basics', level: 2, genre: 'Pop & Acoustic', emoji: '🌿',
    cover: 'linear-gradient(135deg,#11998e,#38ef7d)',
    desc: 'Put the pick down. Arpeggios, Travis picking and a full fingerstyle study.',
    lessons: [
      { id: 'finger-1', title: 'Thumb and fingers', mins: 6, steps: [
        { type: 'read', title: 'Who plays what', body:
          '<p><b>Thumb</b> plays strings 6, 5 and 4. <b>Index</b> plays string 3, <b>middle</b> string 2, <b>ring</b> string 1.</p><p>Hold the whole chord down and let every note ring into the next.</p>' },
        { type: 'play', title: 'C arpeggio', bpm: 70, ring: true, tab: 'e {5.3 4.2 3.0 2.1 1.0 2.1 3.0 4.2 |}x2' },
        { type: 'play', title: 'Am arpeggio', bpm: 70, ring: true, tab: 'e {5.0 4.2 3.2 2.1 1.0 2.1 3.2 4.2 |}x2' },
        { type: 'quiz', q: 'Which finger plays the bass strings?', options: ['Index', 'Thumb', 'Ring'], answer: 1 }
      ] },
      { id: 'finger-2', title: 'Arpeggio progression', mins: 7, steps: [
        { type: 'read', title: 'Hold the shape, pick the notes', chords: ['C', 'Am', 'G', 'Em'], body:
          '<p>Same pattern as before, now over four chords. Change chords on the very last note of each bar.</p>' },
        { type: 'play', title: 'C – Am – G – Em', bpm: 75, ring: true,
          tab: 'e 5.3 4.2 3.0 2.1 1.0 2.1 3.0 4.2 | 5.0 4.2 3.2 2.1 1.0 2.1 3.2 4.2 | 6.3 4.0 3.0 2.0 1.3 2.0 3.0 4.0 | 6.0 4.2 3.0 2.0 1.0 2.0 3.0 4.2 |' }
      ] },
      { id: 'finger-3', title: 'Travis picking', mins: 8, steps: [
        { type: 'read', title: 'The ticking thumb', body:
          '<p>Your thumb alternates between two bass notes on every beat, steady as a clock, while your fingers fill in on the "&"s.</p><p>On C, move your ring finger between string 5 and string 6 (both fret 3).</p>' },
        { type: 'play', title: 'Thumb only', bpm: 70, ring: true, tab: 'q {5.3 4.2 6.3 4.2 |}x2' },
        { type: 'play', title: 'Full pattern on C', bpm: 70, ring: true, tab: 'e {5.3+1.0 2.1 4.2 3.0 6.3 2.1 4.2 3.0 |}x4' },
        { type: 'play', title: 'C to G', bpm: 70, ring: true,
          tab: 'e 5.3+1.0 2.1 4.2 3.0 6.3 2.1 4.2 3.0 | 6.3+1.3 2.0 4.0 3.0 6.3 2.0 4.0 3.0 |' },
        { type: 'quiz', q: 'In Travis picking, what does the thumb do?', options: ['Plays the melody', 'Alternates between bass notes on the beat', 'Rests on the guitar body'], answer: 1 }
      ] },
      { id: 'finger-4', title: 'Study: "Morning Light"', mins: 10, steps: [
        { type: 'read', title: 'Four chords, one pattern', chords: ['Am', 'Fmaj7', 'C', 'G'], body:
          '<p>A short study that uses everything so far. Learn it slowly first, then bring it up to speed.</p>' },
        { type: 'play', title: 'Morning Light (slow)', bpm: 55, ring: true,
          tab: 'e 5.0+1.0 2.1 4.2 3.2 5.0 2.1 4.2 3.2 | 4.3+1.0 2.1 3.2 2.1 4.3 2.1 3.2 2.1 | 5.3+1.0 2.1 4.2 3.0 6.3 2.1 4.2 3.0 | 6.3+1.3 2.0 4.0 3.0 6.3 2.0 4.0 3.0 |' },
        { type: 'play', title: 'Morning Light (full speed)', bpm: 80, ring: true,
          tab: 'e 5.0+1.0 2.1 4.2 3.2 5.0 2.1 4.2 3.2 | 4.3+1.0 2.1 3.2 2.1 4.3 2.1 3.2 2.1 | 5.3+1.0 2.1 4.2 3.0 6.3 2.1 4.2 3.0 | 6.3+1.3 2.0 4.0 3.0 6.3 2.0 4.0 3.0 |' }
      ] }
    ]
  },
  {
    id: 'rock', title: 'Rock Riffs & Power Chords', level: 2, genre: 'Rock', emoji: '⚡',
    cover: 'linear-gradient(135deg,#e52d27,#b31217)',
    desc: 'Power chords, palm muting and single-note riffs: the toolkit behind every rock song.',
    lessons: [
      { id: 'rock-1', title: 'Power chords', mins: 6, steps: [
        { type: 'read', title: 'Root and fifth', chords: ['E5', 'G5'], body:
          '<p>A power chord is just two notes: the <b>root</b> and the <b>fifth</b>. Index on the root, ring finger two frets up on the next string.</p><p>They\'re neither major nor minor, so they fit almost anywhere.</p>' },
        { type: 'play', title: 'E5 – G5 – A5', bpm: 90, tab: 'e {6.0+5.2 6.0+5.2 6.0+5.2 6.0+5.2 6.3+5.5 6.3+5.5 6.5+5.7 6.5+5.7 |}x4' },
        { type: 'quiz', q: 'A power chord is made of…', options: ['The root and the fifth', 'The root, third and fifth', 'Only the root'], answer: 0 }
      ] },
      { id: 'rock-2', title: 'Palm muting', mins: 6, steps: [
        { type: 'read', title: 'The chug', body:
          '<p>Rest the edge of your picking hand on the strings, right where they meet the bridge. Too far forward and the note dies, too far back and it rings.</p><p>"PM" above the tab means palm mute.</p>' },
        { type: 'play', title: 'Chugging on low E', bpm: 100, tab: 'e {6.0m 6.0m 6.0m 6.0m 6.0m 6.0m 6.0m 6.0m |}x2' },
        { type: 'play', title: 'Chugs and accents', bpm: 100, tab: 'e {6.0m 6.0m 6.3+5.5 6.0m 6.0m 6.5+5.7 6.0m 6.0m |}x4' },
        { type: 'quiz', q: 'Where does your palm rest for a palm mute?', options: ['Over the soundhole', 'On the strings near the bridge', 'On the frets'], answer: 1 }
      ] },
      { id: 'rock-3', title: 'Power chords on the A string', mins: 6, steps: [
        { type: 'read', title: 'Same shape, new string', chords: ['C5'], body:
          '<p>Move the shape over: root on the A string, fifth on the D string. <b>C5</b> is at fret 3, <b>D5</b> at fret 5.</p>' },
        { type: 'play', title: 'Moving between strings', bpm: 90, tab: 'q {5.3+4.5 5.3+4.5 5.5+4.7 5.5+4.7 | 6.3+5.5 6.3+5.5 6.5+5.7 6.5+5.7 |}x2' },
        { type: 'quiz', q: 'With the root on the A string, which fret is D5?', options: ['Fret 3', 'Fret 5', 'Fret 7'], answer: 1 }
      ] },
      { id: 'rock-4', title: 'Riff study: "Garage Door"', mins: 8, steps: [
        { type: 'read', title: 'Chugs + power chords', body:
          '<p>This riff mixes palm-muted chugs with power chords on both strings. Learn bar 1, then bar 2, then join them.</p>' },
        { type: 'play', title: 'Garage Door (slow)', bpm: 80,
          tab: 'e {6.0m 6.0m 6.3+5.5 6.3+5.5 6.0m 6.0m 6.5+5.7 6.5+5.7 | 6.0m 6.0m 5.3+4.5 5.3+4.5 5.5+4.7 - 6.3+5.5 - |}x2' },
        { type: 'play', title: 'Garage Door (full speed)', bpm: 120,
          tab: 'e {6.0m 6.0m 6.3+5.5 6.3+5.5 6.0m 6.0m 6.5+5.7 6.5+5.7 | 6.0m 6.0m 5.3+4.5 5.3+4.5 5.5+4.7 - 6.3+5.5 - |}x2' }
      ] },
      { id: 'rock-5', title: 'Single-note riffs', mins: 7, steps: [
        { type: 'read', title: 'E minor pentatonic, low and heavy', scale: { root: 4, type: 'minorPent' }, body:
          '<p>Lots of rock riffs live on the low strings of the <b>E minor pentatonic</b> scale: open strings plus frets 2 and 3.</p>' },
        { type: 'play', title: 'Riff in E', bpm: 100, scale: { root: 4, type: 'minorPent' },
          tab: 'e {6.0 6.0 6.3 6.0 5.0 6.0 5.2 6.0 | 6.0 6.0 6.3 6.0 5.2 5.0 6.3 - |}x2' },
        { type: 'quiz', q: 'Which notes are in E minor pentatonic?', options: ['E G A B D', 'E F# G# B C#', 'E F G A B'], answer: 0 }
      ] }
    ]
  },
  {
    id: 'blues', title: 'Blues Essentials', level: 2, genre: 'Blues', emoji: '🎷',
    cover: 'linear-gradient(135deg,#2b5876,#4e4376)',
    desc: 'The shuffle, the 12-bar form, the minor pentatonic, bends and your first licks.',
    lessons: [
      { id: 'blues-1', title: 'The shuffle', mins: 6, steps: [
        { type: 'read', title: 'Swing it', body:
          '<p>Blues <b>swings</b>: each beat splits long-short, "daa-da daa-da".</p><p>For this boogie, let the A string ring open while your fingers alternate fret 2 and fret 4 on the D string.</p>' },
        { type: 'play', title: 'A shuffle', bpm: 90, swing: true, tab: `e {${shuffle(5, 4)}}x4` },
        { type: 'quiz', q: 'What does swing do to eighth notes?', options: ['Makes them long-short', 'Makes them perfectly even', 'Doubles their speed'], answer: 0 }
      ] },
      { id: 'blues-2', title: 'The 12-bar blues', mins: 8, steps: [
        { type: 'read', title: 'I, IV and V', body:
          '<p>Three chords, twelve bars. In A the chords are <b>A</b> (I), <b>D</b> (IV) and <b>E</b> (V).</p><p>A A A A | D D A A | E D A E</p>' },
        { type: 'play', title: '12-bar shuffle in A', bpm: 95, swing: true,
          tab: `e @A ${shuffle(5, 4)} ${shuffle(5, 4)} ${shuffle(5, 4)} ${shuffle(5, 4)} @D ${shuffle(4, 3)} ${shuffle(4, 3)} @A ${shuffle(5, 4)} ${shuffle(5, 4)} @E ${shuffle(6, 5)} @D ${shuffle(4, 3)} @A ${shuffle(5, 4)} @E ${shuffle(6, 5)}` },
        { type: 'quiz', q: 'In the key of A, what are the I, IV and V chords?', options: ['A, D and E', 'A, C and E', 'A, B and C#'], answer: 0 }
      ] },
      { id: 'blues-3', title: 'Minor pentatonic: box 1', mins: 7, steps: [
        { type: 'read', title: 'The most-used scale in blues and rock', scale: { root: 9, type: 'minorPent' }, body:
          '<p>Five notes: <b>A C D E G</b>. Box 1 starts at fret 5. Index plays fret 5, ring or pinky play frets 7 and 8.</p><p>Brighter dots are the root note, A.</p>' },
        { type: 'play', title: 'Up and down the box', bpm: 80, scale: { root: 9, type: 'minorPent' },
          tab: 'e 6.5 6.8 5.5 5.7 4.5 4.7 3.5 3.7 | 2.5 2.8 1.5 1.8 1.5 2.8 2.5 3.7 | 3.5 4.7 4.5 5.7 5.5 6.8 q 6.5 |' },
        { type: 'quiz', q: 'How many notes are in a pentatonic scale?', options: ['Five', 'Seven', 'Twelve'], answer: 0 }
      ] },
      { id: 'blues-4', title: 'Bends and vibrato', mins: 7, steps: [
        { type: 'read', title: 'Make it cry', body:
          '<p>Push the string toward the ceiling with two or three fingers until it reaches the pitch two frets higher. <b>7b</b> means bend fret 7 up a whole step.</p><p><b>~</b> means vibrato: rock the string up and down a little.</p>' },
        { type: 'play', title: 'Hear the target, then bend to it', bpm: 70, tab: 'q 3.9 3.7b 3.9 3.7b | 2.8 2.5 3.7b - |' },
        { type: 'play', title: 'Vibrato', bpm: 70, tab: 'h 1.8~ 1.5~ | 2.8~ 2.5~ |' },
        { type: 'quiz', q: 'A whole-step bend at fret 7 should sound like…', options: ['Fret 8', 'Fret 9', 'Fret 12'], answer: 1 }
      ] },
      { id: 'blues-5', title: 'First lick and turnaround', mins: 8, steps: [
        { type: 'play', title: 'Lick 1', bpm: 80, swing: true, scale: { root: 9, type: 'minorPent' },
          tab: 'e 1.8 1.5 2.8 2.5 3.7b - 3.5 - | q 4.7 4.5 h 5.7 |' },
        { type: 'play', title: 'Turnaround in A', bpm: 80, swing: true,
          tab: 'e 1.5+3.6 - 1.5+3.5 - 1.5+3.4 - 1.5+3.3 - | q 5.0 - [E7]d - |' },
        { type: 'quiz', q: 'Where does a turnaround go?', options: ['At the very start of a song', 'In the last bars, leading back to the top', 'Only in the guitar solo'], answer: 1 }
      ] }
    ]
  },
  {
    id: 'lead', title: 'Lead Guitar: Pentatonic Mastery', level: 3, genre: 'Rock', emoji: '🚀',
    cover: 'linear-gradient(135deg,#8e2de2,#4a00e0)',
    desc: 'Alternate picking, legato, a second scale box, licks, and your first improvised solo.',
    lessons: [
      { id: 'lead-1', title: 'Alternate picking', mins: 7, steps: [
        { type: 'read', title: 'Down, up, down, up', body: '<p>Strictly alternate your pick direction, even when you change strings. Slow and clean first, speed comes on its own.</p>' },
        { type: 'play', title: 'Sixteenths on one string', bpm: 70, tab: 's {1.5 1.5 1.5 1.5}x4 | {1.8 1.8 1.8 1.8 1.5 1.5 1.5 1.5}x2 |' },
        { type: 'play', title: 'Pentatonic in threes', bpm: 70, scale: { root: 9, type: 'minorPent' },
          tab: 't 6.5 6.8 5.5 6.8 5.5 5.7 5.5 5.7 4.5 5.7 4.5 4.7 | 4.5 4.7 3.5 4.7 3.5 3.7 3.5 3.7 2.5 3.7 2.5 2.8 |' },
        { type: 'quiz', q: 'Alternate picking means…', options: ['Only downstrokes', 'Strict down-up-down-up', 'Picking with your fingers'], answer: 1 }
      ] },
      { id: 'lead-2', title: 'Hammer-ons & pull-offs', mins: 7, steps: [
        { type: 'read', title: 'Legato', body: '<p><b>h</b>: pick the first note, then slam another finger down to sound the second without picking.</p><p><b>p</b>: pick the higher note, then flick your finger off sideways to sound the lower one.</p>' },
        { type: 'play', title: 'Hammer-ons', bpm: 70, tab: 'e {3.5 3.7h 2.5 2.8h 1.5 1.8h 1.5 1.8h |}x2' },
        { type: 'play', title: 'Pull-offs', bpm: 70, tab: 'e {1.8 1.5p 2.8 2.5p 3.7 3.5p 4.7 4.5p |}x2' },
        { type: 'quiz', q: 'A pull-off is when you…', options: ['Pick the string again', 'Flick your finger off to sound a lower fretted note', 'Slide up to the next fret'], answer: 1 }
      ] },
      { id: 'lead-3', title: 'Box 2 and connecting', mins: 8, steps: [
        { type: 'read', title: 'Break out of the box', scale: { root: 9, type: 'minorPent' }, body: '<p>Box 2 starts where box 1\'s top notes left off: fret 8 on the low E. The two shapes share notes, so you can slide between them.</p>' },
        { type: 'play', title: 'Box 2', bpm: 75, scale: { root: 9, type: 'minorPent' },
          tab: 'e 6.8 6.10 5.7 5.10 4.7 4.10 3.7 3.9 | 2.8 2.10 1.8 1.10 1.8 2.10 2.8 3.9 | 3.7 4.10 4.7 5.10 5.7 6.10 q 6.8 |' },
        { type: 'quiz', q: 'Box 2 of A minor pentatonic starts on which note of the low E?', options: ['A at fret 5', 'C at fret 8', 'E at fret 12'], answer: 1 }
      ] },
      { id: 'lead-4', title: 'Three essential licks', mins: 9, steps: [
        { type: 'play', title: 'Lick 1: the descent', bpm: 80, scale: { root: 9, type: 'minorPent' }, tab: 'e 1.8 1.5p 2.8 2.5 3.7 3.5 4.7 - | h 3.7b q 3.5 - |' },
        { type: 'play', title: 'Lick 2: bend and resolve', bpm: 75, scale: { root: 9, type: 'minorPent' }, tab: 'q 2.8b 2.8 2.5 3.7 | h 2.5~ - |' },
        { type: 'play', title: 'Lick 3: the rolling triplet', bpm: 80, scale: { root: 9, type: 'minorPent' }, tab: 't 1.5 2.8 2.5 1.5 2.8 2.5 1.5 2.8 2.5 1.5 2.8 2.5 | h 3.7~ - |' }
      ] },
      { id: 'lead-5', title: 'Jam: improvise in A minor', mins: 10, steps: [
        { type: 'read', title: 'There are no wrong notes', scale: { root: 9, type: 'minorPent' }, body: '<p>The backing loops Am, Dm and Em. Play anything from the A minor pentatonic: start with the licks, then change their rhythm, then make up your own.</p><p>Leave space. Silence is part of a solo.</p>' },
        { type: 'play', title: 'Backing track: Am – Dm – Am – Em', bpm: 85, jam: true, scale: { root: 9, type: 'minorPent' },
          tip: 'This is a backing track. Improvise over it using the scale shown on the fretboard.',
          tab: `e ${campfire('Am')} ${campfire('Dm')} ${campfire('Am')} ${campfire('Em')}` }
      ] }
    ]
  },
  {
    id: 'funk', title: 'Funk Rhythm', level: 3, genre: 'Funk & Soul', emoji: '🕺',
    cover: 'linear-gradient(135deg,#f7971e,#ffd200)',
    desc: 'The 16th-note engine, ninth chords, scratches and tight single-note grooves.',
    lessons: [
      { id: 'funk-1', title: 'The 16th-note engine', mins: 7, steps: [
        { type: 'read', title: '1 e & a', body: '<p>Funk lives on 16th notes: <b>1 e & a 2 e & a…</b> Your hand goes down-up four times every beat, <b>always</b>, even when you don\'t hit anything.</p><p>Lay your fretting fingers lightly across the strings to get the muted "chk".</p>' },
        { type: 'play', title: 'All-muted sixteenths', bpm: 80, tab: 's {{[X]d [X]u [X]d [X]u}x4 |}x2' },
        { type: 'play', title: 'Accent the beat', bpm: 80, tab: 's {{[E9]d [X]u [X]d [X]u}x4 |}x2' },
        { type: 'quiz', q: 'How many 16th notes are in one beat?', options: ['Two', 'Three', 'Four'], answer: 2 }
      ] },
      { id: 'funk-2', title: 'The ninth chord', mins: 7, steps: [
        { type: 'read', title: 'E9', chords: ['E9'], body: '<p>Middle finger on string 5 fret 7, index on string 4 fret 6, ring finger barring strings 3 to 1 at fret 7. Mute string 6 with the tip of your middle finger.</p>' },
        { type: 'play', title: 'E9 stabs', bpm: 90, tab: `s {${funkBar('E9')}}x4` },
        { type: 'quiz', q: 'Which notes make up E9?', options: ['E G# B D F#', 'E G B D', 'E G# B'], answer: 0 }
      ] },
      { id: 'funk-3', title: 'Single-note funk', mins: 7, steps: [
        { type: 'read', title: 'Pick only where the notes are', body: '<p>Keep the 16th motion going and only hit the string on the written notes. Notes marked PM are muted short.</p>' },
        { type: 'play', title: 'Funk line in E', bpm: 80, tab: 's {4.2 - 4.2m - 5.2 - 4.2 4.2m - 5.0 5.2 - 4.2 - - - |}x2' }
      ] },
      { id: 'funk-4', title: 'Groove: E9 to D9', mins: 8, steps: [
        { type: 'read', title: 'Slide the shape', chords: ['E9', 'D9'], body: '<p>D9 is the same shape two frets lower. Move the whole hand on the last "a" of the bar.</p>' },
        { type: 'play', title: 'The groove', bpm: 95, tab: `s ${funkBar('E9')} ${funkBar('D9')}` }
      ] }
    ]
  },
  {
    id: 'theory', title: 'Music Theory for Guitar', level: 1, genre: 'Theory', emoji: '🧠',
    cover: 'linear-gradient(135deg,#0f2027,#2c5364)',
    desc: 'Note names, the major scale, chords in a key and octave shapes, all on the fretboard.',
    lessons: [
      { id: 'theory-1', title: 'The musical alphabet', mins: 5, steps: [
        { type: 'read', title: 'Twelve notes', body: '<p>Seven letters, <b>A to G</b>, with a sharp (#) between each pair <b>except B–C and E–F</b>. That gives twelve notes, then the pattern repeats an octave higher.</p><p>Every fret is one <b>half step</b>.</p>' },
        { type: 'quiz', q: 'Which pair has no sharp between them?', options: ['C and D', 'E and F', 'G and A'], answer: 1 },
        { type: 'quiz', q: 'How many different notes are there?', options: ['7', '12', '24'], answer: 1 }
      ] },
      { id: 'theory-2', title: 'Notes on the E and A strings', mins: 6, steps: [
        { type: 'read', title: 'Find any note', scale: { root: 0, type: 'major', names: true }, body: '<p>These are the natural notes (no sharps). Learn the low E and A strings first: they\'re where the roots of most chords sit.</p><p>Fret 12 is the open string again, one octave higher.</p>' },
        { type: 'quiz', q: 'What note is at fret 5 of the low E string?', options: ['G', 'A', 'B'], answer: 1 },
        { type: 'quiz', q: 'What note is at fret 3 of the A string?', options: ['C', 'D', 'B'], answer: 0 },
        { type: 'quiz', q: 'Fret 12 on any string is…', options: ['The open note, an octave higher', 'A fifth higher', 'A different note on every string'], answer: 0 }
      ] },
      { id: 'theory-3', title: 'The major scale', mins: 6, steps: [
        { type: 'read', title: 'W W H W W W H', body: '<p>Every major scale follows the same steps: <b>whole, whole, half, whole, whole, whole, half</b> (a whole step is two frets).</p>' },
        { type: 'play', title: 'G major, one octave', bpm: 70, scale: { root: 7, type: 'major' }, tab: 'q 6.3 6.5 5.2 5.3 | 5.5 4.2 4.4 4.5 | 4.4 4.2 5.5 5.3 | 5.2 6.5 h 6.3 |' },
        { type: 'quiz', q: 'The major scale\'s step pattern is…', options: ['W W H W W W H', 'W H W W H W W', 'H W W W H W W'], answer: 0 }
      ] },
      { id: 'theory-4', title: 'Chords in a key', mins: 6, steps: [
        { type: 'read', title: 'I IV V vi', chords: ['G', 'C', 'D', 'Em'], body: '<p>Build a chord on each note of the scale: <b>I ii iii IV V vi vii°</b>. In G that\'s G Am Bm C D Em F#°.</p><p>I, IV, V and vi are the workhorses of pop music.</p>' },
        { type: 'quiz', q: 'In the key of G, which chord is the vi?', options: ['Em', 'D', 'Am'], answer: 0 },
        { type: 'quiz', q: 'In the key of C, what are I, IV and V?', options: ['C, F and G', 'C, E and G', 'C, D and E'], answer: 0 },
        { type: 'play', title: 'I – IV – V – vi in G', bpm: 75, tab: `${strum4('G')} ${strum4('C')} ${strum4('D')} ${strum4('Em')}` }
      ] },
      { id: 'theory-5', title: 'Octave shapes', mins: 5, steps: [
        { type: 'read', title: 'Two strings, two frets', body: '<p>From a note on string 6 or 5, skip a string and go <b>two frets up</b>: same note, one octave higher.</p>' },
        { type: 'play', title: 'Octaves', bpm: 70, tab: 'q 6.3 4.5 6.5 4.7 | 5.3 3.5 5.5 3.7 |' },
        { type: 'quiz', q: 'Fret 3 on the low E is G. Where\'s the G an octave up?', options: ['String 4, fret 5', 'String 5, fret 5', 'String 4, fret 3'], answer: 0 }
      ] }
    ]
  }
];

const LEVELS = [
  { id: 'new', label: 'Brand new', sub: 'I\'ve never played' },
  { id: 'beginner', label: 'Beginner', sub: 'I know a few chords' },
  { id: 'intermediate', label: 'Intermediate', sub: 'I can play some songs' },
  { id: 'advanced', label: 'Advanced', sub: 'I solo and play in bands' }
];
const STYLES = [
  { id: 'rock', label: 'Rock', emoji: '⚡', courses: ['rock', 'lead'] },
  { id: 'blues', label: 'Blues', emoji: '🎷', courses: ['blues', 'lead'] },
  { id: 'pop', label: 'Pop & Acoustic', emoji: '🔥', courses: ['rhythm', 'finger'] },
  { id: 'finger', label: 'Fingerstyle', emoji: '🌿', courses: ['finger'] },
  { id: 'funk', label: 'Funk & Soul', emoji: '🕺', courses: ['funk', 'rhythm'] },
  { id: 'metal', label: 'Metal', emoji: '🤘', courses: ['rock', 'lead'] }
];
// Course order per level; the first `keep` stay put, the rest are sorted by style match
const PATH_BASE = {
  new:          { keep: 2, order: ['found', 'rhythm', 'finger', 'rock', 'blues', 'theory', 'lead', 'funk'] },
  beginner:     { keep: 1, order: ['rhythm', 'rock', 'blues', 'finger', 'theory', 'lead', 'funk', 'found'] },
  intermediate: { keep: 0, order: ['blues', 'lead', 'rock', 'funk', 'theory', 'finger', 'rhythm', 'found'] },
  advanced:     { keep: 0, order: ['lead', 'funk', 'blues', 'theory', 'rock', 'finger', 'rhythm', 'found'] }
};

if (typeof module !== 'undefined') module.exports = { OPEN, CHORDS, COURSES, parseTab, chordFrets };
