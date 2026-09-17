// sound.js — the only audio in the app (COMPOSED S4 "Rewards": *WebAudio synth only*, no files, no
// third-party anything). Four cues plus the combo tick:
//   correct  sine 660 → 880 Hz, 80 ms          wrong  triangle 110 Hz, 120 ms
//   mint     four-note arpeggio (tile mint)     level  major chord (level-up)
//   combo    sine at 440 · 2^(combo/12)        (S4 "sound-on combo tick pitch")
//
// Rules this module enforces so no screen has to:
//   • default OFF (store.js ships settings.sound = false) — nothing ever plays unless the student asked;
//   • MUTED after 22:00 local (days.isQuietHours) — S7's soft close: the app says stop, it does not lock
//     the door, so the toggle keeps its value and sound comes back tomorrow;
//   • every call is best-effort: no AudioContext (Node, old Safari, autoplay policy) → play() returns
//     false and nothing throws. Screens may call play() unconditionally.
//
// Browsers require a user gesture before audio starts. Screens do not need to care: play() is normally
// reached from a tap/keypress (a submit), and it resumes a suspended context itself. unlock() exists for
// a screen that wants to warm the context on an earlier gesture (Settings does it on its test button).
import { getState, update } from './store.js';
import { isQuietHours } from './days.js';

/** The cue names play() understands. */
export const CUES = Object.freeze(['correct', 'wrong', 'mint', 'level', 'combo']);

/** Master level — everything below is scaled by this. Deliberately quiet: this is a study app. */
const MASTER = 0.22;

let actx = null;        // the AudioContext, created on first real play
let master = null;      // its master GainNode
let failed = false;     // context construction threw once — never try again this session

const AC = () => (typeof globalThis !== 'undefined'
  ? (globalThis.AudioContext || globalThis.webkitAudioContext || null)
  : null);

/** True when this environment can synthesise at all (false under Node and in tests). */
export function isSupported() { return !failed && typeof AC() === 'function'; }

/** True after 22:00 local — S4/S7: the toggle greys out and every cue is muted until tomorrow. */
export function isQuiet(now = new Date()) { return isQuietHours(now); }

/** The saved preference (settings.sound). Never throws — a broken save reads as off. */
export function soundEnabled() {
  try { return getState()?.settings?.sound === true; } catch { return false; }
}

/** What Settings shows and what play() obeys: on, not quiet hours, and synthesis available. */
export function isAudible(now = new Date()) { return soundEnabled() && !isQuiet(now) && isSupported(); }

/** Write the preference. Returns the value actually stored. */
export function setSound(on) {
  const v = !!on;
  try { update((s) => { s.settings.sound = v; }); } catch { /* memory-only save: the UI still flips */ }
  return v;
}

/* ---------------- the synth ---------------- */

function context() {
  if (actx) return actx;
  const Ctor = AC();
  if (!Ctor) return null;
  try {
    actx = new Ctor();
    master = actx.createGain();
    master.gain.value = MASTER;
    master.connect(actx.destination);
  } catch { failed = true; actx = null; master = null; }
  return actx;
}

/**
 * unlock() — create/resume the AudioContext from inside a user gesture so the first real cue is not
 * swallowed by the autoplay policy. Safe to call repeatedly; returns true if a running context exists.
 */
export function unlock() {
  const c = context();
  if (!c) return false;
  if (c.state === 'suspended') { try { c.resume(); } catch { /* ignore */ } }
  return c.state !== 'closed';
}

/**
 * tone({ type, freq, to, dur, gain, at, attack }) — one enveloped oscillator.
 * `to` (optional) ramps the frequency from `freq` to `to` across the note.
 */
function tone(c, { type = 'sine', freq = 440, to = null, dur = 0.08, gain = 1, at = 0, attack = 0.008 }) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const peak = Math.max(0.0002, gain);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(attack, dur / 2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /* ignore */ } };
}

/** The cue table. Each entry is a list of tone() specs (times are seconds, relative to "now"). */
const VOICES = {
  // S4: correct 660 → 880 Hz, 80 ms
  correct: () => [{ type: 'sine', freq: 660, to: 880, dur: 0.08, gain: 0.9 }],
  // S4: wrong 110 Hz triangle, 120 ms. Low and short — a nudge, not a buzzer.
  wrong: () => [{ type: 'triangle', freq: 110, dur: 0.12, gain: 0.8, attack: 0.004 }],
  // S4: mint arpeggio — the tile mint is the signature moment, so this is the one cue with a shape.
  mint: () => [660, 880, 1108.73, 1318.51].map((f, i) => ({ type: 'sine', freq: f, dur: 0.09, gain: 0.72, at: i * 0.055 })),
  // S4: level chord — C5 E5 G5 C6, soft attack, 520 ms.
  level: () => [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ type: 'sine', freq: f, dur: 0.52, gain: 0.5, at: i * 0.02, attack: 0.03 })),
  // S4: combo tick pitch 440 · 2^(combo/12) — one semitone per combo step, capped with the ×2.0 tier.
  combo: (n = 1) => [{ type: 'sine', freq: 440 * Math.pow(2, Math.min(Math.max(n, 0), 12) / 12), dur: 0.06, gain: 0.55 }],
};

/**
 * play(cue, arg) — synthesise one cue. Returns true only if sound was actually produced.
 * `arg` is the combo count for 'combo' and ignored otherwise.
 *
 *   play('correct')            play('wrong')      play('mint')
 *   play('level')              play('combo', 7)
 */
export function play(cue, arg) {
  if (!isAudible()) return false;
  const make = VOICES[cue];
  if (!make) return false;
  const c = context();
  if (!c) return false;
  if (c.state === 'suspended') { try { c.resume(); } catch { /* ignore */ } }
  try {
    for (const spec of make(arg)) tone(c, spec);
    return true;
  } catch { return false; }
}

/** play('combo', n) by another name — S4's combo tick. */
export function combo(n) { return play('combo', n); }

/** Release the audio hardware (Settings calls it when sound is switched off). */
export function close() {
  if (!actx) return;
  try { actx.close(); } catch { /* ignore */ }
  actx = null; master = null;
}

export default { CUES, play, combo, unlock, close, isAudible, isQuiet, isSupported, soundEnabled, setSound };
